"""
Backfill: mirror already-synced successful Nedarim credit transactions into
payment_history (status 2), so past credit collection shows as נגבה everywhere.

Mirrors the sync-transactions route logic. Idempotent on
(nedarim_transaction_id, student_id) — safe to re-run. Requires migration 047.

DRY-RUN by default. Pass --apply to write.
"""
import sys, io, json, urllib.request, urllib.parse
from pathlib import Path
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
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

# successful credit transactions
tx = []
for p in range(0, 40):
    res = req('GET', f'/nedarim_transactions?select=nedarim_transaction_id,subscription_id,amount,transaction_date&result=eq.success&limit=1000&offset={p*1000}')
    if not res: break
    tx.extend(res)
    if len(res) < 1000: break
tx = [t for t in tx if t.get('subscription_id') and t.get('transaction_date') and t.get('nedarim_transaction_id')]
print(f'successful credit transactions with sub+date: {len(tx)}')

# students per subscription (active credit)
sub_ids = list({t['subscription_id'] for t in tx})
by_sub = defaultdict(list)
for i in range(0, len(sub_ids), 100):
    chunk = sub_ids[i:i+100]
    res = req('GET', '/student_tuition?select=student_id,monthly_amount,nedarim_subscription_id&active=eq.true&nedarim_subscription_id=in.(' + ','.join(chunk) + ')')
    for r in (res or []):
        by_sub[r['nedarim_subscription_id']].append({'student_id': r['student_id'], 'amount': float(r['monthly_amount'] or 0)})

ph_rows = []
no_student = 0
for t in tx:
    studs = by_sub.get(t['subscription_id'])
    if not studs:
        no_student += 1
        continue
    single = len(studs) == 1
    for s in studs:
        ph_rows.append({
            'student_id': s['student_id'],
            'payment_date': t['transaction_date'],
            'amount_ils': float(t['amount']) if single else s['amount'],
            'status_code': 2,
            'status_name': 'נפרע (אשראי)',
            'nedarim_transaction_id': t['nedarim_transaction_id'],
        })

print(f'payment_history rows to mirror: {len(ph_rows)}')
print(f'transactions with no linked student (skipped): {no_student}')
by_month = defaultdict(int)
for r in ph_rows: by_month[r['payment_date'][:7]] += 1
print('by month:', dict(sorted(by_month.items())))

if not APPLY:
    print('\n🔍 DRY-RUN. Pass --apply to write.')
    sys.exit(0)

# upsert ignore-duplicates on (nedarim_transaction_id, student_id)
written = 0
for i in range(0, len(ph_rows), 500):
    chunk = ph_rows[i:i+500]
    req('POST', '/payment_history?on_conflict=nedarim_transaction_id,student_id',
        chunk, {'Prefer': 'resolution=ignore-duplicates,return=minimal'})
    written += len(chunk)
print(f'✅ upserted {written} rows (duplicates ignored).')
