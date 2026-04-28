-- Track which status the period represents (active / chizuk / inactive / graduated)
-- so the timeline can show entry/exit + chizuk transitions.

ALTER TABLE student_periods
  ADD COLUMN IF NOT EXISTS status TEXT;

CREATE INDEX IF NOT EXISTS idx_student_periods_status ON student_periods(status);
