-- Enhanced auto-match using set-based SQL for speed.
-- Normalizes IDs, matches father+mother, falls back to full-name match.

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
BEGIN
  -- === PASS 1: by father_id_number ===
  -- Build a map of normalized father_id_number → family_id for unique matches
  WITH unique_fathers AS (
    SELECT normalize_id(father_id_number) AS nid, MAX(id::text)::uuid AS fid
    FROM families
    WHERE father_id_number IS NOT NULL AND LENGTH(normalize_id(father_id_number)) >= 5
    GROUP BY normalize_id(father_id_number)
    HAVING COUNT(*) = 1
  ),
  updated AS (
    UPDATE nedarim_subscriptions s
    SET family_id = uf.fid
    FROM unique_fathers uf
    WHERE s.family_id IS NULL
      AND s.status <> 'deleted'
      AND LENGTH(normalize_id(s.client_zeout)) >= 5
      AND normalize_id(s.client_zeout) = uf.nid
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_by_father FROM updated;

  -- === PASS 2: by mother_id_number ===
  WITH unique_mothers AS (
    SELECT normalize_id(mother_id_number) AS nid, MAX(id::text)::uuid AS fid
    FROM families
    WHERE mother_id_number IS NOT NULL AND LENGTH(normalize_id(mother_id_number)) >= 5
    GROUP BY normalize_id(mother_id_number)
    HAVING COUNT(*) = 1
  ),
  updated AS (
    UPDATE nedarim_subscriptions s
    SET family_id = um.fid
    FROM unique_mothers um
    WHERE s.family_id IS NULL
      AND s.status <> 'deleted'
      AND LENGTH(normalize_id(s.client_zeout)) >= 5
      AND normalize_id(s.client_zeout) = um.nid
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_by_mother FROM updated;

  -- === PASS 3: family_name + father_name both appear as tokens in client_name ===
  WITH name_pairs AS (
    SELECT
      f.id AS family_id,
      TRIM(f.family_name) AS fn,
      TRIM(f.father_name) AS pn
    FROM families f
    WHERE f.family_name IS NOT NULL AND LENGTH(TRIM(f.family_name)) > 0
      AND f.father_name IS NOT NULL AND LENGTH(TRIM(f.father_name)) > 0
  ),
  candidates AS (
    SELECT s.id AS sub_id, np.family_id
    FROM nedarim_subscriptions s
    JOIN name_pairs np
      ON STRING_TO_ARRAY(TRIM(s.client_name), ' ') @> ARRAY[np.fn]
     AND STRING_TO_ARRAY(TRIM(s.client_name), ' ') @> ARRAY[np.pn]
    WHERE s.family_id IS NULL
      AND s.status <> 'deleted'
      AND s.client_name IS NOT NULL
  ),
  unique_candidates AS (
    SELECT sub_id, MAX(family_id::text)::uuid AS family_id
    FROM candidates
    GROUP BY sub_id
    HAVING COUNT(*) = 1
  ),
  updated AS (
    UPDATE nedarim_subscriptions s
    SET family_id = uc.family_id
    FROM unique_candidates uc
    WHERE s.id = uc.sub_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_by_name FROM updated;

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

  v_ambig := 0; -- set-based match silently skips ambiguous (HAVING COUNT(*)=1)

  RETURN QUERY SELECT v_by_father, v_by_mother, v_by_name, v_ambig, v_nomatch, v_missing;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION auto_match_nedarim_by_zeout() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION normalize_id(TEXT) TO authenticated, anon;
