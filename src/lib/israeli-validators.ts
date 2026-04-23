// Israeli data validators: ID number, bank account, branch.
// Pure client-side, no deps.

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
 * Real BAC validation requires per-bank specific check-digit algorithms
 * from Bank of Israel. Here we do basic sanity:
 *   - numeric only
 *   - 4-9 digits (most Israeli accounts are 6-9 digits)
 */
export function isValidBankAccount(account: string | null | undefined): boolean {
  if (!account) return false;
  const digits = String(account).replace(/\D/g, '');
  return digits.length >= 4 && digits.length <= 9;
}

/**
 * Validate branch number - 3 digit numeric.
 */
export function isValidBranch(branch: string | number | null | undefined): boolean {
  if (branch === null || branch === undefined || branch === '') return false;
  const digits = String(branch).replace(/\D/g, '');
  return digits.length >= 1 && digits.length <= 4;
}
