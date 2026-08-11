"""READ-ONLY: for ACTIVE students without a card phone, what phone sources
exist? Checks family (father/mother/home) and graduate. No writes."""
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


def has(s):
    return bool((s or '').strip())


students = get_all('/students?select=id,first_name,last_name,status,phone,family_id')
families = get_all('/families?select=id,father_phone,mother_phone,home_phone')
graduates = get_all('/graduates?select=student_id,mobile')

fam = {f['id']: f for f in families}
grad_mobile = {g['student_id'] for g in graduates if g.get('student_id') and has(g.get('mobile'))}

active = [s for s in students if s.get('status') in ('active', 'chizuk')]
empty = [s for s in active if not has(s.get('phone'))]

from_grad = 0
from_father = 0
from_mother = 0
from_home = 0
from_any_family = 0
no_source = 0
samples = []

for s in empty:
    f = fam.get(s.get('family_id'))
    ff = has(f and f.get('father_phone'))
    fm = has(f and f.get('mother_phone'))
    fh = has(f and f.get('home_phone'))
    g = s['id'] in grad_mobile
    if g:
        from_grad += 1
    if ff:
        from_father += 1
    if fm:
        from_mother += 1
    if fh:
        from_home += 1
    if ff or fm or fh:
        from_any_family += 1
        if len(samples) < 12:
            src = f.get('father_phone') if ff else (f.get('mother_phone') if fm else f.get('home_phone'))
            lbl = 'אב' if ff else ('אם' if fm else 'בית')
            samples.append((f"{s.get('last_name','')} {s.get('first_name','')}".strip(), src, lbl))
    elif not g:
        no_source += 1

print(f'תלמידים פעילים (active+chizuk): {len(active)}')
print(f'  מתוכם ללא טלפון בכרטיס: {len(empty)}')
print(f'\nמקורות אפשריים לפעילים ללא טלפון:')
print(f'  נייד בוגר:            {from_grad}')
print(f'  טלפון אב (משפחה):     {from_father}')
print(f'  טלפון אם (משפחה):     {from_mother}')
print(f'  טלפון בית (משפחה):    {from_home}')
print(f'  יש טלפון משפחה כלשהו: {from_any_family}')
print(f'  אין שום מקור:         {no_source}')

print('\nדוגמאות (פעיל ללא טלפון -> טלפון משפחה):')
for name, ph, lbl in samples:
    print(f'  {name}: {ph}  ({lbl})')
