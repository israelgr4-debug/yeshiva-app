import { supabase } from '@/lib/supabase';

export interface MarkItem { student_id: string; amount: number; name: string }
export interface MarkResult { inserted: number; updated: number; skipped: number; errors: string[] }

const ils = (n: number) => '₪' + n.toLocaleString('he-IL', { maximumFractionDigits: 2 });

export interface RunFamily {
  family_id: string; family_name: string;
  bank: string; branch: string; account: string;
  students: { id: string; name: string; amount: number }[];
}

/**
 * Remember what a produced מס"ב file contained (not the file itself). Re-downloading
 * the same not-yet-marked run (same date + send counter) replaces it instead of
 * duplicating it.
 */
export async function recordMasavRun(chargeDate: string, sendCounter: number, families: RunFamily[]): Promise<{ ok: boolean; error?: string; replaced?: boolean }> {
  const { data: { user } } = await supabase.auth.getUser();
  const studentCount = families.reduce((s, f) => s + f.students.length, 0);
  const total = families.reduce((s, f) => s + f.students.reduce((a, x) => a + x.amount, 0), 0);
  const meta = { family_count: families.length, student_count: studentCount, total_amount: Math.round(total * 100) / 100, created_by: user?.email || null };

  const { data: existing } = await supabase.from('masav_runs').select('id')
    .eq('kind', 'tuition').eq('charge_date', chargeDate).eq('send_counter', sendCounter)
    .is('marked_paid_at', null).is('cancelled_at', null).maybeSingle();

  let runId: string;
  if (existing) {
    runId = existing.id;
    await supabase.from('masav_run_items').delete().eq('run_id', runId);
    const { error } = await supabase.from('masav_runs').update(meta).eq('id', runId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { data, error } = await supabase.from('masav_runs')
      .insert({ kind: 'tuition', charge_date: chargeDate, send_counter: sendCounter, ...meta })
      .select('id').single();
    if (error || !data) return { ok: false, error: error?.message || 'שמירה נכשלה' };
    runId = data.id;
  }

  const rows = families.flatMap((f) => f.students.map((s) => ({
    run_id: runId, student_id: s.id, family_id: f.family_id, student_name: s.name, family_name: f.family_name,
    bank: f.bank, branch: f.branch, account: f.account, amount: s.amount,
  })));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('masav_run_items').insert(rows.slice(i, i + 500));
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, replaced: !!existing };
}

/**
 * Mark a מס"ב run as PAID in payment_history, using the given per-student amounts
 * (what was actually in the file). Per student, among its BANK rows in that month:
 *   none           → insert status 2 (נפרע)
 *   one, status 1  → update to status 2 (צפי → נפרע)
 *   one, status 2  → skip (flag if the amount differs)
 *   one, status 3  → skip (חזר — not touched)
 *   several        → skip, manual review
 */
export async function markItemsPaid(items: MarkItem[], chargeDate: string, groupNumber: number): Promise<MarkResult> {
  const month = chargeDate.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const nd = new Date(y, m, 1);
  const nextStart = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-01`;
  let inserted = 0, updated = 0, skipped = 0;
  const errors: string[] = [];

  const existing: Record<string, any[]> = {};
  for (let i = 0; i < items.length; i += 100) {
    const { data, error } = await supabase.from('payment_history')
      .select('id, student_id, amount_ils, status_code')
      .in('student_id', items.slice(i, i + 100).map((x) => x.student_id))
      .gte('payment_date', `${month}-01`).lt('payment_date', nextStart)
      .is('nedarim_transaction_id', null); // bank rows only (ignore mirrored credit)
    if (error) throw error;
    for (const r of data || []) (existing[r.student_id] ||= []).push(r);
  }

  for (const it of items) {
    const ex = existing[it.student_id] || [];
    try {
      if (ex.length === 0) {
        const { error } = await supabase.from('payment_history').insert({
          student_id: it.student_id, payment_date: chargeDate, amount_ils: it.amount,
          status_code: 2, status_name: 'נפרע', group_number: groupNumber,
        });
        if (error) throw error;
        inserted++;
      } else if (ex.length > 1) {
        errors.push(`${it.name}: ${ex.length} רשומות בנק בחודש זה — בדוק ידנית`); skipped++;
      } else if (ex[0].status_code === 2) {
        if (Math.abs((Number(ex[0].amount_ils) || 0) - it.amount) >= 0.01) {
          errors.push(`${it.name}: כבר נפרע בסכום ${ils(Number(ex[0].amount_ils))} (בשידור ${ils(it.amount)})`);
        }
        skipped++;
      } else if (ex[0].status_code === 3) {
        errors.push(`${it.name}: מסומן כחזר — לא שונה`); skipped++;
      } else {
        const { error } = await supabase.from('payment_history').update({
          status_code: 2, status_name: 'נפרע', payment_date: chargeDate, amount_ils: it.amount, group_number: groupNumber,
        }).eq('id', ex[0].id);
        if (error) throw error;
        updated++;
      }
    } catch (e: any) { errors.push(`${it.name}: ${e?.message || e}`); }
  }
  return { inserted, updated, skipped, errors };
}
