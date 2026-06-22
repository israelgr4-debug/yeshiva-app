'use client';

import { useMemo, useState } from 'react';
import { Registration } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import * as XLSX from 'xlsx';

interface Props {
  registrations: Registration[];
}

type ReportType = 'examinees' | 'examiner' | 'photos';

type PhotosSort = 'name' | 'yeshiva';

// --- Hebrew gematria helpers ---
// Day 1-30 → אותיות (e.g. 8→ח׳, 15→ט"ו, 28→כ"ח, 30→ל׳)
function hebrewDay(n: number): string {
  if (n < 1 || n > 30) return String(n);
  // Special cases for 15 and 16 (avoid spelling out God's name)
  if (n === 15) return 'ט״ו';
  if (n === 16) return 'ט״ז';
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const TEN: Record<number, string> = { 1: 'י', 2: 'כ', 3: 'ל' };
  const ONE: Record<number, string> = { 1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה', 6: 'ו', 7: 'ז', 8: 'ח', 9: 'ט' };
  if (tens === 0) return `${ONE[ones]}׳`;
  if (ones === 0) return `${TEN[tens]}׳`;
  return `${TEN[tens]}״${ONE[ones]}`;
}

// Year 5786 → תשפ"ו (drops the leading "ה" thousand prefix)
function hebrewYear(n: number): string {
  // Strip the millennium digit (5xxx → xxx)
  const within = n % 1000;
  const hundreds = Math.floor(within / 100);
  const tensDigit = Math.floor((within % 100) / 10);
  const onesDigit = within % 10;
  const HUNDREDS: Record<number, string> = { 0: '', 1: 'ק', 2: 'ר', 3: 'ש', 4: 'ת', 5: 'תק', 6: 'תר', 7: 'תש', 8: 'תת', 9: 'תתק' };
  const TENS: Record<number, string> = { 0: '', 1: 'י', 2: 'כ', 3: 'ל', 4: 'מ', 5: 'נ', 6: 'ס', 7: 'ע', 8: 'פ', 9: 'צ' };
  const ONES: Record<number, string> = { 0: '', 1: 'א', 2: 'ב', 3: 'ג', 4: 'ד', 5: 'ה', 6: 'ו', 7: 'ז', 8: 'ח', 9: 'ט' };
  let combo = (TENS[tensDigit] || '') + (ONES[onesDigit] || '');
  // Avoid forbidden combinations
  if (combo === 'יה') combo = 'טו';
  if (combo === 'יו') combo = 'טז';
  const letters = (HUNDREDS[hundreds] || '') + combo;
  if (letters.length === 0) return '';
  if (letters.length === 1) return `${letters}׳`;
  return `${letters.slice(0, -1)}״${letters.slice(-1)}`;
}

export function TestReportsTab({ registrations }: Props) {
  const [reportType, setReportType] = useState<ReportType>('examinees');
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [photosSort, setPhotosSort] = useState<PhotosSort>('name');

  // Available test dates (only future-or-present sorted desc)
  const availableDates = useMemo(() => {
    const set = new Set<string>();
    for (const r of registrations) {
      if (r.test_date) set.add(r.test_date);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [registrations]);

  // Filter + sort
  const filtered = useMemo(() => {
    let rows = registrations.filter((r) => r.test_date);
    if (selectedDates.size > 0) {
      rows = rows.filter((r) => r.test_date && selectedDates.has(r.test_date));
    }
    if (reportType === 'examinees') {
      // Sort: test_time → prev_yeshiva → last_name
      rows = [...rows].sort((a, b) => {
        const t = (a.test_time || '').localeCompare(b.test_time || '');
        if (t !== 0) return t;
        const y = (a.prev_yeshiva_name || '').localeCompare(b.prev_yeshiva_name || '', 'he');
        if (y !== 0) return y;
        return (a.last_name || '').localeCompare(b.last_name || '', 'he');
      });
    } else if (reportType === 'photos') {
      // Photos report: user-selectable sort.
      //   'name'    → last_name → prev_yeshiva
      //   'yeshiva' → prev_yeshiva → last_name
      rows = [...rows].sort((a, b) => {
        if (photosSort === 'yeshiva') {
          const y = (a.prev_yeshiva_name || '').localeCompare(b.prev_yeshiva_name || '', 'he');
          if (y !== 0) return y;
          return (a.last_name || '').localeCompare(b.last_name || '', 'he');
        }
        const l = (a.last_name || '').localeCompare(b.last_name || '', 'he');
        if (l !== 0) return l;
        return (a.prev_yeshiva_name || '').localeCompare(b.prev_yeshiva_name || '', 'he');
      });
    } else {
      // examiner: Sort: prev_yeshiva → last_name
      rows = [...rows].sort((a, b) => {
        const y = (a.prev_yeshiva_name || '').localeCompare(b.prev_yeshiva_name || '', 'he');
        if (y !== 0) return y;
        return (a.last_name || '').localeCompare(b.last_name || '', 'he');
      });
    }
    return rows;
  }, [registrations, selectedDates, reportType, photosSort]);

  const toggleDate = (d: string) => {
    const next = new Set(selectedDates);
    if (next.has(d)) next.delete(d); else next.add(d);
    setSelectedDates(next);
  };

  /** Format YYYY-MM-DD as Hebrew calendar date in gematria letters,
   *  e.g. "יום שלישי · ח׳ תמוז תשפ״ו" - no Gregorian. */
  const fmtDate = (d: string) => {
    try {
      const dt = new Date(d);
      const weekday = dt.toLocaleDateString('he-IL', { weekday: 'long' });
      const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).formatToParts(dt);
      const numDay = Number(parts.find((p) => p.type === 'day')?.value || 0);
      const month = parts.find((p) => p.type === 'month')?.value || '';
      const numYear = Number(parts.find((p) => p.type === 'year')?.value || 0);
      const dayGem = hebrewDay(numDay);
      const yearGem = hebrewYear(numYear);
      return `${weekday} · ${dayGem} ${month} ${yearGem}`;
    } catch { return d; }
  };

  const fmtMaterial = (r: Registration) => {
    const parts: string[] = [];
    if (r.test_mesechta) parts.push(r.test_mesechta);
    if (r.test_perek) parts.push(`פרק ${r.test_perek}`);
    if (r.test_daf_from || r.test_daf_to) {
      parts.push(`דף ${r.test_daf_from || ''}${r.test_daf_to ? '-' + r.test_daf_to : ''}`);
    }
    if (r.test_sugya) parts.push(r.test_sugya);
    return parts.join(' · ');
  };

  const titleForReport = () => {
    if (reportType === 'examinees') return 'יום בחינה - רשימת נבחנים';
    if (reportType === 'photos')    return 'יום בחינה - דוח תמונות';
    return 'דוח לבוחן - גיליון ציונים';
  };

  const dateLabel = () => {
    if (selectedDates.size === 0) return 'כל התאריכים';
    return Array.from(selectedDates).sort().map(fmtDate).join(', ');
  };

  const exportExcel = () => {
    let rows: any[][];
    if (reportType === 'examinees') {
      rows = [['תאריך', 'שעה', 'ישיבה קטנה', 'שם משפחה', 'שם פרטי', 'חומר המבחן']];
      for (const r of filtered) {
        rows.push([
          r.test_date || '',
          r.test_time || '',
          r.prev_yeshiva_name || '',
          r.last_name,
          r.first_name,
          fmtMaterial(r),
        ]);
      }
    } else {
      rows = [['ישיבה קטנה', 'שם משפחה', 'שם פרטי', 'הערות / ציון']];
      for (const r of filtered) {
        rows.push([
          r.prev_yeshiva_name || '',
          r.last_name,
          r.first_name,
          '', // blank
        ]);
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = reportType === 'examinees'
      ? [{ wch: 12 }, { wch: 8 }, { wch: 26 }, { wch: 16 }, { wch: 14 }, { wch: 32 }]
      : [{ wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 60 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, reportType === 'examinees' ? 'נבחנים' : 'בוחן');
    const fn = `${reportType === 'examinees' ? 'rishimat_nivchanim' : 'doh_bochen'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fn);
  };

  const handlePrint = () => window.print();

  return (
    <div className="space-y-4">
      {/* Controls (hidden on print) */}
      <div className="no-print bg-white rounded-2xl border border-slate-200 p-4 space-y-4">
        {/* Report type selector */}
        <div>
          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
            סוג הדוח
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setReportType('examinees')}
              className={`text-right p-3 rounded-xl border-2 transition-all ${
                reportType === 'examinees'
                  ? 'border-amber-500 bg-amber-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="font-semibold text-slate-900">📋 רשימת נבחנים ליום מבחן</div>
              <div className="text-xs text-slate-500 mt-1">שם, ישיבה, שעה, חומר · מיון: שעה → ישיבה → שם</div>
            </button>
            <button
              type="button"
              onClick={() => setReportType('examiner')}
              className={`text-right p-3 rounded-xl border-2 transition-all ${
                reportType === 'examiner'
                  ? 'border-amber-500 bg-amber-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="font-semibold text-slate-900">📝 דוח לבוחן (שורות פנויות)</div>
              <div className="text-xs text-slate-500 mt-1">ישיבה, שם · עם מקום להערות · מיון: ישיבה → שם</div>
            </button>
            <button
              type="button"
              onClick={() => setReportType('photos')}
              className={`text-right p-3 rounded-xl border-2 transition-all ${
                reportType === 'photos'
                  ? 'border-amber-500 bg-amber-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="font-semibold text-slate-900">📸 דוח תמונות (4 בשורה)</div>
              <div className="text-xs text-slate-500 mt-1">תמונה + שם + ישיבה קטנה</div>
            </button>
          </div>
        </div>

        {/* Photos sort picker - visible only for photos report */}
        {reportType === 'photos' && (
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">
              מיון
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPhotosSort('name')}
                className={`text-right p-3 rounded-xl border-2 transition-all ${
                  photosSort === 'name'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="font-semibold text-slate-900">👤 לפי שם משפחה</div>
                <div className="text-xs text-slate-500 mt-1">שם משפחה א-ת → ישיבה</div>
              </button>
              <button
                type="button"
                onClick={() => setPhotosSort('yeshiva')}
                className={`text-right p-3 rounded-xl border-2 transition-all ${
                  photosSort === 'yeshiva'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="font-semibold text-slate-900">🏫 לפי ישיבה קטנה</div>
                <div className="text-xs text-slate-500 mt-1">ישיבה א-ת → שם משפחה</div>
              </button>
            </div>
          </div>
        )}

        {/* Date filter */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              סינון תאריכים ({selectedDates.size === 0 ? 'הכל' : selectedDates.size})
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setSelectedDates(new Set())}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >נקה</button>
            </div>
          </div>
          {availableDates.length === 0 ? (
            <p className="text-sm text-slate-400 italic">לא נמצאו תאריכי מבחן</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableDates.map((d) => {
                const active = selectedDates.has(d);
                const count = registrations.filter((r) => r.test_date === d).length;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDate(d)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                      active
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-white border-slate-200 hover:border-amber-300 text-slate-700'
                    }`}
                  >
                    {fmtDate(d)} <span className={`text-xs ${active ? 'opacity-80' : 'text-slate-400'}`}>({count})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-slate-100">
          <p className="text-sm text-slate-600">
            <b>{filtered.length}</b> נבחנים בדוח · {dateLabel()}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={handlePrint} disabled={filtered.length === 0}>
              🖨️ הדפס / PDF
            </Button>
            {reportType !== 'photos' && (
              <Button size="sm" onClick={exportExcel} disabled={filtered.length === 0}>
                📥 ייצא לאקסל
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-400 italic">
          להפקת PDF: לחץ &quot;הדפס&quot; ובחר &quot;Save as PDF&quot; / &quot;שמור כ-PDF&quot; כיעד הדפסה.
        </p>
      </div>

      {/* Print area */}
      <div className="print-area bg-white rounded-2xl border border-slate-200 p-6">
        <div className="text-center mb-4 print-header">
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>
            ישיבת מיר מודיעין עילית
          </h1>
          <h2 className="text-lg font-semibold text-slate-700 mt-1">{titleForReport()}</h2>
          <p className="text-sm text-slate-500">{dateLabel()} · {filtered.length} נבחנים</p>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-5xl mb-3 opacity-40">📭</p>
            <p>אין נתונים להצגה. בחר ימי מבחן או שנה את הסינון.</p>
          </div>
        ) : reportType === 'examinees' ? (
          <ExamineesTable rows={filtered} fmtMaterial={fmtMaterial} fmtDate={fmtDate} showDate={selectedDates.size !== 1} />
        ) : reportType === 'photos' ? (
          <PhotosGrid rows={filtered} />
        ) : (
          <ExaminerTable rows={filtered} />
        )}
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 12mm 10mm; }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; inset: 0; padding: 0; border: none; box-shadow: none; }
          .no-print { display: none !important; }
          .examiner-row td { border-bottom: 1px solid #888 !important; }
          .examiner-row { page-break-inside: avoid; }
        }
        .report-table { width: 100%; border-collapse: collapse; direction: rtl; font-size: 13px; }
        .report-table th {
          background: #f1f5f9; color: #475569; text-align: right; padding: 8px 10px;
          border-bottom: 2px solid #cbd5e1; font-weight: 700;
        }
        .report-table td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
        .report-table tbody tr:nth-child(even) td { background: #f8fafc; }
        .examiner-table { width: 100%; border-collapse: collapse; direction: rtl; font-size: 14px; }
        .examiner-table th {
          background: #fff; color: #475569; text-align: right; padding: 10px 8px;
          border-bottom: 2px solid #475569; font-weight: 700;
        }
        .examiner-table td {
          padding: 14px 8px;
          border-bottom: 1px dashed #94a3b8;
          vertical-align: top;
        }
        .photos-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          direction: rtl;
        }
        .photo-card {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 6px;
          text-align: center;
          background: #fff;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .photo-frame {
          width: 100%;
          aspect-ratio: 3 / 4;
          background: #f1f5f9;
          border: 1px solid #94a3b8;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          margin-bottom: 5px;
        }
        .photo-frame img { width: 100%; height: 100%; object-fit: cover; }
        .photo-placeholder { color: #94a3b8; font-size: 10pt; }
        .photo-name { font-size: 11pt; font-weight: 700; line-height: 1.2; }
        .photo-yeshiva { font-size: 9pt; color: #475569; margin-top: 2px; line-height: 1.2; }
      `}</style>
    </div>
  );
}

function PhotosGrid({ rows }: { rows: Registration[] }) {
  return (
    <div className="photos-grid">
      {rows.map((r) => (
        <div key={r.id} className="photo-card">
          <div className="photo-frame">
            {r.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={r.photo_url} alt={`${r.first_name} ${r.last_name}`} />
            ) : (
              <span className="photo-placeholder">אין תמונה</span>
            )}
          </div>
          <div className="photo-name">{r.last_name} {r.first_name}</div>
          <div className="photo-yeshiva">{r.prev_yeshiva_name || '—'}</div>
        </div>
      ))}
    </div>
  );
}

function ExamineesTable({
  rows, fmtMaterial, fmtDate, showDate,
}: {
  rows: Registration[];
  fmtMaterial: (r: Registration) => string;
  fmtDate: (d: string) => string;
  showDate: boolean;
}) {
  return (
    <table className="report-table">
      <thead>
        <tr>
          <th style={{ width: '4%' }}>#</th>
          {showDate && <th style={{ width: '12%' }}>תאריך</th>}
          <th style={{ width: '7%' }}>שעה</th>
          <th style={{ width: '23%' }}>ישיבה קטנה</th>
          <th style={{ width: '14%' }}>שם משפחה</th>
          <th style={{ width: '12%' }}>שם פרטי</th>
          <th>חומר המבחן</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id}>
            <td className="tabular-nums">{i + 1}</td>
            {showDate && <td>{r.test_date ? fmtDate(r.test_date) : ''}</td>}
            <td className="tabular-nums font-semibold">{r.test_time || ''}</td>
            <td>{r.prev_yeshiva_name || ''}</td>
            <td className="font-semibold">{r.last_name}</td>
            <td>{r.first_name}</td>
            <td>{fmtMaterial(r)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ExaminerTable({ rows }: { rows: Registration[] }) {
  return (
    <table className="examiner-table">
      <thead>
        <tr>
          <th style={{ width: '4%' }}>#</th>
          <th style={{ width: '26%' }}>ישיבה קטנה</th>
          <th style={{ width: '16%' }}>שם משפחה</th>
          <th style={{ width: '14%' }}>שם פרטי</th>
          <th>הערות / ציון</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id} className="examiner-row">
            <td className="tabular-nums">{i + 1}</td>
            <td>{r.prev_yeshiva_name || ''}</td>
            <td className="font-semibold">{r.last_name}</td>
            <td>{r.first_name}</td>
            <td style={{ minHeight: '32px' }}>&nbsp;</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
