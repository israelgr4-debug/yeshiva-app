-- Temporary HK amount override for credit students (REQ9 for credit).
-- A group override changes each single-student credit HK to the month's amount now,
-- and the daily cron restores it to the base amount after the HK's charge day.
-- These columns track that lifecycle so nothing gets stuck at the low amount.
ALTER TABLE charge_adjustments
  ADD COLUMN IF NOT EXISTS hk_keva_id TEXT,               -- Nedarim KevaId that was changed
  ADD COLUMN IF NOT EXISTS hk_base_amount NUMERIC(10,2),  -- amount to restore to (HK amount before override)
  ADD COLUMN IF NOT EXISTS hk_charge_day SMALLINT,        -- HK's charge day (restore only after it passes)
  ADD COLUMN IF NOT EXISTS hk_override_applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hk_override_restored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hk_error TEXT;

-- Applied-but-not-yet-restored overrides (the "pending restore" safety-net list).
CREATE INDEX IF NOT EXISTS idx_charge_adjustments_hk_pending
  ON charge_adjustments(hk_override_applied_at)
  WHERE hk_override_applied_at IS NOT NULL AND hk_override_restored_at IS NULL;
