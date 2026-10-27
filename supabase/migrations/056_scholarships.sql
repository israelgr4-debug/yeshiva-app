-- =============================================================================
-- מלגות (scholarships) module.
--   scholarship_types    רכיב        ("שבתות", "סיכומים")
--   scholarship_batches  חיוב תקופתי ("סיכומים חשוון") — new batches ADD to old ones
--   scholarship_entries  זכאות       (student × batch × amount)
--   scholarship_payments תשלום       (one per student per payment save; date only)
--   scholarship_runs     הפקת דוח    (which entries were printed, for marking payment)
--   scholarship_yemot_calls / scholarship_id_aliases — ימות המשיח import
-- An entry without payment_id is an open debt. Idempotent — safe to re-run.
-- =============================================================================

-- ---------- 1. types (רכיבים) ----------
CREATE TABLE IF NOT EXISTS scholarship_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('yemot', 'manual')),
  yemot_extension TEXT,
  default_amount NUMERIC(10,2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO scholarship_types (name, source, yemot_extension, sort_order)
VALUES ('שבתות', 'yemot', '11', 1), ('סיכומים', 'manual', NULL, 2)
ON CONFLICT (name) DO NOTHING;

-- ---------- 2. batches (חיובים תקופתיים) ----------
CREATE TABLE IF NOT EXISTS scholarship_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id UUID NOT NULL REFERENCES scholarship_types(id),
  title TEXT NOT NULL,
  entry_date DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('yemot', 'manual')),
  date_from DATE,
  date_to DATE,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT scholarship_batches_yemot_range CHECK (
    source <> 'yemot' OR (date_from IS NOT NULL AND date_to IS NOT NULL AND date_from <= date_to)
  )
);

-- ---------- 3. runs (הפקות דוח) ----------
CREATE TABLE IF NOT EXISTS scholarship_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  filters JSONB,
  entry_ids UUID[] NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- 4. payments (תשלומים) ----------
CREATE TABLE IF NOT EXISTS scholarship_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  paid_at DATE NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  run_id UUID REFERENCES scholarship_runs(id) ON DELETE SET NULL,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- 5. entries (זכאויות) ----------
CREATE TABLE IF NOT EXISTS scholarship_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES scholarship_batches(id) ON DELETE CASCADE,
  type_id UUID NOT NULL REFERENCES scholarship_types(id),      -- denormalized from batch
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  entry_date DATE NOT NULL,                                    -- copied from batch
  -- cancelling a payment = deleting it → its entries become open debt again
  payment_id UUID REFERENCES scholarship_payments(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (batch_id, student_id)
);

-- ---------- 6. ימות המשיח calls ----------
CREATE TABLE IF NOT EXISTS scholarship_yemot_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'file' CHECK (source IN ('api', 'file', 'manual')),
  record_number INTEGER,               -- column L / API record id (null for manual rows)
  -- Dedup key for re-imports: extension + record_number + call time (so a reset of the
  -- record numbering in ימות can never overwrite an older call). Null for manual rows.
  dedupe_key TEXT UNIQUE,
  added_by TEXT,                       -- who added a manual row
  extension TEXT,
  phone TEXT,
  phone2 TEXT,
  raw_id_number TEXT,
  raw_name TEXT,
  raw_shiur TEXT,
  call_at TIMESTAMPTZ,
  hebrew_date TEXT,
  amount NUMERIC(10,2),
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'included', 'excluded', 'unmatched')),
  batch_id UUID REFERENCES scholarship_batches(id) ON DELETE SET NULL,
  entry_id UUID REFERENCES scholarship_entries(id) ON DELETE SET NULL,
  notes TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- 7. ת"ז aliases ----------
CREATE TABLE IF NOT EXISTS scholarship_id_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_id_number TEXT NOT NULL UNIQUE,  -- as typed, leading zeros stripped
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- indexes ----------
CREATE INDEX IF NOT EXISTS idx_sch_batches_type_date ON scholarship_batches(type_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_sch_entries_student ON scholarship_entries(student_id);
CREATE INDEX IF NOT EXISTS idx_sch_entries_batch ON scholarship_entries(batch_id);
CREATE INDEX IF NOT EXISTS idx_sch_entries_type_date ON scholarship_entries(type_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_sch_entries_payment ON scholarship_entries(payment_id);
CREATE INDEX IF NOT EXISTS idx_sch_payments_student ON scholarship_payments(student_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_sch_calls_status ON scholarship_yemot_calls(status);
CREATE INDEX IF NOT EXISTS idx_sch_calls_student ON scholarship_yemot_calls(student_id);
CREATE INDEX IF NOT EXISTS idx_sch_calls_call_at ON scholarship_yemot_calls(call_at);
CREATE INDEX IF NOT EXISTS idx_sch_calls_raw_id ON scholarship_yemot_calls(raw_id_number);

-- ---------- rules enforced in the DB ----------

-- (a) a ימות batch may not overlap another ימות batch of the same type
CREATE OR REPLACE FUNCTION scholarship_batches_check_overlap() RETURNS trigger AS $$
BEGIN
  IF NEW.source = 'yemot' AND EXISTS (
    SELECT 1 FROM scholarship_batches b
    WHERE b.type_id = NEW.type_id AND b.source = 'yemot' AND b.id <> NEW.id
      AND b.date_from IS NOT NULL AND b.date_to IS NOT NULL
      AND daterange(b.date_from, b.date_to, '[]') && daterange(NEW.date_from, NEW.date_to, '[]')
  ) THEN
    RAISE EXCEPTION 'טווח התאריכים חופף לחיוב ימות קיים של אותו רכיב';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scholarship_batches_overlap ON scholarship_batches;
CREATE TRIGGER scholarship_batches_overlap BEFORE INSERT OR UPDATE ON scholarship_batches
  FOR EACH ROW EXECUTE FUNCTION scholarship_batches_check_overlap();

-- (b) entries: copy type_id + entry_date from the batch
CREATE OR REPLACE FUNCTION scholarship_entries_fill_from_batch() RETURNS trigger AS $$
DECLARE b RECORD;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.batch_id IS DISTINCT FROM OLD.batch_id THEN
    SELECT type_id, entry_date INTO b FROM scholarship_batches WHERE id = NEW.batch_id;
    NEW.type_id := b.type_id;
    NEW.entry_date := b.entry_date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scholarship_entries_fill ON scholarship_entries;
CREATE TRIGGER scholarship_entries_fill BEFORE INSERT OR UPDATE ON scholarship_entries
  FOR EACH ROW EXECUTE FUNCTION scholarship_entries_fill_from_batch();

-- (c) a PAID entry is locked: no delete, no edit — the only allowed change is clearing
--     payment_id (= the payment was cancelled). Also blocks deleting a batch that has
--     paid entries (the cascade delete hits this trigger).
CREATE OR REPLACE FUNCTION scholarship_entries_lock_paid() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.payment_id IS NOT NULL THEN
      RAISE EXCEPTION 'זכאות ששולמה נעולה — אי אפשר למחוק (בטל קודם את התשלום)';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.payment_id IS NOT NULL THEN
    IF NEW.payment_id IS NULL
       AND NEW.amount = OLD.amount AND NEW.student_id = OLD.student_id
       AND NEW.batch_id = OLD.batch_id AND NEW.entry_date = OLD.entry_date THEN
      RETURN NEW;                      -- payment cancelled
    END IF;
    IF NEW.payment_id IS NOT DISTINCT FROM OLD.payment_id
       AND NEW.amount = OLD.amount AND NEW.student_id = OLD.student_id
       AND NEW.batch_id = OLD.batch_id AND NEW.entry_date = OLD.entry_date THEN
      RETURN NEW;                      -- only notes / updated_at changed
    END IF;
    RAISE EXCEPTION 'זכאות ששולמה נעולה לעריכה (בטל קודם את התשלום)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scholarship_entries_lock ON scholarship_entries;
CREATE TRIGGER scholarship_entries_lock BEFORE UPDATE OR DELETE ON scholarship_entries
  FOR EACH ROW EXECUTE FUNCTION scholarship_entries_lock_paid();

-- (d) changing a batch's type/date updates its UNPAID entries (paid ones stay as paid)
CREATE OR REPLACE FUNCTION scholarship_batches_propagate() RETURNS trigger AS $$
BEGIN
  IF NEW.entry_date IS DISTINCT FROM OLD.entry_date OR NEW.type_id IS DISTINCT FROM OLD.type_id THEN
    UPDATE scholarship_entries SET entry_date = NEW.entry_date, type_id = NEW.type_id
    WHERE batch_id = NEW.id AND payment_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS scholarship_batches_propagate ON scholarship_batches;
CREATE TRIGGER scholarship_batches_propagate AFTER UPDATE ON scholarship_batches
  FOR EACH ROW EXECUTE FUNCTION scholarship_batches_propagate();

-- ---------- updated_at ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['scholarship_types','scholarship_batches','scholarship_runs',
    'scholarship_payments','scholarship_entries','scholarship_yemot_calls','scholarship_id_aliases']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_updated_at', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t || '_updated_at', t);
  END LOOP;
END $$;

-- ---------- RLS: authenticated users (permissions enforced in the app) ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['scholarship_types','scholarship_batches','scholarship_runs',
    'scholarship_payments','scholarship_entries','scholarship_yemot_calls','scholarship_id_aliases']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_all', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (auth.role() = ''authenticated'') WITH CHECK (auth.role() = ''authenticated'')', t || '_all', t);
    EXECUTE format('GRANT ALL ON %I TO authenticated', t);
  END LOOP;
END $$;

-- ---------- audit_log: reuse the SAME audit trigger that is on students ----------
-- (the audit triggers were created directly in Supabase, not in a migration — so we copy
--  the definition from students instead of guessing the function name)
DO $$
DECLARE def TEXT; trg TEXT; t TEXT;
BEGIN
  SELECT pg_get_triggerdef(tg.oid), tg.tgname INTO def, trg
  FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
  WHERE tg.tgrelid = 'public.students'::regclass AND NOT tg.tgisinternal
    AND (p.proname ILIKE '%audit%' OR tg.tgname ILIKE '%audit%')
  LIMIT 1;
  IF def IS NULL THEN
    RAISE NOTICE 'no audit trigger found on students — scholarship tables are not audited';
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['scholarship_types','scholarship_batches','scholarship_runs',
    'scholarship_payments','scholarship_entries','scholarship_yemot_calls','scholarship_id_aliases']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_audit', t);
    EXECUTE replace(
      replace(def, 'CREATE TRIGGER ' || quote_ident(trg) || ' ', 'CREATE TRIGGER ' || quote_ident(t || '_audit') || ' '),
      ' ON public.students ', ' ON public.' || t || ' ');
  END LOOP;
  RAISE NOTICE 'audit trigger attached to scholarship tables: %', def;
END $$;

-- ---------- balances view ----------
CREATE OR REPLACE VIEW scholarship_balances WITH (security_invoker = true) AS
SELECT
  student_id,
  type_id,
  COALESCE(SUM(amount), 0)::NUMERIC(12,2) AS total_charged,
  COALESCE(SUM(amount) FILTER (WHERE payment_id IS NOT NULL), 0)::NUMERIC(12,2) AS total_paid,
  COALESCE(SUM(amount) FILTER (WHERE payment_id IS NULL), 0)::NUMERIC(12,2) AS balance
FROM scholarship_entries
GROUP BY student_id, type_id;

GRANT SELECT ON scholarship_balances TO authenticated;
