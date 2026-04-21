-- Payment history: each row is one monthly collection event (from Access תנועות).
-- Decoupled from tuition_charges - useful for showing history per student.

CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  legacy_donor_id INTEGER, -- original מספר תורם in Access
  legacy_donation_id INTEGER, -- מספר תרומה
  legacy_detail_number INTEGER, -- מספר פרוט
  payment_date DATE,
  amount_ils DECIMAL(10, 2),
  status_code SMALLINT, -- 1=לחיוב, 2=נפרע, 3=חזר, 4=לא לחייב, 5=שידור מרוכז
  status_name TEXT,
  group_number INTEGER,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_history_student ON payment_history(student_id);
CREATE INDEX IF NOT EXISTS idx_payment_history_date ON payment_history(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payment_history_legacy ON payment_history(legacy_donor_id, legacy_donation_id);

ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payment_history_all" ON payment_history;
CREATE POLICY "payment_history_all" ON payment_history FOR ALL USING (true) WITH CHECK (true);
