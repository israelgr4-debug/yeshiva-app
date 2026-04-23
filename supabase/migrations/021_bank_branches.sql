-- Bank branches lookup table - populated from Bank of Israel data
-- Allows the UI to show branch name when user types a branch number.

CREATE TABLE IF NOT EXISTS bank_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_code SMALLINT NOT NULL,
  branch_code SMALLINT NOT NULL,
  branch_name TEXT,
  address TEXT,
  city TEXT,
  phone TEXT,
  active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_branches_bank_branch
  ON bank_branches(bank_code, branch_code);
CREATE INDEX IF NOT EXISTS idx_bank_branches_bank ON bank_branches(bank_code);

ALTER TABLE bank_branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_branches_all" ON bank_branches FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON bank_branches TO authenticated, anon;
