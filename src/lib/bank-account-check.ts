/**
 * Israeli bank account validation — EXACT implementation of the official מס"ב spec
 * "בדיקות חוקיות מספרי חשבון לטובת בדיקות המשתתפים לפני שליחת תנועה למס"ב"
 * (version 25/05/26 — the manager's PDF `2026-05-25-Bdikat_hukiot_Heshbon`).
 *
 * Notation (as in the spec): branch = S T U (3 digits, zero-padded); account = the
 * 9-digit, zero-padded number A B C D E F G H X (X = rightmost / check digit).
 * Weights below are listed in that left-to-right order.
 *
 * Results:
 *   'valid'       - passes the bank's official rule
 *   'bad-check'   - structure OK but FAILS the official rule (almost certainly a typo)
 *   'structural'  - structure OK; the bank has no rule (Jerusalem, Indian…) or no bank code
 *   'invalid'     - missing / non-numeric / too long
 */
export type AccountCheckResult = 'valid' | 'structural' | 'invalid' | 'bad-check';

export interface AccountCheckDetail {
  result: AccountCheckResult;
  /** Hebrew explanation of what was checked / why it failed (tooltips & the checker). */
  reason: string;
}

const dot = (digits: string, weights: number[]) =>
  weights.reduce((sum, w, i) => sum + w * Number(digits[i] || 0), 0);
const mod97 = (numStr: string) => Number(BigInt(numStr || '0') % BigInt(97));
const ok = (label: string): AccountCheckDetail => ({ result: 'valid', reason: `עבר בדיקת ${label}` });
const bad = (reason: string): AccountCheckDetail => ({ result: 'bad-check', reason });

// Leumi group (10, 34): B..G ×7..2 + branch ×10,9,8. For each account type T the check
// digits HX = 100 − (sum+T) mod 100 (or 00). Type 110 only when digits F,G ∈ {20,23,00}.
function leumi(br: string, acc: string): AccountCheckDetail {
  const sum = dot(acc.slice(1, 7), [7, 6, 5, 4, 3, 2]) + dot(br, [10, 9, 8]);
  const hx = Number(acc.slice(7, 9));
  const types = [330, 340, 180, 128, ...(['20', '23', '00'].includes(acc.slice(5, 7)) ? [110] : [])];
  const pass = types.some((t) => { const r = (sum + t) % 100; return (r === 0 ? 0 : 100 - r) === hx; });
  return pass ? ok('קבוצת לאומי') : bad(`קבוצת לאומי: ספרות הביקורת ${acc.slice(7)} לא מתאימות לאף סוג חשבון`);
}

// Branch S T U ×9,8,7 + account D..X ×6..1, mod 11.
function branch6(br: string, acc: string, allowed: number[], label: string): AccountCheckDetail {
  const r = (dot(br, [9, 8, 7]) + dot(acc.slice(3), [6, 5, 4, 3, 2, 1])) % 11;
  return allowed.includes(r) ? ok(label) : bad(`${label}: שארית ${r} (מותר ${allowed.join('/')})`);
}

const otsarAllowed = (b: number) =>
  [361, 362, 363].includes(b) ? [0, 2, 4] : [347, 365, 384, 385].includes(b) ? [0, 2] : [0];
const MASSAD_02 = [154, 166, 178, 181, 183, 191, 192, 503, 505, 507, 515, 516, 527, 539];

/** check digits CC = 98 − (prefix mod 97) */
function mod97check(prefix: string, cc: string, label: string): AccountCheckDetail {
  const want = 98 - mod97(prefix);
  return want === Number(cc) ? ok(label) : bad(`${label}: ספרות ביקורת ${cc}, צפוי ${String(want).padStart(2, '0')}`);
}

export function checkBankAccount(
  bankCode: number | string | null | undefined,
  branch: string | number | null | undefined,
  account: string | number | null | undefined
): AccountCheckDetail {
  const accRaw = String(account ?? '').trim();
  const brRaw = String(branch ?? '').trim();
  if (!accRaw) return { result: 'invalid', reason: 'חסר מספר חשבון' };
  if (!brRaw) return { result: 'invalid', reason: 'חסר סניף' };
  if (/[^\d\s-]/.test(accRaw)) return { result: 'invalid', reason: 'מספר החשבון מכיל תווים שאינם ספרות' };
  if (/[^\d\s]/.test(brRaw)) return { result: 'invalid', reason: 'הסניף מכיל תווים שאינם ספרות' };
  const accSig = accRaw.replace(/\D/g, '').replace(/^0+/, '');
  const brSig = brRaw.replace(/\D/g, '').replace(/^0+/, '');
  if (!accSig) return { result: 'invalid', reason: 'מספר חשבון 0' };
  if (accSig.length > 9) return { result: 'invalid', reason: `מספר חשבון ארוך מדי (${accSig.length} ספרות, מקסימום 9)` };
  if (brSig.length > 3) return { result: 'invalid', reason: 'סניף ארוך מ-3 ספרות' };
  const acc = accSig.padStart(9, '0');        // A B C D E F G H X
  const br = (brSig || '0').padStart(3, '0'); // S T U
  const b = Number(br);
  const bank = Number(bankCode);
  if (bankCode === null || bankCode === undefined || bankCode === '' || !Number.isFinite(bank) || bank <= 0) {
    return { result: 'structural', reason: 'אין מספר בנק — לא ניתן לבדוק' };
  }

  switch (bank) {
    case 10: case 34:                                  // לאומי, ערבי ישראלי
      return leumi(br, acc);
    case 13: {                                         // אגוד (מוזג למזרחי 2022)
      const v = (dot(acc.slice(1, 7), [7, 6, 5, 4, 3, 2]) + dot(br, [10, 9, 8]) + Number(acc.slice(7))) % 100;
      return [90, 72, 70, 60, 20].includes(v) ? ok('בנק אגוד') : bad(`בנק אגוד: תוצאה ${v} (מותר 90/72/70/60/20)`);
    }
    case 12: return branch6(br, acc, [0, 2, 4, 6], 'בנק הפועלים');
    case 4: return branch6(br, acc, [0, 2], 'בנק יהב');
    case 20: {                                         // מזרחי טפחות: סניפים 401-799 → −400
      const eff = b >= 401 && b <= 799 ? String(b - 400).padStart(3, '0') : br;
      return branch6(eff, acc, [0, 2, 4], 'מזרחי טפחות');
    }
    case 11: case 17: {                                // דיסקונט, מרכנתיל
      const r = dot(acc, [9, 8, 7, 6, 5, 4, 3, 2, 1]) % 11;
      return [0, 2, 4].includes(r) ? ok('קבוצת דיסקונט') : bad(`קבוצת דיסקונט: שארית ${r} (מותר 0/2/4)`);
    }
    case 31: case 52: {                                // בינלאומי, פאג"י
      const r1 = dot(acc, [9, 8, 7, 6, 5, 4, 3, 2, 1]) % 11;
      if ([0, 6].includes(r1)) return ok('קבוצת הבינלאומי');
      const r2 = dot(acc.slice(3), [6, 5, 4, 3, 2, 1]) % 11;
      if ([0, 6].includes(r2)) return ok('קבוצת הבינלאומי (שלב ב)');
      if (bank === 31 && branch6(br, acc, otsarAllowed(b), '').result === 'valid') return ok('הבינלאומי (שלב ג)');
      return bad(`קבוצת הבינלאומי: שאריות ${r1} / ${r2} (מותר 0/6)`);
    }
    case 14: return branch6(br, acc, otsarAllowed(b), 'אוצר החייל');
    case 46: return branch6(br, acc, MASSAD_02.includes(b) ? [0, 2] : [0], 'בנק מסד');
    case 9: {                                          // הדואר — mod 10
      const r = dot(acc, [9, 8, 7, 6, 5, 4, 3, 2, 1]) % 10;
      return r === 0 ? ok('בנק הדואר') : bad(`בנק הדואר: שארית ${r} (חייב 0)`);
    }
    case 22: {                                         // סיטיבנק
      const want = 11 - (dot(acc.slice(0, 8), [3, 2, 7, 6, 5, 4, 3, 2]) % 11);
      return want === Number(acc[8]) ? ok('סיטיבנק') : bad(`סיטיבנק: ספרת ביקורת ${acc[8]}, צפוי ${want}`);
    }
    case 23:                                           // HSBC
      if (b === 101) return ['4', '9'].includes(acc[6]) ? ok('HSBC') : bad('HSBC סניף 101: הספרה השביעית חייבת להיות 4 או 9');
      if (b === 102) return acc.endsWith('001') ? ok('HSBC') : bad('HSBC סניף 102: החשבון חייב להסתיים ב-001');
      return { result: 'structural', reason: 'HSBC — אין כלל לסניף זה' };
    case 18: return mod97check(br + acc.slice(0, 7), acc.slice(7), 'וואן זירו');
    case 15: return mod97check(br + acc.slice(0, 7), acc.slice(7), 'אופק');
    case 79: return mod97check(br + acc.slice(0, 7), acc.slice(7), '019 שירותי תשלום');
    case 35: case 69: {                                // GROW, GMT — סניף + חשבון ללא ריפוד
      if (b >= 900) return ok('(סניף 900+ ללא בדיקה)');
      if (accSig.length < 3) return bad('מספר חשבון קצר מדי');
      return mod97check(String(b) + accSig.slice(0, -2), accSig.slice(-2), bank === 35 ? 'GROW' : 'GMT');
    }
    case 94:                                           // הפניקס גמא
      return mod97(br + acc) === 0 ? ok('הפניקס גמא') : bad('הפניקס גמא: לא מתחלק ב-97');
    case 3: {                                          // בנק אש
      const r = dot(acc, [9, 8, 7, 6, 5, 4, 3, 2, 1]) % 11;
      return r === 0 ? ok('בנק אש') : bad(`בנק אש: שארית ${r} (חייב 0)`);
    }
    case 47: {                                         // גלובל רמיט
      const want = 11 - (dot(acc.slice(0, 8), [9, 8, 6, 4, 3, 7, 2, 5]) % 11);
      return want === Number(acc[8]) ? ok('גלובל רמיט') : bad(`גלובל רמיט: ספרת ביקורת ${acc[8]}, צפוי ${want}`);
    }
    case 21: {                                         // נימה שפע
      const r = dot(acc.slice(1), [8, 7, 6, 5, 4, 3, 2, 1]) % 11;
      return [0, 2].includes(r) ? ok('נימה שפע') : bad(`נימה שפע: שארית ${r} (מותר 0/2)`);
    }
    case 58: {                                         // רי-וויר
      const r = dot(acc, [9, 2, 3, 4, 5, 6, 7, 8, 1]) % 11;
      return r === 0 ? ok('רי-וויר') : bad(`רי-וויר: שארית ${r} (חייב 0)`);
    }
    case 1: {                                          // ישראכרט
      const r = (dot(br, [10, 9, 8]) + dot(acc.slice(2), [7, 6, 5, 4, 3, 2, 1])) % 11;
      return r === 0 ? ok('ישראכרט') : bad(`ישראכרט: שארית ${r} (חייב 0)`);
    }
    case 6: {                                          // מקס איט פיננסים — mod 10
      const want = dot(acc.slice(0, 8), [2, 3, 4, 5, 6, 7, 8, 9]) % 10;
      return want === Number(acc[8]) ? ok('מקס') : bad(`מקס: ספרת ביקורת ${acc[8]}, צפוי ${want}`);
    }
    case 54: return { result: 'structural', reason: 'לבנק ירושלים אין כלל בדיקה (לפי מס״ב)' };
    case 39: return { result: 'structural', reason: 'לבנק ההודי אין כלל בדיקה (לפי מס״ב)' };
    default: return { result: 'structural', reason: `לבנק ${bank} אין כלל בדיקה במפרט מס״ב` };
  }
}

export function validateBankAccountFull(
  bankCode: number | string | null | undefined,
  branch: string | number | null | undefined,
  account: string | null | undefined
): AccountCheckResult {
  return checkBankAccount(bankCode, branch, account).result;
}
