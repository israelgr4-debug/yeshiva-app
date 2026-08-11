"""
Re-sync each student's shiur from their (permanent) machzor + the current base:
    shiur_index = base_machzor_for_shiur_alef - machzor_number
    idx 0..10 -> שיעור א..יא ; idx >= 11 -> קיבוץ ; idx < 0 -> skip (future cohort)

Fixes students (mainly inactive/graduated) that missed a year-advance. כולל
students (institution 'כולל') and students with no machzor are skipped.

DRY-RUN by default. Pass --apply to write.
"""
import sys, io, json, urllib.request
from pathlib import Path
from collections import Counter

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


SH = ['שיעור א', 'שיעור ב', 'שיעור ג', 'שיעור ד', 'שיעור ה', 'שיעור ו',
      'שיעור ז', 'שיעור ח', 'שיעור ט', 'שיעור י', 'שיעור יא']

base = req('GET', '/system_settings?select=value&key=eq.base_machzor_for_shiur_alef')[0]['value']
print(f'base = {base}')


def derive(mnum):
    idx = base - mnum
    if idx < 0:
        return None
    if idx >= 11:
        return 'קיבוץ'
    return SH[idx]


mach = {m['id']: m['number'] for m in ga('/machzorot?select=id,number')}
students = ga('/students?select=id,first_name,last_name,shiur,status,machzor_id,institution_name')

updates = []
for s in students:
    if 'כולל' in (s.get('institution_name') or ''):
        continue
    mnum = mach.get(s.get('machzor_id'))
    if mnum is None:
        continue
    d = derive(mnum)
    if d and (s.get('shiur') or '') != d:
        updates.append((s, d))

print(f'\nתלמידים לסנכרון: {len(updates)}')
print('לפי סטטוס:', dict(Counter(s['status'] for s, _ in updates)))
print('\nדוגמאות:')
for s, d in updates[:12]:
    print(f"  {s['last_name']} {s['first_name']} ({s['status']}): {s.get('shiur')!r} -> {d}")

if not APPLY:
    print('\nהרצה יבשה בלבד. להרצה: --apply')
    sys.exit(0)

print('\nמעדכן...')
ok = err = 0
for s, d in updates:
    try:
        req('PATCH', f"/students?id=eq.{s['id']}", {'shiur': d}, extra={'Prefer': 'return=minimal'})
        ok += 1
    except Exception as e:
        err += 1
        print(f"  שגיאה {s['last_name']}: {e}")
print(f'\nהסתיים. סונכרנו: {ok} | שגיאות: {err}')
