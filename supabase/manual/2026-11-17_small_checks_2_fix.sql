-- =============================================================================
-- מלגות — התיקון. להריץ פעם אחת, אחרי שתוצאת קובץ הבדיקה נראית נכונה.
-- (הרצה נוספת לא מזיקה: אחרי התיקון אין יותר מה לתקן.)
--
-- מה נעשה, בפעולה אחת:
--   1. נמחק רישום התשלום של כל "צ'ק" קטן מ-30 ₪ (סך התלמיד בהפקה אחת; לא חד פעמיים).
--      הזכאויות שלו חוזרות לבד למצב "פתוח" — שום זכאות לא נמחקת.
--   2. הזכאויות האלה יוצאות מרשימות ההפקות הישנות, כך שההפקות נשארות "שולם" ואין כפילות.
--   3. הן מסומנות "ממתינות לצבירה" (על ההפקה האחרונה), וההפקה הבאה מצרפת אותן לבד.
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
small as (
  select id from (
    select id, sum(amount) over (partition by student_id, run_key) as total from pay
  ) x
  where total > 0 and total < 30
),
reopen as (
  select e.id, e.amount from scholarship_entries e
  where e.payment_id in (select id from small)
),
last_run as (
  select id from scholarship_runs order by created_at desc limit 1
),
upd as (
  update scholarship_runs r
  set entry_ids = array(
        select u.x from unnest(r.entry_ids) with ordinality as u(x, ord)
        where u.x not in (select id from reopen)
        order by u.ord),
      filters = case when r.id = (select id from last_run) then
        jsonb_set(coalesce(r.filters, '{}'::jsonb), '{held_entry_ids}',
          coalesce(r.filters -> 'held_entry_ids', '[]'::jsonb)
          || coalesce((select jsonb_agg(id) from reopen), '[]'::jsonb))
        else r.filters end
  where exists (select 1 from reopen)
    and (r.id = (select id from last_run) or r.entry_ids && array(select id from reopen))
  returning r.id
),
del as (
  delete from scholarship_payments where id in (select id from small)
  returning id
)
select (select count(*) from del)                      as "רישומי תשלום שנמחקו",
       (select count(*) from reopen)                   as "זכאויות שחזרו לפתוח",
       (select coalesce(sum(amount), 0) from reopen)   as "סכום שחזר לפתוח",
       (select count(*) from upd)                      as "הפקות שעודכנו";
