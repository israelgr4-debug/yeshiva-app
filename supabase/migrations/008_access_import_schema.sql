-- Schema additions needed for the Access import.
-- Adds legacy IDs (for UPSERT), new fields from Access, and student_periods table.

-- ========= students =========
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS legacy_student_id INTEGER,
  ADD COLUMN IF NOT EXISTS passport_number TEXT,
  ADD COLUMN IF NOT EXISTS id_type SMALLINT, -- 1=ת"ז, 2=דרכון
  ADD COLUMN IF NOT EXISTS last_name_previous TEXT,
  ADD COLUMN IF NOT EXISTS marital_status SMALLINT, -- 1=רווק, 2=נשוי
  ADD COLUMN IF NOT EXISTS birth_country_code SMALLINT,
  ADD COLUMN IF NOT EXISTS institution_code SMALLINT,
  ADD COLUMN IF NOT EXISTS equivalent_number SMALLINT, -- מקבילה
  ADD COLUMN IF NOT EXISTS entry_shiur TEXT, -- נכנס לישיבה בשיעור
  ADD COLUMN IF NOT EXISTS health_fund_code SMALLINT,
  ADD COLUMN IF NOT EXISTS requires_army BOOLEAN,
  ADD COLUMN IF NOT EXISTS room_number SMALLINT,
  ADD COLUMN IF NOT EXISTS yeshiva_ketana_code SMALLINT,
  ADD COLUMN IF NOT EXISTS yeshiva_ketana_name TEXT,
  ADD COLUMN IF NOT EXISTS talmud_torah_code SMALLINT,
  ADD COLUMN IF NOT EXISTS talmud_torah_name TEXT,
  ADD COLUMN IF NOT EXISTS previous_yeshiva_code SMALLINT,
  ADD COLUMN IF NOT EXISTS previous_yeshiva_name TEXT,
  ADD COLUMN IF NOT EXISTS last_delay_previous_yeshiva SMALLINT,
  ADD COLUMN IF NOT EXISTS has_payment_arrangement BOOLEAN,
  ADD COLUMN IF NOT EXISTS chizuk_exit_date DATE,
  ADD COLUMN IF NOT EXISTS chizuk_expected_return DATE,
  ADD COLUMN IF NOT EXISTS exit_date DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_legacy_id
  ON students(legacy_student_id) WHERE legacy_student_id IS NOT NULL;

-- ========= families =========
ALTER TABLE families
  ADD COLUMN IF NOT EXISTS legacy_family_id INTEGER,
  ADD COLUMN IF NOT EXISTS father_title_code SMALLINT,
  ADD COLUMN IF NOT EXISTS mother_last_name_previous TEXT,
  ADD COLUMN IF NOT EXISTS street TEXT,
  ADD COLUMN IF NOT EXISTS house_number TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood_code SMALLINT,
  ADD COLUMN IF NOT EXISTS city_code INTEGER,
  ADD COLUMN IF NOT EXISTS city_name TEXT,
  ADD COLUMN IF NOT EXISTS additional_phone TEXT,
  ADD COLUMN IF NOT EXISTS father_occupation_code SMALLINT,
  ADD COLUMN IF NOT EXISTS father_occupation_name TEXT,
  ADD COLUMN IF NOT EXISTS father_birth_country SMALLINT,
  ADD COLUMN IF NOT EXISTS mother_occupation_code SMALLINT,
  ADD COLUMN IF NOT EXISTS mother_occupation_name TEXT,
  ADD COLUMN IF NOT EXISTS mother_birth_country SMALLINT,
  ADD COLUMN IF NOT EXISTS is_staff_family BOOLEAN,
  ADD COLUMN IF NOT EXISTS credit_reference INTEGER,
  ADD COLUMN IF NOT EXISTS bank_number SMALLINT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_families_legacy_id
  ON families(legacy_family_id) WHERE legacy_family_id IS NOT NULL;

-- ========= student_periods (entry/exit history) =========
CREATE TABLE IF NOT EXISTS student_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  legacy_student_id INTEGER, -- for matching before student row exists
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_periods_student_id ON student_periods(student_id);
CREATE INDEX IF NOT EXISTS idx_student_periods_legacy ON student_periods(legacy_student_id);

ALTER TABLE student_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "student_periods_all" ON student_periods;
CREATE POLICY "student_periods_all" ON student_periods FOR ALL USING (true) WITH CHECK (true);

-- ========= lookup tables (for future UI dropdowns) =========
CREATE TABLE IF NOT EXISTS lookup_cities (
  code INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lookup_yeshivot_ketanot (
  code SMALLINT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  city_code INTEGER,
  phone TEXT
);

CREATE TABLE IF NOT EXISTS lookup_talmudei_torah (
  code SMALLINT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lookup_occupations (
  code SMALLINT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lookup_countries (
  code SMALLINT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lookup_neighborhoods (
  code SMALLINT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lookup_health_funds (
  code SMALLINT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lookup_banks (
  bank_number SMALLINT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lookup_titles (
  code SMALLINT PRIMARY KEY,
  name TEXT NOT NULL
);

-- Enable RLS on all lookups (read-only for app)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'lookup_cities', 'lookup_yeshivot_ketanot', 'lookup_talmudei_torah',
      'lookup_occupations', 'lookup_countries', 'lookup_neighborhoods',
      'lookup_health_funds', 'lookup_banks', 'lookup_titles'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_all" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s_all" ON %I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
