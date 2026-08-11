"""
Merge duplicate families created at conversion for שיעור א students whose father
ID matches an EXISTING family (ignoring leading zeros) that already holds their
older brothers.

For each match: re-link the שיעור א student to the existing family, then delete
the now-orphaned duplicate family (only if it has no remaining students).

Skips ambiguous cases (father ID matching more than one existing family).
DRY-RUN by default. Pass --apply to write.
"""
import sys, io, json, urllib.request
from pathlib import Path
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
APPLY = '--apply' in sys.argv

env = Path('.env.local').read_text(encoding='utf-8')
for line in env.splitlines():
    if line.startswith('NEXT_PUBLIC_SUPABASE_URL='):
        U = line.split('=', 1)[1].strip().strip('"').strip("'")
    if line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
        K = line.split('=', 1)[1].strip().strip('"').strip("'")
HDR = {'apikey': K, 'Authorization': f'Bearer {K}', 'Content-Type': 'application/json'}


def req(method, path, body=None, extra=None):
    data = json.dumps(body).encode() if body is not None else None
    h = dict(HDR)
    if extra:
        h.update(extra)
    r = urllib.request.Request(f'{U}/rest/v1{path}', data=data, method=method, headers=h)
    return json.loads(urllib.request.urlopen(r).read() or b'null')


def ga(pb):
    o = []
    for p in range(60):
        r = urllib.request.Request(f'{U}/rest/v1{pb}&limit=1000&offset={p*1000}', headers=HDR)
        rows = json.loads(urllib.request.urlopen(r).read() or b'[]')
        o += rows
        if len(rows) < 1000:
            break
    return o


def norm(x):
    return ''.join(c for c in str(x or '') if c.isdigit()).lstrip('0')


fams = {f['id']: f for f in ga('/families?select=*')}

# Fields copied from the NEW (duplicate) family onto the existing one, where the
# new has a value ("last registration wins"). ID numbers are excluded so the
# existing clean (no leading zeros) form is kept.
COPY_FIELDS = [
    'father_name', 'father_phone', 'father_email', 'father_occupation',
    'mother_name', 'mother_phone', 'mother_email', 'mother_occupation',
    'address', 'city', 'postal_code', 'home_phone',
    'bank_name', 'bank_branch', 'bank_account',
]
allst = ga('/students?select=id,first_name,last_name,shiur,status,family_id')
famstud = defaultdict(list)
for s in allst:
    if s.get('family_id'):
        famstud[s['family_id']].append(s)

byfid = defaultdict(list)
for fid, f in fams.items():
    n = norm(f.get('father_id_number'))
    if n:
        byfid[n].append(fid)

alef = [s for s in allst if s.get('shiur') == 'שיעור א' and s['status'] == 'active']

merges = []   # (student, dup_family_id, target_family_id)
ambiguous = []
for s in alef:
    dup = s.get('family_id')
    f = fams.get(dup) or {}
    n = norm(f.get('father_id_number'))
    if not n:
        continue
    targets = [fid for fid in byfid.get(n, []) if fid != dup]
    if not targets:
        continue
    if len(targets) > 1:
        ambiguous.append((s, targets))
        continue
    merges.append((s, dup, targets[0]))

print(f'תלמידי שיעור א למיזוג: {len(merges)}')
print(f'מקרים דו-משמעיים (דילוג): {len(ambiguous)}')
print()
for s, dup, tgt in merges:
    dupcount = len(famstud.get(dup, []))
    of = fams[tgt]
    bros = ', '.join(f"{x['last_name']} {x['first_name']}({x.get('shiur','')})" for x in famstud.get(tgt, []))
    will_delete = 'ימחק' if dupcount == 1 else f'נשאר ({dupcount} תלמידים)'
    print(f"{s['last_name']} {s['first_name']} → משפחת {of.get('father_name')} [{bros}]  | כפילה: {will_delete}")

if not APPLY:
    print('\nהרצה יבשה בלבד. להרצה: --apply')
    sys.exit(0)

print('\nמבצע מיזוג...')
relinked = updated = deleted = 0
for s, dup, tgt in merges:
    newf = fams[dup]
    # 1) update the existing family with the newer (registration) details
    patch = {}
    for k in COPY_FIELDS:
        v = str(newf.get(k) or '').strip()
        if v:
            patch[k] = newf.get(k)
    if patch:
        req('PATCH', f"/families?id=eq.{tgt}", patch, extra={'Prefer': 'return=minimal'})
        updated += 1
    # 2) re-link the student to the existing family
    req('PATCH', f"/students?id=eq.{s['id']}", {'family_id': tgt}, extra={'Prefer': 'return=minimal'})
    relinked += 1
    # 3) delete the duplicate family only if it now has no students
    remaining = req('GET', f"/students?select=id&family_id=eq.{dup}")
    if not remaining:
        req('DELETE', f"/families?id=eq.{dup}", extra={'Prefer': 'return=minimal'})
        deleted += 1
print(f'\nהסתיים. קושרו מחדש: {relinked} | משפחות עודכנו: {updated} | כפילות נמחקו: {deleted}')
