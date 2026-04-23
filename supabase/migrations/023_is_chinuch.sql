-- Add is_chinuch flag to students - indicates student is registered under
-- the yeshiva's sub-institution (חינוך). Used to:
--  1. Display a tag in student card
--  2. Export to Excel reports
--  3. Switch the certificate letterhead/logo to the חינוך brand

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS is_chinuch BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_students_is_chinuch ON students(is_chinuch)
  WHERE is_chinuch = true;
