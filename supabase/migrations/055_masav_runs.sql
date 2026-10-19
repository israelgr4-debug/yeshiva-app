-- =============================================================================
-- Remember every מס"ב file the system PRODUCED (not the file itself — just what was in
-- it), so the manager can later mark that exact run as paid, even if data changed
-- since. One row per export + one item per student with the amount that was billed.
-- =============================================================================

CREATE TABLE IF NOT EXISTS masav_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'tuition',          -- 'tuition' (monthly הו"ק file)
  charge_date DATE NOT NULL,                      -- תאריך החיוב in the file
  send_counter INTEGER NOT NULL,                  -- מספר שידור (group_number on payment_history)
  family_count INTEGER NOT NULL DEFAULT 0,
  student_count INTEGER NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by TEXT,
  marked_paid_at TIMESTAMPTZ,                     -- null = not yet marked as paid
  marked_paid_by TEXT,
  mark_result JSONB,                              -- {inserted, updated, skipped, errors[]}
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS masav_run_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES masav_runs(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  family_id UUID REFERENCES families(id) ON DELETE SET NULL,
  student_name TEXT,
  family_name TEXT,
  bank TEXT,
  branch TEXT,
  account TEXT,
  amount NUMERIC(10,2) NOT NULL,                  -- this student's share in the file
  created_at TIMESTAMPTZ DEFAULT now()
);

-- A produced file is OPEN until the manager either marks it "שודר וזוכה" (marked_paid_at)
-- or cancels it (cancelled_at) to produce a new one.
ALTER TABLE masav_runs ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE masav_runs ADD COLUMN IF NOT EXISTS cancelled_by TEXT;

CREATE INDEX IF NOT EXISTS idx_masav_runs_date ON masav_runs(charge_date DESC);
CREATE INDEX IF NOT EXISTS idx_masav_run_items_run ON masav_run_items(run_id);

DROP TRIGGER IF EXISTS masav_runs_updated_at ON masav_runs;
CREATE TRIGGER masav_runs_updated_at BEFORE UPDATE ON masav_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE masav_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE masav_run_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS masav_runs_all ON masav_runs;
CREATE POLICY masav_runs_all ON masav_runs FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS masav_run_items_all ON masav_run_items;
CREATE POLICY masav_run_items_all ON masav_run_items FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
GRANT ALL ON masav_runs, masav_run_items TO authenticated;
