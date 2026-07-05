"""
Revert 'accept and convert' for candidates.

Finds every student currently in שיעור 0 that has a registration whose
converted_to_student_id points to them, then:
  1. Deletes the student row (education_history cascades)
  2. Resets the registration:
       status = 'accepted'
       converted_to_student_id = null
       decided_at = null
  3. Optionally cleans up families that were freshly created for the accept
     step (a family is "orphaned" if no other student links to it).

By default runs DRY-RUN. Pass --apply to actually write.
Pass --delete-orphan-families to also remove families with no remaining
students (default: leave them).
"""
import sys, io, json, urllib.request
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

APPLY = '--apply' in sys.argv
DELETE_ORPHANS = '--delete-orphan-families' in sys.argv

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
    if extra_headers:
        h.update(extra_headers)
    r = urllib.request.Request(f'{SUPA_URL}/rest/v1{path}', data=data, method=method, headers=h)
    return json.loads(urllib.request.urlopen(r).read() or b'null')


# 1. Registrations that were converted
converted = req('GET', '/registrations?select=id,first_name,last_name,converted_to_student_id,status&status=eq.converted&converted_to_student_id=not.is.null')
if not converted:
    print('אין מועמדים במצב converted. אין מה לבטל.')
    sys.exit(0)

student_ids = [r['converted_to_student_id'] for r in converted]
print(f'{len(converted)} רישומים במצב converted')

# 2. Load the matching students, filter to those in שיעור 0
students = []
for i in range(0, len(student_ids), 200):
    chunk = student_ids[i:i + 200]
    res = req('GET', f'/students?select=id,first_name,last_name,shiur,family_id&id=in.({",".join(chunk)})')
    students.extend(res or [])
by_id = {s['id']: s for s in students}

shiur0 = [(r, by_id[r['converted_to_student_id']])
          for r in converted
          if r['converted_to_student_id'] in by_id
          and by_id[r['converted_to_student_id']].get('shiur') == 'שיעור 0']

if not shiur0:
    print('אין תלמידים בשיעור 0 שקשורים לרישום converted. אין מה לבטל.')
    sys.exit(0)

print(f'{len(shiur0)} תלמידים בשיעור 0 שנוצרו מהמרת רישום.')
print()
print('=== רשימה ===')
for reg, stu in shiur0:
    print(f"  {stu.get('last_name','?')} {stu.get('first_name','?')}   (student={stu['id'][:8]}, registration={reg['id'][:8]})")

# 3. Check for orphan families (would become orphan after we delete these students)
if DELETE_ORPHANS:
    family_ids = [s['family_id'] for _, s in shiur0 if s.get('family_id')]
    orphan_candidates = set()
    for fid in family_ids:
        # Count students in this family that are NOT in our delete list
        deleting_ids = {s['id'] for _, s in shiur0}
        others = req('GET', f'/students?select=id&family_id=eq.{fid}')
        remaining = [x for x in (others or []) if x['id'] not in deleting_ids]
        if not remaining:
            orphan_candidates.add(fid)
    print(f'\n{len(orphan_candidates)} משפחות ייהפכו ל-orphan (יימחקו).')

print()
if not APPLY:
    print('🔍 DRY-RUN. הפעל עם --apply לביצוע.')
    print('   אפשרות: --delete-orphan-families למחוק גם משפחות ריקות.')
    sys.exit(0)

# 4. Delete students (education_history cascades via FK)
print(f'➡  מוחק {len(shiur0)} תלמידים...')
for _, stu in shiur0:
    req('DELETE', f'/students?id=eq.{stu["id"]}', extra_headers={'Prefer': 'return=minimal'})

# 5. Reset registrations
print(f'➡  מאפס {len(shiur0)} רישומים ל-accepted...')
for reg, _ in shiur0:
    req('PATCH', f'/registrations?id=eq.{reg["id"]}',
        {'status': 'accepted', 'converted_to_student_id': None, 'decided_at': None},
        extra_headers={'Prefer': 'return=minimal'})

# 6. Optional: delete orphan families
if DELETE_ORPHANS:
    family_ids = [s['family_id'] for _, s in shiur0 if s.get('family_id')]
    deleted_fam = 0
    for fid in set(family_ids):
        others = req('GET', f'/students?select=id&family_id=eq.{fid}')
        if not others:
            req('DELETE', f'/families?id=eq.{fid}', extra_headers={'Prefer': 'return=minimal'})
            deleted_fam += 1
    print(f'✅ נמחקו {deleted_fam} משפחות orphan.')

print('✅ הושלם. המועמדים חזרו למסך הרישום עם סטטוס accepted.')
