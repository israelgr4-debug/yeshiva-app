"""
Fill EMPTY students.phone from the linked graduate's MOBILE.

Rule (confirmed with the manager):
  - Only students whose `phone` is currently empty/blank.
  - Source = graduates.mobile where graduates.student_id = student.id.
  - MOBILE ONLY. If the linked graduate has no mobile -> leave the student empty.
  - Never overwrite an existing student phone (the 68 "differing" cases are left
    untouched for manual review).

DRY-RUN by default. Pass --apply to actually write.
"""
import sys, io, json, urllib.request
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

APPLY = '--apply' in sys.argv

env = Path('.env.local').read_text(encoding='utf-8')
SUPA_URL = SUPA_KEY = None
for line in env.splitlines():
    if line.startswith('NEXT_PUBLIC_SUPABASE_URL='):
        SUPA_URL = line.split('=', 1)[1].strip().strip('"').strip("'")
    if line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
        SUPA_KEY = line.split('=', 1)[1].strip().strip('"').strip("'")
HDR = {'apikey': SUPA_KEY, 'Authorization': f'Bearer {SUPA_KEY}', 'Content-Type': 'application/json'}


def req(method, path, body=None, extra=None):
    data = json.dumps(body).encode() if body is not None else None
    h = dict(HDR)
    if extra:
        h.update(extra)
    r = urllib.request.Request(f'{SUPA_URL}/rest/v1{path}', data=data, method=method, headers=h)
    return json.loads(urllib.request.urlopen(r).read() or b'null')


def get_all(path_base):
    out = []
    for p in range(0, 40):
        r = urllib.request.Request(
            f'{SUPA_URL}/rest/v1{path_base}&limit=1000&offset={p*1000}',
            method='GET', headers=HDR)
        rows = json.loads(urllib.request.urlopen(r).read() or b'[]')
        out.extend(rows)
        if len(rows) < 1000:
            break
    return out


def digits(s):
    return ''.join(ch for ch in str(s or '') if ch.isdigit())


students = get_all('/students?select=id,first_name,last_name,phone')
graduates = get_all('/graduates?select=student_id,mobile')

# best mobile per linked student
mobile_by_student = {}
for g in graduates:
    sid = g.get('student_id')
    m = (g.get('mobile') or '').strip()
    if sid and m and len(digits(m)) >= 9:
        mobile_by_student.setdefault(sid, m)  # keep first valid

updates = []  # (student, mobile)
for s in students:
    cur = (s.get('phone') or '').strip()
    if cur:
        continue  # never overwrite
    m = mobile_by_student.get(s['id'])
    if m:
        updates.append((s, m))

print(f'תלמידים: {len(students)} | תלמידים עם נייד בוגר זמין למילוי: {len(updates)}')
print(f'מצב: {"APPLY (כותב!)" if APPLY else "DRY-RUN (לא כותב)"}')
print('\nדוגמאות (12 ראשונים):')
for s, m in updates[:12]:
    print(f"  {s.get('last_name','')} {s.get('first_name','')}".strip() + f"  ->  {m}")

if not APPLY:
    print(f'\nזו הרצה יבשה בלבד. כדי לבצע בפועל: הוסף --apply')
    sys.exit(0)

print('\nמעדכן...')
ok = 0
fail = 0
for s, m in updates:
    try:
        req('PATCH', f"/students?id=eq.{s['id']}", {'phone': m}, extra={'Prefer': 'return=minimal'})
        ok += 1
        if ok % 100 == 0:
            print(f'  ...{ok}')
    except Exception as e:
        fail += 1
        print(f"  שגיאה אצל {s.get('last_name','')} {s.get('first_name','')}: {e}")

print(f'\nהסתיים. עודכנו: {ok} | נכשלו: {fail}')
