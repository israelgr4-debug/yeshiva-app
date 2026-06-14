-- Yichus (family lineage) lookup table — mirrors lookup_health_funds.
-- families.yichus_code references this table by code; families.yichus_name
-- is kept denormalized for backward compat with existing data.

CREATE TABLE IF NOT EXISTS lookup_yichus (
  code SMALLINT PRIMARY KEY,
  name TEXT NOT NULL
);

ALTER TABLE lookup_yichus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lookup_yichus_read ON lookup_yichus;
CREATE POLICY lookup_yichus_read ON lookup_yichus FOR SELECT USING (true);
DROP POLICY IF EXISTS lookup_yichus_write ON lookup_yichus;
CREATE POLICY lookup_yichus_write ON lookup_yichus FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
GRANT ALL ON lookup_yichus TO authenticated, anon;

-- Seed with the 3 values currently in use across families
INSERT INTO lookup_yichus (code, name) VALUES
  (1, 'כהן'),
  (2, 'לוי'),
  (3, 'ישראל')
ON CONFLICT (code) DO NOTHING;
