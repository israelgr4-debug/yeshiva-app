"""
Import June 2026 collection from the OLD-software "תנועות" xlsx (by מספר תורם).

Format (headers in row 1): מספר תורם | מספר תרומה | מספר פרוט | סכום דולר |
  סכום שקל | תאריך | סטטוס | קבוצה | גירסא | מספר אישור | מספר פרוט השליחה

Match: מספר תורם == students.legacy_student_id (confirmed 287/288 on this file).

This is a HISTORY-ONLY import (June is older than the July base). It does NOT
touch student_tuition. For each matched student's June payment_history row:
  - status 1 (forecast) -> UPDATE to נפרע (2), amount = xlsx (authoritative),
    and stamp legacy_donor_id / legacy_donation_id / legacy_detail_number /
    group_number / payment_date for provenance.
  - already נפרע (2)     -> SKIP.
  - no June row          -> INSERT a נפרע row (with provenance).
  - >1 June row          -> REPORT (ambiguous), don't touch.
Donors with no matching student are reported for manual handling.

DRY-RUN by default. Pass --apply to write.
"""
import sys, io, json, urllib.request
from pathlib import Path
from collections import defaultdict
import openpyxl

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

XLSX = r"C:\Users\User\Downloads\גביה 6 2026.xlsx"
TARGET_MONTH = '2026-06'
PAYMENT_DATE = '2026-06-20'
PAID_STATUS, PAID_NAME = 2, 'נפרע'
APPLY = '--apply' in sys.argv

env = Path('.env.local').read_text(encoding='utf-8')
def gv(k):
    for l in env.splitlines():
        if l.startswith(k + '='):
            return l.split('=', 1)[1].strip().strip('"').strip("'")
URL = gv('NEXT_PUBLIC_SUPABASE_URL'); KEY = gv('SUPABASE_SERVICE_ROLE_KEY')
HDR = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
def req(method, path, body=None, extra=None):
    data = json.dumps(body).encode() if body is not None else None
    h = dict(HDR)
    if extra: h.update(extra)
    r = urllib.request.Request(f'{URL}/rest/v1{path}', data=data, method=method, headers=h)
    return json.loads(urllib.request.urlopen(r).read() or b'null')

def as_int(v):
    try: return int(v)
    except Exception: return None

# ---- load xlsx ----
wb = openpyxl.load_workbook(XLSX, data_only=True)
xrows = []
for r in list(wb.active.iter_rows(values_only=True))[1:]:
    if r[0] is None: continue
    xrows.append({
        'donor': int(r[0]),
        'donation': as_int(r[1]),
        'detail': as_int(r[2]),
        'amt': float(r[4] or 0),
        'status': as_int(r[6]),
        'group': as_int(r[7]),
    })
print(f'xlsx rows {len(xrows)}  ₪{sum(x["amt"] for x in xrows):,.0f}')

# ---- donor -> student ----
donors = sorted({x['donor'] for x in xrows})
stud = {}
for i in range(0, len(donors), 100):
    res = req('GET', '/students?select=id,first_name,last_name,legacy_student_id,status&legacy_student_id=in.(' + ','.join(map(str, donors[i:i+100])) + ')')
    for s in (res or []): stud[s['legacy_student_id']] = s
sids = [s['id'] for s in stud.values()]

# ---- existing June payment_history per student ----
juneph = defaultdict(list)
for i in range(0, len(sids), 100):
    res = req('GET', '/payment_history?select=id,student_id,amount_ils,status_code&student_id=in.(' + ','.join(sids[i:i+100]) + f')&payment_date=gte.{TARGET_MONTH}-01&payment_date=lte.{TARGET_MONTH}-30')
    for r in (res or []): juneph[r['student_id']].append(r)

# ---- current base (for mismatch reporting only; NOT modified) ----
base = {}
for i in range(0, len(sids), 100):
    res = req('GET', '/student_tuition?select=student_id,monthly_amount,payment_method&student_id=in.(' + ','.join(sids[i:i+100]) + ')')
    for t in (res or []): base[t['student_id']] = t

mark_paid = []; insert = []; already = []; ambig = []; no_student = []; vs_base = []
for x in xrows:
    s = stud.get(x['donor'])
    if not s:
        no_student.append(x); continue
    sid = s['id']; nm = f"{s['last_name']} {s['first_name']}"
    prov = {'legacy_donor_id': x['donor'], 'legacy_donation_id': x['donation'],
            'legacy_detail_number': x['detail'], 'group_number': x['group']}
    rj = juneph.get(sid, [])
    if len(rj) == 0:
        insert.append({'sid': sid, 'name': nm, 'amt': x['amt'], **prov})
    elif len(rj) > 1:
        ambig.append({'name': nm, 'amt': x['amt'], 'rows': rj})
    else:
        p = rj[0]
        if p['status_code'] == PAID_STATUS:
            already.append((nm, x['amt']))
        else:
            mark_paid.append({'id': p['id'], 'name': nm, 'amt': x['amt'], **prov})
    b = base.get(sid)
    if b is not None and abs(float(b['monthly_amount'] or 0) - x['amt']) >= 0.01:
        vs_base.append((nm, float(b['monthly_amount'] or 0), x['amt'], b['payment_method']))

print('='*64)
print(f'JUNE 2026 DONOR COLLECTION — PLAN' + ('  [APPLY]' if APPLY else '  [DRY-RUN]'))
print('='*64)
print(f'matched to student : {len(xrows)-len(no_student)}/{len(xrows)}')
print(f'mark paid (1→2)    : {len(mark_paid)}')
print(f'insert new paid    : {len(insert)}')
print(f'already paid skip  : {len(already)}')
print(f'ambiguous skip     : {len(ambig)}')
print(f'donor→no student   : {len(no_student)}  {[x["donor"] for x in no_student]}')
print(f'\ncollected ≠ current base (INFO, base NOT changed): {len(vs_base)}')
for m in vs_base: print(f'   {m[0]:24s} בסיס ₪{m[1]:>6.0f}  vs יוני ₪{m[2]:>6.0f}  ({m[3]})')
if insert:
    print('\ninsert rows:')
    for r in insert: print(f'   +{r["name"]:24s} ₪{r["amt"]:.0f}')
if ambig:
    print('\nambiguous:')
    for a in ambig: print(f'   {a["name"]}  xlsx ₪{a["amt"]:.0f}  rows={[(r["amount_ils"],r["status_code"]) for r in a["rows"]]}')

print()
if not APPLY:
    print('🔍 DRY-RUN. Pass --apply to write.')
    sys.exit(0)

print('➡ mark paid...')
for r in mark_paid:
    body = {'status_code': PAID_STATUS, 'status_name': PAID_NAME, 'payment_date': PAYMENT_DATE,
            'amount_ils': r['amt'], 'legacy_donor_id': r['legacy_donor_id'],
            'legacy_donation_id': r['legacy_donation_id'], 'legacy_detail_number': r['legacy_detail_number'],
            'group_number': r['group_number']}
    req('PATCH', f"/payment_history?id=eq.{r['id']}", body, {'Prefer': 'return=minimal'})
print('➡ insert new paid...')
if insert:
    for i in range(0, len(insert), 100):
        batch = [{'student_id': r['sid'], 'payment_date': PAYMENT_DATE, 'amount_ils': r['amt'],
                  'status_code': PAID_STATUS, 'status_name': PAID_NAME,
                  'legacy_donor_id': r['legacy_donor_id'], 'legacy_donation_id': r['legacy_donation_id'],
                  'legacy_detail_number': r['legacy_detail_number'], 'group_number': r['group_number']}
                 for r in insert[i:i+100]]
        req('POST', '/payment_history', batch, {'Prefer': 'return=minimal'})
print('✅ done.')
