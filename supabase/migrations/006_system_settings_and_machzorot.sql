-- System settings table and pre-populate machzorot
-- Provides central configuration storage and baseline machzor records for enrollment.

-- 1) system_settings table (key-value store)
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT now()
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_settings_read" ON system_settings;
DROP POLICY IF EXISTS "system_settings_insert" ON system_settings;
DROP POLICY IF EXISTS "system_settings_update" ON system_settings;
DROP POLICY IF EXISTS "system_settings_delete" ON system_settings;

CREATE POLICY "system_settings_read" ON system_settings FOR SELECT USING (true);
CREATE POLICY "system_settings_insert" ON system_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "system_settings_update" ON system_settings FOR UPDATE USING (true);
CREATE POLICY "system_settings_delete" ON system_settings FOR DELETE USING (true);

-- 2) Default settings (use to_jsonb to handle special chars like gershayim)
INSERT INTO system_settings (key, value, description) VALUES
  ('current_school_year', to_jsonb('תשפ"ו'::text), 'שנת לימודים נוכחית'),
  ('base_machzor_for_shiur_alef', to_jsonb(25), 'מספר מחזור לתלמידים חדשים שנרשמים לשיעור א')
ON CONFLICT (key) DO NOTHING;

-- 3) Pre-populate machzorot table (numbers 20 to 45 - covers past & future)
DO $$
DECLARE
  machzor_num INTEGER;
  hebrew_name TEXT;
  full_name TEXT;
  existing_count INTEGER;
BEGIN
  FOR machzor_num IN 20..45 LOOP
    hebrew_name := CASE machzor_num
      WHEN 20 THEN 'כ'   WHEN 21 THEN 'כא'  WHEN 22 THEN 'כב'  WHEN 23 THEN 'כג'
      WHEN 24 THEN 'כד'  WHEN 25 THEN 'כה'  WHEN 26 THEN 'כו'  WHEN 27 THEN 'כז'
      WHEN 28 THEN 'כח'  WHEN 29 THEN 'כט'  WHEN 30 THEN 'ל'   WHEN 31 THEN 'לא'
      WHEN 32 THEN 'לב'  WHEN 33 THEN 'לג'  WHEN 34 THEN 'לד'  WHEN 35 THEN 'לה'
      WHEN 36 THEN 'לו'  WHEN 37 THEN 'לז'  WHEN 38 THEN 'לח'  WHEN 39 THEN 'לט'
      WHEN 40 THEN 'מ'   WHEN 41 THEN 'מא'  WHEN 42 THEN 'מב'  WHEN 43 THEN 'מג'
      WHEN 44 THEN 'מד'  WHEN 45 THEN 'מה'
      ELSE machzor_num::text
    END;

    full_name := 'מחזור ' || hebrew_name;

    -- Check if a machzor with this number already exists
    SELECT COUNT(*) INTO existing_count
    FROM machzorot
    WHERE number = machzor_num;

    IF existing_count = 0 THEN
      INSERT INTO machzorot (name, number, start_year, notes)
      VALUES (full_name, machzor_num, 2000 + machzor_num, '');
    END IF;
  END LOOP;
END $$;
