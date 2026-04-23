-- Nedarim Plus integration schema.
-- Source of truth for tuition collection: Nedarim Plus.
-- Our app mirrors state for display + manages the link to families/students.

-- =============================================================================
-- Categories (Groupe) pulled from Nedarim
-- =============================================================================
CREATE TABLE IF NOT EXISTS nedarim_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL, -- the category name as it appears in Nedarim
  description TEXT,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- Subscriptions (standing orders) - unified for credit + bank
-- =============================================================================
CREATE TABLE IF NOT EXISTS nedarim_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to Nedarim
  nedarim_keva_id TEXT UNIQUE NOT NULL,    -- KevaId in Nedarim
  kind TEXT NOT NULL CHECK (kind IN ('credit', 'bank')),

  -- Link to our system (nullable until matched)
  family_id UUID REFERENCES families(id) ON DELETE SET NULL,
  student_ids UUID[],                      -- which students this charge covers
  amount_breakdown JSONB,                  -- {student_id: amount}

  -- State mirrored from Nedarim
  status TEXT NOT NULL,                    -- 'active' | 'frozen' | 'deleted' | 'pending_bank'
  amount_per_charge NUMERIC(10,2) NOT NULL,
  currency SMALLINT DEFAULT 1,             -- 1 NIS, 2 USD
  scheduled_day SMALLINT,                  -- day of month
  next_charge_date DATE,
  remaining_charges INTEGER,               -- null = unlimited
  successful_charges INTEGER DEFAULT 0,

  -- Client info from Nedarim
  client_zeout TEXT,                       -- father's ID number
  client_name TEXT,
  client_phone TEXT,
  client_mail TEXT,
  client_address TEXT,

  -- Credit-specific
  last_4_digits TEXT,
  card_tokef TEXT,                         -- MMYY
  has_donor_card BOOLEAN DEFAULT false,

  -- Bank-specific
  bank_number TEXT,
  bank_agency TEXT,
  bank_account TEXT,

  -- Metadata
  groupe TEXT,                             -- category from Nedarim
  comments TEXT,
  nedarim_observation TEXT,                -- system notes from Nedarim
  last_error TEXT,                         -- last refusal reason
  created_in_nedarim TIMESTAMPTZ,          -- when created in Nedarim
  last_synced_at TIMESTAMPTZ DEFAULT now(),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nedarim_subs_family ON nedarim_subscriptions(family_id);
CREATE INDEX IF NOT EXISTS idx_nedarim_subs_status ON nedarim_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_nedarim_subs_kind ON nedarim_subscriptions(kind);
CREATE INDEX IF NOT EXISTS idx_nedarim_subs_zeout ON nedarim_subscriptions(client_zeout);
CREATE INDEX IF NOT EXISTS idx_nedarim_subs_next_date ON nedarim_subscriptions(next_charge_date);

CREATE TRIGGER nedarim_subs_updated_at BEFORE UPDATE ON nedarim_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Transactions (actual charges / attempts)
-- =============================================================================
CREATE TABLE IF NOT EXISTS nedarim_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nedarim identifiers
  nedarim_transaction_id TEXT UNIQUE,      -- TransactionId in Nedarim (null for attempts without id)
  nedarim_keva_id TEXT,                    -- KevaId - the subscription

  -- Our links
  subscription_id UUID REFERENCES nedarim_subscriptions(id) ON DELETE CASCADE,
  family_id UUID REFERENCES families(id) ON DELETE SET NULL,

  -- Transaction data
  amount NUMERIC(10,2),
  currency SMALLINT DEFAULT 1,
  transaction_date DATE,
  transaction_time TIMESTAMPTZ,

  -- Status: what happened
  -- success: actual charge succeeded
  -- refused: attempt failed (bounce/decline)
  -- cancelled: transaction cancelled after success
  -- refunded: money returned
  -- pending: no confirmation yet
  result TEXT NOT NULL CHECK (result IN ('success', 'refused', 'cancelled', 'refunded', 'pending')),
  status_text TEXT,                        -- refusal reason or cancellation reason

  -- Metadata
  kind TEXT CHECK (kind IN ('credit', 'bank')),
  confirmation TEXT,                       -- confirmation number from shva
  last_4 TEXT,
  client_name TEXT,
  client_zeout TEXT,
  groupe TEXT,
  tashloumim INTEGER,                      -- number of installments
  receipt_data TEXT,                       -- URL to receipt
  receipt_doc_num TEXT,

  -- Related task (if bounce created one)
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,

  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nedarim_tx_subscription ON nedarim_transactions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_nedarim_tx_family ON nedarim_transactions(family_id);
CREATE INDEX IF NOT EXISTS idx_nedarim_tx_date ON nedarim_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_nedarim_tx_result ON nedarim_transactions(result);
CREATE INDEX IF NOT EXISTS idx_nedarim_tx_keva ON nedarim_transactions(nedarim_keva_id);

-- =============================================================================
-- Sync log (track when we last synced from Nedarim)
-- =============================================================================
CREATE TABLE IF NOT EXISTS nedarim_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,                 -- 'credit_subs' | 'bank_subs' | 'credit_tx' | 'groups' | 'full'
  result TEXT NOT NULL,                    -- 'success' | 'error'
  items_inserted INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_unchanged INTEGER DEFAULT 0,
  error_message TEXT,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_nedarim_sync_log_started ON nedarim_sync_log(started_at DESC);

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE nedarim_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE nedarim_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nedarim_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nedarim_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nedarim_groups_all" ON nedarim_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "nedarim_subs_all" ON nedarim_subscriptions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "nedarim_tx_all" ON nedarim_transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "nedarim_sync_log_all" ON nedarim_sync_log FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON nedarim_groups TO authenticated, anon;
GRANT ALL ON nedarim_subscriptions TO authenticated, anon;
GRANT ALL ON nedarim_transactions TO authenticated, anon;
GRANT ALL ON nedarim_sync_log TO authenticated, anon;
