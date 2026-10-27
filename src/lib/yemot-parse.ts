// ימות המשיח "קבלת נתונים" (שלוחה 11) → normalized call rows.
// ONE parser for both sources: the xlsx download (sheet "נתונים", no header row, 13
// columns A..M) and, later, the API — the API output is converted to the same A..M
// row arrays and passed through parseYemotRows().
//
//   A שלוחה | B מספר מערכת | C טלפון (בלי 0) | D ת"ז שהוקשה | E שם (תצוגה) | F טלפון נוסף
//   G שיעור (תצוגה) | H תאריך (Excel date) | I שעה (Excel time) | J תאריך עברי | K תיקייה
//   L מספר רשומה (מפתח) | M סכום
//
// Rows typed by hand into the file have no B,C,D,H,I,K (sometimes no L) → they come in
// with no ID and end up "לא מזוהים" showing their name + shiur.

import { stripIdLeadingZeros } from './israeli-validators';

export interface ParsedYemotCall {
  extension: string | null;
  record_number: number | null;
  phone: string | null;
  phone2: string | null;
  raw_id_number: string | null;   // digits, leading zeros stripped
  raw_name: string | null;
  raw_shiur: string | null;
  call_at: string | null;         // ISO with Israel offset
  hebrew_date: string | null;
  amount: number;
  dedupe_key: string;
  raw: Record<string, any>;
}

const COLS = 'ABCDEFGHIJKLM'.split('');
const s = (v: any) => (v === null || v === undefined ? '' : String(v).trim());

/** Israeli phone as stored by us: digits with a leading 0 ("504172228" → "0504172228"). */
export function normalizePhone(v: any): string | null {
  let d = s(v).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('972')) d = d.slice(3);
  if (!d.startsWith('0')) d = '0' + d;
  return d;
}

/** Offset (minutes) of Asia/Jerusalem at a given UTC instant. */
function israelOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return Math.round((asUtc - utcMs) / 60000);
}

/** Wall-clock time in Israel → ISO string with the correct (DST-aware) offset. */
export function israelIso(y: number, mo: number, d: number, h = 0, mi = 0, se = 0): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi, se);
  let off = israelOffsetMinutes(guess);
  off = israelOffsetMinutes(guess - off * 60000);
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(se)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Israel-local YYYY-MM-DD of an ISO timestamp. */
export function israelDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

function parseDateCell(v: any): { y: number; m: number; d: number } | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && v > 20000) {               // Excel serial date
    const dt = new Date(Math.round((Math.floor(v) - 25569) * 86400000));
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }
  if (v instanceof Date) return { y: v.getFullYear(), m: v.getMonth() + 1, d: v.getDate() };
  const m1 = s(v).match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);  // dd/mm/yyyy
  if (m1) { const y = Number(m1[3]); return { y: y < 100 ? 2000 + y : y, m: Number(m1[2]), d: Number(m1[1]) }; }
  const m2 = s(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return { y: Number(m2[1]), m: Number(m2[2]), d: Number(m2[3]) };
  return null;
}

function parseTimeCell(v: any): { h: number; mi: number; se: number } {
  if (typeof v === 'number') {                              // Excel time fraction (maybe with a date part)
    const secs = Math.round((v - Math.floor(v)) * 86400);
    return { h: Math.floor(secs / 3600) % 24, mi: Math.floor((secs % 3600) / 60), se: secs % 60 };
  }
  const m = s(v).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? { h: Number(m[1]), mi: Number(m[2]), se: Number(m[3] || 0) } : { h: 0, mi: 0, se: 0 };
}

function parseAmount(v: any): number {
  const n = Number(s(v).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** rows = sheet rows as arrays (A..M). Header / empty rows are skipped. */
export function parseYemotRows(rows: any[][], defaultExtension: string | null): ParsedYemotCall[] {
  const out: ParsedYemotCall[] = [];
  for (const r of rows) {
    if (!r || r.every((c) => s(c) === '')) continue;
    const [A, , C, D, E, F, G, H, I, J, , L, M] = COLS.map((_, i) => r[i]);
    if (s(A) && !/^\d+$/.test(s(A)) && /שלוחה|ext/i.test(s(A))) continue; // a header row, if any
    const raw: Record<string, any> = {};
    COLS.forEach((c, i) => { if (r[i] !== undefined && r[i] !== null && r[i] !== '') raw[c] = r[i]; });

    const extension = s(A) || defaultExtension;
    const record = /^\d+$/.test(s(L)) ? Number(s(L)) : null;
    const date = parseDateCell(H);
    const t = parseTimeCell(I);
    const call_at = date ? israelIso(date.y, date.m, date.d, t.h, t.mi, t.se) : null;
    const id = stripIdLeadingZeros(s(D)) || null;
    const amount = parseAmount(M);
    const name = s(E) || null;
    const shiur = s(G) || null;
    const hebrew = s(J) || null;

    // re-uploading the same file must not create duplicates; a reset of ימות's record
    // numbering must not collide with old calls (hence the call time in the key)
    const dedupe_key = record !== null
      ? `${extension || ''}:${record}:${call_at || ''}`
      : `${extension || ''}:hand:${id || ''}:${name || ''}:${shiur || ''}:${hebrew || ''}:${amount}`;

    out.push({
      extension, record_number: record, phone: normalizePhone(C), phone2: normalizePhone(F),
      raw_id_number: id, raw_name: name, raw_shiur: shiur, call_at, hebrew_date: hebrew,
      amount, dedupe_key, raw,
    });
  }
  return out;
}

/** Read an uploaded xlsx: sheet "נתונים" (or the first sheet), no header. */
export async function readYemotFile(file: File, defaultExtension: string | null): Promise<ParsedYemotCall[]> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const name = wb.SheetNames.includes('נתונים') ? 'נתונים' : wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, raw: true, defval: null });
  return parseYemotRows(rows, defaultExtension);
}

/**
 * ימות API (RenderYMGRFile … convertType=json) → the same A..M row arrays as the xlsx,
 * so both sources go through parseYemotRows(). Field names as returned by ימות:
 * שלוחה, מערכת, טלפון שהתקשר, מס' זהות, שם מזהה, טלפון, שיעור, תאריך (dd/mm/yyyy),
 * שעה (HH:MM:SS), תאריך עברי, ערך/שלוחה, הזמנה (= record number, column L), סכום.
 */
export function yemotJsonToRows(data: Record<string, any>[]): any[][] {
  const pick = (o: Record<string, any>, ...keys: string[]) => {
    for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
    return null;
  };
  return (data || []).map((o) => [
    pick(o, 'שלוחה'),
    pick(o, 'מערכת'),
    pick(o, 'טלפון שהתקשר'),
    pick(o, "מס' זהות", 'מס׳ זהות', 'מספר זהות'),
    pick(o, 'שם מזהה', 'שם'),
    pick(o, 'טלפון'),
    pick(o, 'שיעור'),
    pick(o, 'תאריך'),
    pick(o, 'שעה'),
    pick(o, 'תאריך עברי'),
    pick(o, 'ערך/שלוחה'),
    pick(o, 'הזמנה'),
    pick(o, 'סכום'),
  ]);
}
