// Main Israeli banks - bank code → name
// Source: Bank of Israel published list

export interface Bank {
  code: number;
  name: string;
  shortName: string;
}

export const ISRAELI_BANKS: Bank[] = [
  { code: 3, name: 'בנק אש ישראל', shortName: 'אש' },
  { code: 4, name: 'בנק יהב לעובדי המדינה', shortName: 'יהב' },
  { code: 9, name: 'בנק הדואר', shortName: 'דואר' },
  { code: 10, name: 'בנק לאומי לישראל', shortName: 'לאומי' },
  { code: 11, name: 'בנק דיסקונט לישראל', shortName: 'דיסקונט' },
  { code: 12, name: 'בנק הפועלים', shortName: 'הפועלים' },
  { code: 13, name: 'בנק איגוד לישראל', shortName: 'איגוד' },
  { code: 14, name: 'בנק אוצר החייל', shortName: 'אוצר החייל' },
  { code: 15, name: 'אופק אגודת אשראי', shortName: 'אופק' },
  { code: 17, name: 'בנק מרכנתיל דיסקונט', shortName: 'מרכנתיל' },
  { code: 18, name: 'וואן זירו הבנק הדיגיטלי', shortName: 'וואן זירו' },
  { code: 20, name: 'בנק מזרחי טפחות', shortName: 'מזרחי טפחות' },
  { code: 21, name: 'נימה שפע ישראל', shortName: 'נימה שפע' },
  { code: 22, name: 'Citibank', shortName: 'Citibank' },
  { code: 23, name: 'HSBC', shortName: 'HSBC' },
  { code: 26, name: 'יובנק', shortName: 'יובנק' },
  { code: 31, name: 'הבנק הבינלאומי הראשון', shortName: 'בינלאומי' },
  { code: 34, name: 'בנק ערבי ישראלי', shortName: 'ערבי ישראלי' },
  { code: 35, name: 'GROW', shortName: 'GROW' },
  { code: 39, name: 'SBI State Bank of India', shortName: 'SBI' },
  { code: 46, name: 'בנק מסד', shortName: 'מסד' },
  { code: 47, name: 'גלובל רמיט', shortName: 'גלובל רמיט' },
  { code: 52, name: 'בנק פועלי אגודת ישראל (פאגי)', shortName: 'פאגי' },
  { code: 54, name: 'בנק ירושלים', shortName: 'ירושלים' },
  { code: 58, name: 'רי-וויר', shortName: 'רי-וויר' },
  { code: 59, name: 'בנק לפיתוח התעשייה', shortName: 'תעשייה' },
  { code: 68, name: 'בנק דקסיה ישראל', shortName: 'דקסיה' },
  { code: 71, name: 'בנק הספנות לישראל', shortName: 'הספנות' },
];

export function getBankByCode(code: number | string | null | undefined): Bank | null {
  if (code === null || code === undefined || code === '') return null;
  const n = Number(code);
  if (!Number.isFinite(n)) return null;
  return ISRAELI_BANKS.find((b) => b.code === n) || null;
}

// families has TWO bank columns: bank_number (code — what MASAV/finances use, the source
// of truth) and bank_name (text — legacy, from the Access import / old student card).
// Always write both together; read the code via familyBankCode().

const ALIASES: Record<number, string[]> = {
  20: ['מזרחי', 'טפחות'],
  31: ['הבינלאומי'],
  52: ['פאגי', 'פועלי אגודת ישראל', 'פאג"י'],
  12: ['פועלים'],
  14: ['אוצר החיל'],
  9: ['דואר', 'בנק הדואר'],
};

function normBankText(s: string): string {
  return s
    .replace(/(\S)["'״׳](\S)/g, '$1$2') // פאג"י → פאגי, בע"מ → בעמ
    .replace(/["'״׳()\-–.,]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && w !== 'בנק' && w !== 'בע"מ' && w !== 'בעמ')
    .map((w) => (w.length > 3 && w.startsWith('ה') ? w.slice(1) : w)) // הפועלים → פועלים
    .join(' ');
}

/**
 * Resolve a bank code from free text: "12", "012", "12 - הפועלים", "בנק הפועלים",
 * "פועלים", "מזרחי טפחות"… Returns null when unknown or ambiguous.
 */
export function bankCodeFromText(text: string | number | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const s = String(text).trim();
  if (!s) return null;
  const m = s.match(/^0*(\d{1,3})(?!\d)/);
  if (m) return Number(m[1]) || null;
  const n = normBankText(s);
  if (!n) return null;
  let best: { code: number; score: number } | null = null;
  let tie = false;
  for (const b of ISRAELI_BANKS) {
    for (const c of [b.shortName, b.name, ...(ALIASES[b.code] || [])].map(normBankText)) {
      if (!c) continue;
      if (c === n) return b.code;
      const score = n.includes(c) && c.length >= 3 ? c.length : c.includes(n) && n.length >= 3 ? n.length : 0;
      if (!score) continue;
      if (!best || score > best.score) { best = { code: b.code, score }; tie = false; }
      else if (score === best.score && best.code !== b.code) tie = true;
    }
  }
  return best && !tie ? best.code : null;
}

/** The family's bank code: bank_number, else derived from the legacy bank_name text. */
export function familyBankCode(f: { bank_number?: number | string | null; bank_name?: string | null } | null | undefined): number | null {
  if (!f) return null;
  const n = Number(f.bank_number);
  if (f.bank_number !== null && f.bank_number !== undefined && f.bank_number !== '' && Number.isFinite(n) && n > 0) return n;
  return bankCodeFromText(f.bank_name);
}

/** Display label "12 - הפועלים" (falls back to whatever is stored). */
export function bankLabel(f: { bank_number?: number | string | null; bank_name?: string | null } | null | undefined): string {
  if (!f) return '';
  const code = familyBankCode(f);
  const bank = getBankByCode(code);
  if (bank) return `${bank.code} - ${bank.shortName}`;
  if (code) return f.bank_name ? `${code} - ${f.bank_name}` : String(code);
  return f.bank_name || '';
}

/** The pair to write to families for a chosen bank code (keeps both columns in sync). */
export function bankColumns(code: number | string | null | undefined): { bank_number: number | null; bank_name: string | null } {
  const n = Number(code);
  if (code === null || code === undefined || code === '' || !Number.isFinite(n) || n <= 0) return { bank_number: null, bank_name: null };
  return { bank_number: n, bank_name: getBankByCode(n)?.shortName || null };
}
