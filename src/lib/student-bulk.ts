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
  // cellDates → real Excel date cells parse to dates; dateNF renders them as ISO
  // so a date the user picked/typed in Excel imports regardless of display locale.
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, {
    header: 1, blankrows: false, raw: false, dateNF: 'yyyy-mm-dd',
  }) as any[][];
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

/** Normalize a date cell to YYYY-MM-DD, or '' if unparseable.
 *  Accepts: ISO (yyyy-mm-dd, yyyy/mm/dd), DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
 *  (2- or 4-digit year), Excel date serials, and common textual dates (15 Mar 2010). */
export function parseDateCell(v: string): string {
  const s = (v || '').trim();
  if (!s) return '';

  const iso = (y: string | number, m: number, d: number) =>
    (m >= 1 && m <= 12 && d >= 1 && d <= 31)
      ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      : '';

  // ISO first: yyyy-mm-dd / yyyy/mm/dd / yyyy.mm.dd
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return iso(m[1], Number(m[2]), Number(m[3]));

  // Day-first: dd/mm/yyyy, dd.mm.yy, dd-mm-yyyy … (2- or 4-digit year)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    let day = Number(m[1]);
    let mon = Number(m[2]);
    // Tolerate US month-first (m/d/y) when the 2nd field can't be a month.
    if (mon > 12 && day <= 12) { const t = day; day = mon; mon = t; }
    let year = m[3];
    if (year.length === 2) year = (Number(year) > 40 ? '19' : '20') + year;
    return iso(year, mon, day);
  }

  // Bare Excel serial number (days since 1899-12-30).
  if (/^\d{4,6}$/.test(s)) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000);
    if (!isNaN(dt.getTime())) return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  // Fallback: textual dates like "15 Mar 2010".
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());

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
