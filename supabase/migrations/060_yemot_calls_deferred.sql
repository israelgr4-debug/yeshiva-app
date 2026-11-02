-- =============================================================================
-- מלגות / יבוא ימות: "נדחה" status for calls.
--
-- * 'deferred'  the call was put aside in the import preview — it is NOT charged in the
--               current batch and is NOT excluded either. Deferred calls show up in the
--               "נדחו" tab of every later import (whatever their date) until they are
--               brought back into a batch.
-- * Calls removed from the list by hand stay 'excluded' with notes = 'הוסר מרשימת היבוא'
--   (no schema change; restorable from the "הוסרו" tab).
-- Idempotent.
-- =============================================================================

-- drop the old status check (inline in 056 → auto-named; look it up to be safe)
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'scholarship_yemot_calls'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%status%unmatched%'
  LOOP
    EXECUTE format('ALTER TABLE scholarship_yemot_calls DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE scholarship_yemot_calls ADD CONSTRAINT scholarship_yemot_calls_status_check
  CHECK (status IN ('pending', 'included', 'excluded', 'unmatched', 'deferred'));

CREATE INDEX IF NOT EXISTS idx_scholarship_yemot_calls_deferred
  ON scholarship_yemot_calls(extension) WHERE status = 'deferred';
