-- =============================================================================
-- Student-level tuition obligations: the new source of truth.
-- Each active student has ONE student_tuition row that defines:
--   - How they pay (bank / credit / office / exempt / none)
--   - How much monthly
--   - Link to the actual subscription (if bank or credit)
--
-- Subscriptions (Nedarim HKs, Masav HKs) can cover multiple students;
-- each student's share lives here, not in the subscription.
-- =============================================================================

CREATE TABLE IF NOT EXISTS student_tuition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,

  payment_method TEXT NOT NULL
    CHECK (payment_method IN ('bank_ho', 'credit_nedarim', 'office', 'exempt', 'none')),
  monthly_amount NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- When method = 'credit_nedarim', link to the Nedarim subscription.
  -- One subscription can be linked by multiple students (parent pays for all kids).
  nedarim_subscription_id UUID REFERENCES nedarim_subscriptions(id) ON DELETE SET NULL,

  -- When method = 'bank_ho', this is the day of month to charge.
  -- Default 20 per yeshiva policy.
  bank_day SMALLINT DEFAULT 20 CHECK (bank_day BETWEEN 1 AND 31),

  active BOOLEAN NOT NULL DEFAULT true,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_tuition_method ON student_tuition(payment_method);
CREATE INDEX IF NOT EXISTS idx_student_tuition_active ON student_tuition(active);
CREATE INDEX IF NOT EXISTS idx_student_tuition_nedarim_sub ON student_tuition(nedarim_subscription_id);

CREATE TRIGGER student_tuition_updated_at BEFORE UPDATE ON student_tuition
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE student_tuition ENABLE ROW LEVEL SECURITY;
CREATE POLICY "student_tuition_all" ON student_tuition FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON student_tuition TO authenticated, anon;

-- =============================================================================
-- Office payments (cash / check / other manual entries at the office)
-- =============================================================================
CREATE TABLE IF NOT EXISTS office_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  payment_date DATE NOT NULL,
  method TEXT,                              -- 'cash' | 'check' | 'transfer' | 'other'
  reference TEXT,                           -- check number / transfer id
  covers_month TEXT,                        -- 'YYYY-MM' which month this payment covers
  received_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_payments_student ON office_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_office_payments_date ON office_payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_office_payments_month ON office_payments(covers_month);

ALTER TABLE office_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "office_payments_all" ON office_payments FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON office_payments TO authenticated, anon;

-- =============================================================================
-- Unified view: all tuition payments across all sources, per student
-- =============================================================================
-- Sources:
--   1. Nedarim transactions (credit HK charges)
--   2. Office payments (manual entries)
--   3. Bank Masav charges (from payment_history, but filtered to tuition only)
--
-- We return a union with a consistent shape.

CREATE OR REPLACE VIEW student_payments_unified AS
SELECT
  nt.id,
  'credit' AS source,
  nt.subscription_id::text AS source_ref,
  s.id AS student_id,
  nt.amount,
  nt.transaction_date AS payment_date,
  nt.result AS status,
  nt.status_text,
  nt.groupe AS category,
  nt.confirmation,
  nt.last_4,
  NULL::text AS note
FROM nedarim_transactions nt
JOIN nedarim_subscriptions ns ON ns.id = nt.subscription_id
JOIN students s ON s.id = ANY(ns.student_ids)
WHERE nt.result = 'success'

UNION ALL

SELECT
  op.id,
  'office' AS source,
  op.id::text AS source_ref,
  op.student_id,
  op.amount,
  op.payment_date,
  'success' AS status,
  op.method AS status_text,
  NULL AS category,
  op.reference AS confirmation,
  NULL AS last_4,
  op.notes AS note
FROM office_payments op

UNION ALL

SELECT
  ph.id,
  'bank' AS source,
  ph.legacy_donation_id::text AS source_ref,
  ph.student_id,
  ph.amount_ils AS amount,
  ph.payment_date,
  CASE ph.status_code
    WHEN 2 THEN 'success'
    WHEN 3 THEN 'returned'
    WHEN 1 THEN 'pending'
    ELSE 'other'
  END AS status,
  ph.status_name AS status_text,
  NULL AS category,
  NULL AS confirmation,
  NULL AS last_4,
  NULL AS note
FROM payment_history ph
WHERE ph.status_code IN (2, 3);

GRANT SELECT ON student_payments_unified TO authenticated, anon;

-- =============================================================================
-- Backfill function: build student_tuition from existing data
-- Rules:
--  1. For each active Nedarim subscription with status='active' AND family_id matched:
--       For each student_id in student_ids (if empty, use all active students of family):
--         Create student_tuition method='credit_nedarim', nedarim_subscription_id=sub.id
--         Amount = sub.amount_per_charge / count(students) (even split)
--  2. For each active tuition_charges with payment_method='standing_order' AND status='active':
--       For each student_id in student_ids:
--         Create student_tuition method='bank_ho', bank_day=scheduled_day_of_month
--         Amount from amount_breakdown or (total / count)
--  3. Active students not covered by above → method='none', amount=0
--
-- Safe to re-run: won't overwrite existing student_tuition rows (UNIQUE(student_id)).
-- =============================================================================

CREATE OR REPLACE FUNCTION backfill_student_tuition()
RETURNS TABLE(
  from_nedarim INT,
  from_bank INT,
  defaulted_to_none INT,
  already_existing INT
) AS $$
DECLARE
  v_nedarim INT := 0;
  v_bank INT := 0;
  v_none INT := 0;
  v_existing INT;
  r RECORD;
  v_students UUID[];
  v_per_student NUMERIC;
  v_sid UUID;
  v_amount NUMERIC;
BEGIN
  -- Count existing before we start
  SELECT COUNT(*) INTO v_existing FROM student_tuition;

  -- === PASS 1: Nedarim credit subscriptions ===
  FOR r IN
    SELECT ns.id, ns.family_id, ns.student_ids, ns.amount_per_charge, ns.amount_breakdown
    FROM nedarim_subscriptions ns
    WHERE ns.status = 'active'
      AND ns.family_id IS NOT NULL
  LOOP
    -- Resolve students: use student_ids if present, else all active students of family
    IF r.student_ids IS NOT NULL AND array_length(r.student_ids, 1) > 0 THEN
      v_students := r.student_ids;
    ELSE
      SELECT array_agg(id) INTO v_students
      FROM students WHERE family_id = r.family_id AND status = 'active';
    END IF;

    IF v_students IS NULL OR array_length(v_students, 1) = 0 THEN
      CONTINUE;
    END IF;

    -- Even split (user can edit afterwards)
    v_per_student := ROUND(r.amount_per_charge::numeric / array_length(v_students, 1), 2);

    FOREACH v_sid IN ARRAY v_students LOOP
      -- Check breakdown first (if exists)
      v_amount := v_per_student;
      IF r.amount_breakdown IS NOT NULL AND (r.amount_breakdown ? v_sid::text) THEN
        v_amount := (r.amount_breakdown ->> v_sid::text)::numeric;
      END IF;

      INSERT INTO student_tuition (student_id, payment_method, monthly_amount, nedarim_subscription_id, notes)
      VALUES (v_sid, 'credit_nedarim', v_amount, r.id, '[אוטומטי] יובא מהוק נדרים פעילה')
      ON CONFLICT (student_id) DO NOTHING;

      IF FOUND THEN v_nedarim := v_nedarim + 1; END IF;
    END LOOP;
  END LOOP;

  -- === PASS 2: Bank (Masav) standing orders from tuition_charges ===
  FOR r IN
    SELECT tc.id, tc.family_id, tc.student_ids, tc.total_amount_per_month AS amount_per_charge,
           tc.amount_breakdown, tc.scheduled_day_of_month
    FROM tuition_charges tc
    WHERE tc.status = 'active'
      AND tc.payment_method = 'standing_order'
  LOOP
    IF r.student_ids IS NOT NULL AND array_length(r.student_ids, 1) > 0 THEN
      v_students := r.student_ids;
    ELSE
      SELECT array_agg(id) INTO v_students
      FROM students WHERE family_id = r.family_id AND status = 'active';
    END IF;

    IF v_students IS NULL OR array_length(v_students, 1) = 0 THEN
      CONTINUE;
    END IF;

    v_per_student := ROUND(r.amount_per_charge::numeric / array_length(v_students, 1), 2);

    FOREACH v_sid IN ARRAY v_students LOOP
      v_amount := v_per_student;
      IF r.amount_breakdown IS NOT NULL AND (r.amount_breakdown ? v_sid::text) THEN
        v_amount := (r.amount_breakdown ->> v_sid::text)::numeric;
      END IF;

      INSERT INTO student_tuition (student_id, payment_method, monthly_amount, bank_day, notes)
      VALUES (v_sid, 'bank_ho', v_amount, COALESCE(r.scheduled_day_of_month, 20),
              '[אוטומטי] יובא מהוק בנקאי (מס"ב) פעילה')
      ON CONFLICT (student_id) DO NOTHING;

      IF FOUND THEN v_bank := v_bank + 1; END IF;
    END LOOP;
  END LOOP;

  -- === PASS 3: Active students without any tuition row → 'none' ===
  FOR r IN
    SELECT s.id
    FROM students s
    WHERE s.status = 'active'
      AND NOT EXISTS (SELECT 1 FROM student_tuition st WHERE st.student_id = s.id)
  LOOP
    INSERT INTO student_tuition (student_id, payment_method, monthly_amount, notes)
    VALUES (r.id, 'none', 0, '[אוטומטי] לא סומן אופן תשלום - נדרש טיפול')
    ON CONFLICT (student_id) DO NOTHING;
    IF FOUND THEN v_none := v_none + 1; END IF;
  END LOOP;

  RETURN QUERY SELECT v_nedarim, v_bank, v_none, v_existing;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION backfill_student_tuition() TO authenticated, anon;
