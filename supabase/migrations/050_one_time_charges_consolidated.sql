-- Consolidated creation of one_time_charges.
-- Migration 037 was never applied to this DB, and it referenced
-- trigger_set_updated_at() which also does not exist here. This migration creates
-- the table WITH the credit-channel columns (from 049) built in, and uses
-- update_updated_at_column() which DOES exist. Run THIS instead of 037 + 049.

CREATE TABLE IF NOT EXISTS one_time_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  family_id  UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  charge_date DATE NOT NULL,
  description TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'paid', 'bounced', 'cancelled')),
  masav_send_counter INTEGER,
  masav_sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  channel TEXT NOT NULL DEFAULT 'bank' CHECK (channel IN ('bank', 'credit')),
  nedarim_transaction_id TEXT,
  nedarim_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- If a partial table already existed, make sure the newer columns are present.
ALTER TABLE one_time_charges
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'bank',
  ADD COLUMN IF NOT EXISTS nedarim_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS nedarim_error TEXT;

CREATE INDEX IF NOT EXISTS idx_one_time_charges_family ON one_time_charges(family_id);
CREATE INDEX IF NOT EXISTS idx_one_time_charges_student ON one_time_charges(student_id);
CREATE INDEX IF NOT EXISTS idx_one_time_charges_status ON one_time_charges(status);
CREATE INDEX IF NOT EXISTS idx_one_time_charges_date ON one_time_charges(charge_date DESC);
CREATE INDEX IF NOT EXISTS idx_one_time_charges_credit_due
  ON one_time_charges(charge_date) WHERE channel = 'credit' AND status = 'pending';

DROP TRIGGER IF EXISTS one_time_charges_updated_at ON one_time_charges;
CREATE TRIGGER one_time_charges_updated_at BEFORE UPDATE ON one_time_charges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE one_time_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS one_time_charges_all ON one_time_charges;
CREATE POLICY one_time_charges_all ON one_time_charges FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
GRANT ALL ON one_time_charges TO authenticated;
