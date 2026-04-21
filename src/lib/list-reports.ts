import { Student } from './types';
import { SHIURIM, getShiurByName } from './shiurim';

// ============================================================================
// List report types catalog
// ============================================================================

export type ListReportId =
  | 'general' // דוח כללי - 3 columns
  | 'tests' // דוח מבחנים - 2 columns with 4 squares
  | 'multi_details' // דוח פרטים מרובים בקטן - table
  | 'details' // דוח פרטים - cards with photo
  | 'ram' // דוח ר"מ - 2 columns with 3 lines
  | 'photos'; // דוח תמונות - names and photos

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
