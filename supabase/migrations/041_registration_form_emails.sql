-- Registration form emails: send the registration PDF forms to the parents of
-- next-year candidates, ONE email per recipient (no BCC), with full send tracking.
--
-- The admin uploads the PDF form(s) once (Supabase Storage bucket
-- 'registration-forms'), picks candidates from the registration list, and the
-- server loops over them: for each it resolves ONE recipient address
-- (father → mother → candidate), dedups already-sent / duplicate addresses,
-- attaches the PDFs, sends, and records the result here.
--
-- NOTE: the 'registration-forms' Storage bucket must be created MANUALLY in the
-- Supabase Dashboard (Storage → New bucket, name: registration-forms, PRIVATE)
-- BEFORE running this migration's storage policies below take effect.

CREATE TABLE IF NOT EXISTS registration_form_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,                 -- the address actually used
  recipient_type TEXT NOT NULL,                  -- 'father' | 'mother' | 'student'
  batch_id UUID NOT NULL,                         -- groups one "send" action
  sent_at TIMESTAMP,                             -- when the email was sent
  send_error TEXT,                               -- Gmail error if the send failed
  sent_by TEXT,                                  -- app_users.email of the sender
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reg_form_emails_registration ON registration_form_emails(registration_id);
CREATE INDEX IF NOT EXISTS idx_reg_form_emails_recipient ON registration_form_emails(recipient_email);
CREATE INDEX IF NOT EXISTS idx_reg_form_emails_batch ON registration_form_emails(batch_id);
-- Fast lookup of "who already got it successfully" (dedup on re-send)
CREATE INDEX IF NOT EXISTS idx_reg_form_emails_sent ON registration_form_emails(sent_at) WHERE sent_at IS NOT NULL;

-- Keep updated_at fresh (project convention - reuse the shared trigger fn).
DROP TRIGGER IF EXISTS trg_reg_form_emails_updated ON registration_form_emails;
CREATE TRIGGER trg_reg_form_emails_updated
  BEFORE UPDATE ON registration_form_emails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: authenticated users can read/write (the send route uses service_role,
-- which bypasses RLS anyway; this covers the UI reading the tracking log).
ALTER TABLE registration_form_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rfe_all ON registration_form_emails;
CREATE POLICY rfe_all ON registration_form_emails
  FOR ALL USING (auth.role() = 'authenticated');

-- Storage policies for the PRIVATE 'registration-forms' bucket.
-- Authenticated users upload the form PDFs from /settings; the send route reads
-- them via service_role. Nothing here is public.
DROP POLICY IF EXISTS "reg_forms_select" ON storage.objects;
CREATE POLICY "reg_forms_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'registration-forms' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "reg_forms_insert" ON storage.objects;
CREATE POLICY "reg_forms_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'registration-forms' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "reg_forms_update" ON storage.objects;
CREATE POLICY "reg_forms_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'registration-forms' AND auth.role() = 'authenticated')
  WITH CHECK (bucket_id = 'registration-forms' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "reg_forms_delete" ON storage.objects;
CREATE POLICY "reg_forms_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'registration-forms' AND auth.role() = 'authenticated');
