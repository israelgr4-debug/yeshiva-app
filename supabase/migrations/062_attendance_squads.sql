-- =============================================================================
-- ביקורת נוכחות — קבוצות ואחראים (/attendance → "קבוצות")
--
-- attendance_squads          a standing group of eligible students, prepared ahead of an
--                            audit. leaders = up to 2 responsible people (JSON array of
--                            { student_id | null, name, phone }) — the callers and patrol
--                            of that group during an audit.
-- attendance_squad_members   who is in which group (a student is in ONE group at most).
--
-- An audit FREEZES the division when it opens:
--   attendance_audit_students.squad   the group's name
--   attendance_audits.squads          [{ name, leaders: [{ name, phone }] }]
--
-- Idempotent — safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS attendance_squads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  leaders JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_squad_members (
  student_id UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  squad_id UUID NOT NULL REFERENCES attendance_squads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_att_squad_members_squad ON attendance_squad_members(squad_id);

ALTER TABLE attendance_audit_students ADD COLUMN IF NOT EXISTS squad TEXT;
ALTER TABLE attendance_audits ADD COLUMN IF NOT EXISTS squads JSONB;

-- ---------- updated_at ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_squads', 'attendance_squad_members']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t || '_updated_at', t);
  END LOOP;
END $$;

-- ---------- RLS: authenticated users (permissions enforced in the app) ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_squads', 'attendance_squad_members']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_all', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')', t || '_all', t);
    EXECUTE format('GRANT ALL ON %I TO authenticated', t);
  END LOOP;
END $$;
