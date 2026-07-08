// Export helpers for the Acceptance tab: full-details report + document-checklist
// report, each as Excel (xlsx) and print-to-PDF (isolated print window).

import * as XLSX from 'xlsx';
import { Registration } from './types';

// ---- The 5 registration attachments ----------------------------------------
export const DOC_FIELDS: { key: keyof Registration; label: string }[] = [
  { key: 'doc_student_id', label: 'צילום ת.ז. תלמיד' },
  { key: 'doc_parent_id', label: 'צילום ת.ז. הורה + ספח' },
  { key: 'doc_credit', label: 'אשראי' },
  { key: 'doc_standing_order', label: 'הו"ק' },
  { key: 'doc_medical', label: 'אישור רפואי לפנימיה' },
];

const STATUS_LABEL: Record<string, string> = {
  registered: 'נרשם',
  tested: 'נבחן',
  accepted: 'התקבל',
  rejected: 'לא התקבל',
  converted: 'הומר לתלמיד',
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const p = iso.slice(0, 10).split('-');
  if (p.length !== 3) return iso;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function fmtTime(t: string | null | undefined): string {
  if (!t) return '';
  return t.slice(0, 5); // HH:MM (drop seconds)
}

function fmtTestMaterial(r: Registration): string {
  const parts: string[] = [];
  if (r.test_mesechta) parts.push(r.test_mesechta);
  if (r.test_perek) parts.push(`פרק ${r.test_perek}`);
  if (r.test_daf_from || r.test_daf_to) {
    parts.push(`דף ${[r.test_daf_from, r.test_daf_to].filter(Boolean).join('-')}`);
  }
  if (r.test_sugya) parts.push(r.test_sugya);
  return parts.join(' · ');
}

// ---- Full-details field catalog (label → value) ----------------------------
export const FULL_FIELDS: { label: string; get: (r: Registration) => string }[] = [
  { label: 'שם משפחה', get: (r) => r.last_name || '' },
  { label: 'שם פרטי', get: (r) => r.first_name || '' },
  { label: 'תעודת זהות', get: (r) => r.id_number || '' },
  { label: 'דרכון', get: (r) => r.passport_number || '' },
  { label: 'תאריך לידה', get: (r) => fmtDate(r.date_of_birth) },
  { label: 'טלפון תלמיד', get: (r) => r.phone || '' },
  { label: 'אימייל תלמיד', get: (r) => r.email || '' },
  { label: 'שם האב', get: (r) => r.father_name || '' },
  { label: 'ת.ז. אב', get: (r) => r.father_id_number || '' },
  { label: 'טלפון אב', get: (r) => r.father_phone || '' },
  { label: 'אימייל אב', get: (r) => r.father_email || '' },
  { label: 'שם האם', get: (r) => r.mother_name || '' },
  { label: 'ת.ז. אם', get: (r) => r.mother_id_number || '' },
  { label: 'טלפון אם', get: (r) => r.mother_phone || '' },
  { label: 'טלפון בבית', get: (r) => r.home_phone || '' },
  { label: 'כתובת', get: (r) => r.address || '' },
  { label: 'עיר', get: (r) => r.city || '' },
  { label: 'מיקוד', get: (r) => r.postal_code || '' },
  { label: 'ישיבה קטנה', get: (r) => r.prev_yeshiva_name || '' },
  { label: 'עיר הישיבה', get: (r) => r.prev_yeshiva_city || '' },
  { label: 'תלמוד תורה', get: (r) => r.prev_talmud_torah || '' },
  { label: 'כיתה שסיים', get: (r) => r.prev_class_completed || '' },
  { label: 'תאריך מבחן', get: (r) => fmtDate(r.test_date) },
  { label: 'שעת מבחן', get: (r) => fmtTime(r.test_time) },
  { label: 'חומר המבחן', get: (r) => fmtTestMaterial(r) },
  { label: 'הערות מבחן', get: (r) => r.test_notes || '' },
  { label: 'ציון', get: (r) => r.test_grade || '' },
  { label: 'סטטוס', get: (r) => STATUS_LABEL[r.status] || r.status },
  { label: 'הערות', get: (r) => r.notes || '' },
  ...DOC_FIELDS.map((d) => ({
    label: d.label,
    get: (r: Registration) => (r[d.key] ? 'יש' : 'אין'),
  })),
];

export function sortRegs(regs: Registration[]): Registration[] {
  return [...regs].sort((a, b) => {
    const l = (a.last_name || '').localeCompare(b.last_name || '', 'he');
    if (l !== 0) return l;
    return (a.first_name || '').localeCompare(b.first_name || '', 'he');
  });
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function today(): string {
  return new Date().toLocaleDateString('he-IL');
}

// ---- Print window ----------------------------------------------------------
function printHtml(innerHtml: string, landscape: boolean) {
  const w = window.open('', '_blank');
  if (!w) {
    alert('הדפדפן חסם את חלון ההדפסה. אפשר חלונות קופצים לאתר ונסה שוב.');
    return;
  }
  w.document.write(`<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8">
<title>דוח רישום</title>
<style>
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Heebo','Segoe UI',Arial,sans-serif; direction: rtl; color: #0f172a; margin: 0; padding: 12px; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .sub { font-size: 12px; color: #64748b; margin: 0 0 14px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: right; font-size: 11px; }
  thead th { background: #f1f5f9; font-weight: 700; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  .yes { color: #16a34a; font-weight: 700; }
  .no { color: #cbd5e1; }
  .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; page-break-inside: avoid; }
  .card h3 { margin: 0 0 6px; font-size: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px 14px; }
  .grid .f { font-size: 11px; }
  .grid .f b { color: #475569; font-weight: 600; }
  @media print { .noprint { display: none; } }
</style>
</head>
<body>
${innerHtml}
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };</script>
</body>
</html>`);
  w.document.close();
}

// ---- Full details ----------------------------------------------------------
export function exportFullDetailsExcel(regs: Registration[]) {
  const sorted = sortRegs(regs);
  const header = FULL_FIELDS.map((f) => f.label);
  const rows = [header, ...sorted.map((r) => FULL_FIELDS.map((f) => f.get(r)))];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = FULL_FIELDS.map((f) => ({ wch: Math.max(10, Math.min(28, f.label.length + 4)) }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'פרטים מלאים');
  XLSX.writeFile(wb, `רישום_פרטים_מלא_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function printFullDetails(regs: Registration[]) {
  const sorted = sortRegs(regs);
  const cards = sorted
    .map((r) => {
      const cells = FULL_FIELDS.filter((f) => f.get(r).trim() !== '')
        .map((f) => `<div class="f"><b>${escapeHtml(f.label)}:</b> ${escapeHtml(f.get(r))}</div>`)
        .join('');
      return `<div class="card"><h3>${escapeHtml(`${r.last_name || ''} ${r.first_name || ''}`.trim())}</h3><div class="grid">${cells}</div></div>`;
    })
    .join('');
  const html = `<h1>דוח פרטי נרשמים מלא</h1><p class="sub">${sorted.length} נרשמים · ${today()}</p>${cards}`;
  printHtml(html, false);
}

// ---- Document checklist ----------------------------------------------------
function checklistHeader(): string[] {
  return ['#', 'שם התלמיד', 'שם האב', 'טלפון אב', 'טלפון אם', ...DOC_FIELDS.map((d) => d.label)];
}

export function exportChecklistExcel(regs: Registration[]) {
  const sorted = sortRegs(regs);
  const header = checklistHeader();
  const rows = [
    header,
    ...sorted.map((r, i) => [
      i + 1,
      `${r.last_name || ''} ${r.first_name || ''}`.trim(),
      r.father_name || '',
      r.father_phone || '',
      r.mother_phone || '',
      ...DOC_FIELDS.map((d) => (r[d.key] ? 'V' : '')),
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 4 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 14 },
    ...DOC_FIELDS.map(() => ({ wch: 16 })),
  ];
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, 'צרופות');
  XLSX.writeFile(wb, `רישום_צרופות_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function printChecklist(regs: Registration[]) {
  const sorted = sortRegs(regs);
  const head = checklistHeader().map((h) => `<th>${escapeHtml(h)}</th>`).join('');
  const body = sorted
    .map((r, i) => {
      const docCells = DOC_FIELDS.map((d) =>
        r[d.key]
          ? '<td style="text-align:center" class="yes">✓</td>'
          : '<td style="text-align:center" class="no">✗</td>'
      ).join('');
      return `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(`${r.last_name || ''} ${r.first_name || ''}`.trim())}</td>
        <td>${escapeHtml(r.father_name || '')}</td>
        <td>${escapeHtml(r.father_phone || '')}</td>
        <td>${escapeHtml(r.mother_phone || '')}</td>
        ${docCells}
      </tr>`;
    })
    .join('');
  const html = `<h1>דוח צרופות לרישום</h1><p class="sub">${sorted.length} נרשמים · ${today()}</p>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  printHtml(html, true);
}
