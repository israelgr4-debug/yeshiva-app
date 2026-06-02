-- Graduate self-update flow: tokens + audit log.
-- Admin sends update requests to graduates' emails. Each email has a unique
-- token-bearing link → public page → submits updates → applied directly.
-- A snapshot of the BEFORE state is kept for admin review.

CREATE TABLE IF NOT EXISTS graduate_update_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,           -- random URL-safe string
  graduate_id UUID NOT NULL REFERENCES graduates(id) ON DELETE CASCADE,
  email TEXT NOT NULL,                  -- snapshot at send time
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,        -- typically created_at + 60 days
  sent_at TIMESTAMP,                    -- when email was actually sent
  opened_at TIMESTAMP,                  -- first GET (pixel optional)
  used_at TIMESTAMP,                    -- when graduate submitted
  reminder_count INTEGER NOT NULL DEFAULT 0,
  last_reminder_at TIMESTAMP,
  send_error TEXT                       -- if Gmail send failed
);

CREATE INDEX IF NOT EXISTS idx_grad_upd_tokens_graduate ON graduate_update_tokens(graduate_id);
CREATE INDEX IF NOT EXISTS idx_grad_upd_tokens_token ON graduate_update_tokens(token);
CREATE INDEX IF NOT EXISTS idx_grad_upd_tokens_used ON graduate_update_tokens(used_at) WHERE used_at IS NULL;

-- Audit log: every submission saves before+after snapshots + admin notes
CREATE TABLE IF NOT EXISTS graduate_update_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  graduate_id UUID NOT NULL REFERENCES graduates(id) ON DELETE CASCADE,
  token_id UUID REFERENCES graduate_update_tokens(id) ON DELETE SET NULL,
  submitted_at TIMESTAMP DEFAULT NOW(),
  before_snapshot JSONB NOT NULL,
  after_snapshot JSONB NOT NULL,
  changed_fields TEXT[] DEFAULT '{}',
  notes_to_admin TEXT,                  -- free-text from the graduate
  ip_address TEXT,
  admin_reviewed_at TIMESTAMP,
  admin_reviewed_by UUID REFERENCES app_users(id),
  admin_note TEXT                       -- admin's internal note about this update
);

CREATE INDEX IF NOT EXISTS idx_grad_upd_log_graduate ON graduate_update_log(graduate_id);
CREATE INDEX IF NOT EXISTS idx_grad_upd_log_unreviewed ON graduate_update_log(admin_reviewed_at) WHERE admin_reviewed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_grad_upd_log_has_notes ON graduate_update_log((notes_to_admin IS NOT NULL))
  WHERE notes_to_admin IS NOT NULL;

-- Track when graduate last self-updated (for "old data" filtering)
ALTER TABLE graduates
  ADD COLUMN IF NOT EXISTS last_self_update_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS email_unsubscribed BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_graduates_last_self_update ON graduates(last_self_update_at);

-- RLS
ALTER TABLE graduate_update_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gut_all ON graduate_update_tokens;
CREATE POLICY gut_all ON graduate_update_tokens FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE graduate_update_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gul_all ON graduate_update_log;
CREATE POLICY gul_all ON graduate_update_log FOR ALL USING (auth.role() = 'authenticated');

-- Note: Public endpoints will use the service_role key (via API route),
-- which bypasses RLS - so the public update page works without auth.
