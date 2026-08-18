-- =============================================================================
-- Per-student FREEZE (הקפאה) for X consecutive months.
--
-- A freeze is modelled as N consecutive `override` adjustments of amount 0,
-- one per frozen month, all sharing a `freeze_group` id and tagged is_freeze.
--   final(student, frozen month) = (override 0) + additions = 0
-- so it flows through the monthly screen and the MASAV export with no new math
-- (a ₪0 family total is already excluded from MASAV).
--
-- For CREDIT (Nedarim) students the DB amount alone can't stop the HK — the card
-- is charged automatically every month. So on freeze we ALSO suspend the HK now
-- (DisableKeva) and queue a RESUME (EnableKevaNew) scheduled for the first day of
-- the month after the freeze ends. The daily cron (process-queue) fires it then.
-- Shared HKs (siblings on one card) are skipped and flagged for manual handling.
--
-- These freeze/suspend columns are SEPARATE from the mig-051 hk_override_* columns
-- so the "pending restore" banner and restore-hk-overrides cron never touch a
-- freeze (a freeze resumes months later, not the day after the charge).
-- =============================================================================

ALTER TABLE charge_adjustments
  ADD COLUMN IF NOT EXISTS is_freeze BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS freeze_group UUID,               -- links the N months of one freeze
  ADD COLUMN IF NOT EXISTS hk_suspended_at TIMESTAMPTZ,     -- credit HK suspended for this freeze (on the group's rows)
  ADD COLUMN IF NOT EXISTS hk_resume_scheduled_for DATE,    -- when the HK is scheduled to resume
  ADD COLUMN IF NOT EXISTS hk_resume_queue_id UUID;         -- the queued 'resume' action (so cancel can undo it)

CREATE INDEX IF NOT EXISTS idx_charge_adjustments_freeze_group
  ON charge_adjustments(freeze_group) WHERE freeze_group IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Scheduled execution for the Nedarim action queue.
-- process-queue now runs an item only when scheduled_for IS NULL (asap) or has
-- arrived (<= today). Lets us queue a resume months ahead for a freeze.
-- ---------------------------------------------------------------------------
ALTER TABLE nedarim_action_queue
  ADD COLUMN IF NOT EXISTS scheduled_for DATE;

CREATE INDEX IF NOT EXISTS idx_nedarim_queue_scheduled
  ON nedarim_action_queue(scheduled_for) WHERE status = 'pending';
