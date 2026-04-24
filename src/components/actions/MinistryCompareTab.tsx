'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { Student } from '@/lib/types';

type MinistryType = 'dat' | 'chinuch';

interface MinistryRow {
  firstName: string;
  lastName: string;
  idNumber: string;
  entitlement: string; // זכאי / אינו זכאי
  entryDate: string;
  idType: string; // תעודת זהות / דרכון
  raw: string[];
}

interface CompareSection {
  key: string;
  title: string;
  tone: 'red' | 'amber' | 'blue';
  description: string;
  rows: Array<{
    firstName: string;
    lastName: string;
    idNumber: string;
    extra?: string;
  }>;
}

/** Normalize Israeli ID: strip non-digits, strip leading zeros */
function normalizeId(id: string | null | undefined): string {
  if (!id) return '';
  const digits = String(id).replace(/\D/g, '').replace(/^0+/, '');
  return digits;
}

/** Parse Ministry of Religion CSV - Row 4 is header, rows 5+ are data. */
function parseMinistryCsv(text: string): MinistryRow[] {
  // Strip BOM
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/);

  // Simple CSV row parser (handles quoted fields)
  const parseRow = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (c === ',' && !inQuote) {
        out.push(cur); cur = '';
      } else cur += c;
    }
    out.push(cur);
    return out;
  };

  // Find the header row - looks for "StudentIdentity"
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    if (lines[i].includes('StudentIdentity')) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return [];

  const header = parseRow(lines[headerIdx]);
  const idx = {
    firstName: header.indexOf('StudentName2'),
    lastName: header.indexOf('StudentFamilyName1'),
    id: header.indexOf('StudentIdentity'),
    entitlement: header.indexOf('EntitlementStatusName'),
    entryDate: header.indexOf('DateFrom'),
    idType: header.indexOf('IdentificationTypeName'),
  };

  const rows: MinistryRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = parseRow(line);
    const id = (cols[idx.id] || '').trim();
    const entitlement = (cols[idx.entitlement] || '').trim();
    // Skip total/summary rows - they have no entitlement per-student
    if (!id || !entitlement) continue;
    rows.push({
      firstName: (cols[idx.firstName] || '').trim(),
      lastName: (cols[idx.lastName] || '').trim(),
      idNumber: id,
      entitlement,
      entryDate: (cols[idx.entryDate] || '').trim(),
      idType: (cols[idx.idType] || '').trim(),
      raw: cols,
    });
  }
  return rows;
}

export function MinistryCompareTab() {
  const [ministryType, setMinistryType] = useState<MinistryType>('dat');
  const [ministryRows, setMinistryRows] = useState<MinistryRow[] | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [students, setStudents] = useState<Student[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const loadStudents = async () => {
    setLoading(true);
    const all: Student[] = [];
    for (let p = 0; p < 20; p++) {
      const from = p * 1000;
      const to = from + 999;
      const { data } = await supabase
        .from('students')
        .select('id,first_name,last_name,id_number,passport_number,status,shiur,institution_name,is_chinuch')
        .range(from, to);
      if (!data || data.length === 0) break;
      all.push(...(data as Student[]));
      if (data.length < 1000) break;
    }
    setStudents(all);
    setLoading(false);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseMinistryCsv(text);
      if (parsed.length === 0) {
        setParseError('לא נמצאו רשומות תקינות בקובץ. ודא שזה קובץ CSV של דוח משרד הדתות/החינוך.');
        setMinistryRows(null);
        return;
      }
      setMinistryRows(parsed);
      if (!students) await loadStudents();
    } catch (err: any) {
      setParseError('שגיאה בקריאת הקובץ: ' + (err?.message || err));
    }
  };

  const comparison = useMemo(() => {
    if (!ministryRows || !students) return null;

    // Build lookup maps by normalized ID
    const ministryById = new Map<string, MinistryRow>();
    for (const r of ministryRows) {
      const k = normalizeId(r.idNumber);
      if (k) ministryById.set(k, r);
    }

    const studentsById = new Map<string, Student>();
    for (const s of students) {
      const k = normalizeId(s.id_number || s.passport_number);
      if (k) studentsById.set(k, s);
    }

    const isActiveSet = new Set(['active']);

    const sections: CompareSection[] = [];

    // 1. Active in yeshiva but NOT in ministry
    {
      const rows: CompareSection['rows'] = [];
      for (const s of students) {
        if (!isActiveSet.has(s.status)) continue;
        // Only compare ישיבה (not כולל) against Ministry of Religion
        if (ministryType === 'dat' && s.institution_name && s.institution_name !== 'ישיבה') continue;
        if (ministryType === 'chinuch' && !s.is_chinuch) continue;
        const k = normalizeId(s.id_number || s.passport_number);
        if (!k) continue;
        if (!ministryById.has(k)) {
          rows.push({
            firstName: s.first_name || '',
            lastName: s.last_name || '',
            idNumber: s.id_number || s.passport_number || '',
            extra: s.shiur || '',
          });
        }
      }
      rows.sort((a, b) => a.lastName.localeCompare(b.lastName, 'he'));
      sections.push({
        key: 'only-yeshiva',
        title: `פעיל בישיבה ולא מופיע ב${ministryType === 'dat' ? 'משרד הדתות' : 'משרד החינוך'}`,
        tone: 'red',
        description: 'תלמידים שאצלנו פעילים אבל לא מופיעים בדוח - חסר להם רישום',
        rows,
      });
    }

    // 2. In ministry but yeshiva status is NOT active
    {
      const rows: CompareSection['rows'] = [];
      for (const r of ministryRows) {
        const k = normalizeId(r.idNumber);
        if (!k) continue;
        const s = studentsById.get(k);
        if (!s) continue; // different section
        if (s.status === 'active') continue;
        const statusLabel = {
          active: 'פעיל',
          chizuk: 'חיזוק',
          inactive: 'לא פעיל',
          graduated: 'סיים',
        }[s.status] || s.status;
        rows.push({
          firstName: s.first_name || r.firstName,
          lastName: s.last_name || r.lastName,
          idNumber: r.idNumber,
          extra: `אצלנו: ${statusLabel}`,
        });
      }
      rows.sort((a, b) => a.lastName.localeCompare(b.lastName, 'he'));
      sections.push({
        key: 'ministry-yeshiva-not-active',
        title: `מופיע ב${ministryType === 'dat' ? 'משרד הדתות' : 'משרד החינוך'} אבל לא פעיל בישיבה`,
        tone: 'amber',
        description: 'תלמידים שהמשרד מזכה/משלם אבל אצלנו סומנו כעזב/סיים/לא פעיל',
        rows,
      });
    }

    // 3. Chizuk in yeshiva AND in ministry report
    {
      const rows: CompareSection['rows'] = [];
      for (const r of ministryRows) {
        const k = normalizeId(r.idNumber);
        if (!k) continue;
        const s = studentsById.get(k);
        if (!s) continue;
        if (s.status !== 'chizuk') continue;
        rows.push({
          firstName: s.first_name || r.firstName,
          lastName: s.last_name || r.lastName,
          idNumber: r.idNumber,
          extra: `שיעור: ${s.shiur || '-'}`,
        });
      }
      rows.sort((a, b) => a.lastName.localeCompare(b.lastName, 'he'));
      sections.push({
        key: 'chizuk-in-ministry',
        title: `מסומן "חיזוק" בישיבה ומופיע ב${ministryType === 'dat' ? 'משרד הדתות' : 'משרד החינוך'}`,
        tone: 'amber',
        description: 'תלמידי חיזוק שעלולים לדרוש בדיקה מול המשרד',
        rows,
      });
    }

    // 4. In ministry but no student record at all
    {
      const rows: CompareSection['rows'] = [];
      for (const r of ministryRows) {
        const k = normalizeId(r.idNumber);
        if (!k) continue;
        if (studentsById.has(k)) continue;
        rows.push({
          firstName: r.firstName,
          lastName: r.lastName,
          idNumber: r.idNumber,
          extra: r.entitlement,
        });
      }
      rows.sort((a, b) => a.lastName.localeCompare(b.lastName, 'he'));
      sections.push({
        key: 'ministry-only',
        title: `מופיע ב${ministryType === 'dat' ? 'משרד הדתות' : 'משרד החינוך'} אבל לא קיים במערכת`,
        tone: 'red',
        description: 'רישומים שלא נמצא עבורם תלמיד כלל - ייתכן ת"ז שגוי או חסר',
        rows,
      });
    }

    // Summary stats
    const activeYeshiva = students.filter((s) => {
      if (s.status !== 'active') return false;
      if (ministryType === 'dat' && s.institution_name && s.institution_name !== 'ישיבה') return false;
      if (ministryType === 'chinuch' && !s.is_chinuch) return false;
      return true;
    }).length;

    return {
      sections,
      stats: {
        ministryTotal: ministryRows.length,
        ministryEntitled: ministryRows.filter((r) => r.entitlement === 'זכאי').length,
        yeshivaActive: activeYeshiva,
      },
    };
  }, [ministryRows, students, ministryType]);

  const handlePrintPdf = () => {
    window.print();
  };

  const reset = () => {
    setMinistryRows(null);
    setFileName('');
    setParseError(null);
  };

  const ministryLabel = ministryType === 'dat' ? 'משרד הדתות' : 'משרד החינוך';

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-bold text-gray-900">השוואת דוחות משרדיים</h2>
      </CardHeader>
      <CardContent>
        <div className="no-print">
          <p className="text-sm text-gray-600 mb-4">
            העלה קובץ CSV של דוח התלמידים ממשרד הדתות או ממשרד החינוך.
            המערכת תשווה אותו מול רשימת התלמידים אצלנו ותראה הבדלים.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">סוג דוח</label>
              <select
                value={ministryType}
                onChange={(e) => { setMinistryType(e.target.value as MinistryType); reset(); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="dat">משרד הדתות (כל תלמידי הישיבה)</option>
                <option value="chinuch">משרד החינוך (רק תלמידי חינוך)</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">קובץ CSV</label>
              <div className="flex items-center gap-2">
                <label className="flex-1 cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium border border-blue-200 text-center">
                  📁 {fileName || 'בחר קובץ CSV'}
                  <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
                </label>
                {ministryRows && (
                  <Button variant="secondary" onClick={reset}>נקה</Button>
                )}
              </div>
            </div>
          </div>

          {parseError && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 mb-4 text-sm">
              {parseError}
            </div>
          )}

          {loading && <p className="text-sm text-gray-600 mb-3">טוען תלמידים...</p>}
        </div>

        {comparison && (
          <div className="print-area">
            {/* Print header */}
            <div className="hidden print:block mb-6">
              <h1 className="text-2xl font-bold text-center">
                השוואה: {ministryLabel} מול רשימת הישיבה
              </h1>
              <p className="text-center text-sm text-gray-600 mt-2">
                הופק בתאריך: {new Date().toLocaleDateString('he-IL')}
              </p>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3 mb-6 no-print-bg">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-gray-600">בדוח {ministryLabel}</p>
                <p className="text-2xl font-bold text-blue-700">{comparison.stats.ministryTotal}</p>
                <p className="text-xs text-gray-500">מתוכם זכאים: {comparison.stats.ministryEntitled}</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-xs text-gray-600">פעילים אצלנו{ministryType === 'chinuch' ? ' (חינוך)' : ''}</p>
                <p className="text-2xl font-bold text-green-700">{comparison.stats.yeshivaActive}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-600">סה״כ אי התאמות</p>
                <p className="text-2xl font-bold text-gray-700">
                  {comparison.sections.reduce((sum, s) => sum + s.rows.length, 0)}
                </p>
              </div>
            </div>

            {/* Export button */}
            <div className="flex justify-end mb-4 no-print">
              <Button onClick={handlePrintPdf}>
                🖨️ ייצוא ל-PDF / הדפסה
              </Button>
            </div>

            {/* Comparison sections */}
            <div className="space-y-6">
              {comparison.sections.map((section) => {
                const toneClasses = {
                  red: 'border-red-300 bg-red-50',
                  amber: 'border-amber-300 bg-amber-50',
                  blue: 'border-blue-300 bg-blue-50',
                }[section.tone];
                const titleClass = {
                  red: 'text-red-800',
                  amber: 'text-amber-800',
                  blue: 'text-blue-800',
                }[section.tone];
                return (
                  <div key={section.key} className={`border rounded-lg ${toneClasses} print:break-inside-avoid`}>
                    <div className="px-4 py-3 border-b border-inherit">
                      <h3 className={`font-bold ${titleClass}`}>
                        {section.title} ({section.rows.length})
                      </h3>
                      <p className="text-xs text-gray-700 mt-1">{section.description}</p>
                    </div>
                    {section.rows.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-gray-500">✓ אין אי-התאמות בקטגוריה זו</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm bg-white">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-3 py-2 text-start font-semibold">#</th>
                              <th className="px-3 py-2 text-start font-semibold">שם משפחה</th>
                              <th className="px-3 py-2 text-start font-semibold">שם פרטי</th>
                              <th className="px-3 py-2 text-start font-semibold">ת״ז / דרכון</th>
                              <th className="px-3 py-2 text-start font-semibold">הערה</th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.rows.map((row, i) => (
                              <tr key={`${section.key}-${i}`} className="border-t border-gray-100">
                                <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                                <td className="px-3 py-2 font-medium">{row.lastName}</td>
                                <td className="px-3 py-2">{row.firstName}</td>
                                <td className="px-3 py-2 font-mono text-xs">{row.idNumber}</td>
                                <td className="px-3 py-2 text-gray-600">{row.extra || ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <style jsx global>{`
          @media print {
            body * { visibility: hidden; }
            .print-area, .print-area * { visibility: visible; }
            .print-area { position: absolute; inset: 0; padding: 20px; }
            .no-print { display: none !important; }
          }
        `}</style>
      </CardContent>
    </Card>
  );
}
