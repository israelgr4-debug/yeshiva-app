-- Improved unified payment view that attributes credit transactions
-- to the RIGHT student (based on student_tuition.nedarim_subscription_id).
-- Previously: one transaction showed up duplicated for every student in
-- the sub's student_ids array.
-- Now: each transaction is attributed only to students whose student_tuition
-- points to that subscription, and the amount shown is the student's own
-- portion (from student_tuition.monthly_amount), not the total HK amount.

CREATE OR REPLACE VIEW student_payments_unified AS
-- Credit transactions, attributed via student_tuition link
SELECT
  nt.id,
  'credit' AS source,
  nt.subscription_id::text AS source_ref,
  st.student_id,
  -- Show the student's own portion of this HK if there are multiple students on it,
  -- else the full amount
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

-- Bank history (legacy payment_history), linked per-student already
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
WHERE ph.status_code IN (2, 3);

GRANT SELECT ON student_payments_unified TO authenticated, anon;
