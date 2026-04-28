-- Store path to student's ID/passport scan (sensitive - private bucket).
-- The bucket 'student-id-scans' must be created manually as PRIVATE.

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS id_scan_path TEXT,
  ADD COLUMN IF NOT EXISTS id_scan_uploaded_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_students_has_id_scan
  ON students(id_scan_path) WHERE id_scan_path IS NOT NULL;
