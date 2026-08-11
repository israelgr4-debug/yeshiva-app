"""
Backfill machzor_id for active/chizuk students who have none, using the
standard rule: machzor_number = base_machzor_for_shiur_alef - shiur.index.

Covers regular shiurim only (א..יא). Kibbutz is skipped - its machzor cannot be
derived from the shiur (each kibbutz member keeps their original cohort), so
those are reported for manual assignment.

DRY-RUN by default. Pass --apply to write.
"""
import sys, io, json, urllib.request
from pathlib import Path

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
    for p in range(40):
        r = urllib.request.Request(f'{U}/rest/v1{pb}&limit=1000&offset={p*1000}', headers=HDR)
        rows = json.loads(urllib.request.urlopen(r).read() or b'[]')
        o += rows
        if len(rows) < 1000:
            break
    return o


# Shiur index map (matches src/lib/shiurim.ts, regular shiurim only)
SHIUR_INDEX = {
    'שיעור א': 0, 'שיעור ב': 1, 'שיעור ג': 2, 'שיעור ד': 3, 'שיעור ה': 4,
    'שיעור ו': 5, 'שיעור ז': 6, 'שיעור ח': 7, 'שיעור ט': 8, 'שיעור י': 9, 'שיעור יא': 10,
}

# 1) current base
base_row = req('GET', "/system_settings?select=value&key=eq.base_machzor_for_shiur_alef")
base = base_row[0]['value'] if base_row else None
if base is None:
    print('לא נמצא base_machzor_for_shiur_alef בהגדרות'); sys.exit(1)
print(f'base_machzor_for_shiur_alef = {base}')

# 2) machzorot number -> id. Ensure the OLD cohorts (8-19) exist - the base
# seed only covered 1-7 and 20-45, so ח-יא (need 16-19) have no row to point to.
HEB = {8: "ח'", 9: "ט'", 10: "י'", 11: 'י"א', 12: 'י"ב', 13: 'י"ג', 14: 'י"ד',
       15: 'ט"ו', 16: 'ט"ז', 17: 'י"ז', 18: 'י"ח', 19: 'י"ט'}
mach = req('GET', '/machzorot?select=id,number,name')
have = {m['number'] for m in mach}
to_create = [n for n in range(8, 20) if n not in have]
if to_create:
    print(f'יוצר שורות מחזור חסרות: {to_create}')
    if APPLY:
        body = [{'number': n, 'name': f'מחזור {HEB[n]}', 'start_year': 2000 + n, 'notes': ''} for n in to_create]
        req('POST', '/machzorot', body, extra={'Prefer': 'return=minimal'})
        mach = req('GET', '/machzorot?select=id,number,name')
    else:
        print('  (ייווצרו רק בהרצת --apply)')
id_by_num = {m['number']: m['id'] for m in mach}
# In dry-run the rows aren't created yet; add placeholders so the preview counts.
if not APPLY:
    for n in to_create:
        id_by_num.setdefault(n, f'(ייווצר: מחזור {HEB[n]})')

# 3) students missing machzor
students = ga('/students?select=id,first_name,last_name,shiur,status,machzor_id&status=in.(active,chizuk)')
missing = [s for s in students if not s.get('machzor_id')]

updates = []
kibbutz = []
unknown = []
for s in missing:
    sh = s.get('shiur') or ''
    if sh == 'קיבוץ':
        kibbutz.append(s); continue
    if sh not in SHIUR_INDEX:
        unknown.append(s); continue
    num = base - SHIUR_INDEX[sh]
    mid = id_by_num.get(num)
    if not mid:
        unknown.append(s); continue
    updates.append((s, sh, num, mid))

print(f'\nחסרי מחזור (active+chizuk): {len(missing)}')
print(f'  ניתן להקצות (א-יא): {len(updates)}')
print(f'  קיבוץ (ידני): {len(kibbutz)}')
print(f'  ללא שיעור/מחזור מתאים: {len(unknown)}')

from collections import Counter
c = Counter(sh for _, sh, _, _ in updates)
print('  פילוח להקצאה:', dict(c))
print('\nדוגמאות:')
for s, sh, num, _ in updates[:12]:
    print(f"  {s.get('last_name','')} {s.get('first_name','')} · {sh} → מחזור {num}")
if kibbutz:
    print('\nקיבוץ (דורש הקצאה ידנית):')
    for s in kibbutz[:12]:
        print(f"  {s.get('last_name','')} {s.get('first_name','')}")

if not APPLY:
    print('\nהרצה יבשה בלבד. להרצה בפועל: --apply')
    sys.exit(0)

print('\nמעדכן...')
ok = err = 0
for s, sh, num, mid in updates:
    try:
        req('PATCH', f"/students?id=eq.{s['id']}", {'machzor_id': mid}, extra={'Prefer': 'return=minimal'})
        ok += 1
    except Exception as e:
        err += 1
        print(f"  שגיאה {s.get('last_name','')}: {e}")
print(f'\nהסתיים. עודכנו: {ok} | שגיאות: {err} | קיבוץ שנותר ידני: {len(kibbutz)}')
