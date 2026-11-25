-- =============================================================================
-- שכר לימוד: פיצול תשלום ומשלם.
--
-- לכל תלמיד נשארת השורה הראשית שלו (student_tuition — המשפחה, החשבון של המשפחה).
-- כאן נוספים "משלמים נוספים": הורה שני או משלם חיצוני (סבא וכד'), כל אחד עם סכום,
-- אופן תשלום, וחשבון בנק או הו"ק אשראי משלו.
--   דוגמה: המשפחה 600 במס"ב (השורה הראשית) + סבא 600 באשראי (שורה כאן).
--
-- משלם נוסף נגבה רק כל עוד החיוב הראשי של התלמיד פעיל (עזב / הופסק → גם הוא נעצר במס"ב).
-- בטוח להריץ שוב.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tuition_extra_payers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,

  payer_kind TEXT NOT NULL DEFAULT 'external'
    CHECK (payer_kind IN ('parent', 'external')),   -- הורה נוסף / משלם חיצוני
  payer_name TEXT NOT NULL,
  payer_relation TEXT,                              -- "אם", "סבא", "דוד" …
  payer_id_number TEXT,
  payer_phone TEXT,

  payment_method TEXT NOT NULL
    CHECK (payment_method IN ('bank_ho', 'credit_nedarim', 'office')),
  monthly_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (monthly_amount >= 0),

  -- bank_ho: the payer's OWN account (not the family's)
  bank_number INTEGER,
  bank_branch TEXT,
  bank_account TEXT,

  -- credit_nedarim: the payer's own Nedarim standing order
  nedarim_subscription_id UUID REFERENCES nedarim_subscriptions(id) ON DELETE SET NULL,

  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extra_payers_student ON tuition_extra_payers(student_id);
CREATE INDEX IF NOT EXISTS idx_extra_payers_sub ON tuition_extra_payers(nedarim_subscription_id);

DROP TRIGGER IF EXISTS tuition_extra_payers_updated_at ON tuition_extra_payers;
CREATE TRIGGER tuition_extra_payers_updated_at BEFORE UPDATE ON tuition_extra_payers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE tuition_extra_payers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tuition_extra_payers_all ON tuition_extra_payers;
CREATE POLICY tuition_extra_payers_all ON tuition_extra_payers FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
GRANT ALL ON tuition_extra_payers TO authenticated;

-- Which payer a collection row belongs to. NULL = the main payer (the family) — every
-- existing row. Lets the same student have two bank rows in one month (family + payer)
-- without them being confused when a מס"ב file is marked as paid / returned.
ALTER TABLE payment_history
  ADD COLUMN IF NOT EXISTS payer_id UUID REFERENCES tuition_extra_payers(id) ON DELETE SET NULL;
ALTER TABLE masav_run_items
  ADD COLUMN IF NOT EXISTS payer_id UUID REFERENCES tuition_extra_payers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_history_payer ON payment_history(payer_id) WHERE payer_id IS NOT NULL;

SELECT 'tuition_extra_payers' AS "טבלה", count(*) AS "שורות" FROM tuition_extra_payers;
