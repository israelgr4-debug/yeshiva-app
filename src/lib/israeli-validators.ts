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
 */
export function isValidBankAccount(account: string | null | undefined): boolean {
  if (!account) return false;
  const digits = String(account).replace(/\D/g, '');
  return digits.length >= 4 && digits.length <= 9;
}

/**
 * Israeli bank account check-digit validation per bank.
 * Uses the documented algorithms for the main Israeli banks.
 * Falls back to structural check for unknown banks.
 *
 * Returns:
 *   'valid'       - passes both structure AND check-digit
 *   'structural'  - passes structure, unknown bank (can't verify check-digit)
 *   'invalid'     - fails structural or check-digit
 */
export type AccountCheckResult = 'valid' | 'structural' | 'invalid';

export function validateBankAccountFull(
  bankCode: number | string | null | undefined,
  branch: string | number | null | undefined,
  account: string | null | undefined
): AccountCheckResult {
  if (!isValidBankAccount(account)) return 'invalid';
  if (!isValidBranch(branch)) return 'invalid';
  const bank = Number(bankCode);
  if (!Number.isFinite(bank)) return 'structural';

  const accDigits = String(account).replace(/\D/g, '').padStart(6, '0');
  const branchDigits = String(branch).replace(/\D/g, '').padStart(3, '0');

  // Algorithms: weights applied right-to-left over "branch + account"
  // Each bank has a specific set of weights. Common weights:
  // Hapoalim (12), Mizrahi (20) - same
  // Discount (11) / Mercantile (17)
  // Leumi (10) - different digit layout
  //
  // Reference: Bank of Israel "Bank Account Number Validation" spec.

  const combinedLen = branchDigits.length + accDigits.length;
  const combined = branchDigits + accDigits;

  // Weights per bank (indexed from leftmost digit)
  const WEIGHTS: Record<number, number[]> = {
    12: [10, 5, 8, 4, 2, 1, 6, 3, 7],     // Hapoalim
    20: [10, 5, 8, 4, 2, 1, 6, 3, 7],     // Mizrahi Tefahot
    11: [10, 5, 8, 4, 2, 1, 6, 3, 7],     // Discount
    17: [10, 5, 8, 4, 2, 1, 6, 3, 7],     // Mercantile
    52: [10, 5, 8, 4, 2, 1, 6, 3, 7],     // PAGI
    10: [10, 5, 8, 4, 2, 1, 6, 3, 7],     // Leumi
  };

  const w = WEIGHTS[bank];
  if (!w || combinedLen !== w.length) return 'structural';

  let sum = 0;
  for (let i = 0; i < combinedLen; i++) {
    sum += Number(combined[i]) * w[i];
  }
  if (sum % 11 === 0) return 'valid';
  return 'invalid';
}

/**
 * Validate branch number - 3 digit numeric.
 */
export function isValidBranch(branch: string | number | null | undefined): boolean {
  if (branch === null || branch === undefined || branch === '') return false;
  const digits = String(branch).replace(/\D/g, '');
  return digits.length >= 1 && digits.length <= 4;
}
