-- Government ID for passport-holding students.
-- Some passport students are assigned a temporary id by Ministry of Religion
-- or Education for reporting purposes. We need to match BOTH the passport
-- number AND this government-assigned id when comparing ministry reports.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS govt_id_number TEXT;

CREATE INDEX IF NOT EXISTS idx_students_govt_id_number
  ON students(govt_id_number)
  WHERE govt_id_number IS NOT NULL;
