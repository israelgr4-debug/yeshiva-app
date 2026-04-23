-- Smart re-match of student_tuition from Nedarim subscriptions,
-- fixing the "even split" issue: when a family has N HKs and N active
-- students, each student should be matched to ONE HK (1:1) using the
-- HK's successful_charges count + creation date as a heuristic.
--
-- Logic:
--   Case 1: family has N active students AND N active Nedarim HKs
--           → 1:1 match, by ordering students by date_of_birth (oldest first)
--             and HKs by successful_charges DESC (most charges first).
--   Case 2: family has 1 HK with N students
--           → even split (keep old behavior)
--   Case 3: family has K HKs and M students where K != M and K != 1 and M != 1
--           → leave as 'none' for manual review (can't auto-infer)

DROP FUNCTION IF EXISTS smart_rematch_student_tuition();

CREATE OR REPLACE FUNCTION smart_rematch_student_tuition()
RETURNS TABLE(
  rematched_1to1 INT,
  even_split INT,
  left_for_manual INT,
  families_processed INT
) AS $$
DECLARE
  v_1to1 INT := 0;
  v_split INT := 0;
  v_manual INT := 0;
  v_families INT := 0;
  f_row RECORD;
  hk_count INT;
  st_count INT;
  pair RECORD;
  hk_ids UUID[];
  st_ids UUID[];
  amounts NUMERIC[];
  i INT;
BEGIN
  -- Iterate over families that have at least one active Nedarim sub
  FOR f_row IN
    SELECT DISTINCT family_id
    FROM nedarim_subscriptions
    WHERE status = 'active' AND family_id IS NOT NULL
  LOOP
    v_families := v_families + 1;

    -- Count HKs and active students for this family
    SELECT COUNT(*) INTO hk_count
    FROM nedarim_subscriptions
    WHERE family_id = f_row.family_id AND status = 'active';

    SELECT COUNT(*) INTO st_count
    FROM students
    WHERE family_id = f_row.family_id AND status = 'active';

    -- Remove existing credit_nedarim tuition rows for this family's students
    -- (to re-assign cleanly)
    DELETE FROM student_tuition st
    USING students s
    WHERE st.student_id = s.id
      AND s.family_id = f_row.family_id
      AND st.payment_method = 'credit_nedarim'
      AND COALESCE(st.notes, '') LIKE '%אוטומטי%';

    -- Case 1: equal count → 1:1 match
    IF hk_count = st_count AND hk_count > 1 THEN
      -- Collect HKs ordered by successful_charges DESC (most payments = oldest student)
      SELECT array_agg(id ORDER BY successful_charges DESC NULLS LAST, created_in_nedarim ASC NULLS LAST),
             array_agg(amount_per_charge ORDER BY successful_charges DESC NULLS LAST, created_in_nedarim ASC NULLS LAST)
      INTO hk_ids, amounts
      FROM nedarim_subscriptions
      WHERE family_id = f_row.family_id AND status = 'active';

      -- Collect students ordered by date_of_birth ASC (oldest first)
      SELECT array_agg(id ORDER BY date_of_birth ASC NULLS LAST, created_at ASC)
      INTO st_ids
      FROM students
      WHERE family_id = f_row.family_id AND status = 'active';

      -- Pair them up
      FOR i IN 1..hk_count LOOP
        INSERT INTO student_tuition (student_id, payment_method, monthly_amount, nedarim_subscription_id, notes)
        VALUES (st_ids[i], 'credit_nedarim', amounts[i], hk_ids[i],
                '[אוטומטי] שוייך לפי היסטוריית חיובים (תלמיד ותיק→הוק ותיקה)')
        ON CONFLICT (student_id) DO UPDATE SET
          payment_method = EXCLUDED.payment_method,
          monthly_amount = EXCLUDED.monthly_amount,
          nedarim_subscription_id = EXCLUDED.nedarim_subscription_id,
          notes = EXCLUDED.notes
        WHERE student_tuition.payment_method IN ('none', 'credit_nedarim');
        v_1to1 := v_1to1 + 1;
      END LOOP;

      -- Also sync student_ids on each sub to the assigned student
      FOR i IN 1..hk_count LOOP
        UPDATE nedarim_subscriptions
        SET student_ids = ARRAY[st_ids[i]]
        WHERE id = hk_ids[i];
      END LOOP;

    -- Case 2: exactly ONE HK, N students → even split (or use breakdown)
    ELSIF hk_count = 1 AND st_count > 0 THEN
      DECLARE
        sub_record RECORD;
        per_student NUMERIC;
      BEGIN
        SELECT id, amount_per_charge, amount_breakdown INTO sub_record
        FROM nedarim_subscriptions
        WHERE family_id = f_row.family_id AND status = 'active'
        LIMIT 1;

        SELECT array_agg(id) INTO st_ids
        FROM students
        WHERE family_id = f_row.family_id AND status = 'active';

        per_student := ROUND(sub_record.amount_per_charge::numeric / st_count, 2);

        FOR i IN 1..st_count LOOP
          INSERT INTO student_tuition (student_id, payment_method, monthly_amount, nedarim_subscription_id, notes)
          VALUES (st_ids[i], 'credit_nedarim',
            COALESCE((sub_record.amount_breakdown ->> st_ids[i]::text)::numeric, per_student),
            sub_record.id,
            '[אוטומטי] פוצל שווה - הוק אחת לכל המשפחה')
          ON CONFLICT (student_id) DO UPDATE SET
            payment_method = EXCLUDED.payment_method,
            monthly_amount = EXCLUDED.monthly_amount,
            nedarim_subscription_id = EXCLUDED.nedarim_subscription_id,
            notes = EXCLUDED.notes
          WHERE student_tuition.payment_method IN ('none', 'credit_nedarim');
          v_split := v_split + 1;
        END LOOP;

        -- Update sub's student_ids to include all these students
        UPDATE nedarim_subscriptions
        SET student_ids = st_ids
        WHERE id = sub_record.id;
      END;

    -- Case 3: mismatched count - leave manual
    ELSIF hk_count > 0 AND st_count > 0 THEN
      v_manual := v_manual + (hk_count * st_count);
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_1to1, v_split, v_manual, v_families;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION smart_rematch_student_tuition() TO authenticated, anon;
