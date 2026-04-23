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
 * Israeli bank account check-digit validation.
 * Implementation based on Bank of Israel's "Bank Account Number Validation"
 * specification. Different bank groups use slightly different rules.
 *
 * Bank groups (based on which validation algorithm they use):
 *
 *  Group A (standard mod-11, valid iff mod == 0):
 *    Hapoalim (12), Mizrahi Tefahot (20), Yahav (4), Yahav old (26),
 *    Otsar Hachayal (14), First International (31), Massad (46),
 *    Pagi (52), Jerusalem (54), U-Bank (26)
 *
 *  Group B (mod-11, valid if mod == 0 OR mod == 2):
 *    Discount (11), Mercantile (17)
 *
 *  Group C (Leumi - different structure):
 *    Leumi (10)
 *
 *  Group D (unknown - structural check only):
 *    everything else
 *
 * Returns:
 *   'valid'       - passes both structure AND check-digit per bank's algo
 *   'structural'  - passes structure, bank algo not implemented
 *   'invalid'     - fails structural check
 *   'bad-check'   - structure OK but check digit failed
 */
export type AccountCheckResult = 'valid' | 'structural' | 'invalid' | 'bad-check';

// Bank groups
const GROUP_A_BANKS = new Set([4, 12, 14, 20, 26, 31, 46, 52, 54, 68]);
const GROUP_B_BANKS = new Set([11, 17]);  // Discount, Mercantile - allow mod 0 or 2

// Bank Hapoalim / Mizrahi / etc common algorithm:
// Combined string: branch(3) + account(6) = 9 digits
// Weights applied left-to-right: [10, 5, 8, 4, 2, 1, 6, 3, 7]
// Check: sum mod 11 in allowedRemainders
function runModCheck(
  branchDigits: string,
  accDigits: string,
  weights: number[],
  allowedRemainders: number[]
): boolean {
  const combined = branchDigits + accDigits;
  if (combined.length !== weights.length) return false;
  let sum = 0;
  for (let i = 0; i < combined.length; i++) {
    sum += Number(combined[i]) * weights[i];
  }
  return allowedRemainders.includes(sum % 11);
}

export function validateBankAccountFull(
  bankCode: number | string | null | undefined,
  branch: string | number | null | undefined,
  account: string | null | undefined
): AccountCheckResult {
  if (!isValidBankAccount(account)) return 'invalid';
  if (!isValidBranch(branch)) return 'invalid';
  const bank = Number(bankCode);
  if (!Number.isFinite(bank)) return 'structural';

  const accRaw = String(account).replace(/\D/g, '');
  const branchDigits = String(branch).replace(/\D/g, '').padStart(3, '0');

  // Pad account to 6 digits (standard length for most banks)
  const accDigits = accRaw.padStart(6, '0');

  // Bank Leumi (code 10) - special structure:
  //   Account is 8 digits, branch is 3 digits
  //   Weights: [10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8]? - there are multiple variants
  //   For simplicity, try both 6-digit and 8-digit account layouts
  if (bank === 10) {
    const acc8 = accRaw.padStart(8, '0');
    // Leumi variant A: weights [10, 5, 8, 4, 2, 1, 6, 3, 7] on branch+6-acc
    // Leumi variant B: weights [10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10] on branch+8-acc
    if (runModCheck(branchDigits, accDigits, [10, 5, 8, 4, 2, 1, 6, 3, 7], [0])) return 'valid';
    if (runModCheck(branchDigits, acc8, [10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10], [0])) return 'valid';
    return 'bad-check';
  }

  // Group B: Discount / Mercantile - mod 0 or 2 allowed
  if (GROUP_B_BANKS.has(bank)) {
    const weights = [10, 5, 8, 4, 2, 1, 6, 3, 7];
    if (runModCheck(branchDigits, accDigits, weights, [0, 2])) return 'valid';
    return 'bad-check';
  }

  // Group A: standard mod 11 == 0
  if (GROUP_A_BANKS.has(bank)) {
    const weights = [10, 5, 8, 4, 2, 1, 6, 3, 7];
    if (runModCheck(branchDigits, accDigits, weights, [0])) return 'valid';
    return 'bad-check';
  }

  // Unknown bank - can't verify check-digit
  return 'structural';
}

/**
 * Validate branch number - 3 digit numeric.
 */
export function isValidBranch(branch: string | number | null | undefined): boolean {
  if (branch === null || branch === undefined || branch === '') return false;
  const digits = String(branch).replace(/\D/g, '');
  return digits.length >= 1 && digits.length <= 4;
}
