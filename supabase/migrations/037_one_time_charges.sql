-- One-time MASAV charges: ad-hoc standing-order debits queued and bundled
-- into MASAV files separate from the regular monthly tuition flow.

CREATE TABLE IF NOT EXISTS one_time_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  family_id  UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  charge_date DATE NOT NULL,
  description TEXT,
  notes TEXT,
  -- pending = in queue, awaiting MASAV
  -- sent    = bundled into a MASAV file
  -- paid    = bank confirmed
  -- bounced = bank returned (NSF)
  -- cancelled
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'paid', 'bounced', 'cancelled')),
  masav_send_counter INTEGER,
  masav_sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_one_time_charges_family ON one_time_charges(family_id);
CREATE INDEX IF NOT EXISTS idx_one_time_charges_student ON one_time_charges(student_id);
CREATE INDEX IF NOT EXISTS idx_one_time_charges_status ON one_time_charges(status);
CREATE INDEX IF NOT EXISTS idx_one_time_charges_date ON one_time_charges(charge_date DESC);

DROP TRIGGER IF EXISTS one_time_charges_updated_at ON one_time_charges;
CREATE TRIGGER one_time_charges_updated_at BEFORE UPDATE ON one_time_charges
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE one_time_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS one_time_charges_all ON one_time_charges;
CREATE POLICY one_time_charges_all ON one_time_charges FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
