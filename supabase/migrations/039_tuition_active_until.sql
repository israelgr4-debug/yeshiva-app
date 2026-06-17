-- Schedule a future stop date for a student's tuition.
-- When set, MASAV generation skips this student starting from the next charge
-- date after `tuition_active_until`. Until then they're billed normally.
-- NULL = no scheduled stop (regular active=true behavior).
ALTER TABLE student_tuition
  ADD COLUMN IF NOT EXISTS tuition_active_until DATE;

COMMENT ON COLUMN student_tuition.tuition_active_until IS
  'Optional: keep billing until this date (inclusive), then auto-stop. Used when a student leaves mid-month and we want one final charge.';
