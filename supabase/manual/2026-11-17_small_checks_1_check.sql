-- =============================================================================
-- מלגות — בדיקה בלבד (לא משנה כלום).
-- הרקע: סומן "שולם" על הכול, אבל צ'ק של פחות מ-30 ₪ לא נכתב בפועל.
-- "צ'ק" = סך התשלום של תלמיד אחד בהפקה אחת (חד פעמיים לא נכללים).
-- התוצאה: לכל הפקה — כמה צ'קים נשארים משולמים וכמה יחזרו ל"פתוח".
-- =============================================================================
with pay as (
  select p.id, p.student_id,
         coalesce(p.run_id::text, 'ללא הפקה · ' || p.paid_at) as run_key,
         (select coalesce(sum(e.amount), 0) from scholarship_entries e where e.payment_id = p.id) as amount
  from scholarship_payments p
  where p.status = 'paid'
    and not exists (select 1 from scholarship_entries e
                    join scholarship_types t on t.id = e.type_id
                    where e.payment_id = p.id and t.kind = 'one_time')
),
cheque as (
  select student_id, run_key, sum(amount) as total
  from pay group by student_id, run_key
)
select coalesce(r.title, c.run_key)                        as "הפקה",
       count(*) filter (where c.total >= 30)               as "צ'קים שנשארים משולמים",
       coalesce(sum(c.total) filter (where c.total >= 30), 0) as "סכום שנשאר משולם",
       count(*) filter (where c.total > 0 and c.total < 30)   as "פחות מ-30: יחזרו לפתוח",
       coalesce(sum(c.total) filter (where c.total > 0 and c.total < 30), 0) as "סכום שיחזור לפתוח"
from cheque c
left join scholarship_runs r on r.id::text = c.run_key
group by 1
order by 1;
