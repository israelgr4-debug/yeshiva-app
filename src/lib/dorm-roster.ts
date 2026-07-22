// Dormitory roster import/export for the annual reshuffle.
// The Excel carries a stable student id (מזהה) so re-upload matches exactly,
// plus human-readable name/shiur/room columns for hand-editing.

import * as XLSX from 'xlsx';
import { Student } from './types';
import { SHIURIM } from './shiurim';

export const ROSTER_HEADERS = ['מזהה', 'שם משפחה', 'שם פרטי', 'שיעור', 'חדר'];

/** The dormitory belongs to the ישיבה only - כולל students are never housed. */
export function isYeshivaStudent(s: { institution_name?: string | null }): boolean {
  return !((s.institution_name || '').includes('כולל'));
}

const SHIUR_ORDER: Record<string, number> = Object.fromEntries(
  SHIURIM.map((s, i) => [s.name, i])
);

function sortForRoster(students: Student[]): Student[] {
  return [...students].sort((a, b) => {
    const sa = SHIUR_ORDER[a.shiur || ''] ?? 999;
    const sb = SHIUR_ORDER[b.shiur || ''] ?? 999;
    if (sa !== sb) return sa - sb;
    const l = (a.last_name || '').localeCompare(b.last_name || '', 'he');
    if (l !== 0) return l;
    return (a.first_name || '').localeCompare(b.first_name || '', 'he');
  });
}

/** Download an .xlsx roster: one row per student, current room (blank if none).
 *  Serves both as a backup and as an editable assignment template. */
export function exportRosterXlsx(students: Student[], filename: string) {
  const rows: (string | number)[][] = [ROSTER_HEADERS];
  for (const s of sortForRoster(students)) {
    rows.push([
      s.id,
      s.last_name || '',
      s.first_name || '',
      s.shiur || '',
      s.room_number ?? '',
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 38 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'שיבוץ פנימייה');
  XLSX.writeFile(wb, filename);
}

/** Download a plain list of unassigned students: last name, first name, shiur. */
export function exportUnassignedXlsx(students: Student[], filename: string) {
  const rows: (string | number)[][] = [['שם משפחה', 'שם פרטי', 'שיעור']];
  for (const s of sortForRoster(students)) {
    rows.push([s.last_name || '', s.first_name || '', s.shiur || '']);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'לא משובצים');
  XLSX.writeFile(wb, filename);
}

/** Beds-per-room report, grouped by dormitory section (layout order kept). */
export interface BedsSection {
  title: string;
  rooms: { room: number; beds: number }[];
}

export function exportBedsReportXlsx(sections: BedsSection[], filename: string) {
  const rows: (string | number)[][] = [];
  for (const s of sections) {
    rows.push([s.title, '']);
    rows.push(['מספר חדר', 'מספר מיטות']);
    for (const r of s.rooms) rows.push([r.room, r.beds]);
    rows.push(['סה"כ', s.rooms.reduce((a, b) => a + b.beds, 0)]);
    rows.push(['', '']);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 26 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'מיטות לפי חדר');
  XLSX.writeFile(wb, filename);
}

export function printBedsReport(sections: BedsSection[]) {
  const esc = (s: string) =>
    String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const blocks = sections
    .map((s) => {
      const total = s.rooms.reduce((a, b) => a + b.beds, 0);
      const body = s.rooms
        .map((r) => `<tr><td>${r.room}</td><td style="text-align:center">${r.beds}</td></tr>`)
        .join('');
      return `<div class="sec">
        <h3>${esc(s.title)}</h3>
        <table>
          <thead><tr><th>מספר חדר</th><th>מספר מיטות</th></tr></thead>
          <tbody>${body}</tbody>
          <tfoot><tr><td>סה"כ</td><td style="text-align:center">${total}</td></tr></tfoot>
        </table>
      </div>`;
    })
    .join('');

  const w = window.open('', '_blank');
  if (!w) { alert('הדפדפן חסם את חלון ההדפסה. אפשר חלונות קופצים ונסה שוב.'); return; }
  const grand = sections.reduce((a, s) => a + s.rooms.reduce((x, r) => x + r.beds, 0), 0);
  w.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"><title>דוח מיטות לפי חדר</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  body { font-family: 'Heebo','Segoe UI',Arial,sans-serif; direction: rtl; color:#0f172a; margin:0; padding:10px; }
  h1 { font-size:17px; margin:0 0 2px; }
  .sub { font-size:11px; color:#64748b; margin:0 0 12px; }
  .wrap { column-count: 3; column-gap: 6mm; }
  .sec { break-inside: avoid; page-break-inside: avoid; margin-bottom: 6mm; }
  .sec h3 { font-size:12px; margin:0 0 3px; background:#f1f5f9; padding:3px 5px; border:1px solid #cbd5e1; border-bottom:none; }
  table { width:100%; border-collapse:collapse; }
  th,td { border:1px solid #cbd5e1; padding:2px 5px; font-size:10.5px; text-align:right; }
  thead th { background:#f8fafc; font-weight:700; }
  tfoot td { background:#f1f5f9; font-weight:700; }
</style></head>
<body>
<h1>דוח מיטות לפי חדר</h1>
<p class="sub">מחולק לפי פנימיות · סה"כ ${grand} מיטות מאוישות</p>
<div class="wrap">${blocks}</div>
<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
</body></html>`);
  w.document.close();
}

export interface RosterRow {
  id: string;
  last_name: string;
  first_name: string;
  shiur: string;
  room: string; // raw cell text; '' = clear the room
}

/** Parse an uploaded .xlsx/.csv roster into rows. Detects columns by header
 *  text so it accepts both our export and the "custom report" CSV format. */
export async function parseRosterFile(file: File): Promise<RosterRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as any[][];
  if (aoa.length < 2) return [];

  const header = (aoa[0] || []).map((h) => String(h ?? '').trim());
  const findCol = (aliases: string[]) =>
    header.findIndex((h) => aliases.includes(h));

  const iId = findCol(['מזהה', 'id', 'ID', 'Id']);
  const iLast = findCol(['שם משפחה']);
  const iFirst = findCol(['שם פרטי']);
  const iShiur = findCol(['שיעור']);
  const iRoom = findCol(['חדר', 'חדר בפנימייה', 'חדר חדש', 'חדר נוכחי']);

  const out: RosterRow[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    const cell = (i: number) => (i > -1 ? String(row[i] ?? '').trim() : '');
    const id = cell(iId);
    const last = cell(iLast);
    const first = cell(iFirst);
    if (!id && !last && !first) continue; // skip empty rows
    out.push({
      id,
      last_name: last,
      first_name: first,
      shiur: cell(iShiur),
      room: cell(iRoom),
    });
  }
  return out;
}

/** Normalized key for name+shiur fallback matching. */
export function rosterNameKey(last: string, first: string, shiur: string): string {
  const n = (s: string) => (s || '').trim().replace(/\s+/g, ' ');
  return `${n(last)}|${n(first)}|${n(shiur)}`;
}
