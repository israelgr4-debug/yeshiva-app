// Per-shiur bulk export + re-import: export a shiur's students with student &
// family fields to xlsx, let the user fill in missing details offline, then
// re-import to update the DB. Matching is by a stable hidden `id` column.

import * as XLSX from 'xlsx';
import { Student, Family, Machzor } from './types';

export const ID_COL = 'מזהה';

type Scope = 'ref' | 'student' | 'family';

interface BulkFieldDef {
  label: string;                 // xlsx column header (also the import key)
  scope: Scope;                  // ref = read-only reference, not imported
  col?: string;                  // DB column for student/family scope
  isDate?: boolean;              // parse/format as a date
  get: (s: Student, f?: Family, m?: Machzor) => string;
}

const STATUS_LABEL: Record<string, string> = {
  active: 'פעיל', chizuk: 'חיזוק', inactive: 'לא פעיל', graduated: 'סיים',
};

// Order = column order in the sheet. `ref` columns are for orientation only.
export const BULK_FIELDS: BulkFieldDef[] = [
  { label: 'שיעור', scope: 'ref', get: (s) => s.shiur || '' },
  { label: 'מחזור', scope: 'ref', get: (_s, _f, m) => m?.name || '' },
  { label: 'סטטוס', scope: 'ref', get: (s) => STATUS_LABEL[s.status] || s.status },
  // --- student ---
  { label: 'שם משפחה', scope: 'student', col: 'last_name', get: (s) => s.last_name || '' },
  { label: 'שם פרטי', scope: 'student', col: 'first_name', get: (s) => s.first_name || '' },
  { label: 'תעודת זהות', scope: 'student', col: 'id_number', get: (s) => s.id_number || '' },
  { label: 'דרכון', scope: 'student', col: 'passport_number', get: (s) => (s as any).passport_number || '' },
  { label: 'תאריך לידה', scope: 'student', col: 'date_of_birth', isDate: true, get: (s) => s.date_of_birth || '' },
  { label: 'טלפון תלמיד', scope: 'student', col: 'phone', get: (s) => s.phone || '' },
  { label: 'אימייל תלמיד', scope: 'student', col: 'email', get: (s) => s.email || '' },
  { label: 'קופת חולים', scope: 'student', col: 'health_fund_name', get: (s) => (s as any).health_fund_name || '' },
  { label: 'הערות תלמיד', scope: 'student', col: 'notes', get: (s) => s.notes || '' },
  // --- family ---
  { label: 'שם האב', scope: 'family', col: 'father_name', get: (_s, f) => f?.father_name || '' },
  { label: 'ת"ז אב', scope: 'family', col: 'father_id_number', get: (_s, f) => f?.father_id_number || '' },
  { label: 'טלפון אב', scope: 'family', col: 'father_phone', get: (_s, f) => f?.father_phone || '' },
  { label: 'אימייל אב', scope: 'family', col: 'father_email', get: (_s, f) => (f as any)?.father_email || '' },
  { label: 'שם האם', scope: 'family', col: 'mother_name', get: (_s, f) => f?.mother_name || '' },
  { label: 'ת"ז אם', scope: 'family', col: 'mother_id_number', get: (_s, f) => f?.mother_id_number || '' },
  { label: 'טלפון אם', scope: 'family', col: 'mother_phone', get: (_s, f) => f?.mother_phone || '' },
  { label: 'כתובת', scope: 'family', col: 'address', get: (_s, f) => f?.address || '' },
  { label: 'עיר', scope: 'family', col: 'city', get: (_s, f) => f?.city || '' },
  { label: 'מיקוד', scope: 'family', col: 'postal_code', get: (_s, f) => f?.postal_code || '' },
  { label: 'טלפון בית', scope: 'family', col: 'home_phone', get: (_s, f) => f?.home_phone || '' },
  { label: 'בנק', scope: 'family', col: 'bank_name', get: (_s, f) => f?.bank_name || '' },
  { label: 'סניף', scope: 'family', col: 'bank_branch', get: (_s, f) => f?.bank_branch || '' },
  { label: 'חשבון', scope: 'family', col: 'bank_account', get: (_s, f) => f?.bank_account || '' },
];

export function exportBulkXlsx(
  students: Student[],
  families: Record<string, Family>,
  machzorot: Record<string, Machzor>,
  filename: string
) {
  const header = [ID_COL, ...BULK_FIELDS.map((f) => f.label)];
  const rows: (string | number)[][] = [header];
  const sorted = [...students].sort(
    (a, b) =>
      (a.last_name || '').localeCompare(b.last_name || '', 'he') ||
      (a.first_name || '').localeCompare(b.first_name || '', 'he')
  );
  for (const s of sorted) {
    const f = s.family_id ? families[s.family_id] : undefined;
    const m = s.machzor_id ? machzorot[s.machzor_id] : undefined;
    rows.push([s.id, ...BULK_FIELDS.map((bf) => bf.get(s, f, m))]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = header.map((h, i) =>
    i === 0 ? { wch: 38 } : { wch: Math.max(10, Math.min(22, String(h).length + 5)) }
  );
  (ws as any)['!sheetView'] = [{ rightToLeft: true }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'עדכון תלמידים');
  XLSX.writeFile(wb, filename);
}

export interface ParsedBulkRow {
  id: string;
  values: Record<string, string>;
}

export async function parseBulkFile(
  file: File
): Promise<{ rows: ParsedBulkRow[]; unknownHeaders: string[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // raw:false → cells come back as formatted strings (dates as text, not serials)
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: false }) as any[][];
  if (aoa.length < 2) return { rows: [], unknownHeaders: [] };

  const header = (aoa[0] || []).map((h) => String(h ?? '').trim());
  const known = new Set([ID_COL, ...BULK_FIELDS.map((f) => f.label)]);
  const unknownHeaders = header.filter((h) => h && !known.has(h));
  const idIdx = header.indexOf(ID_COL);

  const rows: ParsedBulkRow[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const id = idIdx > -1 ? String(row[idIdx] ?? '').trim() : '';
    if (!id) continue;
    const values: Record<string, string> = {};
    header.forEach((h, i) => {
      if (h && h !== ID_COL) values[h] = String(row[i] ?? '').trim();
    });
    rows.push({ id, values });
  }
  return { rows, unknownHeaders };
}

/** Normalize a date cell to YYYY-MM-DD, or '' if unparseable. */
export function parseDateCell(v: string): string {
  const s = (v || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already ISO
  const dmy = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/); // DD/MM/YYYY
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return '';
}

/** Build sparse student + family patches from one parsed row. Blank cells are
 *  left untouched (never wipe existing data). Returns which columns were set. */
export function buildPatches(values: Record<string, string>): {
  student: Record<string, any>;
  family: Record<string, any>;
} {
  const student: Record<string, any> = {};
  const family: Record<string, any> = {};
  for (const bf of BULK_FIELDS) {
    if (bf.scope === 'ref' || !bf.col) continue;
    const raw = values[bf.label];
    if (raw === undefined || raw === '') continue; // blank = leave unchanged
    let val: any = raw;
    if (bf.isDate) {
      val = parseDateCell(raw);
      if (!val) continue;
    }
    if (bf.scope === 'student') student[bf.col] = val;
    else family[bf.col] = val;
  }
  return { student, family };
}
