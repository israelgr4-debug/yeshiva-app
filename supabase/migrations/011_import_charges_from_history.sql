-- Sync tuition_charges from the most-recent paid batch (20/04/2026).
-- For each family that paid in the batch:
--   - If no active charge exists → create one
--   - If active charge exists → UPDATE amounts/breakdown/day to match the batch
-- Historical batch is the source of truth.

CREATE OR REPLACE FUNCTION import_charges_from_batch(batch_date DATE DEFAULT '2026-04-20')
RETURNS TABLE(
  charges_created INT,
  charges_updated INT,
  charges_unchanged INT,
  students_missing INT
) AS $$
DECLARE
  v_created INT := 0;
  v_updated INT := 0;
  v_unchanged INT := 0;
  v_missing INT := 0;
  r RECORD;
  v_day INT;
  v_existing_id UUID;
  v_existing_total NUMERIC;
BEGIN
  v_day := EXTRACT(DAY FROM batch_date)::INT;

  FOR r IN
    SELECT
      s.family_id,
      array_agg(ph.student_id ORDER BY ph.student_id) AS student_ids,
      jsonb_object_agg(ph.student_id::text, ph.amount_ils) AS breakdown,
      SUM(ph.amount_ils) AS total
    FROM payment_history ph
    JOIN students s ON s.id = ph.student_id
    WHERE ph.payment_date = batch_date
      AND ph.amount_ils > 0
      AND ph.group_number IS NOT NULL   -- only standing-order rows sent to Masav
      AND s.status = 'active'
    GROUP BY s.family_id
  LOOP
    SELECT id, total_amount_per_month INTO v_existing_id, v_existing_total
    FROM tuition_charges
    WHERE family_id = r.family_id AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      INSERT INTO tuition_charges (
        family_id, student_ids, total_amount_per_month, amount_breakdown,
        payment_method, scheduled_day_of_month, status, start_date, notes
      ) VALUES (
        r.family_id, r.student_ids, r.total, r.breakdown,
        'standing_order', v_day, 'active', CURRENT_DATE,
        '[אוטומטי] נוצר מייבוא של ' || batch_date::text
      );
      v_created := v_created + 1;
    ELSIF v_existing_total = r.total THEN
      v_unchanged := v_unchanged + 1;
    ELSE
      UPDATE tuition_charges
      SET student_ids = r.student_ids,
          total_amount_per_month = r.total,
          amount_breakdown = r.breakdown,
          scheduled_day_of_month = v_day,
          notes = COALESCE(notes, '') ||
                  CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END ||
                  '[אוטומטי] עודכן מייבוא של ' || batch_date::text ||
                  ' (היה ' || v_existing_total || ' → ' || r.total || ')'
      WHERE id = v_existing_id;
      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  SELECT COUNT(DISTINCT ph.student_id) INTO v_missing
  FROM payment_history ph
  LEFT JOIN students s ON s.id = ph.student_id
  WHERE ph.payment_date = batch_date
    AND (s.id IS NULL OR s.status <> 'active');

  RETURN QUERY SELECT v_created, v_updated, v_unchanged, v_missing;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION import_charges_from_batch(DATE) TO authenticated, anon;
