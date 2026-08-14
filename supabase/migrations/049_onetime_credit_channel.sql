-- Extend one-time charges to support CREDIT (Nedarim) in addition to bank (MASAV).
-- Bank charges bundle into a MASAV file for the chosen date. Credit charges are fired
-- via Nedarim TashlumBodedNew when their charge_date arrives (by the daily cron, or the
-- "בצע עכשיו" button) — since a Nedarim single charge is immediate, not schedulable.
ALTER TABLE one_time_charges
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'bank'
    CHECK (channel IN ('bank', 'credit')),
  ADD COLUMN IF NOT EXISTS nedarim_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS nedarim_error TEXT;

CREATE INDEX IF NOT EXISTS idx_one_time_charges_credit_due
  ON one_time_charges(charge_date)
  WHERE channel = 'credit' AND status = 'pending';
