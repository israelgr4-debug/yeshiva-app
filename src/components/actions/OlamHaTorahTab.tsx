'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { Student, Family } from '@/lib/types';
import { useSystemSettings } from '@/hooks/useSystemSettings';

interface MinistryRow {
  idNumber: string;
  firstName: string;
  lastName: string;
  entitlement?: string;
  studyTypeId?: string;
  birthDate?: string;
}
interface StoredData {
  rows: MinistryRow[];
  uploadedAt: string;
  fileName: string;
}

function normalizeId(id: string | null | undefined): string {
  if (!id) return '';
  return String(id).replace(/\D/g, '').replace(/^0+/, '');
}

/** Parse address "רחוב 12" -> { street: "רחוב", house: "12" } */
function splitAddress(addr: string | null | undefined): { street: string; house: string } {
  if (!addr) return { street: '', house: '' };
  const trimmed = addr.trim();
  // Find trailing number (possibly with /, like "12/3")
  const m = trimmed.match(/^(.*?)\s+([\d\/]+)\s*$/);
  if (m) return { street: m[1].trim(), house: m[2].trim() };
  return { street: trimmed, house: '' };
}

/** Format date to DD/MM/YYYY */
function formatDate(d: string | null | undefined): string {
  if (!d) return '';
  // Already in DD/MM/YYYY?
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) return d;
  // ISO format YYYY-MM-DD
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return d;
}

/** Map StudyTypeID -> column J (סדר נלמד) */
function studyOrder(studyType: string): string {
  const t = String(studyType || '').trim();
  if (t === '300' || t === '600' || t === '605') return 'יום שלם';
  if (t === '700' || t === '705') return 'סדר א';
  if (t === '720' || t === '725') return 'סדר ב';
  return '';
}

/** Map institution to K (מקום לימוד) */
function studyPlace(institution: string | null | undefined): string {
  const inst = (institution || '').trim();
  if (inst === 'ישיבה') return 'היכל הישיבה';
  if (inst === 'כולל') return 'בית המדרש רבי עקיבא';
  return '';
}

/** Is kollel? */
function isKollel(s: Student): boolean {
  return (s.institution_name || '') === 'כולל';
}

const TEMPLATE_HEADERS = [
  'מספר זהות (9 ספרות בלבד!)',
  'שם משפחה',
  'שם פרטי',
  'תאריך לידה',
  'אברך/בחור',
  'כתובת',
  'מס בית',
  'עיר',
  'מספר טלפון',
  'סדר נלמד (סדר א/סדר ב/יום שלם)',
  'מקום לימוד בבית המדרש',
  'מלגה',
  'מושהה בשל החלטת בג"ץ',
  'הגדרת זכאות במשרד הדתות',
];

export function OlamHaTorahTab() {
  const { getSetting } = useSystemSettings();
  const [datData, setDatData] = useState<StoredData | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [families, setFamilies] = useState<Map<string, Family>>(new Map());
  const [loading, setLoading] = useState(false);
  const [scholarship, setScholarship] = useState<number>(2150);
  const [includeScholarship, setIncludeScholarship] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const dat = await getSetting<StoredData | null>('ministry_dat_data', null);
    setDatData(dat);

    const allStudents: Student[] = [];
    for (let p = 0; p < 20; p++) {
      const { data } = await supabase
        .from('students')
        .select('*')
        .range(p * 1000, p * 1000 + 999);
      if (!data || data.length === 0) break;
      allStudents.push(...(data as Student[]));
      if (data.length < 1000) break;
    }
    setStudents(allStudents);

    const famIds = Array.from(new Set(allStudents.map((s) => s.family_id).filter(Boolean))) as string[];
    const famMap = new Map<string, Family>();
    for (let i = 0; i < famIds.length; i += 500) {
      const chunk = famIds.slice(i, i + 500);
      const { data } = await supabase.from('families').select('*').in('id', chunk);
      for (const f of (data || []) as Family[]) famMap.set(f.id, f);
    }
    setFamilies(famMap);
    setLoading(false);
  }, [getSetting]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Build preview rows
  const { rows, missing, incomplete } = useMemo(() => {
    if (!datData) return { rows: [], missing: [] as MinistryRow[], incomplete: [] as any[] };
    const studentByMinistryId = new Map<string, Student>();
    for (const s of students) {
      const k = normalizeId(s.id_number || s.passport_number);
      if (k) studentByMinistryId.set(k, s);
    }

    const rows: any[][] = [];
    const missing: MinistryRow[] = [];
    const incomplete: Array<{
      idNumber: string;
      lastName: string;
      firstName: string;
      studentId: string;
      missingFields: string[];
    }> = [];

    for (const m of datData.rows) {
      const k = normalizeId(m.idNumber);
      if (!k) continue;
      const s = studentByMinistryId.get(k);
      if (!s) { missing.push(m); continue; }
      // Only include students we'd actually report on
      if (s.is_chinuch) continue; // chinuch goes to Education ministry, not here

      const fam = s.family_id ? families.get(s.family_id) : undefined;
      const kollel = isKollel(s);
      const { street, house } = splitAddress(fam?.address);

      // Prefer explicit street/house if set on family (any-typed)
      const explicitStreet = fam && (fam as any).street ? (fam as any).street : street;
      const explicitHouse = fam && (fam as any).house_number ? (fam as any).house_number : house;

      const birth = formatDate(s.date_of_birth) || formatDate(m.birthDate);
      const phone = fam?.father_phone || fam?.home_phone || s.phone || '';
      const entitled = (m.entitlement || '').trim() === 'זכאי';

      // Track incomplete critical fields so user can fix before sending
      const missingFields: string[] = [];
      if (!birth) missingFields.push('תאריך לידה');
      if (!explicitStreet) missingFields.push('רחוב');
      if (!explicitHouse) missingFields.push('מס׳ בית');
      if (!fam?.city) missingFields.push('עיר');
      if (!phone) missingFields.push('טלפון');
      if (!studyOrder(m.studyTypeId || '')) missingFields.push('סדר נלמד (J)');
      if (!studyPlace(s.institution_name)) missingFields.push('מקום לימוד (K)');
      if (missingFields.length > 0) {
        incomplete.push({
          idNumber: m.idNumber,
          lastName: s.last_name || m.lastName || '',
          firstName: s.first_name || m.firstName || '',
          studentId: s.id,
          missingFields,
        });
      }

      rows.push([
        m.idNumber.replace(/\D/g, ''),            // A - 9 digits only
        s.last_name || m.lastName || '',          // B
        s.first_name || m.firstName || '',        // C
        birth,                                    // D
        kollel ? 'אברך' : 'בחור',                 // E
        explicitStreet || '',                     // F
        explicitHouse || '',                      // G
        fam?.city || '',                          // H
        phone,                                    // I
        studyOrder(m.studyTypeId || ''),          // J
        studyPlace(s.institution_name),           // K
        kollel && includeScholarship ? scholarship : '', // L
        entitled ? 'לא' : 'כן',                   // M - NOT entitled -> כן
        (m.studyTypeId || '').trim(),             // N
      ]);
    }

    return { rows, missing, incomplete };
  }, [datData, students, families, scholarship, includeScholarship]);

  const handleDownload = () => {
    // Pre-export confirmation summarizing what will and won't be included
    const lines: string[] = [];
    lines.push(`ייוצא דוח עם ${rows.length} תלמידים.`);
    if (missing.length > 0) {
      lines.push('');
      lines.push(`⚠️ ${missing.length} רשומות בדוח הדתות לא נמצאו במערכת - ידולגו.`);
    }
    if (incomplete.length > 0) {
      lines.push('');
      lines.push(`⚠️ ${incomplete.length} תלמידים עם שדות חסרים (יופיעו בדוח עם שדות ריקים).`);
    }
    lines.push('');
    lines.push('להמשיך בייצוא?');
    if (!confirm(lines.join('\n'))) return;

    setGenerating(true);
    try {
      const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, ...rows]);
      ws['!cols'] = [
        { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 8 },
        { wch: 18 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
        { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
      ];
      // RTL direction
      if (!ws['!sheetView']) (ws as any)['!sheetView'] = [{ rightToLeft: true }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'תלמידים');
      const now = new Date();
      const name = `olam_hatorah_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}.xlsx`;
      XLSX.writeFile(wb, name);
    } catch (err: any) {
      alert('שגיאה: ' + (err?.message || err));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg md:text-xl font-bold text-gray-900">📚 עולם התורה - הפקת דוח חודשי</h2>
          <Button variant="secondary" size="sm" onClick={loadAll} disabled={loading}>
            {loading ? 'טוען...' : '🔄 רענן'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!datData ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
            ⚠️ צריך להעלות תחילה את קובץ משרד הדתות (CSV) בטאב &quot;השוואת משרדים&quot;.
            הדוח מבוסס על רשימת התלמידים הרשומים במשרד הדתות.
          </div>
        ) : (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-900">
              <p><strong>מקור נתונים:</strong> {datData.fileName}</p>
              <p className="text-xs text-blue-700">הועלה {new Date(datData.uploadedAt).toLocaleString('he-IL')}</p>
              <p className="text-xs text-blue-700 mt-1">
                רק תלמידים שמופיעים בדוח משרד הדתות ולא מסומנים &quot;חינוך&quot; ייכללו בדוח.
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
              <h3 className="font-semibold mb-3">הגדרות קבועות</h3>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeScholarship}
                    onChange={(e) => setIncludeScholarship(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">מלגת כולל (עמודה L)</span>
                </label>
                <input
                  type="number"
                  value={scholarship}
                  onChange={(e) => setScholarship(Number(e.target.value))}
                  disabled={!includeScholarship}
                  className="w-24 px-2 py-1 border border-gray-300 rounded text-sm disabled:bg-gray-100"
                />
                <span className="text-xs text-gray-500">רק לשורות של &quot;כולל&quot;. אם לא לכלול - השדה יישאר ריק.</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              <Stat label="בדוח הדתות" value={datData.rows.length} />
              <Stat label="יהיו בדוח" value={rows.length} tone="green" />
              <Stat label="חסרים במערכת" value={missing.length} tone={missing.length > 0 ? 'red' : 'gray'} />
              <Stat label="פרטים חסרים" value={incomplete.length} tone={incomplete.length > 0 ? 'amber' : 'gray'} />
            </div>

            <div className="flex justify-end mb-4">
              <Button onClick={handleDownload} disabled={generating || rows.length === 0}>
                {generating ? 'מפיק...' : `📥 הורד דוח Excel (${rows.length} שורות)`}
              </Button>
            </div>

            {incomplete.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <h4 className="font-semibold text-amber-800 mb-2">
                  ⚠️ {incomplete.length} תלמידים עם שדות חסרים - הדוח יצא איתם עם שדות ריקים
                </h4>
                <p className="text-xs text-amber-700 mb-2">
                  לחץ על שם תלמיד כדי לפתוח את הכרטיס שלו בטאב חדש ולהשלים נתונים. אחר כך לחץ &quot;רענן&quot;.
                </p>
                <div className="max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-amber-100">
                      <tr>
                        <th className="px-2 py-1 text-start">ת״ז</th>
                        <th className="px-2 py-1 text-start">שם משפחה</th>
                        <th className="px-2 py-1 text-start">שם פרטי</th>
                        <th className="px-2 py-1 text-start">שדות חסרים</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomplete.map((r, i) => (
                        <tr key={i} className="border-t border-amber-200">
                          <td className="px-2 py-1 font-mono">{r.idNumber}</td>
                          <td className="px-2 py-1">
                            <a
                              href={`/students/${r.studentId}`}
                              target="_blank"
                              rel="noopener"
                              className="text-blue-700 hover:underline"
                            >
                              {r.lastName}
                            </a>
                          </td>
                          <td className="px-2 py-1">{r.firstName}</td>
                          <td className="px-2 py-1 text-amber-800">
                            {r.missingFields.join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {missing.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <h4 className="font-semibold text-red-800 mb-2">
                  ⚠️ {missing.length} רשומות מדוח הדתות ללא תלמיד תואם במערכת (מדולגים)
                </h4>
                <div className="max-h-40 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-red-100">
                      <tr>
                        <th className="px-2 py-1 text-start">ת״ז</th>
                        <th className="px-2 py-1 text-start">שם משפחה</th>
                        <th className="px-2 py-1 text-start">שם פרטי</th>
                      </tr>
                    </thead>
                    <tbody>
                      {missing.map((m, i) => (
                        <tr key={i} className="border-t border-red-200">
                          <td className="px-2 py-1 font-mono">{m.idNumber}</td>
                          <td className="px-2 py-1">{m.lastName}</td>
                          <td className="px-2 py-1">{m.firstName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Preview */}
            <details>
              <summary className="cursor-pointer text-sm font-medium text-gray-700 mb-2">
                תצוגה מקדימה של שורות הדוח ({rows.length})
              </summary>
              <div className="overflow-x-auto mt-2 border border-gray-200 rounded">
                <table className="w-full text-xs">
                  <thead className="bg-gray-100">
                    <tr>
                      {TEMPLATE_HEADERS.map((h, i) => (
                        <th key={i} className="px-2 py-1 text-start font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        {r.map((v: any, j: number) => (
                          <td key={j} className="px-2 py-1 whitespace-nowrap">{v ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 50 && (
                  <p className="text-center text-xs text-gray-500 py-2">
                    מוצגות 50 שורות ראשונות. הקובץ יכיל את כל {rows.length} השורות.
                  </p>
                )}
              </div>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone = 'blue' }: { label: string; value: number; tone?: 'blue' | 'green' | 'red' | 'amber' | 'gray' }) {
  const cls: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
  };
  return (
    <div className={`border rounded-lg p-2 ${cls[tone]}`}>
      <p className="text-xs leading-tight">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
