"""READ-ONLY: breakdown by student status of "empty card phone but a mobile is
available in the אלפון" (source = linked graduate's mobile). No writes."""
import sys, io, json, urllib.request
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

env = Path('.env.local').read_text(encoding='utf-8')
for line in env.splitlines():
    if line.startswith('NEXT_PUBLIC_SUPABASE_URL='):
        SUPA_URL = line.split('=', 1)[1].strip().strip('"').strip("'")
    if line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
        SUPA_KEY = line.split('=', 1)[1].strip().strip('"').strip("'")
HDR = {'apikey': SUPA_KEY, 'Authorization': f'Bearer {SUPA_KEY}'}


def get_all(path_base):
    out = []
    for p in range(0, 40):
        r = urllib.request.Request(f'{SUPA_URL}/rest/v1{path_base}&limit=1000&offset={p*1000}', headers=HDR)
        rows = json.loads(urllib.request.urlopen(r).read() or b'[]')
        out.extend(rows)
        if len(rows) < 1000:
            break
    return out


def digits(s):
    return ''.join(ch for ch in str(s or '') if ch.isdigit())


students = get_all('/students?select=id,status,phone')
graduates = get_all('/graduates?select=student_id,mobile')

mobile_by_student = {}
for g in graduates:
    sid, m = g.get('student_id'), (g.get('mobile') or '').strip()
    if sid and len(digits(m)) >= 9:
        mobile_by_student.setdefault(sid, m)

STAT = {'active': 'פעיל', 'chizuk': 'חיזוק', 'inactive': 'לא פעיל', 'graduated': 'סיים'}
from collections import defaultdict
tot = defaultdict(int)
empty = defaultdict(int)
fillable = defaultdict(int)

for s in students:
    st = s.get('status') or '?'
    tot[st] += 1
    if not (s.get('phone') or '').strip():
        empty[st] += 1
        if mobile_by_student.get(s['id']):
            fillable[st] += 1

print(f"{'סטטוס':<10}{'סהכ':>7}{'ללא טלפון':>12}{'ניתן למלא מנייד בוגר':>24}")
for st in ['active', 'chizuk', 'inactive', 'graduated']:
    print(f"{STAT.get(st, st):<10}{tot[st]:>7}{empty[st]:>12}{fillable[st]:>24}")

act = fillable['active'] + fillable['chizuk']
print(f"\nפעילים (active+chizuk) שניתן למלא מנייד בוגר: {act}")
print(f"רק active: {fillable['active']}")
