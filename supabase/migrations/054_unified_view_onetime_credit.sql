-- =============================================================================
-- Fix: one-time CREDIT charges never appeared in the student card's tuition tab.
--
-- The tab reads student_payments_unified. Before this migration its credit branch
-- sourced ONLY from nedarim_transactions JOIN student_tuition, and its bank branch
-- EXCLUDED payment_history rows carrying a nedarim_transaction_id (to avoid
-- double-counting mirrored credit). A one-time credit charge (charge-onetime) is
-- written to payment_history WITH a nedarim_transaction_id and a student_id, so it
-- fell through BOTH branches and showed nowhere.
--
-- This adds a 4th branch: credit charges recorded in payment_history (one-time
-- charges + any mirror) that are NOT already shown via the nedarim_transactions
-- branch — matched on (nedarim_transaction_id, student_id) so nothing double-counts.
-- =============================================================================

CREATE OR REPLACE VIEW student_payments_unified AS
-- 1) Credit transactions, attributed via the student_tuition ↔ subscription link
SELECT
  nt.id,
  'credit' AS source,
  nt.subscription_id::text AS source_ref,
  st.student_id,
  CASE
    WHEN (SELECT COUNT(*) FROM student_tuition WHERE nedarim_subscription_id = nt.subscription_id) > 1
    THEN st.monthly_amount
    ELSE nt.amount
  END AS amount,
  nt.transaction_date AS payment_date,
  nt.result AS status,
  nt.status_text,
  nt.groupe AS category,
  nt.confirmation,
  nt.last_4,
  CASE
    WHEN (SELECT COUNT(*) FROM student_tuition WHERE nedarim_subscription_id = nt.subscription_id) > 1
    THEN 'חלק מהוק משותפת (סך ₪' || nt.amount::text || ')'
    ELSE NULL
  END AS note
FROM nedarim_transactions nt
JOIN student_tuition st ON st.nedarim_subscription_id = nt.subscription_id
WHERE nt.result = 'success'
  AND nt.subscription_id IS NOT NULL

UNION ALL

-- 2) Office payments (per-student by design)
SELECT
  op.id,
  'office' AS source,
  op.id::text AS source_ref,
  op.student_id,
  op.amount,
  op.payment_date,
  'success' AS status,
  op.method AS status_text,
  NULL AS category,
  op.reference AS confirmation,
  NULL AS last_4,
  op.notes AS note
FROM office_payments op

UNION ALL

-- 3) Bank history — REAL bank only (exclude mirrored/credit rows; those come below)
SELECT
  ph.id,
  'bank' AS source,
  ph.legacy_donation_id::text AS source_ref,
  ph.student_id,
  ph.amount_ils AS amount,
  ph.payment_date,
  CASE ph.status_code
    WHEN 2 THEN 'success'
    WHEN 3 THEN 'returned'
    WHEN 1 THEN 'pending'
    ELSE 'other'
  END AS status,
  ph.status_name AS status_text,
  NULL AS category,
  NULL AS confirmation,
  NULL AS last_4,
  NULL AS note
FROM payment_history ph
WHERE ph.status_code IN (2, 3)
  AND ph.nedarim_transaction_id IS NULL

UNION ALL

-- 4) NEW: credit charges in payment_history (one-time charges + mirror) that are
--    NOT already represented by branch 1 above. Dedup by (nedarim_transaction_id,
--    student_id) so nothing double-counts.
SELECT
  ph.id,
  'credit' AS source,
  ph.nedarim_transaction_id AS source_ref,
  ph.student_id,
  ph.amount_ils AS amount,
  ph.payment_date,
  CASE ph.status_code
    WHEN 2 THEN 'success'
    WHEN 3 THEN 'returned'
    ELSE 'other'
  END AS status,
  ph.status_name AS status_text,
  NULL AS category,
  NULL AS confirmation,
  NULL AS last_4,
  NULL AS note
FROM payment_history ph
WHERE ph.status_code IN (2, 3)
  AND ph.nedarim_transaction_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM nedarim_transactions nt
    JOIN student_tuition st ON st.nedarim_subscription_id = nt.subscription_id
    WHERE nt.nedarim_transaction_id = ph.nedarim_transaction_id
      AND st.student_id = ph.student_id
      AND nt.result = 'success'
      AND nt.subscription_id IS NOT NULL
  );

GRANT SELECT ON student_payments_unified TO authenticated, anon;
