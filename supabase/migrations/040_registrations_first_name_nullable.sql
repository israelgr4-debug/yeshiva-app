-- Allow registrations to be imported with only a last name; first_name can be
-- filled in later when more details arrive.
ALTER TABLE registrations
  ALTER COLUMN first_name DROP NOT NULL;
