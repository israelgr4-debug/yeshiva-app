// Shared model for the מלגות report (print / Excel) and the payment-marking grid:
// groups (shiur / כולל) → student rows → one cell per scholarship type (רכיב).

import * as XLSX from 'xlsx';
import { ScholarshipEntry, ScholarshipType } from './types';
import { SHIURIM } from './shiurim';
import type { StudentLite } from '@/components/scholarships/shared';
import { compareStudents, shiurGroup } from '@/components/scholarships/shared';

export interface ReportCell {
  amount: number;
  entries: ScholarshipEntry[];
}

export interface ReportRow {
  student: StudentLite;
  cells: Record<string, ReportCell>; // by type_id
  total: number;
}

export interface ReportGroup {
  name: string;
  rows: ReportRow[];
  totals: Record<string, number>;
  total: number;
}

export interface ScholarshipReport {
  columns: ScholarshipType[];
  groups: ReportGroup[];
  totals: Record<string, number>;
  total: number;
  studentCount: number;
}

const GROUP_RANK = new Map<string, number>([...SHIURIM.map((s, i) => [s.name, i] as [string, number]), ['כולל', 900], ['ללא שיעור', 950]]);

export function buildScholarshipReport(
  entries: ScholarshipEntry[],
  students: Map<string, StudentLite>,
  types: ScholarshipType[],
): ScholarshipReport {
  const usedTypes = new Set(entries.map((e) => e.type_id));
  const columns = types.filter((t) => usedTypes.has(t.id)).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'he'));

  const rowsByStudent = new Map<string, ReportRow>();
  for (const e of entries) {
    const s = students.get(e.student_id);
    if (!s) continue;
    let row = rowsByStudent.get(s.id);
    if (!row) { row = { student: s, cells: {}, total: 0 }; rowsByStudent.set(s.id, row); }
    const cell = (row.cells[e.type_id] ||= { amount: 0, entries: [] });
    cell.amount += Number(e.amount) || 0;
    cell.entries.push(e);
    row.total += Number(e.amount) || 0;
  }

  const groupsMap = new Map<string, ReportGroup>();
  for (const row of rowsByStudent.values()) {
    const g = shiurGroup(row.student);
    if (!groupsMap.has(g)) groupsMap.set(g, { name: g, rows: [], totals: {}, total: 0 });
    const grp = groupsMap.get(g)!;
    grp.rows.push(row);
    for (const [tid, c] of Object.entries(row.cells)) grp.totals[tid] = (grp.totals[tid] || 0) + c.amount;
    grp.total += row.total;
  }
  const groups = Array.from(groupsMap.values()).sort((a, b) => (GROUP_RANK.get(a.name) ?? 800) - (GROUP_RANK.get(b.name) ?? 800));
  for (const g of groups) g.rows.sort((a, b) => compareStudents(a.student, b.student));

  const totals: Record<string, number> = {};
  let total = 0;
  for (const g of groups) {
    for (const [tid, v] of Object.entries(g.totals)) totals[tid] = (totals[tid] || 0) + v;
    total += g.total;
  }
  return { columns, groups, totals, total, studentCount: rowsByStudent.size };
}

export function exportScholarshipReportXlsx(rep: ScholarshipReport, title: string, filename: string) {
  const wb = XLSX.utils.book_new();
  const cols = rep.columns;

  const summary: (string | number)[][] = [[title], [], ['שיעור', ...cols.map((c) => c.name), 'סה"כ']];
  for (const g of rep.groups) summary.push([g.name, ...cols.map((c) => g.totals[c.id] || 0), g.total]);
  summary.push(['סה"כ', ...cols.map((c) => rep.totals[c.id] || 0), rep.total]);
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1['!rtl' as any] = true;
  (wb as any).Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws1, 'סיכום');

  const detail: (string | number)[][] = [['שיעור', 'שם משפחה', 'שם פרטי', 'ת"ז', ...cols.map((c) => c.name), 'סה"כ']];
  for (const g of rep.groups) {
    for (const r of g.rows) {
      detail.push([g.name, r.student.last_name || '', r.student.first_name || '', r.student.id_number || r.student.passport_number || '',
        ...cols.map((c) => r.cells[c.id]?.amount || ''), r.total]);
    }
    detail.push([`סה"כ ${g.name}`, '', '', '', ...cols.map((c) => g.totals[c.id] || 0), g.total]);
  }
  const ws2 = XLSX.utils.aoa_to_sheet(detail);
  ws2['!cols'] = detail[0].map((_, i) => ({ wch: i < 4 ? 14 : 10 }));
  XLSX.utils.book_append_sheet(wb, ws2, 'פירוט');
  XLSX.writeFile(wb, filename);
}
