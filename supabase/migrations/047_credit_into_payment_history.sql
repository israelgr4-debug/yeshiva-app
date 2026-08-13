-- =============================================================================
-- Unify credit collection into payment_history (the single collection ledger).
--
-- Successful Nedarim credit charges live in nedarim_transactions. To make
-- "collected / not collected" one question across the whole app (monthly run,
-- gauge, history, student card), every successful credit charge also gets a
-- payment_history row (status_code=2). This column links it back to the source
-- Nedarim transaction and makes the sync idempotent.
-- =============================================================================

ALTER TABLE payment_history
  ADD COLUMN IF NOT EXISTS nedarim_transaction_id TEXT;

-- One payment_history row per (Nedarim transaction, student) — re-syncs won't
-- duplicate. (A shared HK charge is split across its students, so the student
-- is part of the key.) Non-partial: existing bank rows have nedarim_transaction_id
-- NULL, and NULLs are distinct in a unique index, so they never conflict — this
-- lets PostgREST upsert infer ON CONFLICT (nedarim_transaction_id, student_id).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_history_nedarim_tx
  ON payment_history(nedarim_transaction_id, student_id);
