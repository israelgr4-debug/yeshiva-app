'use client';

// Data access for the tuition split (additional payers) — see lib/tuition-payers.ts.
// Plain async functions (no React state) so pages, cards and dialogs can all call them.

import { supabase } from '@/lib/supabase';
import { EXTRA_PAYERS_TABLE, ExtraPayer } from '@/lib/tuition-payers';

const COLS = 'id, student_id, payer_kind, payer_name, payer_relation, payer_id_number, payer_phone, payment_method, monthly_amount, bank_number, bank_branch, bank_account, nedarim_subscription_id, active, notes';

const norm = (r: any): ExtraPayer => ({ ...r, monthly_amount: Number(r.monthly_amount) || 0 });

/**
 * Every ACTIVE additional payer. Returns [] (never throws) when migration 064 was not run
 * yet — the collection screens must keep working exactly as before in that case.
 */
export async function loadActiveExtraPayers(): Promise<ExtraPayer[]> {
  const all: ExtraPayer[] = [];
  try {
    for (let p = 0; p < 20; p++) {
      const { data, error } = await supabase.from(EXTRA_PAYERS_TABLE).select(COLS)
        .eq('active', true).order('id').range(p * 1000, p * 1000 + 999);
      if (error) return [];
      if (!data || data.length === 0) break;
      all.push(...data.map(norm));
      if (data.length < 1000) break;
    }
  } catch { return []; }
  return all;
}

/** Active payers of ACTIVE ישיבה students only — the population of the finance dashboards. */
export async function loadDashboardExtraPayers(): Promise<ExtraPayer[]> {
  const list = await loadActiveExtraPayers();
  if (list.length === 0) return [];
  const ids = [...new Set(list.map((p) => p.student_id))];
  const ok = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('students').select('id')
      .in('id', ids.slice(i, i + 200)).eq('status', 'active').eq('institution_name', 'ישיבה');
    for (const s of data || []) ok.add(s.id);
  }
  return list.filter((p) => ok.has(p.student_id));
}

/** All payers of one student (active and stopped). `missing` = migration 064 not run. */
export async function listStudentPayers(studentId: string): Promise<{ payers: ExtraPayer[]; missing: boolean; error?: string }> {
  const { data, error } = await supabase.from(EXTRA_PAYERS_TABLE).select(COLS)
    .eq('student_id', studentId).order('created_at');
  if (error) {
    const missing = /does not exist|schema cache|Could not find/i.test(error.message || '');
    return { payers: [], missing, error: error.message };
  }
  return { payers: (data || []).map(norm), missing: false };
}

export type PayerDraft = Omit<ExtraPayer, 'id' | 'active'> & { id?: string; active?: boolean };

export async function savePayer(d: PayerDraft): Promise<{ ok: boolean; id?: string; error?: string }> {
  const isBank = d.payment_method === 'bank_ho';
  const payload = {
    student_id: d.student_id,
    payer_kind: d.payer_kind,
    payer_name: d.payer_name.trim(),
    payer_relation: d.payer_relation?.trim() || null,
    payer_id_number: d.payer_id_number?.replace(/\D/g, '') || null,
    payer_phone: d.payer_phone?.trim() || null,
    payment_method: d.payment_method,
    monthly_amount: Number(d.monthly_amount) || 0,
    bank_number: isBank ? (Number(d.bank_number) || null) : null,
    bank_branch: isBank ? (String(d.bank_branch || '').trim() || null) : null,
    bank_account: isBank ? (String(d.bank_account || '').trim() || null) : null,
    nedarim_subscription_id: d.payment_method === 'credit_nedarim' ? (d.nedarim_subscription_id || null) : null,
    notes: d.notes?.trim() || null,
  };
  if (d.id) {
    const { error } = await supabase.from(EXTRA_PAYERS_TABLE).update(payload).eq('id', d.id);
    return error ? { ok: false, error: error.message } : { ok: true, id: d.id };
  }
  const { data, error } = await supabase.from(EXTRA_PAYERS_TABLE).insert({ ...payload, active: true }).select('id').single();
  return error || !data ? { ok: false, error: error?.message || 'שמירה נכשלה' } : { ok: true, id: data.id };
}

export async function setPayerActive(id: string, active: boolean): Promise<boolean> {
  const { error } = await supabase.from(EXTRA_PAYERS_TABLE).update({ active }).eq('id', id);
  return !error;
}

/**
 * Delete a payer — only one that was never collected. A payer with collection rows is
 * stopped instead (deleting would turn his rows into the family's rows).
 */
export async function deletePayer(id: string): Promise<{ ok: boolean; hasHistory?: boolean; error?: string }> {
  const { count, error: cErr } = await supabase.from('payment_history').select('id', { count: 'exact', head: true }).eq('payer_id', id);
  if (cErr) return { ok: false, error: cErr.message };
  if ((count || 0) > 0) return { ok: false, hasHistory: true };
  const { error } = await supabase.from(EXTRA_PAYERS_TABLE).delete().eq('id', id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export interface SubLite {
  id: string; nedarim_keva_id: string; client_name: string | null; client_zeout: string | null;
  amount_per_charge: number; last_4_digits: string | null; scheduled_day: number | null; status: string;
}
const SUB_COLS = 'id, nedarim_keva_id, client_name, client_zeout, amount_per_charge, last_4_digits, scheduled_day, status';

/** Find a credit standing order of ANY payer (name / ת"ז / last 4 digits / KevaId). */
export async function searchCreditSubs(term: string): Promise<SubLite[]> {
  const t = term.trim().replace(/[%,()]/g, '');
  if (t.length < 2) return [];
  const { data } = await supabase.from('nedarim_subscriptions').select(SUB_COLS)
    .eq('kind', 'credit').neq('status', 'deleted')
    .or(`client_name.ilike.%${t}%,client_zeout.ilike.%${t}%,last_4_digits.eq.${t},nedarim_keva_id.eq.${t}`)
    .order('client_name').limit(25);
  return (data || []) as SubLite[];
}

export async function getSubsByIds(ids: string[]): Promise<Map<string, SubLite>> {
  const m = new Map<string, SubLite>();
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 200) {
    const { data } = await supabase.from('nedarim_subscriptions').select(SUB_COLS).in('id', uniq.slice(i, i + 200));
    for (const s of data || []) m.set(s.id, s as SubLite);
  }
  return m;
}
