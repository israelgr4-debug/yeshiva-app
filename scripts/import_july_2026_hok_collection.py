"""
Import July 2026 standing-order (הו"ק בנקאי) collection from the summary xlsx.

Input: "הוק-דוח סיכום.xlsx" — one row per student:
  col B = student full name ("lastname firstname")
  col C = father first name
  col D = phone
  col E = bank/branch (messy, informational only)
  col F = bank account number   <-- primary match key
  col G = monthly amount
  col H = charge date (2026-07-20)

Matching (per manager decision): by BANK ACCOUNT NUMBER (F) -> family,
then resolve the specific student inside the family by full name.

Two write targets (per manager decision 2026-08-13):
  1. student_tuition (THE BASE): where the xlsx amount differs from the
     stored monthly_amount, update it (xlsx is authoritative). Ensure the
     row is bank_ho / bank_day=20 / active.
  2. payment_history (HISTORY): the July charge was actually collected.
     - existing July forecast row (status 1) -> UPDATE to נפרע (status 2),
       amount = xlsx amount, date = 2026-07-20.
     - no July row               -> INSERT a נפרע row.
     - already נפרע (status 2)    -> SKIP.
     - חזר/bounced (status 3)     -> REPORT, don't touch.
     - >1 July row               -> REPORT (ambiguous), don't touch.

DRY-RUN by default. Pass --apply to write.
"""
import sys, io, json, re, urllib.request
from pathlib import Path
from collections import defaultdict
import openpyxl

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

XLSX         = r"C:\Users\User\Documents\הוק-דוח סיכום.xlsx"
TARGET_MONTH = '2026-07'
PAYMENT_DATE = '2026-07-20'
PAID_STATUS  = 2
PAID_NAME    = 'נפרע'
APPLY        = '--apply' in sys.argv

# ---- env / http ----
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

# ---- normalizers ----
def nacct(v): return re.sub(r'\D', '', str(v or '')).lstrip('0') or ''
def nname(x):
    if not x: return ''
    x = str(x).replace('\u00a0', ' ')
    x = re.sub(r'["\'\u05f3\u05f4`]', '', x)
    return re.sub(r'\s+', ' ', x).strip()

# ---- load families + build account index ----
fams = []
for p in range(0, 30):
    res = req('GET', f'/families?select=id,family_name,bank_account&limit=1000&offset={p*1000}')
    if not res: break
    fams.extend(res)
    if len(res) < 1000: break
fam_by_acct = defaultdict(list)
for f in fams:
    a = nacct(f.get('bank_account'))
    if a: fam_by_acct[a].append(f)

# ---- load xlsx ----
wb = openpyxl.load_workbook(XLSX, data_only=True)
rows = list(wb.active.iter_rows(values_only=True))[1:]
def sc(v): return '' if v is None else str(v).strip()

# ---- resolve rows -> students ----
fam_ids = set()
for r in rows:
    for f in fam_by_acct.get(nacct(r[5]), []): fam_ids.add(f['id'])
fam_ids = list(fam_ids)
students = []
for i in range(0, len(fam_ids), 100):
    res = req('GET', '/students?select=id,first_name,last_name,family_id,status&family_id=in.(' + ','.join(fam_ids[i:i+100]) + ')')
    students.extend(res or [])
by_fam = defaultdict(list)
for st in students: by_fam[st['family_id']].append(st)
def variants(st):
    fn = nname(st.get('first_name')); ln = nname(st.get('last_name'))
    return {f"{ln} {fn}".strip(), f"{fn} {ln}".strip()}

resolved = []   # (student, amount, xlsx_name)
unmatched = []
for r in rows:
    acct = nacct(r[5]); xname = nname(r[1]); amt = float(sc(r[6]) or 0)
    fl = fam_by_acct.get(acct, [])
    if not fl:
        unmatched.append((sc(r[1]), acct, amt, 'no_account')); continue
    studs = []
    for f in fl: studs += by_fam.get(f['id'], [])
    hits = [st for st in studs if xname in variants(st)]
    if len(hits) == 1:
        st = hits[0]
    elif len(studs) == 1:
        st = studs[0]
    else:
        active = [x for x in studs if x['status'] == 'active']
        if len(active) == 1:
            st = active[0]
        else:
            unmatched.append((sc(r[1]), acct, amt, 'no_name')); continue
    resolved.append((st, amt, sc(r[1])))

sids = [st['id'] for st, _, _ in resolved]

# ---- current student_tuition ----
tuit = {}
for i in range(0, len(sids), 100):
    res = req('GET', '/student_tuition?select=id,student_id,payment_method,monthly_amount,bank_day,active&student_id=in.(' + ','.join(sids[i:i+100]) + ')')
    for t in (res or []): tuit[t['student_id']] = t

# ---- existing July payment_history ----
ph = defaultdict(list)
for i in range(0, len(sids), 100):
    res = req('GET', '/payment_history?select=id,student_id,amount_ils,status_code,status_name,payment_date&student_id=in.(' + ','.join(sids[i:i+100]) + f')&payment_date=gte.{TARGET_MONTH}-01&payment_date=lte.{TARGET_MONTH}-31')
    for x in (res or []): ph[x['student_id']].append(x)

# ---- build plan ----
st_update    = []   # student_tuition amount change
ph_mark_paid = []   # status 1 -> 2 (+amount fix)
ph_insert    = []   # new paid row
ph_already   = []   # status 2 already
ph_bounced   = []   # status 3 conflict
ph_ambig     = []   # >1 July row

for st, amt, xn in resolved:
    sid = st['id']
    # --- base ---
    t = tuit.get(sid)
    if t is not None and abs(float(t['monthly_amount'] or 0) - amt) >= 0.01:
        st_update.append({'tid': t['id'], 'name': xn, 'old': float(t['monthly_amount'] or 0), 'new': amt,
                          'method': t['payment_method'], 'bank_day': t.get('bank_day')})
    # --- history ---
    rowsj = ph.get(sid, [])
    if len(rowsj) == 0:
        ph_insert.append({'sid': sid, 'name': xn, 'amt': amt})
    elif len(rowsj) > 1:
        ph_ambig.append({'name': xn, 'rows': rowsj, 'amt': amt})
    else:
        p = rowsj[0]; scode = p.get('status_code')
        rec = {'id': p['id'], 'name': xn, 'amt': amt, 'old_amt': float(p.get('amount_ils') or 0), 'old_status': scode}
        if scode == PAID_STATUS:
            ph_already.append(rec)
        elif scode == 3:
            ph_bounced.append(rec)
        else:  # 1 (לחיוב/צפי) or other -> mark paid
            ph_mark_paid.append(rec)

# ---- report ----
print('='*66)
print('JULY 2026 הו"ק COLLECTION — PLAN' + ('  [APPLY]' if APPLY else '  [DRY-RUN]'))
print('='*66)
print(f'xlsx rows                 : {len(rows)}   ₪{sum(a for _,a,_ in resolved):,.0f} resolved')
print(f'resolved to student       : {len(resolved)}')
print(f'unmatched (manual)        : {len(unmatched)}')
print()
print('--- student_tuition (BASE) ---')
print(f'  amount updates          : {len(st_update)}')
for u in st_update:
    print(f"     {u['name']:24s} ₪{u['old']:>6.0f} → ₪{u['new']:>6.0f}  ({u['method']}, day={u['bank_day']})")
print()
print('--- payment_history (HISTORY, month 2026-07) ---')
print(f'  mark paid (1→2)         : {len(ph_mark_paid)}')
print(f'  insert new paid         : {len(ph_insert)}')
print(f'  already paid (skip)     : {len(ph_already)}')
print(f'  BOUNCED conflict (skip) : {len(ph_bounced)}')
print(f'  AMBIGUOUS (skip)        : {len(ph_ambig)}')
if ph_insert:
    print('  new rows:')
    for x in ph_insert: print(f"     {x['name']:24s} ₪{x['amt']:>6.0f}")
if ph_bounced:
    print('  ⚠ bounced (left untouched):')
    for x in ph_bounced: print(f"     {x['name']:24s} db ₪{x['old_amt']:>6.0f}")
if ph_ambig:
    print('  ⚠ ambiguous (left untouched):')
    for x in ph_ambig:
        print(f"     {x['name']:24s} xlsx ₪{x['amt']:>6.0f}")
        for p in x['rows']: print(f"        - ₪{p['amount_ils']} status={p['status_code']} ({p['status_name']}) {p['payment_date']}")
print()
print(f'--- UNMATCHED ({len(unmatched)}) — need manual link ---')
for u in unmatched: print('   ', u)

# ---- apply ----
print()
if not APPLY:
    print('🔍 DRY-RUN. Pass --apply to write.')
    sys.exit(0)

print('➡ updating student_tuition amounts...')
for u in st_update:
    req('PATCH', f"/student_tuition?id=eq.{u['tid']}",
        {'monthly_amount': u['new'], 'payment_method': 'bank_ho',
         'bank_day': u['bank_day'] or 20, 'active': True},
        {'Prefer': 'return=minimal'})

print('➡ marking July rows as נפרע...')
for r in ph_mark_paid:
    req('PATCH', f"/payment_history?id=eq.{r['id']}",
        {'status_code': PAID_STATUS, 'status_name': PAID_NAME,
         'payment_date': PAYMENT_DATE, 'amount_ils': r['amt']},
        {'Prefer': 'return=minimal'})

print('➡ inserting new paid rows...')
if ph_insert:
    B = 100
    for i in range(0, len(ph_insert), B):
        batch = [{'student_id': r['sid'], 'payment_date': PAYMENT_DATE,
                  'amount_ils': r['amt'], 'status_code': PAID_STATUS,
                  'status_name': PAID_NAME} for r in ph_insert[i:i+B]]
        req('POST', '/payment_history', batch, {'Prefer': 'return=minimal'})

print('✅ done.')
