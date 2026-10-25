// Israeli data validators: ID number, bank account, branch.
// Pure client-side, no deps.

/** Digits only, with leading zeros stripped. '012345' → '12345'. */
export function stripIdLeadingZeros(id: string | null | undefined): string {
  return String(id || '').replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * Candidate stored forms of an ID for matching that ignores leading zeros.
 * Returns the stripped digits plus every zero-padded length up to 9, so a
 * search of '12345' matches a stored '012345' / '0012345' and vice-versa.
 * Use with PostgREST: `.in('father_id_number', idMatchVariants(x))`.
 */
export function idMatchVariants(id: string | null | undefined): string[] {
  const d = stripIdLeadingZeros(id);
  if (!d) return [];
  const out = new Set<string>([d]);
  for (let len = d.length; len <= 9; len++) out.add(d.padStart(len, '0'));
  return Array.from(out);
}

/**
 * Validate Israeli ID number (תעודת זהות) using the official check-digit algorithm.
 * Accepts 5-9 digit numbers. Pads left to 9 digits, then verifies check digit.
 * Returns true for valid 9-digit Israeli IDs only.
 */
export function isValidIsraeliId(id: string | null | undefined): boolean {
  if (!id) return false;
  const digits = String(id).replace(/\D/g, '');
  if (digits.length < 5 || digits.length > 9) return false;
  const padded = digits.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(padded[i]);
    d *= (i % 2) + 1;
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Validate Israeli bank account number - simple structural check.
 */
export function isValidBankAccount(account: string | null | undefined): boolean {
  if (!account) return false;
  // Ignore leading zeros (accounts are often stored zero-padded, e.g. "0088309500").
  const digits = String(account).replace(/\D/g, '').replace(/^0+/, '');
  return digits.length >= 1 && digits.length <= 9;
}

// Official מס"ב account-validation rules live in bank-account-check.ts.
export { checkBankAccount, validateBankAccountFull } from './bank-account-check';
export type { AccountCheckResult, AccountCheckDetail } from './bank-account-check';

/**
 * Validate branch number - 3 digit numeric.
 */
export function isValidBranch(branch: string | number | null | undefined): boolean {
  if (branch === null || branch === undefined || branch === '') return false;
  const digits = String(branch).replace(/\D/g, '');
  return digits.length >= 1 && digits.length <= 4;
}
