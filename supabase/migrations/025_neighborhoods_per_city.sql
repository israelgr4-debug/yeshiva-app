-- Make neighborhoods scoped per city (for school transport organization).
-- Existing 33 entries are all from Jerusalem - backfill them.

ALTER TABLE lookup_neighborhoods
  ADD COLUMN IF NOT EXISTS city_name TEXT;

UPDATE lookup_neighborhoods SET city_name = 'ירושלים' WHERE city_name IS NULL;

ALTER TABLE lookup_neighborhoods ALTER COLUMN city_name SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lookup_neighborhoods_city
  ON lookup_neighborhoods(city_name);

-- Auto-assign new codes starting at 100 (leave room for legacy 1-33)
CREATE SEQUENCE IF NOT EXISTS lookup_neighborhoods_code_seq AS SMALLINT START 100 MINVALUE 100;
SELECT setval(
  'lookup_neighborhoods_code_seq',
  GREATEST(100, COALESCE((SELECT MAX(code) FROM lookup_neighborhoods), 100))
);
ALTER TABLE lookup_neighborhoods
  ALTER COLUMN code SET DEFAULT nextval('lookup_neighborhoods_code_seq');

-- Friendly unique constraint - same name shouldn't be duplicated within a city
CREATE UNIQUE INDEX IF NOT EXISTS uq_lookup_neighborhoods_city_name
  ON lookup_neighborhoods(city_name, name);
