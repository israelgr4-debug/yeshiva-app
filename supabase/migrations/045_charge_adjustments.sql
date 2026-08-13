-- =============================================================================
-- Monthly charge adjustments — the primitive that unifies REQ 6/7/8/9.
--
-- The base recurring amount stays in student_tuition.monthly_amount.
-- This migration adds a per-student, per-MONTH layer on top of the base:
--   final(student, month) = (override for that month ? override_amount : base)
--                           + sum(active additions for that month)
--
-- One primitive, four features:
--   REQ7 one-time add to a student for month Z         -> kind='addition', source='manual'
--   REQ8 group add (trip) fanned out to each student   -> source='group', group_action_id set
--   REQ9 group monthly override (absolute, one month)  -> kind='override', source='group'
--   REQ6 bounce resolution (next month / installments) -> source='bounce'/'installment', bounce_payment_id set
--
-- Each adjustment records which payment method it dispatches through
-- (bank_ho -> MASAV, credit_nedarim -> Nedarim TashlumBodedNew, office -> manual),
-- captured at creation time from student_tuition.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- group_actions: a single group operation that fans out into per-student rows
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,                       -- 'YYYY-MM' the run this applies to
  action_kind TEXT NOT NULL CHECK (action_kind IN ('addition', 'override')),
  amount NUMERIC(10,2) NOT NULL,             -- addition: delta per student; override: absolute for the month
  target_type TEXT NOT NULL CHECK (target_type IN ('shiur', 'status', 'institution', 'custom')),
  target_value TEXT,                         -- e.g. 'שיעור א'  (null when target_type='custom' + explicit ids)
  reason TEXT,                               -- why (e.g. 'טיול שיעור א')
  skip_exempt BOOLEAN NOT NULL DEFAULT true, -- exempt/none students are skipped (manager decision)
  student_count INTEGER NOT NULL DEFAULT 0,  -- how many students it fanned out to
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_group_actions_month ON group_actions(month);

-- ---------------------------------------------------------------------------
-- charge_adjustments: per-student, per-month delta or override
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS charge_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  month TEXT NOT NULL,                        -- 'YYYY-MM'

  kind TEXT NOT NULL CHECK (kind IN ('addition', 'override')),
  -- addition: signed delta added to the month (trip +300, discount -100, bounce recharge +X)
  -- override: absolute amount that REPLACES the base for this month only (REQ9)
  amount NUMERIC(10,2) NOT NULL,
  reason TEXT,                                -- free-text note (why this adjustment)

  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'group', 'bounce', 'installment')),
  group_action_id UUID REFERENCES group_actions(id) ON DELETE CASCADE,
  bounce_payment_id UUID REFERENCES payment_history(id) ON DELETE SET NULL,

  -- Which method this adjustment is billed through (snapshot from student_tuition at creation).
  dispatch_method TEXT CHECK (dispatch_method IN ('bank_ho', 'credit_nedarim', 'office', 'exempt', 'none')),
  -- For credit_nedarim adjustments actioned via Nedarim TashlumBodedNew:
  nedarim_result TEXT,                        -- 'success' | 'error' | null (not yet sent)
  nedarim_transaction_id TEXT,
  nedarim_error TEXT,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled')),  -- cancelled rows are ignored in the month total

  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_charge_adjustments_student ON charge_adjustments(student_id);
CREATE INDEX IF NOT EXISTS idx_charge_adjustments_month ON charge_adjustments(month);
CREATE INDEX IF NOT EXISTS idx_charge_adjustments_student_month ON charge_adjustments(student_id, month);
CREATE INDEX IF NOT EXISTS idx_charge_adjustments_group ON charge_adjustments(group_action_id);
-- At most one active override per student per month (additions are unlimited).
CREATE UNIQUE INDEX IF NOT EXISTS uq_charge_adjustments_override
  ON charge_adjustments(student_id, month)
  WHERE kind = 'override' AND status = 'active';

-- updated_at triggers
DROP TRIGGER IF EXISTS group_actions_updated_at ON group_actions;
CREATE TRIGGER group_actions_updated_at BEFORE UPDATE ON group_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS charge_adjustments_updated_at ON charge_adjustments;
CREATE TRIGGER charge_adjustments_updated_at BEFORE UPDATE ON charge_adjustments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE group_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE charge_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS group_actions_all ON group_actions;
CREATE POLICY group_actions_all ON group_actions FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS charge_adjustments_all ON charge_adjustments;
CREATE POLICY charge_adjustments_all ON charge_adjustments FOR ALL
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Helper view: the final computed amount per student per month
-- (base ± adjustments), so the monthly-run screen and MASAV can read one place.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW monthly_charge_computed AS
WITH months AS (
  SELECT DISTINCT month FROM charge_adjustments WHERE status = 'active'
)
SELECT
  st.student_id,
  m.month,
  st.payment_method,
  st.monthly_amount AS base_amount,
  ov.amount AS override_amount,
  COALESCE(adds.sum_add, 0) AS additions_total,
  COALESCE(ov.amount, st.monthly_amount) + COALESCE(adds.sum_add, 0) AS final_amount
FROM student_tuition st
CROSS JOIN months m
LEFT JOIN LATERAL (
  SELECT amount FROM charge_adjustments ca
  WHERE ca.student_id = st.student_id AND ca.month = m.month
    AND ca.kind = 'override' AND ca.status = 'active'
  LIMIT 1
) ov ON true
LEFT JOIN LATERAL (
  SELECT SUM(amount) AS sum_add FROM charge_adjustments ca
  WHERE ca.student_id = st.student_id AND ca.month = m.month
    AND ca.kind = 'addition' AND ca.status = 'active'
) adds ON true
WHERE st.active = true;

GRANT SELECT ON monthly_charge_computed TO authenticated, anon;
GRANT ALL ON group_actions, charge_adjustments TO authenticated;
