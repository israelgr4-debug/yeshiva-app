-- =============================================================================
-- Parent broadcast emails — send a free-text email (custom subject + body) to the
-- parents of selected students, either by group (shiur/status/institution) or by
-- manual selection from the student list. Mirrors registration_form_emails.
--
-- One row per household per send (dedup by family). recipient_type = father|mother.
-- The last-used נוסח is remembered in system_settings (parent_email_subject/body),
-- written by the send route (service role), so the composer prefills next time.
-- =============================================================================

CREATE TABLE IF NOT EXISTS parent_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,  -- representative student of the household
  family_id UUID REFERENCES families(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,                 -- the address actually used (TO)
  recipient_type TEXT NOT NULL,                  -- 'father' | 'mother'
  cc_email TEXT,                                 -- mother CC, when included
  subject TEXT,                                  -- the subject that was sent (for history)
  batch_id UUID NOT NULL,                         -- groups one "send" action
  sent_at TIMESTAMPTZ,                           -- when the email was sent
  send_error TEXT,                               -- Gmail error if the send failed
  sent_by TEXT,                                  -- app_users.email of the sender
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_emails_batch ON parent_emails(batch_id);
CREATE INDEX IF NOT EXISTS idx_parent_emails_created ON parent_emails(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_emails_student ON parent_emails(student_id);

DROP TRIGGER IF EXISTS parent_emails_updated_at ON parent_emails;
CREATE TRIGGER parent_emails_updated_at BEFORE UPDATE ON parent_emails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE parent_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parent_emails_all ON parent_emails;
CREATE POLICY parent_emails_all ON parent_emails FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
GRANT ALL ON parent_emails TO authenticated;
