-- Registration years: tag every registration with the school year it belongs to
-- so cycles don't mix, and the document checklist stays queryable per year even
-- after candidates convert to students and the school year starts.
--
-- The 124 candidates currently in the system are registering (during תשפ"ו) for
-- entry in תשפ"ז, so existing rows are backfilled to תשפ"ז. Change the active
-- year from the registration screen when the next cycle opens.

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS registration_year TEXT;

CREATE INDEX IF NOT EXISTS idx_registrations_year ON registrations(registration_year);

-- The active registration year - new registrations are tagged with it.
INSERT INTO system_settings (key, value, description)
VALUES ('current_registration_year', to_jsonb('תשפ"ז'::text),
        'שנת הרישום הפעילה - נרשמים חדשים מתויגים אליה')
ON CONFLICT (key) DO NOTHING;

-- Backfill existing rows to the opening cycle.
UPDATE registrations
SET registration_year = 'תשפ"ז'
WHERE registration_year IS NULL OR registration_year = '';
