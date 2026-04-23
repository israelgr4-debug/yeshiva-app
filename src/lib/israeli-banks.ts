// Main Israeli banks - bank code → name
// Source: Bank of Israel published list

export interface Bank {
  code: number;
  name: string;
  shortName: string;
}

export const ISRAELI_BANKS: Bank[] = [
  { code: 4, name: 'בנק יהב לעובדי המדינה', shortName: 'יהב' },
  { code: 9, name: 'בנק הדואר', shortName: 'דואר' },
  { code: 10, name: 'בנק לאומי לישראל', shortName: 'לאומי' },
  { code: 11, name: 'בנק דיסקונט לישראל', shortName: 'דיסקונט' },
  { code: 12, name: 'בנק הפועלים', shortName: 'הפועלים' },
  { code: 13, name: 'בנק איגוד לישראל', shortName: 'איגוד' },
  { code: 14, name: 'בנק אוצר החייל', shortName: 'אוצר החייל' },
  { code: 17, name: 'בנק מרכנתיל דיסקונט', shortName: 'מרכנתיל' },
  { code: 20, name: 'בנק מזרחי טפחות', shortName: 'מזרחי טפחות' },
  { code: 22, name: 'Citibank', shortName: 'Citibank' },
  { code: 23, name: 'HSBC', shortName: 'HSBC' },
  { code: 26, name: 'יובנק', shortName: 'יובנק' },
  { code: 31, name: 'הבנק הבינלאומי הראשון', shortName: 'בינלאומי' },
  { code: 39, name: 'SBI State Bank of India', shortName: 'SBI' },
  { code: 46, name: 'בנק מסד', shortName: 'מסד' },
  { code: 52, name: 'בנק פועלי אגודת ישראל (פאגי)', shortName: 'פאגי' },
  { code: 54, name: 'בנק ירושלים', shortName: 'ירושלים' },
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
