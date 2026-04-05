-- Tuition Payment System
-- Tracks monthly tuition charges and payments for students

-- Create tuition_charges table
CREATE TABLE IF NOT EXISTS tuition_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  student_ids UUID[] NOT NULL, -- Array of student IDs in this family
  total_amount_per_month DECIMAL(10, 2) NOT NULL,
  amount_breakdown JSONB NOT NULL, -- {student_id: amount, ...}
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('standing_order', 'check', 'credit', 'office')),
  scheduled_day_of_month INTEGER CHECK (scheduled_day_of_month BETWEEN 1 AND 31),
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),

  CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT valid_standing_order CHECK (payment_method != 'standing_order' OR scheduled_day_of_month IS NOT NULL)
);

-- Create tuition_payments table
CREATE TABLE IF NOT EXISTS tuition_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  tuition_charge_id UUID NOT NULL REFERENCES tuition_charges(id) ON DELETE CASCADE,
  payment_month VARCHAR(7) NOT NULL, -- YYYY-MM format
  scheduled_date DATE NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  amount_breakdown JSONB NOT NULL, -- {student_id: amount, ...}
  status VARCHAR(50) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'collected', 'failed', 'partial')),
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('standing_order', 'check', 'credit', 'office')),
  payment_details JSONB, -- Flexible storage for method-specific data (check_number, transaction_id, etc.)
  notes TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),

  UNIQUE(family_id, tuition_charge_id, payment_month)
);

-- Create indexes for performance
CREATE INDEX idx_tuition_charges_family_id ON tuition_charges(family_id);
CREATE INDEX idx_tuition_charges_status ON tuition_charges(status);
CREATE INDEX idx_tuition_payments_family_id ON tuition_payments(family_id);
CREATE INDEX idx_tuition_payments_month ON tuition_payments(payment_month);
CREATE INDEX idx_tuition_payments_status ON tuition_payments(status);
CREATE INDEX idx_tuition_payments_scheduled_date ON tuition_payments(scheduled_date);

-- Enable RLS
ALTER TABLE tuition_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE tuition_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow authenticated users for now, can be restricted later)
CREATE POLICY "tuition_charges_read" ON tuition_charges FOR SELECT USING (true);
CREATE POLICY "tuition_charges_insert" ON tuition_charges FOR INSERT WITH CHECK (true);
CREATE POLICY "tuition_charges_update" ON tuition_charges FOR UPDATE USING (true);
CREATE POLICY "tuition_charges_delete" ON tuition_charges FOR DELETE USING (true);

CREATE POLICY "tuition_payments_read" ON tuition_payments FOR SELECT USING (true);
CREATE POLICY "tuition_payments_insert" ON tuition_payments FOR INSERT WITH CHECK (true);
CREATE POLICY "tuition_payments_update" ON tuition_payments FOR UPDATE USING (true);
CREATE POLICY "tuition_payments_delete" ON tuition_payments FOR DELETE USING (true);

-- Create trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tuition_charges_updated_at BEFORE UPDATE ON tuition_charges
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tuition_payments_updated_at BEFORE UPDATE ON tuition_payments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
