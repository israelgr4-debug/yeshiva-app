-- =============================================================================
-- Bounce (הו"ק חזר) resolution tracking — REQ 4/5/6.
--
-- A bounced charge is a payment_history row with status_code = 3 (חזר).
-- These columns record HOW the manager resolved it:
--   'manual'       - handled outside the system (paid cash / etc.)
--   'next_month'   - added to next month's collection (a charge_adjustment)
--   'installments' - split across N months (N charge_adjustments)
--   'recharge'     - a new dated charge was created (one_time_charge)
-- The actual re-charge rows link back via charge_adjustments.bounce_payment_id
-- (added in migration 045) or one_time_charges.
-- =============================================================================

ALTER TABLE payment_history
  ADD COLUMN IF NOT EXISTS bounce_resolution TEXT
    CHECK (bounce_resolution IN ('manual', 'next_month', 'installments', 'recharge')),
  ADD COLUMN IF NOT EXISTS bounce_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounce_note TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_history_bounced
  ON payment_history(payment_date DESC)
  WHERE status_code = 3;
