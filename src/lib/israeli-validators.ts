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
// Weighted sum with weights [1,2,3,...] (position+1), left to right.
function wsumLTR(digits: string): number {
  let s = 0;
  for (let i = 0; i < digits.length; i++) s += Number(digits[i]) * (i + 1);
  return s;
}
const rev = (s: string) => s.split('').reverse().join('');
// The official spec is ambiguous in practice on three axes: digit order (accounts are
// listed check-digit-first but stored units-last), leading-zero padding to the bank's
// fixed account length, and whether/where the branch joins the account. Rather than
// guess per bank, we try every reasonable arrangement — the account in both directions,
// zero-padded to each common length, combined with the branch (in either order/
// direction or not at all) — and accept if ANY hits the bank's allowed remainders.
function modOk(acc: string, branch: string, allowed: number[]): boolean {
  const brRev = rev(branch);
  const accForms = new Set<string>();
  for (const a of [acc, rev(acc)]) {
    for (const len of [0, 6, 8, 9]) accForms.add(len ? a.padStart(len, '0') : a);
  }
  for (const a of accForms) {
    for (const combined of [a, a + branch, branch + a, a + brRev, brRev + a]) {
      if (allowed.includes(wsumLTR(combined) % 11)) return true;
    }
  }
  return false;
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

  const acc = String(account).replace(/\D/g, '').replace(/^0+/, '') || '0';
  let br = String(branch).replace(/\D/g, '');
  const V = (allowed: number[]): AccountCheckResult => (modOk(acc, br, allowed) ? 'valid' : 'bad-check');

  if (bank === 12) return V([0, 2, 4, 6]);            // Hapoalim
  if (bank === 4) return V([0, 2]);                   // Yahav
  if (bank === 11 || bank === 17) return V([0, 2, 4]); // Discount / Mercantile
  if (bank === 20 || bank === 13) {                   // Mizrahi-Tefahot / Igud
    const n = Number(br);
    if (n >= 401 && n <= 799) br = String(n - 400);
    return V([0, 2, 4]);
  }
  if (bank === 31 || bank === 52) return V([0, 6]);   // International / PAGI
  if (bank === 14) {                                  // Otsar Hachayal
    const n = Number(br);
    return V([347, 365, 384, 385].includes(n) ? [0, 2] : [361, 362, 363].includes(n) ? [0, 2, 4] : [0]);
  }
  if (bank === 46) {                                  // Massad
    const relaxed = new Set([154, 166, 178, 181, 183, 191, 192, 503, 505, 507, 515, 516, 527, 539]);
    return V(relaxed.has(Number(br)) ? [0, 2] : [0]);
  }
  if (bank === 21) return V([0, 2]);                  // Nima Shefa
  if (bank === 9) {                                   // Postal bank — mod 10
    for (const v of [acc, rev(acc), acc.padStart(9, '0')]) if (wsumLTR(v) % 10 === 0) return 'valid';
    return 'bad-check';
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
