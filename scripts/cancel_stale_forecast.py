"""
Cancel stale forecast rows (payment_history.status_code=1) by marking them
בוטל (status 9) — reversible, matches the app's existing "cancelled" convention.

Cancels:
  A) every status-1 row whose student is graduated / inactive / chizuk
     (they left / are exempt — should carry no forecast). reason: student left.
  B) status-1 rows of ACTIVE students in PAST months (2026-05/06/07) that were
     never collected. reason: past forecast not collected.

Keeps: active students' forecast for 2026-08 onward (the legit yearly plan).

DRY-RUN by default. Pass --apply to write.
"""
import sys, io, json, urllib.request
from pathlib import Path
from collections import Counter
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

APPLY = '--apply' in sys.argv
PAST_MONTHS = {'2026-05', '2026-06', '2026-07'}
REASON_LEFT = 'בוטל - תלמיד עזב/בוגר'
REASON_PAST = 'בוטל - צפי עבר שלא נגבה'

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

# all status-1 forecast rows
rows = []
for p in range(0, 30):
    res = req('GET', f'/payment_history?select=id,student_id,payment_date&status_code=eq.1&limit=1000&offset={p*1000}')
    if not res: break
    rows.extend(res)
    if len(res) < 1000: break

sids = list({r['student_id'] for r in rows if r['student_id']})
sstat = {}
for i in range(0, len(sids), 100):
    res = req('GET', '/students?select=id,status&id=in.(' + ','.join(sids[i:i+100]) + ')')
    for s in (res or []): sstat[s['id']] = s['status']

cancel_left = []; cancel_past = []; keep = 0
for r in rows:
    st = sstat.get(r['student_id'])
    month = (r['payment_date'] or '')[:7]
    if st in ('graduated', 'inactive', 'chizuk'):
        cancel_left.append(r['id'])
    elif st == 'active' and month in PAST_MONTHS:
        cancel_past.append(r['id'])
    else:
        keep += 1

print('='*60)
print('CANCEL STALE FORECAST — PLAN' + ('  [APPLY]' if APPLY else '  [DRY-RUN]'))
print('='*60)
print(f'total status-1 rows        : {len(rows)}')
print(f'cancel (student left)      : {len(cancel_left)}')
print(f'cancel (active past uncoll): {len(cancel_past)}')
print(f'KEEP (active, Aug+ forecast): {keep}')
print(f'TOTAL to cancel            : {len(cancel_left)+len(cancel_past)}')

if not APPLY:
    print('\n🔍 DRY-RUN. Pass --apply to write.')
    sys.exit(0)

def patch_ids(ids, reason):
    for i in range(0, len(ids), 100):
        chunk = ids[i:i+100]
        req('PATCH', '/payment_history?id=in.(' + ','.join(chunk) + ')',
            {'status_code': 9, 'status_name': reason}, {'Prefer': 'return=minimal'})

print('\n➡ cancelling (student left)...')
patch_ids(cancel_left, REASON_LEFT)
print('➡ cancelling (active past uncollected)...')
patch_ids(cancel_past, REASON_PAST)
print('✅ done.')
