import { Student } from './types';
import { SHIURIM, getShiurByName } from './shiurim';

// Re-export for convenience
export { SHIURIM };

// ============================================================================
// List report types catalog
// ============================================================================

export type ListReportId =
  | 'general' // דוח כללי - 3 columns
  | 'tests' // דוח מבחנים - 2 columns with 4 squares
  | 'multi_details' // דוח פרטים מרובים בקטן - table
  | 'details' // דוח פרטים - cards with photo
  | 'ram' // דוח ר"מ - 2 columns with 3 lines
  | 'photos' // דוח תמונות - names and photos
  | 'eligible' // דוח זכאים (משרד הדתות) - shiur/last/first/phone
  | 'custom' // מחולל דוחות - choose fields + export to Excel
  | 'bulk_update'; // ייצוא/ייבוא אקסל לפי שיעור לעדכון נתונים

export interface ListReportDef {
  id: ListReportId;
  name: string;
  description: string;
  icon: string;
}

export const LIST_REPORTS: ListReportDef[] = [
  {
    id: 'general',
    name: 'דוח כללי',
    description: 'רשימת תלמידים בשלוש עמודות לפי שם משפחה',
    icon: '📋',
  },
  {
    id: 'tests',
    name: 'דוח מבחנים',
    description: 'שני עמודות עם ארבע משבצות לכל תלמיד',
    icon: '📝',
  },
  {
    id: 'multi_details',
    name: 'דוח פרטים מרובים בקטן',
    description: 'טבלה עם פרטי כל התלמידים',
    icon: '📊',
  },
  {
    id: 'details',
    name: 'דוח פרטים',
    description: 'כרטיסי פרטים עם תמונה לכל תלמיד',
    icon: '🪪',
  },
  {
    id: 'ram',
    name: 'דוח ר"מ',
    description: 'שני עמודות ממוספרות עם שלושה קווים לכל תלמיד',
    icon: '✍️',
  },
  {
    id: 'photos',
    name: 'דוח תמונות',
    description: 'שם וצילום של כל תלמיד',
    icon: '📸',
  },
  {
    id: 'eligible',
    name: 'דוח זכאים (משרד הדתות)',
    description: 'רק תלמידים שמופיעים בדוח האחרון של משרד הדתות כ"זכאי"',
    icon: '✅',
  },
  {
    id: 'custom',
    name: 'מחולל דוחות',
    description: 'בחר שדות + סינון וייצא לאקסל',
    icon: '⚙️',
  },
  {
    id: 'bulk_update',
    name: 'עדכון לפי שיעור (אקסל)',
    description: 'ייצא שיעור, מלא פרטים באקסל, והעלה לעדכון המערכת',
    icon: '📤',
  },
];

export function getListReport(id: ListReportId): ListReportDef | undefined {
  return LIST_REPORTS.find((r) => r.id === id);
}

// ============================================================================
// Sorting & filtering
// ============================================================================

// Sort by last name then first name in Hebrew
export function sortStudentsByName(students: Student[]): Student[] {
  return [...students].sort((a, b) => {
    const lastCompare = (a.last_name || '').localeCompare(b.last_name || '', 'he');
    if (lastCompare !== 0) return lastCompare;
    return (a.first_name || '').localeCompare(b.first_name || '', 'he');
  });
}

// Group students by shiur, in shiur order (א, ב, ג, ..., קיבוץ)
// Inside each group, sort by last_name then first_name.
// Returns array of {shiur, students} groups for easy rendering with page breaks.
export function groupStudentsByShiur(students: Student[]): Array<{ shiur: string; students: Student[] }> {
  // Use the canonical shiur order from SHIURIM
  const order = SHIURIM.map((s) => s.name);

  const grouped: Record<string, Student[]> = {};
  for (const s of students) {
    const key = s.shiur || '—';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }

  // Sort inside each group
  for (const key of Object.keys(grouped)) {
    grouped[key] = sortStudentsByName(grouped[key]);
  }

  // Return in canonical order
  const result: Array<{ shiur: string; students: Student[] }> = [];
  for (const name of order) {
    if (grouped[name]?.length) {
      result.push({ shiur: name, students: grouped[name] });
      delete grouped[name];
    }
  }
  // Remaining (unknown) shiurim at the end
  for (const key of Object.keys(grouped)) {
    result.push({ shiur: key, students: grouped[key] });
  }
  return result;
}

// The "מקבילה" (parallel class) of a student: equivalent_number, falling back
// to equivalent_year. '' when the student has none.
export function makbilaOf(s: Student): string {
  const v = (s as any).equivalent_number ?? (s as any).equivalent_year;
  return v === null || v === undefined || v === '' ? '' : String(v);
}

// Group by shiur (canonical order) then by מקבילה (numeric-ish sort, blank last).
// Each entry is one printable page: {shiur, makbila, label, students}.
export function groupByShiurThenMakbila(
  students: Student[]
): { shiur: string; makbila: string; label: string; students: Student[] }[] {
  const out: { shiur: string; makbila: string; label: string; students: Student[] }[] = [];
  for (const grp of groupStudentsByShiur(students)) {
    const byMak: Record<string, Student[]> = {};
    for (const s of grp.students) {
      const m = makbilaOf(s);
      (byMak[m] ||= []).push(s);
    }
    const keys = Object.keys(byMak).sort((a, b) => {
      if (a === '' && b !== '') return 1;
      if (b === '' && a !== '') return -1;
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b, 'he');
    });
    for (const m of keys) {
      out.push({
        shiur: grp.shiur,
        makbila: m,
        label: m ? `${grp.shiur} ${m}` : grp.shiur,
        students: sortStudentsByName(byMak[m]),
      });
    }
  }
  return out;
}

// Get short letter for a shiur (e.g., 'שיעור א' → 'א', 'קיבוץ' → 'ק')
export function getShiurLetter(shiurName: string): string {
  const shiur = getShiurByName(shiurName);
  return shiur?.shortName || shiurName || '';
}

// List of shiurim that can be selected as filter
export function getShiurFilterOptions() {
  return [
    { value: '', label: 'כל השיעורים' },
    ...SHIURIM.map((s) => ({ value: s.name, label: s.name })),
  ];
}

// Format date DD/MM/YYYY from YYYY-MM-DD
export function formatDateShort(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const parts = isoDate.slice(0, 10).split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
