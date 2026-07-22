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
