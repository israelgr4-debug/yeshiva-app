-- =============================================================================
-- "אישור שכר לימוד עם פירוט 12 חודשים" existed only in the code fallback
-- (lib/certificates.ts). Once certificate_templates has rows the app reads ONLY the DB,
-- so this certificate never showed up. Add it (editable in the certificate editor).
-- {{payments_html}} is filled by the certificates page with the last-12-months table.
-- Idempotent: does nothing if the row already exists (won't overwrite edits).
-- =============================================================================
INSERT INTO certificate_templates (id, name, recipient, body, extra_fields, display_order, is_active)
VALUES (
  'tuition_with_history',
  'אישור שכר לימוד עם פירוט 12 חודשים',
  'לכל המעונין:',
  E'הננו לאשר כי התלמיד {{full_name_with_id}}\nלומד בשנת הלימודים {{year}} בישיבה ומשתתף בשכר לימוד בסך ₪{{amount}} לחודש.\n\nלהלן פירוט התשלומים ב-12 החודשים האחרונים:\n{{payments_html}}',
  '[{"key":"amount","label":"שכר לימוד חודשי (ש\"ח)","type":"number","placeholder":"600"}]'::jsonb,
  105,
  true
)
ON CONFLICT (id) DO NOTHING;
