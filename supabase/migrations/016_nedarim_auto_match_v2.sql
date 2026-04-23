-- Enhanced auto-match that:
--  1) Normalizes ID numbers (strip non-digits, remove leading zeros)
--  2) Matches against BOTH father_id_number AND mother_id_number
--  3) Second pass: exact father_name + family_name (if unique)
--
-- Still: only assigns when there's exactly one matching family.

CREATE OR REPLACE FUNCTION normalize_id(id TEXT) RETURNS TEXT AS $$
  SELECT LTRIM(REGEXP_REPLACE(COALESCE(id, ''), '[^0-9]', '', 'g'), '0');
$$ LANGUAGE SQL IMMUTABLE;

DROP FUNCTION IF EXISTS auto_match_nedarim_by_zeout();

CREATE OR REPLACE FUNCTION auto_match_nedarim_by_zeout()
RETURNS TABLE(
  matched_by_father INT,
  matched_by_mother INT,
  matched_by_name INT,
  ambiguous_count INT,
  no_match_count INT,
  missing_zeout_count INT
) AS $$
DECLARE
  v_by_father INT := 0;
  v_by_mother INT := 0;
  v_by_name INT := 0;
  v_ambig INT := 0;
  v_nomatch INT := 0;
  v_missing INT := 0;
  r RECORD;
  v_family_id UUID;
  v_count INT;
  v_norm TEXT;
  v_client_tokens TEXT[];
BEGIN
  -- === PASS 1: by father_id_number or mother_id_number (normalized) ===
  FOR r IN
    SELECT id, client_zeout, client_name
    FROM nedarim_subscriptions
    WHERE family_id IS NULL
      AND status <> 'deleted'
  LOOP
    v_norm := normalize_id(r.client_zeout);

    IF v_norm IS NULL OR LENGTH(v_norm) < 5 THEN
      -- Save for pass 2 (name matching)
      CONTINUE;
    END IF;

    -- Try father first
    SELECT COUNT(*) INTO v_count
    FROM families
    WHERE normalize_id(father_id_number) = v_norm;

    IF v_count = 1 THEN
      SELECT id INTO v_family_id
      FROM families
      WHERE normalize_id(father_id_number) = v_norm
      LIMIT 1;
      UPDATE nedarim_subscriptions SET family_id = v_family_id WHERE id = r.id;
      v_by_father := v_by_father + 1;
      CONTINUE;
    ELSIF v_count > 1 THEN
      v_ambig := v_ambig + 1;
      CONTINUE;
    END IF;

    -- Try mother
    SELECT COUNT(*) INTO v_count
    FROM families
    WHERE normalize_id(mother_id_number) = v_norm;

    IF v_count = 1 THEN
      SELECT id INTO v_family_id
      FROM families
      WHERE normalize_id(mother_id_number) = v_norm
      LIMIT 1;
      UPDATE nedarim_subscriptions SET family_id = v_family_id WHERE id = r.id;
      v_by_mother := v_by_mother + 1;
    ELSIF v_count > 1 THEN
      v_ambig := v_ambig + 1;
    END IF;
  END LOOP;

  -- === PASS 2: exact "family_name + father_name" match for rows without zeout or no id-match ===
  FOR r IN
    SELECT id, client_zeout, client_name
    FROM nedarim_subscriptions
    WHERE family_id IS NULL
      AND status <> 'deleted'
      AND client_name IS NOT NULL
      AND LENGTH(TRIM(client_name)) > 0
  LOOP
    v_client_tokens := STRING_TO_ARRAY(TRIM(r.client_name), ' ');

    IF array_length(v_client_tokens, 1) < 2 THEN
      CONTINUE;
    END IF;

    -- Try: find exactly one family where BOTH the family_name and father_name tokens
    -- are present as full words in client_name.
    -- A conservative match: if a family's (family_name, father_name) pair both appear
    -- as tokens in client_name, and there's exactly one such family.
    SELECT COUNT(*) INTO v_count
    FROM families
    WHERE family_name IS NOT NULL
      AND father_name IS NOT NULL
      AND TRIM(family_name) = ANY(v_client_tokens)
      AND TRIM(father_name) = ANY(v_client_tokens);

    IF v_count = 1 THEN
      SELECT id INTO v_family_id
      FROM families
      WHERE family_name IS NOT NULL
        AND father_name IS NOT NULL
        AND TRIM(family_name) = ANY(v_client_tokens)
        AND TRIM(father_name) = ANY(v_client_tokens)
      LIMIT 1;
      UPDATE nedarim_subscriptions SET family_id = v_family_id WHERE id = r.id;
      v_by_name := v_by_name + 1;
    END IF;
  END LOOP;

  -- === Final tally ===
  SELECT COUNT(*) INTO v_nomatch
  FROM nedarim_subscriptions
  WHERE family_id IS NULL
    AND status <> 'deleted'
    AND LENGTH(normalize_id(client_zeout)) >= 5;

  SELECT COUNT(*) INTO v_missing
  FROM nedarim_subscriptions
  WHERE family_id IS NULL
    AND status <> 'deleted'
    AND (client_zeout IS NULL OR LENGTH(normalize_id(client_zeout)) < 5);

  RETURN QUERY SELECT v_by_father, v_by_mother, v_by_name, v_ambig, v_nomatch, v_missing;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION auto_match_nedarim_by_zeout() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION normalize_id(TEXT) TO authenticated, anon;
