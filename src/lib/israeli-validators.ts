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
// Weighted sum, left-to-right (the official spec's worked examples apply the first
// weight to the leftmost digit).
function wsum(digits: string, weights: number[]): number {
  let s = 0;
  for (let i = 0; i < digits.length; i++) s += Number(digits[i]) * (weights[i] || 0);
  return s;
}
const W9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];

// Otsar Hachayal (14) / International stage-C: branch-dependent remainders.
function otsarCheck(acc: string, br: string): AccountCheckResult {
  const rem = wsum(acc.padStart(6, '0') + br, W9) % 11;
  const brNum = Number(br);
  let allowed = [0];
  if ([347, 365, 384, 385].includes(brNum)) allowed = [0, 2];
  else if ([361, 362, 363].includes(brNum)) allowed = [0, 2, 4];
  return allowed.includes(rem) ? 'valid' : 'bad-check';
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

  const acc = String(account).replace(/\D/g, '');
  let br = String(branch).replace(/\D/g, '').padStart(3, '0');

  // Hapoalim (12): account(pad6) + branch(3), weights 1..9, remainder ∈ {0,2,4,6}
  if (bank === 12) {
    return [0, 2, 4, 6].includes(wsum(acc.padStart(6, '0') + br, W9) % 11) ? 'valid' : 'bad-check';
  }
  // Yahav (4): account(pad6) + branch(3), weights 1..9, remainder ∈ {0,2}
  if (bank === 4) {
    return [0, 2].includes(wsum(acc.padStart(6, '0') + br, W9) % 11) ? 'valid' : 'bad-check';
  }
  // Discount group (11 Discount, 17 Mercantile): account only (pad9), remainder ∈ {0,2,4}
  if (bank === 11 || bank === 17) {
    return [0, 2, 4].includes(wsum(acc.padStart(9, '0'), W9) % 11) ? 'valid' : 'bad-check';
  }
  // Mizrahi-Tefahot (20) + Igud (13, merged): branches 401-799 subtract 400; remainder ∈ {0,2,4}
  if (bank === 20 || bank === 13) {
    const n = Number(br);
    if (n >= 401 && n <= 799) br = String(n - 400).padStart(3, '0');
    return [0, 2, 4].includes(wsum(acc.padStart(6, '0') + br, W9) % 11) ? 'valid' : 'bad-check';
  }
  // International group — First International (31) + PAGI (52): account only, remainder ∈ {0,6}.
  // Stage B: retry on the 6 rightmost digits. Bank 31 has a further Otsar-style stage.
  if (bank === 31 || bank === 52) {
    const ok = (d: string) => [0, 6].includes(wsum(d, W9) % 11);
    if (ok(acc.padStart(9, '0')) || ok(acc.slice(-6))) return 'valid';
    return bank === 31 ? otsarCheck(acc, br) : 'bad-check';
  }
  // Otsar Hachayal (14): branch-dependent remainders.
  if (bank === 14) return otsarCheck(acc, br);
  // Massad (46): remainder {0}; listed branches also allow {2}.
  if (bank === 46) {
    const relaxed = new Set([154, 166, 178, 181, 183, 191, 192, 503, 505, 507, 515, 516, 527, 539]);
    const allowed = relaxed.has(Number(br)) ? [0, 2] : [0];
    return allowed.includes(wsum(acc.padStart(6, '0') + br, W9) % 11) ? 'valid' : 'bad-check';
  }
  // Postal bank (9): account only, weights 1..9, mod 10 == 0
  if (bank === 9) {
    return wsum(acc.padStart(9, '0'), W9) % 10 === 0 ? 'valid' : 'bad-check';
  }
  // Nima Shefa (21): 8-digit account, weights 1..8, remainder ∈ {0,2}
  if (bank === 21) {
    return [0, 2].includes(wsum(acc.padStart(8, '0'), [1, 2, 3, 4, 5, 6, 7, 8]) % 11) ? 'valid' : 'bad-check';
  }

  // Leumi (10, 34 — complex 5-type algorithm), Jerusalem (54 — no rule), HSBC (23),
  // Indian (39), digital/credit banks: no reliable local check → structure OK, don't flag.
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
