-- Auto-match nedarim_subscriptions to families by exact father_id_number match.
-- Only matches subscriptions where:
--   - subscription has client_zeout AND
--   - exactly one family has matching father_id_number
-- Ambiguous cases (zero or multiple matches) are left unmatched for manual review.

CREATE OR REPLACE FUNCTION auto_match_nedarim_by_zeout()
RETURNS TABLE(
  matched_count INT,
  ambiguous_count INT,
  no_match_count INT,
  missing_zeout_count INT
) AS $$
DECLARE
  v_matched INT := 0;
  v_ambig INT := 0;
  v_nomatch INT := 0;
  v_missing INT := 0;
  r RECORD;
  v_family_id UUID;
  v_count INT;
BEGIN
  FOR r IN
    SELECT id, client_zeout
    FROM nedarim_subscriptions
    WHERE family_id IS NULL
      AND status <> 'deleted'
  LOOP
    IF r.client_zeout IS NULL OR LENGTH(TRIM(r.client_zeout)) = 0 THEN
      v_missing := v_missing + 1;
      CONTINUE;
    END IF;

    -- Find families with matching father_id_number
    SELECT COUNT(*), MIN(id)
      INTO v_count, v_family_id
    FROM families
    WHERE TRIM(father_id_number) = TRIM(r.client_zeout);

    IF v_count = 1 THEN
      UPDATE nedarim_subscriptions
         SET family_id = v_family_id
       WHERE id = r.id;
      v_matched := v_matched + 1;
    ELSIF v_count > 1 THEN
      v_ambig := v_ambig + 1;
    ELSE
      v_nomatch := v_nomatch + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_matched, v_ambig, v_nomatch, v_missing;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION auto_match_nedarim_by_zeout() TO authenticated, anon;
