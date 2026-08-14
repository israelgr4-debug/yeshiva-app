-- Fix: after credit charges were mirrored into payment_history (migration 047),
-- the unified payment view showed each credit charge TWICE — once as 'credit'
-- (from nedarim_transactions) and once as 'bank' (from the mirrored payment_history
-- row). The bank branch now excludes mirrored credit rows (nedarim_transaction_id
-- IS NOT NULL), so credit appears once as credit and bank shows real bank only.

CREATE OR REPLACE VIEW student_payments_unified AS
-- Credit transactions, attributed via student_tuition link
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

-- Office payments (per-student by design)
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

-- Bank history — REAL bank only (exclude mirrored credit charges from migration 047)
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
  AND ph.nedarim_transaction_id IS NULL;

GRANT SELECT ON student_payments_unified TO authenticated, anon;
