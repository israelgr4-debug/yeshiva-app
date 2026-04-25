-- Registration table - candidates applying to next year's first-year (שיעור א).
-- During summer the school accepts applications, schedules tests per source
-- yeshiva, marks who passed, and on acceptance promotes them into the
-- students table at שיעור 0 (which becomes שיעור א on year-up).

CREATE TABLE IF NOT EXISTS registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Student personal info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  id_number TEXT,
  passport_number TEXT,
  date_of_birth DATE,
  phone TEXT,
  email TEXT,

  -- Family info (free text - linked to a Family row only after acceptance)
  father_name TEXT,
  father_phone TEXT,
  father_id_number TEXT,
  father_email TEXT,
  mother_name TEXT,
  mother_phone TEXT,
  mother_id_number TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  home_phone TEXT,

  -- Previous education
  prev_yeshiva_name TEXT,           -- ישיבה קטנה (source yeshiva for the test)
  prev_yeshiva_city TEXT,
  prev_talmud_torah TEXT,
  prev_class_completed TEXT,

  -- Test scheduling
  test_date DATE,
  test_time TIME,
  test_mesechta TEXT,
  test_perek TEXT,
  test_daf_from TEXT,
  test_daf_to TEXT,
  test_sugya TEXT,
  test_notes TEXT,
  test_grade TEXT,                  -- free text or 0-100

  -- Day of test - photo
  photo_url TEXT,

  -- Decision flow
  status TEXT NOT NULL DEFAULT 'registered',
  -- registered: just signed up
  -- tested:    finished the test, decision pending
  -- accepted:  passed - awaiting conversion
  -- rejected:  did not pass / didn't show up
  -- converted: a student row was created from this registration
  decided_at TIMESTAMP,
  decided_by UUID REFERENCES app_users(id),
  converted_to_student_id UUID REFERENCES students(id) ON DELETE SET NULL,

  notes TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT registrations_status_chk CHECK (status IN
    ('registered', 'tested', 'accepted', 'rejected', 'converted'))
);

CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_test_date ON registrations(test_date);
CREATE INDEX IF NOT EXISTS idx_registrations_prev_yeshiva ON registrations(prev_yeshiva_name);
CREATE INDEX IF NOT EXISTS idx_registrations_id_number ON registrations(id_number);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION trg_registrations_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS registrations_updated_at ON registrations;
CREATE TRIGGER registrations_updated_at
BEFORE UPDATE ON registrations
FOR EACH ROW EXECUTE FUNCTION trg_registrations_set_updated_at();

-- RLS - allow anyone authenticated to read; only admin/manager can write
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reg_select ON registrations;
CREATE POLICY reg_select ON registrations FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS reg_insert ON registrations;
CREATE POLICY reg_insert ON registrations FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS reg_update ON registrations;
CREATE POLICY reg_update ON registrations FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS reg_delete ON registrations;
CREATE POLICY reg_delete ON registrations FOR DELETE USING (auth.role() = 'authenticated');

-- Storage bucket for registration photos
-- (Run separately if needed:
--   INSERT INTO storage.buckets (id, name, public) VALUES ('registration-photos','registration-photos',true) ON CONFLICT DO NOTHING;
-- )
