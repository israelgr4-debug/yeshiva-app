"""
Import May 2026 collection from the OLD software (xlsx export).

Input: גביה 5 2026.xlsx — columns: legacy_student_id, amount, date (20/05/2026)

For each xlsx row → find student → check existing May 2026 records:
  - Found 1 row, same amount, status NOT 'paid' → UPDATE status=2 (נפרע)
  - Found 1 row, different amount → UPDATE status=2 AND amount (xlsx is authoritative)
  - Found 1 row, status already 2 (נפרע) same amount → SKIP
  - Found 1 row, status 2 different amount → REPORT (don't touch)
  - Found multiple rows → REPORT (ambiguous)
  - Found 0 rows → INSERT new with status=2

Status: 2 = נפרע (paid), date = 2026-05-20.

DRY-RUN by default. Pass --apply to actually write.
"""
import sys, io, json, urllib.request
from pathlib import Path
from collections import defaultdict
import pandas as pd

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

XLSX = r'C:\Users\User\Downloads\גביה 5 2026.xlsx'
TARGET_MONTH = '2026-05'
PAYMENT_DATE = '2026-05-20'
PAID_STATUS  = 2
PAID_NAME    = 'נפרע'
APPLY = '--apply' in sys.argv

env = Path('.env.local').read_text(encoding='utf-8')
SUPA_URL = SUPA_KEY = None
for line in env.splitlines():
    if line.startswith('NEXT_PUBLIC_SUPABASE_URL='):
        SUPA_URL = line.split('=', 1)[1].strip().strip('"').strip("'")
    if line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
        SUPA_KEY = line.split('=', 1)[1].strip().strip('"').strip("'")
HDR = {'apikey': SUPA_KEY, 'Authorization': f'Bearer {SUPA_KEY}', 'Content-Type': 'application/json'}

def req(method, path, body=None, extra_headers=None):
    data = json.dumps(body).encode() if body is not None else None
    h = dict(HDR)
    if extra_headers: h.update(extra_headers)
    r = urllib.request.Request(f'{SUPA_URL}/rest/v1{path}', data=data, method=method, headers=h)
    return json.loads(urllib.request.urlopen(r).read() or b'null')

# ---- load xlsx ----
df = pd.read_excel(XLSX)
df.columns = ['legacy_student_id', 'amount', 'date']
df['legacy_student_id'] = df['legacy_student_id'].astype(int)
df['amount']            = df['amount'].astype(float)
print(f'Loaded {len(df)} rows from xlsx, total ₪{df.amount.sum():,.0f}')

# ---- bulk fetch students ----
ids = df['legacy_student_id'].tolist()
students = []
for i in range(0, len(ids), 300):
    chunk = ids[i:i+300]
    res = req('GET', f'/students?select=id,legacy_student_id,first_name,last_name&legacy_student_id=in.({",".join(map(str,chunk))})')
    students.extend(res or [])
stud_by_legacy = {s['legacy_student_id']: s for s in students}
print(f'Matched {len(stud_by_legacy)}/{len(ids)} students')

# ---- bulk fetch existing 2026-05 records ----
student_ids = [s['id'] for s in stud_by_legacy.values()]
existing_by_student = defaultdict(list)
for i in range(0, len(student_ids), 100):
    chunk = student_ids[i:i+100]
    q = (f'/payment_history?select=id,student_id,payment_date,amount_ils,status_code,status_name'
         f'&student_id=in.({",".join(chunk)})'
         f'&payment_date=gte.{TARGET_MONTH}-01&payment_date=lte.{TARGET_MONTH}-31')
    res = req('GET', q)
    for p in (res or []):
        existing_by_student[p['student_id']].append(p)
print(f'Found {sum(len(v) for v in existing_by_student.values())} existing 2026-05 records')

# ---- plan ----
to_update_status = []   # status was not 2, but amount matches → only change status
to_update_amount = []   # status 1/9, amount differs → update both status + amount
to_insert        = []   # no row exists → insert new
already_paid     = []   # status already 2 + amount matches → skip
conflict_paid    = []   # already paid with different amount
ambiguous        = []   # multiple existing rows → don't auto-touch
missing_student  = []

for _, row in df.iterrows():
    legacy_id = int(row['legacy_student_id'])
    amount    = float(row['amount'])

    s = stud_by_legacy.get(legacy_id)
    if not s:
        missing_student.append((legacy_id, amount))
        continue

    existing = existing_by_student.get(s['id'], [])
    info = {
        'student_id': s['id'],
        'student_name': f"{s['first_name']} {s['last_name']}",
        'legacy_id': legacy_id,
        'amount': amount,
    }

    if len(existing) == 0:
        to_insert.append(info)
    elif len(existing) > 1:
        info['existing'] = existing
        ambiguous.append(info)
    else:
        p = existing[0]
        p_amount = float(p.get('amount_ils') or 0)
        p_status = p.get('status_code')
        info['rec_id'] = p['id']
        info['old_amount'] = p_amount
        info['old_status'] = p_status
        info['old_status_name'] = p.get('status_name')
        info['old_date'] = p.get('payment_date')

        amount_same = abs(p_amount - amount) < 0.01
        is_paid = (p_status == PAID_STATUS)

        if is_paid and amount_same:
            already_paid.append(info)
        elif is_paid and not amount_same:
            conflict_paid.append(info)
        elif amount_same:
            to_update_status.append(info)
        else:
            to_update_amount.append(info)

# ---- report ----
print()
print('='*70)
print('SUMMARY')
print('='*70)
print(f'Matched students          : {len(stud_by_legacy)}/{len(df)}')
print(f'Will INSERT (new)         : {len(to_insert)}    ₪{sum(r["amount"] for r in to_insert):,.0f}')
print(f'Will UPDATE status only   : {len(to_update_status)}    (אותו סכום, רק סטטוס → נפרע)')
print(f'Will UPDATE status+amount : {len(to_update_amount)}    (סטטוס + תיקון סכום)')
print(f'Already paid (skip)       : {len(already_paid)}')
print(f'Conflict-paid (REPORT)    : {len(conflict_paid)}')
print(f'Ambiguous - multi-row     : {len(ambiguous)}')
print(f'Missing students          : {len(missing_student)}')

if to_update_amount:
    print()
    print('--- UPDATE: סטטוס + תיקון סכום ---')
    for r in to_update_amount[:50]:
        print(f"  {r['student_name']:25s} (#{r['legacy_id']})  ₪{r['old_amount']:>6.0f} → ₪{r['amount']:>6.0f}  (היה: {r['old_status_name']})")
    if len(to_update_amount) > 50:
        print(f'  ... +{len(to_update_amount)-50} more')

if to_insert:
    print()
    print('--- INSERT (חדש לחלוטין) ---')
    for r in to_insert:
        print(f"  {r['student_name']:25s} (#{r['legacy_id']})  ₪{r['amount']:>6.0f}")

if conflict_paid:
    print()
    print('--- ⚠ CONFLICT-PAID (כבר נפרע עם סכום שונה - לא נוגעים) ---')
    for r in conflict_paid:
        print(f"  {r['student_name']:25s} (#{r['legacy_id']})  db ₪{r['old_amount']:>6.0f}   xlsx ₪{r['amount']:>6.0f}")

if ambiguous:
    print()
    print('--- ⚠ AMBIGUOUS (כמה רשומות לאותו חודש) ---')
    for r in ambiguous:
        print(f"  {r['student_name']:25s} (#{r['legacy_id']})  xlsx ₪{r['amount']:>6.0f}")
        for p in r['existing']:
            print(f"     - ₪{p['amount_ils']}  status={p['status_code']} ({p['status_name']})  date={p['payment_date']}")

if missing_student:
    print()
    print(f'--- MISSING STUDENTS ({len(missing_student)}) ---')
    for m in missing_student:
        print(f"  #{m[0]:>5}  ₪{m[1]:>6.0f}")

# ---- apply ----
print()
if not APPLY:
    print('🔍 DRY-RUN. Pass --apply to actually write.')
    sys.exit(0)

if conflict_paid or ambiguous:
    if '--force' not in sys.argv:
        print('🛑 ABORTING: there are conflicts/ambiguous rows. Resolve manually or pass --force to ignore them and update only the safe rows.')
        sys.exit(2)

# UPDATE status-only
print(f'➡  UPDATE status (only): {len(to_update_status)} rows...')
for r in to_update_status:
    body = {
        'status_code': PAID_STATUS,
        'status_name': PAID_NAME,
        'payment_date': PAYMENT_DATE,
        'legacy_donor_id': r['legacy_id'],
    }
    req('PATCH', f'/payment_history?id=eq.{r["rec_id"]}', body, {'Prefer': 'return=minimal'})

# UPDATE status + amount
print(f'➡  UPDATE status+amount: {len(to_update_amount)} rows...')
for r in to_update_amount:
    body = {
        'status_code': PAID_STATUS,
        'status_name': PAID_NAME,
        'payment_date': PAYMENT_DATE,
        'amount_ils': r['amount'],
        'legacy_donor_id': r['legacy_id'],
    }
    req('PATCH', f'/payment_history?id=eq.{r["rec_id"]}', body, {'Prefer': 'return=minimal'})

# INSERT new
print(f'➡  INSERT: {len(to_insert)} rows...')
if to_insert:
    BATCH = 100
    for i in range(0, len(to_insert), BATCH):
        batch = [{
            'student_id': r['student_id'],
            'legacy_donor_id': r['legacy_id'],
            'payment_date': PAYMENT_DATE,
            'amount_ils':   r['amount'],
            'status_code':  PAID_STATUS,
            'status_name':  PAID_NAME,
        } for r in to_insert[i:i+BATCH]]
        req('POST', '/payment_history', batch, {'Prefer': 'return=minimal'})

print('✅ done.')
