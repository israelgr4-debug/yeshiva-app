-- =============================================================================
-- מלגות: cancelled checks + one-time payments.
--
-- * scholarship_payments.status
--     'paid'      a check that was handed out (default — all existing rows)
--     'cancelled' the check was lost / torn / bounced. The row is KEPT for history
--                 (shown struck-through on the student card) and its entries are released
--                 back to open debt.
--     'transfer'  bookkeeping row: the released entries were moved to a one-time
--                 payment ("צ'ק חלופי"), so they don't come back in the regular reports.
-- * scholarship_types.kind = 'one_time' — the "תשלומים חד פעמיים" list: names added by
--   hand from time to time (and replacement checks), produced for payment when needed.
--   Each one-time item is its own batch + entry, so the usual report / mark-payment /
--   student-ledger flows work unchanged.
-- Idempotent.
-- =============================================================================

-- ---------- payments: status + cancel details ----------
ALTER TABLE scholarship_payments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'paid';
DO $$ BEGIN
  ALTER TABLE scholarship_payments ADD CONSTRAINT scholarship_payments_status_chk
    CHECK (status IN ('paid', 'cancelled', 'transfer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE scholarship_payments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE scholarship_payments ADD COLUMN IF NOT EXISTS cancelled_by TEXT;
ALTER TABLE scholarship_payments ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
-- the one-time entry created as a replacement for a cancelled check (if any)
ALTER TABLE scholarship_payments ADD COLUMN IF NOT EXISTS replacement_entry_id UUID
  REFERENCES scholarship_entries(id) ON DELETE SET NULL;

-- ---------- types: kind ----------
ALTER TABLE scholarship_types ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'regular';
DO $$ BEGIN
  ALTER TABLE scholarship_types ADD CONSTRAINT scholarship_types_kind_chk
    CHECK (kind IN ('regular', 'one_time'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO scholarship_types (name, source, kind, sort_order)
VALUES ('תשלומים חד פעמיים', 'manual', 'one_time', 99)
ON CONFLICT (name) DO UPDATE SET kind = 'one_time';
