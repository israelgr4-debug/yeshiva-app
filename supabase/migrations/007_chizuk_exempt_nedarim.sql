-- Extended statuses, exempt payment method, and Nedarim Plus settings

-- 1) Add 'chizuk' to students.status
-- First drop any existing CHECK constraint on the status column
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'students'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE students DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

ALTER TABLE students
  ADD CONSTRAINT students_status_check
  CHECK (status IN ('active', 'inactive', 'graduated', 'chizuk'));

-- 2) Add 'exempt' to tuition_charges.payment_method
ALTER TABLE tuition_charges DROP CONSTRAINT IF EXISTS tuition_charges_payment_method_check;
ALTER TABLE tuition_charges
  ADD CONSTRAINT tuition_charges_payment_method_check
  CHECK (payment_method IN ('standing_order', 'check', 'credit', 'office', 'exempt'));

-- 3) Add 'exempt' to tuition_payments.payment_method
ALTER TABLE tuition_payments DROP CONSTRAINT IF EXISTS tuition_payments_payment_method_check;
ALTER TABLE tuition_payments
  ADD CONSTRAINT tuition_payments_payment_method_check
  CHECK (payment_method IN ('standing_order', 'check', 'credit', 'office', 'exempt'));

-- 4) Add Nedarim Plus API settings (empty defaults - user fills in admin UI)
INSERT INTO system_settings (key, value, description) VALUES
  ('nedarim_plus_api_url', to_jsonb(''::text), 'כתובת שרת API של נדרים פלוס'),
  ('nedarim_plus_mosad_id', to_jsonb(''::text), 'מזהה מוסד בנדרים פלוס'),
  ('nedarim_plus_api_password', to_jsonb(''::text), 'סיסמת API של נדרים פלוס (מוצפנת בצד לקוח)'),
  ('nedarim_plus_enabled', to_jsonb(false), 'האם להפעיל אינטגרציה לנדרים פלוס')
ON CONFLICT (key) DO NOTHING;

-- 5) Add a column on tuition_charges to track external provider (Nedarim Plus) charge IDs
ALTER TABLE tuition_charges
  ADD COLUMN IF NOT EXISTS external_charge_id TEXT,
  ADD COLUMN IF NOT EXISTS external_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
