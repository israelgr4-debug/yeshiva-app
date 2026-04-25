-- Graduates (בוגרים) - alumni tracking, separate from active students.
-- Holds historical info + current address/marital state for ongoing contact.

CREATE TABLE IF NOT EXISTS graduates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linkage
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  family_id  UUID REFERENCES families(id) ON DELETE SET NULL,

  -- Identity
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  machzor_name TEXT,                 -- e.g. 'יז' (free-text Hebrew letter)
  machzor_id UUID REFERENCES machzorot(id) ON DELETE SET NULL,

  -- Current address (post-yeshiva, distinct from family address)
  street TEXT,
  building_number TEXT,
  apartment TEXT,
  entrance TEXT,
  neighborhood TEXT,                  -- free-text (separate from lookup)
  city TEXT,
  temp_address TEXT,

  -- Contact
  mobile TEXT,
  phone TEXT,
  email TEXT,

  -- Marital
  marital_status TEXT,                -- נשוי / מאורס / רווק / עזב / נפטר / —
  spouse_name TEXT,
  marriage_date_text TEXT,            -- e.g. 'אב ס"ג' (free-text Hebrew month-year)

  -- Original parents (snapshot - editable independent of family)
  father_name TEXT,
  mother_name TEXT,

  -- Spouse parents
  spouse_father_name TEXT,
  spouse_father_phone TEXT,
  spouse_mother_name TEXT,
  spouse_mother_phone TEXT,
  spouse_father_city TEXT,

  -- Lifecycle
  is_pending BOOLEAN NOT NULL DEFAULT false,  -- candidate (still active student or pending info)
  pending_reason TEXT,                         -- e.g. 'התארס', 'עזב לאחרונה'
  left_date DATE,                              -- date the student actually left
  notes TEXT,
  legacy_marker TEXT,                          -- 'נאה' col + 'הערות' col from import

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graduates_student_id ON graduates(student_id);
CREATE INDEX IF NOT EXISTS idx_graduates_family_id ON graduates(family_id);
CREATE INDEX IF NOT EXISTS idx_graduates_marital ON graduates(marital_status);
CREATE INDEX IF NOT EXISTS idx_graduates_pending ON graduates(is_pending) WHERE is_pending = true;
CREATE INDEX IF NOT EXISTS idx_graduates_machzor_name ON graduates(machzor_name);

-- updated_at trigger
CREATE OR REPLACE FUNCTION trg_graduates_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS graduates_updated_at ON graduates;
CREATE TRIGGER graduates_updated_at
BEFORE UPDATE ON graduates
FOR EACH ROW EXECUTE FUNCTION trg_graduates_set_updated_at();

-- Auto-create pending graduate when a student moves to inactive/graduated
CREATE OR REPLACE FUNCTION trg_student_to_pending_graduate()
RETURNS TRIGGER AS $$
DECLARE
  fam RECORD;
  existing_id UUID;
BEGIN
  IF NEW.status IN ('inactive', 'graduated')
     AND (OLD.status IS DISTINCT FROM NEW.status)
  THEN
    -- Skip if already converted (any row referencing this student)
    SELECT id INTO existing_id FROM graduates WHERE student_id = NEW.id LIMIT 1;
    IF existing_id IS NULL THEN
      SELECT * INTO fam FROM families WHERE id = NEW.family_id;
      INSERT INTO graduates (
        student_id, family_id, first_name, last_name,
        father_name, mother_name, mobile, email,
        is_pending, pending_reason
      ) VALUES (
        NEW.id, NEW.family_id, NEW.first_name, NEW.last_name,
        COALESCE(fam.father_name, ''), COALESCE(fam.mother_name, ''),
        COALESCE(NEW.phone, ''), COALESCE(NEW.email, ''),
        true,
        CASE WHEN NEW.status = 'graduated' THEN 'סיים' ELSE 'עזב' END
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS student_to_graduate ON students;
CREATE TRIGGER student_to_graduate
AFTER UPDATE OF status ON students
FOR EACH ROW EXECUTE FUNCTION trg_student_to_pending_graduate();

-- RLS: any authenticated user can read/write (app-level role gating)
ALTER TABLE graduates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS grad_select ON graduates;
CREATE POLICY grad_select ON graduates FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS grad_insert ON graduates;
CREATE POLICY grad_insert ON graduates FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS grad_update ON graduates;
CREATE POLICY grad_update ON graduates FOR UPDATE USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS grad_delete ON graduates;
CREATE POLICY grad_delete ON graduates FOR DELETE USING (auth.role() = 'authenticated');
