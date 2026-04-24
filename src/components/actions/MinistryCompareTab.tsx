'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { Student } from '@/lib/types';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { SHIURIM } from '@/lib/shiurim';

type MinistryType = 'dat' | 'chinuch';

interface MinistryRow {
  firstName: string;
  lastName: string;
  idNumber: string;
  /** Ministry of Religion: זכאי / אינו זכאי */
  entitlement?: string;
  entryDate?: string;
  idType?: string;
  /** Chinuch: שכבה/כיתת אם */
  classroom?: string;
  /** Chinuch: תקין / שגוי */
  validity?: string;
  /** Chinuch: מוצהר / ריק */
  declared?: string;
}

interface StoredData {
  rows: MinistryRow[];
  uploadedAt: string;
  fileName: string;
}

interface CompareRow {
  firstName: string;
  lastName: string;
  idNumber: string;
  shiur?: string;
  extra?: string;
}

const SHIUR_ORDER = new Map<string, number>(SHIURIM.map((s, i) => [s.name, i]));
function shiurRank(name?: string): number {
  if (!name) return 9999;
  const r = SHIUR_ORDER.get(name);
  return r === undefined ? 9998 : r;
}
function compareRows(a: CompareRow, b: CompareRow): number {
  const sa = shiurRank(a.shiur);
  const sb = shiurRank(b.shiur);
  if (sa !== sb) return sa - sb;
  return (a.lastName || '').localeCompare(b.lastName || '', 'he');
}

interface CompareSection {
  key: string;
  title: string;
  tone: 'red' | 'amber' | 'blue' | 'purple';
  description: string;
  rows: CompareRow[];
}

/** Normalize Israeli ID: strip non-digits, strip leading zeros */
function normalizeId(id: string | null | undefined): string {
  if (!id) return '';
  const digits = String(id).replace(/\D/g, '').replace(/^0+/, '');
  return digits;
}

/** Split Hebrew full name "last_name first_name rest..." */
function splitHebrewName(full: string): { firstName: string; lastName: string } {
  const trimmed = (full || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return { firstName: '', lastName: '' };
  const parts = trimmed.split(' ');
  // Compound surnames (בן X, בר X, בית X) need 2 words
  const compoundPrefixes = ['בן', 'בר', 'בית', 'אבן', 'אבו', 'בני', 'דה', "ד'", 'ון', 'דר'];
  let lastLen = 1;
  if (parts.length >= 3 && compoundPrefixes.includes(parts[0])) lastLen = 2;
  const lastName = parts.slice(0, lastLen).join(' ');
  const firstName = parts.slice(lastLen).join(' ');
  return { firstName, lastName };
}

/** Parse Ministry of Religion CSV */
function parseDatCsv(text: string): MinistryRow[] {
  const cleaned = text.replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/);
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
    if (!id || !entitlement) continue; // skip totals
    rows.push({
      firstName: (cols[idx.firstName] || '').trim(),
      lastName: (cols[idx.lastName] || '').trim(),
      idNumber: id,
      entitlement,
      entryDate: (cols[idx.entryDate] || '').trim(),
      idType: (cols[idx.idType] || '').trim(),
    });
  }
  return rows;
}

/** Parse Ministry of Education xlsx. Format:
 *  col 0: מספר זהות, col 1: שם התלמיד (last first), col 3: שכבה, col 4: סטטוס,
 *  col 5: הצהרת מנהל, col 7: תקינות מצבת
 */
async function parseChinuchXlsx(file: File): Promise<MinistryRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  if (data.length < 2) return [];
  const header = data[0].map((h) => String(h || '').trim());

  // Find columns by Hebrew headers (robust to column order)
  const findCol = (...names: string[]): number => {
    for (const n of names) {
      const i = header.findIndex((h) => h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };
  const idCol = findCol('מספר זהות', 'זהות');
  const nameCol = findCol('שם התלמיד', 'שם');
  const classCol = findCol('שכבה', 'כיתת');
  const statusCol = findCol('סטטוס');
  const declCol = findCol('הצהרת');
  const validCol = findCol('תקינות');

  const rows: MinistryRow[] = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r || r.length === 0) continue;
    const id = String(r[idCol] || '').trim();
    const fullName = String(r[nameCol] || '').trim();
    if (!id || !fullName) continue;
    const { firstName, lastName } = splitHebrewName(fullName);
    rows.push({
      firstName,
      lastName,
      idNumber: id,
      classroom: classCol >= 0 ? String(r[classCol] || '').trim() : '',
      validity: validCol >= 0 ? String(r[validCol] || '').trim() : '',
      declared: declCol >= 0 ? String(r[declCol] || '').trim() : '',
      entitlement: statusCol >= 0 ? String(r[statusCol] || '').trim() : '',
    });
  }
  return rows;
}

export function MinistryCompareTab() {
  const { getSetting, setSetting } = useSystemSettings();

  const [datData, setDatData] = useState<StoredData | null>(null);
  const [chinuchData, setChinuchData] = useState<StoredData | null>(null);
  const [students, setStudents] = useState<Student[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<MinistryType | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<MinistryType | null>(null);
  const [activeView, setActiveView] = useState<'dat' | 'chinuch' | 'combined'>('dat');

  // Initial load: persisted uploads + students
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [dat, ch] = await Promise.all([
        getSetting<StoredData | null>('ministry_dat_data', null),
        getSetting<StoredData | null>('ministry_chinuch_data', null),
      ]);
      setDatData(dat);
      setChinuchData(ch);
      await loadStudents();
      setLoading(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadStudents = useCallback(async () => {
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
  }, []);

  const handleRecheck = async () => {
    setLoading(true);
    await loadStudents();
    setLoading(false);
  };

  const processFile = async (type: MinistryType, file: File) => {
    setParseError(null);
    setUploading(type);
    try {
      let rows: MinistryRow[];
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      const isCsv = /\.(csv|txt)$/i.test(file.name);
      if (type === 'dat') {
        if (!isCsv) {
          setParseError('משרד הדתות: צריך קובץ CSV. הקובץ שבחרת הוא ' + file.name);
          setUploading(null);
          return;
        }
        const text = await file.text();
        rows = parseDatCsv(text);
      } else {
        if (!isExcel) {
          setParseError('משרד החינוך: צריך קובץ XLSX/XLS. הקובץ שבחרת הוא ' + file.name);
          setUploading(null);
          return;
        }
        rows = await parseChinuchXlsx(file);
      }
      if (rows.length === 0) {
        setParseError(`לא נמצאו רשומות ב${type === 'dat' ? 'קובץ משרד הדתות' : 'קובץ משרד החינוך'}. בדוק שזה הקובץ הנכון.`);
        setUploading(null);
        return;
      }
      const stored: StoredData = {
        rows,
        uploadedAt: new Date().toISOString(),
        fileName: file.name,
      };
      const key = type === 'dat' ? 'ministry_dat_data' : 'ministry_chinuch_data';
      // Update UI immediately; save to Supabase in background so the
      // second file picker isn't blocked waiting for the network round-trip
      if (type === 'dat') setDatData(stored);
      else setChinuchData(stored);
      setActiveView(type);
      setSetting(key, stored).catch((err) => {
        console.error('Failed to persist ministry data', err);
      });
    } catch (err: any) {
      setParseError('שגיאה בקריאת הקובץ: ' + (err?.message || err));
    } finally {
      setUploading(null);
    }
  };

  const handleFile = async (type: MinistryType, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(type, file);
    // Clear input so the same file can be re-uploaded
    e.target.value = '';
  };

  const handleDrop = async (type: MinistryType, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processFile(type, file);
  };

  const handleClear = async (type: MinistryType) => {
    if (!confirm(`למחוק את הדוח של ${type === 'dat' ? 'משרד הדתות' : 'משרד החינוך'}?`)) return;
    const key = type === 'dat' ? 'ministry_dat_data' : 'ministry_chinuch_data';
    await setSetting(key, null);
    if (type === 'dat') setDatData(null);
    else setChinuchData(null);
  };

  // Ministry belonging helper for comparison
  const belongsToMinistry = (s: Student, type: MinistryType): boolean => {
    if (type === 'chinuch') return !!s.is_chinuch;
    // Dat: ישיבה/כולל, but NOT chinuch students (they belong to Ministry of Education)
    if (s.is_chinuch) return false;
    const inst = s.institution_name || '';
    if (inst === "כולל של ר' יצחק פינקל" || inst === 'כולל של ר׳ יצחק פינקל') return false;
    return inst === 'ישיבה' || inst === 'כולל' || !inst;
  };

  // Run comparison for a specific ministry
  const buildComparison = (type: MinistryType): { sections: CompareSection[]; stats: any } | null => {
    const data = type === 'dat' ? datData : chinuchData;
    if (!data || !students) return null;

    const ministryById = new Map<string, MinistryRow>();
    for (const r of data.rows) {
      const k = normalizeId(r.idNumber);
      if (k) ministryById.set(k, r);
    }
    const studentsById = new Map<string, Student>();
    for (const s of students) {
      const k = normalizeId(s.id_number || s.passport_number);
      if (k) studentsById.set(k, s);
    }

    const label = type === 'dat' ? 'משרד הדתות' : 'משרד החינוך';
    const sections: CompareSection[] = [];

    // 1. Active in yeshiva but NOT in ministry
    {
      const rows: CompareRow[] = [];
      for (const s of students) {
        if (s.status !== 'active') continue;
        if (!belongsToMinistry(s, type)) continue;
        const k = normalizeId(s.id_number || s.passport_number);
        if (!k || ministryById.has(k)) continue;
        rows.push({
          firstName: s.first_name || '',
          lastName: s.last_name || '',
          idNumber: s.id_number || s.passport_number || '',
          shiur: s.shiur || undefined,
          extra: [s.shiur, s.institution_name].filter(Boolean).join(' · '),
        });
      }
      rows.sort(compareRows);
      sections.push({
        key: 'only-yeshiva',
        tone: 'red',
        title: `פעיל אצלנו ולא ב${label}`,
        description: 'תלמידים פעילים אצלנו שאין להם רישום בדוח',
        rows,
      });
    }

    // 2. In ministry but yeshiva status != active
    {
      const rows: CompareRow[] = [];
      for (const r of data.rows) {
        const k = normalizeId(r.idNumber);
        if (!k) continue;
        const s = studentsById.get(k);
        if (!s || s.status === 'active') continue;
        // Dat: skip chinuch students (they belong to Ministry of Education)
        if (type === 'dat' && s.is_chinuch) continue;
        // Chinuch: skip students not flagged is_chinuch
        if (type === 'chinuch' && !s.is_chinuch) continue;
        const statusLabel = ({ chizuk: 'חיזוק', inactive: 'לא פעיל', graduated: 'סיים' } as any)[s.status] || s.status;
        rows.push({
          firstName: s.first_name || r.firstName,
          lastName: s.last_name || r.lastName,
          idNumber: r.idNumber,
          shiur: s.shiur || undefined,
          extra: `אצלנו: ${statusLabel}`,
        });
      }
      rows.sort(compareRows);
      sections.push({
        key: 'ministry-yeshiva-not-active',
        tone: 'amber',
        title: `ברישום ${label} אך אצלנו לא פעיל`,
        description: 'המשרד מזכה עליהם אבל אצלנו הם סומנו כלא פעיל/סיים',
        rows,
      });
    }

    // 3. Chizuk in yeshiva + in ministry
    {
      const rows: CompareRow[] = [];
      for (const r of data.rows) {
        const k = normalizeId(r.idNumber);
        if (!k) continue;
        const s = studentsById.get(k);
        if (!s || s.status !== 'chizuk') continue;
        if (type === 'dat' && s.is_chinuch) continue;
        if (type === 'chinuch' && !s.is_chinuch) continue;
        rows.push({
          firstName: s.first_name || r.firstName,
          lastName: s.last_name || r.lastName,
          idNumber: r.idNumber,
          shiur: s.shiur || undefined,
          extra: s.shiur || '',
        });
      }
      rows.sort(compareRows);
      sections.push({
        key: 'chizuk',
        tone: 'amber',
        title: `מסומן "חיזוק" ומופיע ב${label}`,
        description: 'תלמידי חיזוק שעלולים לדרוש בדיקה מול המשרד',
        rows,
      });
    }

    // 4. Active + in ministry BUT not entitled / shagui
    {
      const rows: CompareRow[] = [];
      for (const s of students) {
        if (s.status !== 'active') continue;
        if (!belongsToMinistry(s, type)) continue;
        const k = normalizeId(s.id_number || s.passport_number);
        if (!k) continue;
        const m = ministryById.get(k);
        if (!m) continue;
        let problem = '';
        if (type === 'dat') {
          if (m.entitlement === 'זכאי') continue;
          problem = m.entitlement || '';
        } else {
          // chinuch: flag שגוי validity
          if (!m.validity || m.validity === 'תקין') continue;
          problem = m.validity;
        }
        rows.push({
          firstName: s.first_name || m.firstName,
          lastName: s.last_name || m.lastName,
          idNumber: s.id_number || s.passport_number || '',
          shiur: s.shiur || undefined,
          extra: `${problem} · ${s.shiur || ''}`,
        });
      }
      rows.sort(compareRows);
      sections.push({
        key: 'registered-but-problem',
        tone: 'amber',
        title: type === 'dat'
          ? `פעיל אצלנו + ברישום ${label} אך "אינו זכאי"`
          : `פעיל אצלנו + ברישום ${label} אך "שגוי"`,
        description: type === 'dat'
          ? 'תלמידים פעילים שהמשרד לא מזכה עליהם - כדאי לבדוק את הסיבה'
          : 'תלמידים שמצבת החינוך לא תקינה - נדרש תיקון במערכת החינוך',
        rows,
      });
    }

    // 5. In ministry with no student record at all
    {
      const rows: CompareRow[] = [];
      for (const r of data.rows) {
        const k = normalizeId(r.idNumber);
        if (!k || studentsById.has(k)) continue;
        rows.push({
          firstName: r.firstName,
          lastName: r.lastName,
          idNumber: r.idNumber,
          extra: r.entitlement || r.classroom || '',
        });
      }
      rows.sort(compareRows);
      sections.push({
        key: 'ministry-only',
        tone: 'red',
        title: `ב${label} אך לא קיים במערכת`,
        description: 'רישומים שאין להם תלמיד במערכת - אולי ת"ז שגוי או חסר',
        rows,
      });
    }

    const entitledCount = type === 'dat'
      ? data.rows.filter((r) => r.entitlement === 'זכאי').length
      : data.rows.filter((r) => r.validity === 'תקין').length;

    return {
      sections,
      stats: {
        ministryTotal: data.rows.length,
        ministryEntitled: entitledCount,
        yeshivaActive: students.filter((s) => s.status === 'active' && belongsToMinistry(s, type)).length,
      },
    };
  };

  const comparisonDat = useMemo(() => buildComparison('dat'), [datData, students]); // eslint-disable-line react-hooks/exhaustive-deps
  const comparisonChinuch = useMemo(() => buildComparison('chinuch'), [chinuchData, students]); // eslint-disable-line react-hooks/exhaustive-deps

  // Combined comparison: students appearing in BOTH ministries (or conflicts)
  const comparisonCombined = useMemo(() => {
    if (!datData || !chinuchData || !students) return null;
    const datIds = new Set(datData.rows.map((r) => normalizeId(r.idNumber)).filter(Boolean));
    const chIds = new Set(chinuchData.rows.map((r) => normalizeId(r.idNumber)).filter(Boolean));

    const sections: CompareSection[] = [];

    // 1. Students marked is_chinuch but appear in Dat but not Chinuch
    {
      const rows: CompareRow[] = [];
      for (const s of students) {
        if (!s.is_chinuch) continue;
        if (s.status !== 'active') continue;
        const k = normalizeId(s.id_number || s.passport_number);
        if (!k) continue;
        if (chIds.has(k)) continue;
        rows.push({
          firstName: s.first_name,
          lastName: s.last_name,
          idNumber: s.id_number || s.passport_number || '',
          shiur: s.shiur || undefined,
          extra: datIds.has(k) ? 'רשום במשרד הדתות' : 'חסר בשני המשרדים',
        });
      }
      rows.sort(compareRows);
      sections.push({
        key: 'chinuch-missing-from-chinuch',
        tone: 'red',
        title: 'מסומן חינוך אצלנו אך אינו ברישום משרד החינוך',
        description: 'תלמידי חינוך שחסרים בדוח החינוך - דורש טיפול דחוף',
        rows,
      });
    }

    // 2. Students in Chinuch but not marked is_chinuch in our system
    {
      const rows: CompareRow[] = [];
      for (const r of chinuchData.rows) {
        const k = normalizeId(r.idNumber);
        if (!k) continue;
        const s = students.find((st) => normalizeId(st.id_number || st.passport_number) === k);
        if (!s) continue;
        if (s.is_chinuch) continue;
        rows.push({
          firstName: s.first_name || r.firstName,
          lastName: s.last_name || r.lastName,
          idNumber: r.idNumber,
          shiur: s.shiur || undefined,
          extra: `${r.classroom || ''} · סטטוס אצלנו: ${s.status}`,
        });
      }
      rows.sort(compareRows);
      sections.push({
        key: 'in-chinuch-not-flagged',
        tone: 'amber',
        title: 'ברישום משרד החינוך אך לא מסומן "חינוך" אצלנו',
        description: 'כנראה שצריך לסמן אותם כ"חינוך" בטאב חינוך',
        rows,
      });
    }

    // 3. Appears in BOTH ministries (double-registered - potentially fine, informational)
    {
      const rows: CompareRow[] = [];
      for (const k of datIds) {
        if (!chIds.has(k)) continue;
        const s = students.find((st) => normalizeId(st.id_number || st.passport_number) === k);
        if (!s) continue;
        rows.push({
          firstName: s.first_name || '',
          lastName: s.last_name || '',
          idNumber: s.id_number || s.passport_number || '',
          shiur: s.shiur || undefined,
          extra: `סטטוס: ${s.status}${s.is_chinuch ? ' · חינוך ✓' : ''}`,
        });
      }
      rows.sort(compareRows);
      sections.push({
        key: 'in-both',
        tone: 'blue',
        title: 'רשום בשני המשרדים (מידע)',
        description: 'תלמידים שמופיעים גם במשרד הדתות וגם במשרד החינוך',
        rows,
      });
    }

    return {
      sections,
      stats: {
        datTotal: datData.rows.length,
        chinuchTotal: chinuchData.rows.length,
        inBoth: [...datIds].filter((id) => chIds.has(id)).length,
      },
    };
  }, [datData, chinuchData, students]);

  const currentComparison =
    activeView === 'dat' ? comparisonDat
    : activeView === 'chinuch' ? comparisonChinuch
    : null;

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleString('he-IL'); } catch { return iso; }
  };

  const UploadBox = ({ type }: { type: MinistryType }) => {
    const data = type === 'dat' ? datData : chinuchData;
    const label = type === 'dat' ? 'משרד הדתות' : 'משרד החינוך';
    const ext = type === 'dat' ? '.csv' : '.xlsx';
    const icon = type === 'dat' ? '📜' : '📘';
    const isDragging = dragOver === type;
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(type); }}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(type); }}
        onDragLeave={() => setDragOver(null)}
        onDrop={(e) => handleDrop(type, e)}
        className={`border-2 rounded-lg p-4 transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-100 border-dashed'
            : 'border-gray-200 bg-gray-50'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-gray-800">{icon} {label}</h4>
          {data && (
            <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded">
              ✓ טעון ({data.rows.length} רשומות)
            </span>
          )}
        </div>
        {data && (
          <p className="text-xs text-gray-500 mb-2">
            {data.fileName} · הועלה {formatDate(data.uploadedAt)}
          </p>
        )}
        <p className="text-xs text-gray-500 mb-2">
          {isDragging ? '🎯 שחרר כאן...' : `גרור לכאן קובץ ${ext} או השתמש בכפתור`}
        </p>
        <div className="flex gap-2">
          <label className="flex-1 cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded text-sm font-medium border border-blue-200 text-center">
            {uploading === type ? 'מעלה...' : data ? 'החלף קובץ' : `📁 בחר ${ext}`}
            <input
              type="file"
              accept={type === 'dat' ? '.csv,text/csv' : '.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}
              onChange={(e) => handleFile(type, e)}
              disabled={uploading === type}
              className="hidden"
            />
          </label>
          {data && (
            <Button variant="secondary" onClick={() => handleClear(type)}>מחק</Button>
          )}
        </div>
      </div>
    );
  };

  const activeLabel = activeView === 'dat' ? 'משרד הדתות' : activeView === 'chinuch' ? 'משרד החינוך' : 'השוואה כללית';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg md:text-xl font-bold text-gray-900">השוואת דוחות משרדיים</h2>
          <Button variant="secondary" onClick={handleRecheck} disabled={loading} size="sm">
            {loading ? 'טוען...' : '🔄 בדוק מחדש'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="no-print">
          <p className="text-sm text-gray-600 mb-4">
            העלה את קבצי הדוח של משרד הדתות (CSV) ומשרד החינוך (XLSX).
            הנתונים יישמרו עד להעלאה חדשה. כשאתה משנה תלמידים בטאב אחר, לחץ &quot;בדוק מחדש&quot; כדי לרענן את ההשוואה.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <UploadBox type="dat" />
            <UploadBox type="chinuch" />
          </div>

          {parseError && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 mb-4 text-sm">
              {parseError}
            </div>
          )}

          {/* View selector */}
          <div className="flex gap-1 md:gap-2 border-b border-gray-200 mb-4 overflow-x-auto whitespace-nowrap">
            {(['dat', 'chinuch', 'combined'] as const).map((v) => {
              const enabled =
                v === 'dat' ? !!datData
                : v === 'chinuch' ? !!chinuchData
                : !!(datData && chinuchData);
              const label =
                v === 'dat' ? '📜 משרד הדתות'
                : v === 'chinuch' ? '📘 משרד החינוך'
                : '🔀 השוואה כללית';
              return (
                <button
                  key={v}
                  type="button"
                  disabled={!enabled}
                  onClick={() => setActiveView(v)}
                  className={`px-3 md:px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex-shrink-0 ${
                    activeView === v
                      ? 'border-blue-600 text-blue-700'
                      : enabled
                      ? 'border-transparent text-gray-500 hover:text-gray-700'
                      : 'border-transparent text-gray-300 cursor-not-allowed'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active comparison content */}
        {activeView !== 'combined' && currentComparison && (
          <ComparisonView
            title={activeLabel}
            stats={currentComparison.stats}
            sections={currentComparison.sections}
          />
        )}

        {activeView === 'combined' && comparisonCombined && (
          <ComparisonView
            title="השוואה כללית - דתות + חינוך"
            stats={comparisonCombined.stats}
            sections={comparisonCombined.sections}
            combined
          />
        )}

        {activeView !== 'combined' && !currentComparison && !loading && (
          <p className="text-sm text-gray-500 py-6 text-center">
            העלה קובץ של {activeLabel} כדי להתחיל השוואה
          </p>
        )}

        {activeView === 'combined' && !comparisonCombined && !loading && (
          <p className="text-sm text-gray-500 py-6 text-center">
            להשוואה כללית דרושים שני הקבצים - דתות וחינוך
          </p>
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

/* -------- Comparison display component -------- */
function ComparisonView({
  title,
  stats,
  sections,
  combined,
}: {
  title: string;
  stats: any;
  sections: CompareSection[];
  combined?: boolean;
}) {
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const toggleKey = (key: string) =>
    setCollapsedKeys((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const collapseAll = () => setCollapsedKeys(new Set(sections.map((s) => s.key)));
  const expandAll = () => setCollapsedKeys(new Set());
  const handlePrintPdf = () => window.print();
  return (
    <div className="print-area">
      <div className="hidden print:block mb-6">
        <h1 className="text-2xl font-bold text-center">{title}</h1>
        <p className="text-center text-sm text-gray-600 mt-2">
          הופק ב-{new Date().toLocaleDateString('he-IL')}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 mb-4">
        {combined ? (
          <>
            <StatCard label="דוח משרד הדתות" value={stats.datTotal} tone="blue" />
            <StatCard label="דוח משרד החינוך" value={stats.chinuchTotal} tone="purple" />
            <StatCard label="בשני המשרדים" value={stats.inBoth} tone="green" />
          </>
        ) : (
          <>
            <StatCard label={`בדוח ${title}`} value={stats.ministryTotal} tone="blue" sub={`${stats.ministryEntitled} זכאים/תקינים`} />
            <StatCard label="פעילים אצלנו" value={stats.yeshivaActive} tone="green" />
            <StatCard label="אי התאמות" value={sections.reduce((s, sec) => s + sec.rows.length, 0)} tone="gray" />
          </>
        )}
      </div>

      <div className="flex justify-between items-center mb-3 no-print gap-2 flex-wrap">
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={collapseAll}>
            🗜️ קפל הכל
          </Button>
          <Button size="sm" variant="secondary" onClick={expandAll}>
            📂 פתח הכל
          </Button>
        </div>
        <Button onClick={handlePrintPdf}>🖨️ ייצוא ל-PDF</Button>
      </div>

      <div className="space-y-5">
        {sections.map((section) => (
          <SectionBlock
            key={section.key}
            section={section}
            collapsed={collapsedKeys.has(section.key)}
            onToggle={() => toggleKey(section.key)}
          />
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone, sub }: { label: string; value: number; tone: string; sub?: string }) {
  const toneMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
  };
  return (
    <div className={`border rounded-lg p-2 md:p-3 ${toneMap[tone] || toneMap.gray}`}>
      <p className="text-xs text-gray-600 leading-tight">{label}</p>
      <p className="text-xl md:text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-gray-500 leading-tight">{sub}</p>}
    </div>
  );
}

function SectionBlock({
  section,
  collapsed,
  onToggle,
}: {
  section: CompareSection;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const toneClasses: Record<string, string> = {
    red: 'border-red-300 bg-red-50',
    amber: 'border-amber-300 bg-amber-50',
    blue: 'border-blue-300 bg-blue-50',
    purple: 'border-purple-300 bg-purple-50',
  };
  const titleClass: Record<string, string> = {
    red: 'text-red-800',
    amber: 'text-amber-800',
    blue: 'text-blue-800',
    purple: 'text-purple-800',
  };
  return (
    <div className={`border rounded-lg ${toneClasses[section.tone]} print:break-inside-avoid`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 md:px-4 py-2 md:py-3 border-b border-inherit text-start hover:bg-black/5 transition-colors flex items-start justify-between gap-2 md:gap-3 print:cursor-default"
      >
        <div className="flex-1 min-w-0">
          <h3 className={`font-bold text-sm md:text-base leading-tight ${titleClass[section.tone]}`}>
            {section.title} ({section.rows.length})
          </h3>
          <p className="text-xs text-gray-700 mt-1 leading-tight">{section.description}</p>
        </div>
        <span className={`text-xl ${titleClass[section.tone]} select-none no-print`}>
          {collapsed ? '▸' : '▾'}
        </span>
      </button>
      {collapsed ? null : section.rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-gray-500">✓ אין אי-התאמות בקטגוריה זו</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm bg-white">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">#</th>
                <th className="px-3 py-2 text-start font-semibold">שיעור</th>
                <th className="px-3 py-2 text-start font-semibold">שם משפחה</th>
                <th className="px-3 py-2 text-start font-semibold">שם פרטי</th>
                <th className="px-3 py-2 text-start font-semibold">ת״ז</th>
                <th className="px-3 py-2 text-start font-semibold">הערה</th>
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.shiur || '—'}</td>
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
}
