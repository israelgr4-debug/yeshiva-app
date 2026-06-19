'use client';

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/Button';
import { useRegistrations } from '@/hooks/useRegistrations';
import { supabase } from '@/lib/supabase';

/** Map from Hebrew column header → Registration field key */
const COLUMN_MAP: Record<string, string> = {
  'שם פרטי': 'first_name',
  'שם משפחה': 'last_name',
  'תעודת זהות': 'id_number',
  'ת״ז': 'id_number',
  'תז': 'id_number',
  'דרכון': 'passport_number',
  'תאריך לידה': 'date_of_birth',
  'טלפון': 'phone',
  'טלפון תלמיד': 'phone',
  'דוא״ל': 'email',
  'מייל': 'email',
  'שם האב': 'father_name',
  'שם אב': 'father_name',
  'טלפון אב': 'father_phone',
  'ת״ז אב': 'father_id_number',
  'תז אב': 'father_id_number',
  'מייל אב': 'father_email',
  'שם האם': 'mother_name',
  'שם אם': 'mother_name',
  'טלפון אם': 'mother_phone',
  'ת״ז אם': 'mother_id_number',
  'תז אם': 'mother_id_number',
  'כתובת': 'address',
  'עיר': 'city',
  'מיקוד': 'postal_code',
  'טלפון בית': 'home_phone',
  'ישיבה קטנה': 'prev_yeshiva_name',
  'עיר ישיבה': 'prev_yeshiva_city',
  'תלמוד תורה': 'prev_talmud_torah',
  'כיתה אחרונה': 'prev_class_completed',
  'הערות': 'notes',
};

/** Excel date serial → ISO YYYY-MM-DD */
function excelDateToIso(v: any): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    // Excel epoch is 1900-01-00 with leap year bug
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s;
}

interface Props {
  onImported: () => void;
}

interface ImportError {
  row: number;
  name: string;
  reason: string;
}

export function RegistrationImportButtons({ onImported }: Props) {
  const { create } = useRegistrations();
  const [busy, setBusy] = useState(false);
  const [importReport, setImportReport] = useState<{
    imported: number;
    skipped: number;
    errors: ImportError[];
  } | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSampleDownload = () => {
    const headers = Object.keys(COLUMN_MAP).filter((h, i, arr) => arr.indexOf(h) === i);
    // Use a curated subset to avoid 30+ duplicate columns; one header per field
    const seen = new Set<string>();
    const cleanHeaders: string[] = [];
    for (const h of headers) {
      const field = COLUMN_MAP[h];
      if (seen.has(field)) continue;
      seen.add(field);
      cleanHeaders.push(h);
    }
    const sampleRow = [
      'יוסי', 'כהן', '123456782', '', '15/05/2008', '052-1234567', 'yossi@example.com',
      'משה כהן', '050-7654321', '987654321', 'moshe@example.com',
      'שרה כהן', '054-1112222', '987654322',
      'רחוב הרצוג 12', 'ירושלים', '9100000', '02-1234567',
      'ישיבת תפארת ירושלים', 'ירושלים', 'ת"ת חדר תורה', 'ח׳',
      'תלמיד מצטיין',
    ];
    // Make sure sample has same length as headers
    while (sampleRow.length < cleanHeaders.length) sampleRow.push('');
    sampleRow.length = cleanHeaders.length;

    const ws = XLSX.utils.aoa_to_sheet([cleanHeaders, sampleRow]);
    ws['!cols'] = cleanHeaders.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'מועמדים');
    XLSX.writeFile(wb, 'תבנית_רישום.xlsx');
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setImportReport(null);
    let imported = 0;
    let skipped = 0;
    const errors: ImportError[] = [];
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
      if (rows.length === 0) {
        alert('הקובץ ריק');
        return;
      }

      const firstRow = rows[0];
      const headerKeys = Object.keys(firstRow);
      const headerMap: Record<string, string> = {};
      for (const k of headerKeys) {
        const trimmed = String(k).replace(/[\s"׳']+/g, '').trim();
        for (const [hebrew, field] of Object.entries(COLUMN_MAP)) {
          const cleanHeb = hebrew.replace(/[\s"׳']+/g, '').trim();
          if (trimmed === cleanHeb) {
            headerMap[k] = field;
            break;
          }
        }
      }

      if (Object.keys(headerMap).length === 0) {
        alert('לא זוהו כותרות. הורד את קובץ הדוגמא ובדוק שהכותרות תואמות.');
        return;
      }

      // Track unrecognized headers - show as info in the report
      const unrecognized = headerKeys.filter((k) => !headerMap[k] && String(k).trim());

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const xlsxRow = i + 2; // +1 for header row, +1 to make 1-indexed
        const data: any = {};
        let hasName = false;
        for (const [key, value] of Object.entries(row)) {
          const field = headerMap[key];
          if (!field) continue;
          let v: any = value;
          if (v === '' || v === null || v === undefined) continue;
          if (field === 'date_of_birth') v = excelDateToIso(v);
          if (typeof v !== 'string' && field !== 'date_of_birth') v = String(v);
          if (typeof v === 'string') v = v.trim();
          if (!v) continue;
          data[field] = v;
          if (field === 'first_name' || field === 'last_name') hasName = true;
        }
        const label = `${data.last_name || ''} ${data.first_name || ''}`.trim() || '(ללא שם)';
        if (!hasName) {
          skipped++;
          errors.push({
            row: xlsxRow,
            name: '(ריק)',
            reason: 'שורה ללא שם פרטי / שם משפחה - דולגה',
          });
          continue;
        }
        try {
          await create(data);
          imported++;
        } catch (err: any) {
          const msg = err?.message || err?.details || String(err) || 'שגיאה לא ידועה';
          // Translate common Supabase errors to Hebrew
          let humanReason = msg;
          if (/duplicate key|unique/i.test(msg)) humanReason = 'מועמד כבר קיים במערכת (כפילות)';
          else if (/invalid input|invalid date/i.test(msg)) humanReason = 'ערך לא תקין באחד השדות (כנראה תאריך)';
          else if (/not.*null|null value/i.test(msg)) humanReason = 'שדה חובה ריק';
          else if (/permission|RLS/i.test(msg)) humanReason = 'אין הרשאה (RLS)';
          errors.push({ row: xlsxRow, name: label, reason: humanReason });
          console.error('Row import failed', err, data);
        }
      }

      const reportErrors = [...errors];
      if (unrecognized.length > 0) {
        reportErrors.unshift({
          row: 1,
          name: '(כותרות)',
          reason: `כותרות לא מזוהות (יוכלו): ${unrecognized.join(', ')}`,
        });
      }
      setImportReport({ imported, skipped, errors: reportErrors });
      onImported();
    } catch (err: any) {
      alert('שגיאה בייבוא: ' + (err?.message || err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDeleteAll = async () => {
    const confirmation = prompt(
      '⚠️ פעולה זו תמחק את כל המועמדים במערכת!\n\n' +
      'אם אתה בטוח - הקלד את המילה "מחק" ולחץ אישור:'
    );
    if (confirmation !== 'מחק') {
      if (confirmation !== null) alert('הביטול בוצע - לא הוקלד "מחק"');
      return;
    }
    setDeletingAll(true);
    try {
      // Delete in batches to avoid timeouts; use a synthetic always-true
      // condition since Supabase requires a filter on DELETE.
      const { error, count } = await supabase
        .from('registrations')
        .delete({ count: 'exact' })
        .gte('created_at', '1900-01-01');
      if (error) throw error;
      alert(`✅ נמחקו ${count ?? 0} מועמדים.`);
      setImportReport(null);
      onImported();
    } catch (err: any) {
      alert('שגיאה במחיקה: ' + (err?.message || err));
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={handleSampleDownload}
        disabled={busy}
        title="הורד תבנית Excel ריקה עם כותרות"
      >
        📥 תבנית
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        {busy ? 'מייבא...' : '📤 ייבא Excel'}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="danger"
        onClick={handleDeleteAll}
        disabled={deletingAll || busy}
        title="מחיקת כל המועמדים במערכת - בלתי הפיכה"
      >
        {deletingAll ? 'מוחק...' : '🗑️ מחק הכל'}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={handleFile}
        className="hidden"
      />

      {importReport && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="px-6 py-4 border-b flex justify-between items-start">
              <div>
                <h3 className="text-xl font-bold text-slate-900">📊 דוח ייבוא</h3>
                <div className="text-sm text-slate-600 mt-1 space-x-3 space-x-reverse">
                  <span>✅ <b>{importReport.imported}</b> יובאו</span>
                  {importReport.skipped > 0 && (
                    <span>⏭️ <b>{importReport.skipped}</b> דולגו</span>
                  )}
                  {importReport.errors.length > 0 && (
                    <span className="text-red-700">❌ <b>{importReport.errors.length}</b> שגיאות</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImportReport(null)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
              >×</button>
            </div>

            <div className="px-6 py-4 overflow-y-auto flex-1">
              {importReport.errors.length === 0 ? (
                <div className="text-center py-10 text-emerald-700">
                  <p className="text-5xl mb-2">🎉</p>
                  <p className="font-semibold">הקובץ יובא בלי שגיאות!</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-slate-700 mb-3 font-semibold">פירוט שגיאות:</p>
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-start w-16">שורה</th>
                          <th className="px-3 py-2 text-start">שם</th>
                          <th className="px-3 py-2 text-start">סיבה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importReport.errors.map((e, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="px-3 py-2 tabular-nums font-semibold">{e.row}</td>
                            <td className="px-3 py-2">{e.name}</td>
                            <td className="px-3 py-2 text-red-700">{e.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-500 mt-3">
                    💡 השורה מתייחסת למספר השורה בקובץ ה-Excel המקורי (כולל כותרת = שורה 1).
                    תקן את השורות הבעייתיות בקובץ ויבא שוב. אם תרצה להתחיל מאפס -
                    לחץ &quot;🗑️ מחק הכל&quot; לפני הייבוא.
                  </p>
                </>
              )}
            </div>

            <div className="px-6 py-3 border-t flex justify-end">
              <Button size="sm" onClick={() => setImportReport(null)}>סגור</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
