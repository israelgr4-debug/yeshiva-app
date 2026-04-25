# Import graduates xlsx into Supabase 'graduates' table.
# Tries to link each row to an existing student by exact name + machzor match.

import sys, io, json, urllib.request, urllib.parse
from pathlib import Path
import openpyxl

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

env = Path('.env.local').read_text()
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
    if extra_headers: h.update(extra_headers)
    r = urllib.request.Request(f'{SUPA_URL}/rest/v1{path}', data=data, method=method, headers=h)
    resp = urllib.request.urlopen(r)
    raw = resp.read()
    return json.loads(raw) if raw else None

def fetch_all(path):
    out = []
    for page in range(60):
        data = req('GET', f"{path}{'&' if '?' in path else '?'}limit=1000&offset={page*1000}")
        if not data: break
        out.extend(data)
        if len(data) < 1000: break
    return out

print('Loading machzorot...')
machzorot = req('GET', '/machzorot?select=id,name,number')
# Build map: hebrew letter sequence -> id
def normalize_machzor(name):
    if not name: return ''
    # Strip 'מחזור ', geresh, gershayim, spaces
    s = str(name).replace('מחזור', '').replace('׳', '').replace('"', '').replace("'", '').strip()
    return s
machzor_by_letter = {}
for m in machzorot:
    key = normalize_machzor(m['name'])
    machzor_by_letter[key] = m['id']
print(f'  {len(machzor_by_letter)} machzorot indexed')

print('Loading students (this may take a moment)...')
students = fetch_all('/students?select=id,first_name,last_name,family_id,machzor_id,phone,email')
print(f'  {len(students)} students')

# Build student map by (first, last) → list of students
def norm_name(s):
    return (s or '').strip().replace('  ', ' ')
student_by_name = {}
for s in students:
    k = (norm_name(s.get('first_name', '')), norm_name(s.get('last_name', '')))
    student_by_name.setdefault(k, []).append(s)

print('Loading families...')
families = fetch_all('/families?select=id,father_name,mother_name')
fam_by_id = {f['id']: f for f in families}

print('Reading xlsx...')
wb = openpyxl.load_workbook(r'C:\Users\User\Documents\בוגרים26.4.26.xlsx', data_only=True)
ws = wb.active
rows = list(ws.iter_rows(values_only=True))
headers = rows[0]
print(f'  {len(rows)-1} data rows')

def cell(row, idx):
    if idx >= len(row): return ''
    v = row[idx]
    if v is None: return ''
    return str(v).strip()

# Existing graduates - skip dupes by exact (first, last, machzor_name)
print('Checking existing graduates...')
existing = fetch_all('/graduates?select=first_name,last_name,machzor_name')
existing_keys = set()
for g in existing:
    existing_keys.add((g.get('first_name', '') or '', g.get('last_name', '') or '', g.get('machzor_name', '') or ''))
print(f'  {len(existing_keys)} existing keys')

batch = []
linked = 0
new_rows = 0
skipped = 0
ambiguous = 0
for i in range(1, len(rows)):
    row = rows[i]
    last_name = cell(row, 3)
    first_name = cell(row, 4)
    if not first_name and not last_name:
        continue
    machzor_name = cell(row, 2)
    key = (first_name, last_name, machzor_name)
    if key in existing_keys:
        skipped += 1
        continue
    existing_keys.add(key)

    # Match machzor
    norm_m = normalize_machzor(machzor_name)
    machzor_id = machzor_by_letter.get(norm_m)

    # Match student
    student_match = None
    family_id = None
    candidates = student_by_name.get((first_name, last_name), [])
    if machzor_id:
        narrowed = [s for s in candidates if s.get('machzor_id') == machzor_id]
        if len(narrowed) == 1:
            student_match = narrowed[0]
        elif len(narrowed) > 1:
            ambiguous += 1
    if not student_match and len(candidates) == 1:
        student_match = candidates[0]
    elif not student_match and len(candidates) > 1:
        ambiguous += 1

    father_name = cell(row, 18)
    mother_name = cell(row, 19)
    if student_match:
        linked += 1
        family_id = student_match.get('family_id')
        # Pull parents from family if not set in xlsx
        if family_id and not father_name:
            fam = fam_by_id.get(family_id)
            if fam:
                father_name = fam.get('father_name', '') or ''
                if not mother_name:
                    mother_name = fam.get('mother_name', '') or ''

    # Marital status from col 14
    marital = cell(row, 14)
    if marital not in ('נשוי', 'מאורס', 'רווק', 'עזב', 'נפטר'):
        marital = None

    # Date col 16 - free text or empty
    left_date_text = cell(row, 16)
    left_date = None
    # Skip parsing - leave as null for now if not ISO
    if left_date_text:
        try:
            from datetime import datetime
            # Could be 'DD/MM/YYYY' or 'DD.MM.YYYY' or hebrew
            for fmt in ('%d/%m/%Y', '%d.%m.%Y', '%d-%m-%Y', '%Y-%m-%d'):
                try:
                    left_date = datetime.strptime(left_date_text, fmt).strftime('%Y-%m-%d')
                    break
                except: pass
        except: pass

    record = {
        'first_name': first_name,
        'last_name': last_name,
        'machzor_name': machzor_name or None,
        'machzor_id': machzor_id,
        'student_id': student_match['id'] if student_match else None,
        'family_id': family_id,
        'street': cell(row, 5) or None,
        'building_number': cell(row, 6) or None,
        'apartment': cell(row, 7) or None,
        'entrance': cell(row, 8) or None,
        'neighborhood': cell(row, 9) or None,
        'city': cell(row, 10) or None,
        'temp_address': cell(row, 17) or None,
        'mobile': cell(row, 11) or None,
        'phone': cell(row, 12) or None,
        'email': cell(row, 13) or None,
        'marital_status': marital,
        'spouse_name': cell(row, 20) or None,
        'marriage_date_text': cell(row, 15) or None,
        'father_name': father_name or None,
        'mother_name': mother_name or None,
        'left_date': left_date,
        'is_pending': False,
        'notes': cell(row, 21) or None,
        'legacy_marker': (cell(row, 0) + ' / ' + cell(row, 1)).strip(' /') or None,
    }
    batch.append(record)
    new_rows += 1

print(f'\nReady to insert: {new_rows} new graduates')
print(f'  Linked to student: {linked}')
print(f'  Ambiguous (multiple candidates, not linked): {ambiguous}')
print(f'  Skipped (already in DB): {skipped}')

# Insert in chunks of 200
CHUNK = 200
inserted = 0
errors = 0
for i in range(0, len(batch), CHUNK):
    chunk = batch[i:i+CHUNK]
    try:
        req('POST', '/graduates', body=chunk, extra_headers={'Prefer': 'return=minimal'})
        inserted += len(chunk)
        print(f'  Inserted {inserted}/{len(batch)}')
    except Exception as e:
        errors += 1
        print(f'  Chunk {i} failed: {e}')

print(f'\nDone. Inserted {inserted}, errors {errors}')
