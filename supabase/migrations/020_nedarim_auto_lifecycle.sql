-- Auto-lifecycle for Nedarim subscriptions based on student status changes.
--
-- When ALL active students linked to a Nedarim HK become inactive:
--   - Mark the subscription as 'frozen' in our DB
--   - Queue a call to Nedarim API to suspend (handled by edge function /
--     API route that polls this queue)
-- When a student returns (status → active) and the HK is frozen-auto:
--   - Mark back to 'active' and queue re-enable
--
-- For SHARED HKs where only SOME students become inactive:
--   - DO NOT auto-suspend (the other students still need to pay)
--   - Create a task for manual review (amount might need adjustment)

-- Queue of pending actions toward Nedarim API
CREATE TABLE IF NOT EXISTS nedarim_action_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL CHECK (action IN ('suspend', 'resume', 'delete', 'update_amount')),
  nedarim_keva_id TEXT NOT NULL,
  subscription_id UUID REFERENCES nedarim_subscriptions(id) ON DELETE CASCADE,
  params JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done', 'failed')),
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  triggered_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_nedarim_queue_pending ON nedarim_action_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_nedarim_queue_keva ON nedarim_action_queue(nedarim_keva_id);

ALTER TABLE nedarim_action_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nedarim_action_queue_all" ON nedarim_action_queue FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON nedarim_action_queue TO authenticated, anon;


-- Trigger function: called when a student's status changes.
-- Reconciles Nedarim HK statuses where this student is linked via student_tuition.
CREATE OR REPLACE FUNCTION sync_nedarim_on_student_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_sub RECORD;
  v_active_count INT;
  v_inactive_count INT;
  v_total_count INT;
  v_task_title TEXT;
  v_task_description TEXT;
BEGIN
  -- Only react to actual status changes
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Find all Nedarim subscriptions this student is linked to via student_tuition
  FOR v_sub IN
    SELECT DISTINCT ns.id, ns.nedarim_keva_id, ns.status, ns.student_ids
    FROM nedarim_subscriptions ns
    JOIN student_tuition st ON st.nedarim_subscription_id = ns.id
    WHERE st.student_id = NEW.id
  LOOP
    -- Count other students on this sub by their current status
    SELECT
      COUNT(*) FILTER (WHERE s.status = 'active'),
      COUNT(*) FILTER (WHERE s.status <> 'active'),
      COUNT(*)
    INTO v_active_count, v_inactive_count, v_total_count
    FROM student_tuition st2
    JOIN students s ON s.id = st2.student_id
    WHERE st2.nedarim_subscription_id = v_sub.id
      AND s.id <> NEW.id;

    -- Include the current student (post-change) in the counts
    IF NEW.status = 'active' THEN
      v_active_count := v_active_count + 1;
    ELSE
      v_inactive_count := v_inactive_count + 1;
    END IF;
    v_total_count := v_total_count + 1;

    -- Decision logic
    IF v_active_count = 0 AND v_inactive_count > 0 THEN
      -- ALL students inactive → suspend the HK
      IF v_sub.status = 'active' THEN
        UPDATE nedarim_subscriptions
          SET status = 'frozen'
          WHERE id = v_sub.id;

        INSERT INTO nedarim_action_queue (action, nedarim_keva_id, subscription_id, params, triggered_by)
        VALUES ('suspend', v_sub.nedarim_keva_id, v_sub.id,
                jsonb_build_object('reason', 'כל התלמידים שעל ההוק לא פעילים'),
                'auto_all_students_inactive');
      END IF;

    ELSIF NEW.status = 'active' AND v_sub.status = 'frozen' THEN
      -- Returning student revives a frozen HK
      UPDATE nedarim_subscriptions
        SET status = 'active'
        WHERE id = v_sub.id;

      INSERT INTO nedarim_action_queue (action, nedarim_keva_id, subscription_id, params, triggered_by)
      VALUES ('resume', v_sub.nedarim_keva_id, v_sub.id,
              jsonb_build_object('reason', 'תלמיד חזר לישיבה'),
              'auto_student_returned');

    ELSIF v_total_count > 1 AND v_inactive_count > 0 AND v_active_count > 0 THEN
      -- Partial: some students inactive, some active → create task for manual review
      v_task_title := 'בדוק גובה הוק אשראי - תלמיד שינה סטטוס';
      v_task_description := format(
        'הוק בנדרים %s משותפת ל-%s תלמידים. %s שינה סטטוס ל-%s. %s תלמידים עדיין פעילים על ההוק. ייתכן שצריך להקטין את הסכום בנדרים.',
        v_sub.nedarim_keva_id, v_total_count,
        COALESCE(NEW.first_name || ' ' || NEW.last_name, 'תלמיד'),
        NEW.status, v_active_count
      );

      INSERT INTO tasks (title, description, priority, status, related_entity_type, related_entity_id, due_date)
      VALUES (v_task_title, v_task_description, 'high', 'pending', 'nedarim_subscription', v_sub.id, (CURRENT_DATE + 3));
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_nedarim_student_status ON students;
CREATE TRIGGER trg_nedarim_student_status
AFTER UPDATE OF status ON students
FOR EACH ROW
EXECUTE FUNCTION sync_nedarim_on_student_status_change();
