// Tuition split — "additional payers" (mig 064, table tuition_extra_payers).
//
// A student keeps ONE main row in student_tuition (the family: its method, its amount, the
// family's bank account). On top of it he may have additional payers — a second parent or
// an outside payer (grandfather …) — each with an amount, a method and his OWN bank account
// or Nedarim standing order. Total tuition = main amount + Σ additional payers.
//
// Rules the whole collection flow follows:
//   • monthly adjustments (addition / override) belong to the MAIN row only;
//   • a freeze, a scheduled stop (tuition_active_until) or main.active = false stop the
//     additional BANK payers too (they are simply left out of the מס"ב file);
//   • a payer's credit standing order lives in Nedarim and is stopped only explicitly.
//
// This file is pure (no supabase) so the server routes and the offline tests can use it.

export const EXTRA_PAYERS_TABLE = 'tuition_extra_payers';

export type ExtraPayMethod = 'bank_ho' | 'credit_nedarim' | 'office';
export type ExtraPayerKind = 'parent' | 'external';

export interface ExtraPayer {
  id: string;
  student_id: string;
  payer_kind: ExtraPayerKind;
  payer_name: string;
  payer_relation: string | null;
  payer_id_number: string | null;
  payer_phone: string | null;
  payment_method: ExtraPayMethod;
  monthly_amount: number;
  bank_number: number | null;
  bank_branch: string | null;
  bank_account: string | null;
  nedarim_subscription_id: string | null;
  active: boolean;
  notes: string | null;
}

export const EXTRA_METHOD_LABELS: Record<ExtraPayMethod, string> = {
  bank_ho: 'הו"ק בנק',
  credit_nedarim: 'אשראי',
  office: 'משרד',
};

export const EXTRA_KIND_LABELS: Record<ExtraPayerKind, string> = {
  parent: 'הורה נוסף',
  external: 'משלם חיצוני',
};

/** "סבא · ישראל כהן" / "הורה נוסף · רחל לוי" */
export function payerLabel(p: Pick<ExtraPayer, 'payer_kind' | 'payer_name' | 'payer_relation'>): string {
  const rel = (p.payer_relation || '').trim() || EXTRA_KIND_LABELS[p.payer_kind] || '';
  const name = (p.payer_name || '').trim();
  return [rel, name].filter(Boolean).join(' · ');
}

export function extraTotal(list: Array<Pick<ExtraPayer, 'monthly_amount'>> | undefined | null): number {
  return (list || []).reduce((s, p) => s + (Number(p.monthly_amount) || 0), 0);
}

export function groupPayersByStudent<T extends { student_id: string }>(list: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const p of list) {
    const arr = m.get(p.student_id);
    if (arr) arr.push(p); else m.set(p.student_id, [p]);
  }
  return m;
}

/** What is missing before this payer can actually be charged ('' = ready). */
export function payerProblem(p: Pick<ExtraPayer, 'payment_method' | 'monthly_amount' | 'bank_number' | 'bank_branch' | 'bank_account' | 'nedarim_subscription_id'>): string {
  if (!(Number(p.monthly_amount) > 0)) return 'סכום 0';
  if (p.payment_method === 'bank_ho') {
    const miss = [!p.bank_number && 'בנק', !p.bank_branch && 'סניף', !p.bank_account && 'חשבון'].filter(Boolean);
    return miss.length ? 'חסר ' + miss.join(', ') : '';
  }
  if (p.payment_method === 'credit_nedarim' && !p.nedarim_subscription_id) return 'לא קושרה הו"ק אשראי';
  return '';
}

/**
 * Is this BANK payer charged in the מס"ב file of `chargeDate`?
 * `main` = the student's ACTIVE main setup (undefined when it is stopped / missing);
 * `frozen` = the student has a freeze in that month.
 */
export function bankPayerCharged(
  p: Pick<ExtraPayer, 'payment_method' | 'active'>,
  main: { tuition_active_until?: string | null } | undefined | null,
  frozen: boolean,
  chargeDate: string,
): boolean {
  if (!p.active || p.payment_method !== 'bank_ho') return false;
  if (!main) return false;                                                  // main charge stopped → payer too
  if (main.tuition_active_until && chargeDate > main.tuition_active_until) return false;
  return !frozen;
}

/** One link between a Nedarim standing order and a student: his main row or one of his payers. */
export interface CreditLink {
  student_id: string;
  amount: number;
  /** null = the student's main row */
  payer_id: string | null;
}

/**
 * Who a successful charge of ONE standing order belongs to.
 *   a single link            → the whole charged amount
 *   several links (shared)   → each link's own monthly amount
 * payment_history holds one row per (transaction, student), so several links of the SAME
 * student are merged into one row (payer kept only when all of them are that one payer).
 */
export function splitCreditCharge(chargedAmount: number, links: CreditLink[]): CreditLink[] {
  if (!links || links.length === 0) return [];
  if (links.length === 1) return [{ ...links[0], amount: chargedAmount }];
  const byStudent = new Map<string, CreditLink>();
  for (const l of links) {
    const cur = byStudent.get(l.student_id);
    if (!cur) { byStudent.set(l.student_id, { ...l, amount: Number(l.amount) || 0 }); continue; }
    cur.amount += Number(l.amount) || 0;
    if (cur.payer_id !== l.payer_id) cur.payer_id = null;
  }
  const out = [...byStudent.values()];
  // all the links were one student's → he gets the whole charge
  if (out.length === 1) out[0].amount = chargedAmount;
  return out;
}

/** Key of one collection line: the student's main row, or one of his additional payers. */
export const lineKey = (studentId: string, payerId?: string | null) => `${studentId}|${payerId || ''}`;
