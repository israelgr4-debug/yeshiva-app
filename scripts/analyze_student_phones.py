"""
READ-ONLY analysis: where do the "updated" phones in the אלפון come from,
relative to students.phone?

The אלפון (directory) is a computed merge. For a student, phones can come from:
  - the student row itself           (students.phone)
  - a linked graduate row            (graduates where student_id = student.id) -> mobile / phone
  - the originating registration     (registrations where converted_to_student_id = student.id
                                       OR id_number matches) -> phone

This script does NOT write anything. It reports how many students could gain
or change a phone, broken down by source, so we can pick a safe rule.
"""
import sys, io, json, urllib.request
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

env = Path('.env.local').read_text(encoding='utf-8')
SUPA_URL = SUPA_KEY = None
for line in env.splitlines():
    if line.startswith('NEXT_PUBLIC_SUPABASE_URL='):
        SUPA_URL = line.split('=', 1)[1].strip().strip('"').strip("'")
    if line.startswith('SUPABASE_SERVICE_ROLE_KEY='):
        SUPA_KEY = line.split('=', 1)[1].strip().strip('"').strip("'")
HDR = {'apikey': SUPA_KEY, 'Authorization': f'Bearer {SUPA_KEY}', 'Content-Type': 'application/json'}


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


def norm_phone(s):
    if not s:
        return ''
    v = ''.join(ch for ch in str(s) if ch.isdigit())
    if v.startswith('972'):
        v = '0' + v[3:]
    return v


def norm_id(s):
    if not s:
        return ''
    return ''.join(ch for ch in str(s) if ch.isdigit()).lstrip('0')


students = get_all('/students?select=id,first_name,last_name,id_number,passport_number,phone,status')
graduates = get_all('/graduates?select=id,student_id,mobile,phone')
registrations = get_all('/registrations?select=id,id_number,phone,converted_to_student_id')

print(f'תלמידים: {len(students)} | בוגרים: {len(graduates)} | רישומים: {len(registrations)}')

grad_by_student = {}
for g in graduates:
    if g.get('student_id'):
        grad_by_student.setdefault(g['student_id'], []).append(g)

reg_by_student = {}
reg_by_idnum = {}
for r in registrations:
    if r.get('converted_to_student_id'):
        reg_by_student.setdefault(r['converted_to_student_id'], []).append(r)
    if r.get('id_number'):
        reg_by_idnum.setdefault(norm_id(r['id_number']), []).append(r)

total = len(students)
empty_phone = 0
fill_from_grad = 0          # empty student phone, grad has one
fill_from_reg = 0           # empty student phone, reg has one
fill_from_any = 0           # empty student phone, either source has one
still_empty = 0             # empty student phone, NO source
differs_grad = 0            # student has phone, grad differs (potential stale)
differs_reg = 0             # student has phone, reg differs
sample_fill = []
sample_diff = []

for s in students:
    sp = norm_phone(s.get('phone'))
    # gather source phones for THIS student (their own, by id/link)
    src = []
    for g in grad_by_student.get(s['id'], []):
        for cand in (g.get('mobile'), g.get('phone')):
            np = norm_phone(cand)
            if np:
                src.append(('graduate', np))
    sid = norm_id(s.get('id_number') or s.get('passport_number'))
    regs = reg_by_student.get(s['id'], []) + (reg_by_idnum.get(sid, []) if sid else [])
    seen_reg = set()
    for r in regs:
        if r['id'] in seen_reg:
            continue
        seen_reg.add(r['id'])
        np = norm_phone(r.get('phone'))
        if np:
            src.append(('registration', np))

    grad_phones = [p for (t, p) in src if t == 'graduate']
    reg_phones = [p for (t, p) in src if t == 'registration']
    any_phone = grad_phones or reg_phones

    if not sp:
        empty_phone += 1
        if grad_phones:
            fill_from_grad += 1
        if reg_phones:
            fill_from_reg += 1
        if any_phone:
            fill_from_any += 1
            if len(sample_fill) < 12:
                sample_fill.append((f"{s.get('last_name','')} {s.get('first_name','')}".strip(),
                                    grad_phones[0] if grad_phones else reg_phones[0],
                                    'בוגר' if grad_phones else 'רישום'))
        else:
            still_empty += 1
    else:
        if grad_phones and all(gp != sp for gp in grad_phones):
            differs_grad += 1
            if len(sample_diff) < 12:
                sample_diff.append((f"{s.get('last_name','')} {s.get('first_name','')}".strip(),
                                    sp, grad_phones[0], 'בוגר'))
        if reg_phones and all(rp != sp for rp in reg_phones):
            differs_reg += 1

print('\n=== תלמידים ללא טלפון בכרטיס ===')
print(f'ללא טלפון בכלל: {empty_phone} ({empty_phone*100//max(total,1)}%)')
print(f'  ניתן למלא מבוגר:   {fill_from_grad}')
print(f'  ניתן למלא מרישום:  {fill_from_reg}')
print(f'  ניתן למלא ממקור כלשהו: {fill_from_any}')
print(f'  יישארו ריקים (אין מקור): {still_empty}')

print('\n=== תלמידים עם טלפון קיים שנראה שונה מהמקור (אולי לא מעודכן) ===')
print(f'  שונה מטלפון הבוגר:  {differs_grad}')
print(f'  שונה מטלפון הרישום: {differs_reg}')

print('\n=== דוגמאות למילוי (ריק -> מקור) ===')
for name, ph, srcname in sample_fill:
    print(f'  {name}: {ph}  (מ{srcname})')

print('\n=== דוגמאות להבדל (קיים vs מקור) ===')
for name, cur, other, srcname in sample_diff:
    print(f'  {name}: כרטיס={cur}  {srcname}={other}')
