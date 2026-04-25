'use client';

import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/Button';
import { useRegistrations } from '@/hooks/useRegistrations';

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

export function RegistrationImportButtons({ onImported }: Props) {
  const { create } = useRegistrations();
  const [busy, setBusy] = useState(false);
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
    let imported = 0;
    let errors = 0;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
      if (rows.length === 0) {
        alert('הקובץ ריק');
        return;
      }

      // Map header → field for THIS sheet (handles user customization)
      const firstRow = rows[0];
      const headerKeys = Object.keys(firstRow);
      const headerMap: Record<string, string> = {};
      for (const k of headerKeys) {
        const trimmed = String(k).replace(/[\s"׳']+/g, '').trim();
        // Try exact match first
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

      for (const row of rows) {
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
        if (!hasName) {
          continue; // skip rows with no name
        }
        try {
          await create(data);
          imported++;
        } catch (err) {
          console.error('Row import failed', err, data);
          errors++;
        }
      }
      alert(`הסתיים. ${imported} מועמדים יובאו${errors > 0 ? `, ${errors} שגיאות` : ''}.`);
      onImported();
    } catch (err: any) {
      alert('שגיאה בייבוא: ' + (err?.message || err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
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
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={handleFile}
        className="hidden"
      />
    </>
  );
}
