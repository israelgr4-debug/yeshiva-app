-- Rolling 12-month forecast refresh, driven by tuition_charges (the source of truth).
--
-- Logic:
--  1) Delete all future pending rows (status_code IN (1,5)) from next month onward.
--     Current month and all historical rows are untouched.
--  2) For each ACTIVE tuition_charge, generate N months of payment_history rows
--     per student in the charge (using amount_breakdown), on scheduled_day_of_month.
--     Suspended / cancelled charges are ignored ⇒ they drop out of the forecast.

CREATE OR REPLACE FUNCTION refresh_forecast(months_ahead INT DEFAULT 12)
RETURNS TABLE(
  deleted_rows INT,
  created_rows INT,
  charges_processed INT,
  charges_skipped INT
) AS $$
DECLARE
  v_deleted INT := 0;
  v_created INT := 0;
  v_processed INT := 0;
  v_skipped INT := 0;
  v_cutoff DATE;
  r_charge RECORD;
  v_student_id UUID;
  v_amount NUMERIC;
  i INT;
  v_month_start DATE;
  v_last_day INT;
  v_target_day INT;
  v_target_date DATE;
BEGIN
  -- Cutoff = first day of next month (keep current month intact)
  v_cutoff := date_trunc('month', CURRENT_DATE)::DATE + INTERVAL '1 month';

  -- 1) Wipe future pending forecast rows
  DELETE FROM payment_history
  WHERE payment_date >= v_cutoff
    AND status_code IN (1, 5);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 2) Generate forecast from active charges
  FOR r_charge IN
    SELECT tc.id, tc.family_id, tc.student_ids, tc.amount_breakdown,
           tc.payment_method, tc.scheduled_day_of_month, tc.status
    FROM tuition_charges tc
  LOOP
    -- Skip non-active, exempt, or without a scheduled day
    IF r_charge.status <> 'active'
       OR r_charge.payment_method IN ('exempt', 'office')
       OR r_charge.scheduled_day_of_month IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_processed := v_processed + 1;
    v_target_day := r_charge.scheduled_day_of_month;

    -- For each student in the charge
    FOREACH v_student_id IN ARRAY r_charge.student_ids LOOP
      -- Skip students that are no longer active
      IF NOT EXISTS (
        SELECT 1 FROM students s
        WHERE s.id = v_student_id AND s.status = 'active'
      ) THEN
        CONTINUE;
      END IF;

      v_amount := (r_charge.amount_breakdown ->> v_student_id::text)::NUMERIC;
      IF v_amount IS NULL OR v_amount <= 0 THEN
        CONTINUE;
      END IF;

      -- Create N months of rows
      FOR i IN 0..(months_ahead - 1) LOOP
        v_month_start := (v_cutoff + (i || ' months')::INTERVAL)::DATE;
        v_last_day := EXTRACT(DAY FROM (v_month_start + INTERVAL '1 month' - INTERVAL '1 day'))::INT;
        v_target_date := v_month_start + (LEAST(v_target_day, v_last_day) - 1);

        INSERT INTO payment_history (
          student_id, payment_date, amount_ils,
          status_code, status_name, group_number
        ) VALUES (
          v_student_id, v_target_date, v_amount,
          1, 'לחיוב (צפי)', NULL
        );
        v_created := v_created + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT v_deleted, v_created, v_processed, v_skipped;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION refresh_forecast(INT) TO authenticated, anon;


-- =============================================================================
-- Auto-suspend tuition_charges when a student leaves or goes to chizuk.
-- When ALL students in a charge are non-active, the charge is suspended.
-- When a student returns (status → active), related suspended charges are
-- reactivated automatically (only if they were suspended by this trigger).
-- =============================================================================

CREATE OR REPLACE FUNCTION sync_charge_status_with_student()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Suspend charges where this student is listed and is now inactive,
    -- only if no other student in the charge is still active.
    IF NEW.status <> 'active' THEN
      UPDATE tuition_charges tc
      SET status = 'suspended',
          notes = COALESCE(tc.notes, '') ||
                  CASE WHEN COALESCE(tc.notes, '') = '' THEN '' ELSE E'\n' END ||
                  '[אוטומטי] הושהה בעקבות שינוי סטטוס תלמיד ל-' || NEW.status
      WHERE NEW.id = ANY(tc.student_ids)
        AND tc.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM unnest(tc.student_ids) sid
          JOIN students s ON s.id = sid
          WHERE s.id <> NEW.id AND s.status = 'active'
        );
    ELSE
      -- Student returned to active → reactivate charges auto-suspended before
      UPDATE tuition_charges tc
      SET status = 'active',
          notes = COALESCE(tc.notes, '') ||
                  CASE WHEN COALESCE(tc.notes, '') = '' THEN '' ELSE E'\n' END ||
                  '[אוטומטי] הופעל מחדש בעקבות חזרת תלמיד'
      WHERE NEW.id = ANY(tc.student_ids)
        AND tc.status = 'suspended'
        AND COALESCE(tc.notes, '') LIKE '%[אוטומטי] הושהה%';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_charge_status ON students;
CREATE TRIGGER trg_sync_charge_status
AFTER UPDATE OF status ON students
FOR EACH ROW
EXECUTE FUNCTION sync_charge_status_with_student();
