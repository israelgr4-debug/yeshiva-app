"""
Fill students.phone from a list (xlsx) that has an ID number and a mobile number.

There is no service-role key on this machine (on purpose), so this script does NOT touch
the database: it writes ONE SQL statement for the manager to run in the Supabase SQL
Editor. The statement updates and then returns, row by row, what happened.

Expected headers (first row): משפחה | פרטי | ת.ז. | ... | טלפון נייד | ...

Matching (inside the SQL): by ID number — students.id_number / passport_number /
govt_id_number, digits only, leading zeros ignored; an active student wins. A row with no
ID in the file falls back to an exact name match, only when exactly one ACTIVE student
has that name.

What the SQL writes:
  - student has no phone             -> the number from the file
  - student has the same number      -> nothing
  - student has a DIFFERENT number   -> nothing (listed), unless `overwrite` is set to true
                                        in the first line of the statement

The output file holds personal data — keep it OUT of git (write it under /local-data/).

  python scripts/import_phones_from_xlsx.py --file "<path>.xlsx" --out local-data/phones.sql
"""
import sys, io, re
from pathlib import Path

import openpyxl

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

FILE = sys.argv[sys.argv.index('--file') + 1]
OUT = Path(sys.argv[sys.argv.index('--out') + 1])


def digits(s):
    return ''.join(ch for ch in str(s or '') if ch.isdigit())


def id_key(s):
    d = digits(s).lstrip('0')
    return d if len(d) >= 5 else ''


def norm_phone(s):
    d = digits(s)
    if d.startswith('972'):
        d = '0' + d[3:]
    if len(d) == 9 and not d.startswith('0'):
        d = '0' + d
    return d


def is_mobile(d):
    return bool(re.fullmatch(r'05\d{8}', d))


def is_phone(d):
    return bool(re.fullmatch(r'0(5\d{8}|[23489]\d{7}|7\d{8})', d))


def norm_name(s):
    s = str(s or '').replace(' ', ' ')
    return re.sub(r'\s+', ' ', s).strip()


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


wb = openpyxl.load_workbook(FILE, data_only=True)
ws = wb.worksheets[0]
hdr = [norm_name(c.value) for c in ws[1]]


def col(*names):
    for n in names:
        if n in hdr:
            return hdr.index(n)
    raise SystemExit(f'missing column: {names} (found: {hdr})')


C_LAST, C_FIRST, C_ID, C_MOBILE = col('משפחה'), col('פרטי'), col('ת.ז.', 'תז', 'ת.ז'), col('טלפון נייד', 'נייד')
rows = []
for i, r in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
    last, first = norm_name(r[C_LAST]), norm_name(r[C_FIRST])
    if not last and not first:
        continue
    phone = norm_phone(r[C_MOBILE])
    rows.append({'n': i, 'last': last, 'first': first, 'id': id_key(r[C_ID]), 'phone': phone if is_phone(phone) else '', 'raw': digits(r[C_MOBILE])})

values = ',\n'.join(f"  ({x['n']}, {q(x['last'])}, {q(x['first'])}, {q(x['id'])}, {q(x['phone'])})" for x in rows)
D = r"regexp_replace(coalesce(%s, ''), '\D', '', 'g')"
sql = f"""-- Fill students.phone from "{Path(FILE).name}" ({len(rows)} rows).
-- Run once in the Supabase SQL Editor. Only EMPTY phones are filled; to also replace
-- numbers that differ, change false to true in the next line.
WITH cfg AS (SELECT false AS overwrite),
src(n, last_name, first_name, id_key, phone) AS (VALUES
{values}
),
stu AS (
  SELECT s.id, s.status, s.phone,
    ARRAY[ltrim({D % 's.id_number'}, '0'), ltrim({D % 's.passport_number'}, '0'), ltrim({D % 's.govt_id_number'}, '0')] AS keys,
    regexp_replace(btrim(coalesce(s.last_name, '') || ' ' || coalesce(s.first_name, '')), '\\s+', ' ', 'g') AS full_name
  FROM students s
),
m AS (
  SELECT src.*, pick.id AS student_id, {D % 'pick.phone'} AS cur
  FROM src LEFT JOIN LATERAL (
    SELECT st.id, st.phone FROM stu st
    WHERE (src.id_key <> '' AND src.id_key = ANY (st.keys))
       OR (src.id_key = '' AND st.status = 'active' AND st.full_name = btrim(src.last_name || ' ' || src.first_name)
           AND (SELECT count(*) FROM stu x WHERE x.status = 'active' AND x.full_name = st.full_name) = 1)
    ORDER BY (st.status = 'active') DESC, st.id
    LIMIT 1
  ) pick ON true
),
upd AS (
  UPDATE students s SET phone = m.phone
  FROM m, cfg
  WHERE s.id = m.student_id AND m.phone <> ''
    AND (m.cur = '' OR (cfg.overwrite AND right(m.cur, 9) <> right(m.phone, 9)))
  RETURNING s.id
),
res AS (
  SELECT m.n, btrim(m.last_name || ' ' || m.first_name) AS name, m.cur, m.phone,
    CASE WHEN m.student_id IS NULL THEN '1. לא נמצא במערכת'
         WHEN m.phone = '' THEN '2. אין מספר תקין בקובץ'
         WHEN m.cur = '' THEN '4. הוכנס'
         WHEN right(m.cur, 9) = right(m.phone, 9) THEN '5. כבר היה אותו מספר'
         WHEN m.student_id IN (SELECT id FROM upd) THEN '3. הוחלף'
         ELSE '3. מספר שונה במערכת - לא שונה' END AS status
  FROM m
)
SELECT status AS "מה קרה", count(*) OVER (PARTITION BY status) AS "כמה כאלה", n AS "שורה בקובץ", name AS "שם", cur AS "היה במערכת", phone AS "בקובץ"
FROM res ORDER BY status, n;
"""
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(sql, encoding='utf-8')

print(f'rows: {len(rows)}')
print(f'  mobile (05x)            : {sum(1 for x in rows if is_mobile(x["phone"]))}')
print(f'  landline in the mobile column (kept): {sum(1 for x in rows if x["phone"] and not is_mobile(x["phone"]))}')
bad = [x for x in rows if not x['phone']]
print(f'  no valid number         : {len(bad)}')
for x in bad:
    print(f'      row {x["n"]}: {x["last"]} {x["first"]} — {"empty" if not x["raw"] else str(len(x["raw"])) + " digits"}')
noid = [x for x in rows if not x['id']]
print(f'  no ID in the file (name match): {len(noid)}')
for x in noid:
    print(f'      row {x["n"]}: {x["last"]} {x["first"]}')
dup = len(rows) - len({x['id'] or (x['last'], x['first']) for x in rows})
print(f'  duplicate people        : {dup}')
print(f'written: {OUT}  ({len(sql)} chars)')
