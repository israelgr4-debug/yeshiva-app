-- Add a 6th registration attachment: הצהרה (declaration).
-- Marked per-registration in the Acceptance tab, included in both reports.

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS doc_declaration BOOLEAN NOT NULL DEFAULT false;
