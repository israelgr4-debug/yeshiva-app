-- =============================================================================
-- ביקורת נוכחות (Ministry of Religion surprise attendance audit) — /attendance
--
-- attendance_audits            one audit (real / practice / repeat). Only ONE can be open.
--                              access_token + access_code = the dedicated team link
--                              (/g/audit/<token>), valid only while the audit is open.
-- attendance_audit_students    the eligible list FROZEN at opening (snapshot of name /
--                              shiur / room / phone, so the team screens never read the
--                              students table). code = what the marker keys on a kosher
--                              phone. present / call_status are the live state.
-- attendance_audit_events      log of every marking / undo / call update / robot run.
--
-- Idempotent — safe to re-run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS attendance_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'real' CHECK (kind IN ('real', 'practice', 'repeat')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  target_pct NUMERIC(5,2) NOT NULL DEFAULT 85,
  parent_audit_id UUID REFERENCES attendance_audits(id) ON DELETE SET NULL,
  access_token TEXT NOT NULL UNIQUE,
  access_code TEXT NOT NULL,
  code_length INT NOT NULL DEFAULT 3,
  dat_file_name TEXT,
  dat_uploaded_at TIMESTAMPTZ,
  robot_auto BOOLEAN NOT NULL DEFAULT false,
  robot_interval_min INT NOT NULL DEFAULT 5,
  robot_last_run_at TIMESTAMPTZ,
  robot_runs INT NOT NULL DEFAULT 0,
  opened_by TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by TEXT,
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- one open audit at a time
CREATE UNIQUE INDEX IF NOT EXISTS attendance_audits_one_open ON attendance_audits ((status)) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS attendance_audit_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES attendance_audits(id) ON DELETE CASCADE,
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  id_number TEXT,
  last_name TEXT,
  first_name TEXT,
  grp TEXT NOT NULL DEFAULT 'yeshiva' CHECK (grp IN ('yeshiva', 'kollel', 'unknown')),
  shiur TEXT,
  room TEXT,
  phone TEXT,
  present BOOLEAN NOT NULL DEFAULT false,
  present_at TIMESTAMPTZ,
  marked_by TEXT,
  marked_via TEXT,
  call_status TEXT NOT NULL DEFAULT 'none' CHECK (call_status IN ('none', 'coming', 'no_answer', 'cant')),
  call_note TEXT,
  call_by TEXT,
  call_at TIMESTAMPTZ,
  prev_missing BOOLEAN NOT NULL DEFAULT false,
  robot_calls INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (audit_id, code)
);
CREATE INDEX IF NOT EXISTS idx_att_students_audit ON attendance_audit_students(audit_id);
CREATE INDEX IF NOT EXISTS idx_att_students_student ON attendance_audit_students(student_id);

CREATE TABLE IF NOT EXISTS attendance_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID NOT NULL REFERENCES attendance_audits(id) ON DELETE CASCADE,
  audit_student_id UUID REFERENCES attendance_audit_students(id) ON DELETE CASCADE,
  action TEXT NOT NULL,          -- present / undo / call / robot / open / close
  via TEXT,                      -- phone / screen / team / robot
  actor TEXT,                    -- user email, team member name or caller phone
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_att_events_audit ON attendance_audit_events(audit_id, created_at DESC);

-- ---------- updated_at ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_audits', 'attendance_audit_students', 'attendance_audit_events']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t || '_updated_at', t);
  END LOOP;
END $$;

-- ---------- RLS: authenticated users (permissions enforced in the app). The public team
-- link never touches these tables directly — it goes through /api/attendance/team with
-- the service role, after checking the token + code and that the audit is open. ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_audits', 'attendance_audit_students', 'attendance_audit_events']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_all', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')', t || '_all', t);
    EXECUTE format('GRANT ALL ON %I TO authenticated', t);
  END LOOP;
END $$;
