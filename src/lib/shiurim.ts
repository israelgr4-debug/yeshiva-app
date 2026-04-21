// Shiurim (class levels) and machzor (cohort) configuration
// Machzor is derived from shiur at the time a student enrolls, and stays with them forever.

export interface ShiurDef {
  index: number; // 0-based position
  name: string; // Full name (e.g., 'שיעור א')
  shortName: string; // Short form (e.g., 'א')
  isKibutz?: boolean;
}

// Ordered list of shiurim. Order determines advancement direction.
export const SHIURIM: ShiurDef[] = [
  { index: 0, name: 'שיעור א', shortName: 'א' },
  { index: 1, name: 'שיעור ב', shortName: 'ב' },
  { index: 2, name: 'שיעור ג', shortName: 'ג' },
  { index: 3, name: 'שיעור ד', shortName: 'ד' },
  { index: 4, name: 'שיעור ה', shortName: 'ה' },
  { index: 5, name: 'שיעור ו', shortName: 'ו' },
  { index: 6, name: 'שיעור ז', shortName: 'ז' },
  { index: 7, name: 'שיעור ח', shortName: 'ח' },
  { index: 8, name: 'שיעור ט', shortName: 'ט' },
  { index: 9, name: 'שיעור י', shortName: 'י' },
  { index: 10, name: 'שיעור יא', shortName: 'יא' },
  { index: 11, name: 'קיבוץ', shortName: 'קיבוץ', isKibutz: true },
];

export const LAST_REGULAR_SHIUR_INDEX = 10; // שיעור יא
export const KIBUTZ_INDEX = 11;

// Get shiur definition by name
export function getShiurByName(name: string): ShiurDef | undefined {
  return SHIURIM.find((s) => s.name === name);
}

// Get shiur by index
export function getShiurByIndex(index: number): ShiurDef | undefined {
  return SHIURIM.find((s) => s.index === index);
}

// Get the next shiur (for year advancement)
export function getNextShiur(currentShiurName: string): ShiurDef | null {
  const current = getShiurByName(currentShiurName);
  if (!current) return null;

  // Kibutz stays in kibutz (students don't advance from there in our system)
  if (current.isKibutz) return current;

  // שיעור יא → קיבוץ
  if (current.index === LAST_REGULAR_SHIUR_INDEX) {
    return SHIURIM[KIBUTZ_INDEX];
  }

  return SHIURIM[current.index + 1] || null;
}

// ===== MACHZOR MAPPING =====
// Current mapping (base year תשפ"ו):
//   שיעור א = מחזור כו (26) ← newest / highest number
//   שיעור ב = מחזור כה (25)
//   שיעור ג = מחזור כד (24)
//   ...
//   שיעור יא = מחזור טז (16) ← oldest / lowest number
//
// Rule: machzor_number = BASE_MACHZOR - shiur.index (DESCENDING)
// BASE_MACHZOR is the machzor that שיעור א receives in the current school year.
// When advancing a year, BASE_MACHZOR does NOT change for existing students
// (their machzor stays), but NEW enrollments will get a different mapping
// based on the updated BASE_MACHZOR setting.
//
// Kibutz: students keep the machzor they had in שיעור יא. The kibbutz
// actually holds many machzorim at once (one per year cohort).

export const DEFAULT_BASE_MACHZOR = 26; // תשפ"ו default - 'שיעור א' → מחזור כו (26)

// Compute machzor number for a new student joining in a specific shiur
// Returns null for Kibutz (they should bring their own machzor from before)
export function getMachzorForNewStudent(
  shiurName: string,
  baseMachzor: number = DEFAULT_BASE_MACHZOR
): number | null {
  const shiur = getShiurByName(shiurName);
  if (!shiur) return null;
  if (shiur.isKibutz) return null; // Kibutz needs manual machzor assignment
  return baseMachzor - shiur.index;
}

// Hebrew numerals helper: convert a number (1-999) to Hebrew letters (e.g., 25 → 'כה')
export function numberToHebrewLetters(num: number): string {
  if (num <= 0 || num >= 1000) return String(num);

  const hundreds = ['', 'ק', 'ר', 'ש', 'ת', 'תק', 'תר', 'תש', 'תת', 'תתק'];
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];

  const h = Math.floor(num / 100);
  let t = Math.floor((num % 100) / 10);
  let o = num % 10;

  // Special cases: 15 → טו (not יה), 16 → טז (not יו)
  let tensPart = tens[t];
  let onesPart = ones[o];

  if (t === 1 && o === 5) {
    tensPart = '';
    onesPart = 'טו';
  } else if (t === 1 && o === 6) {
    tensPart = '';
    onesPart = 'טז';
  }

  const result = hundreds[h] + tensPart + onesPart;
  // Add gershayim if multiple letters
  if (result.length > 1) {
    return result.slice(0, -1) + '"' + result.slice(-1);
  }
  // Add single geresh
  if (result.length === 1) {
    return result + "'";
  }
  return result;
}

// Get Hebrew display name for a machzor number, e.g., 25 → 'מחזור כ"ה'
export function formatMachzorName(num: number): string {
  return `מחזור ${numberToHebrewLetters(num)}`;
}
