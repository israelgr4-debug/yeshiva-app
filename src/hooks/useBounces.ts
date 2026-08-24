'use client';

import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/supabase-paginate';

export interface BounceRow {
  id: string;
  student_id: string;
  first_name: string;
  last_name: string;
  shiur: string | null;
  family_id: string | null;
  amount_ils: number;
  payment_date: string;
  bounce_resolution: string | null;
  bounce_resolved_at: string | null;
  bounce_note: string | null;
}

export interface PaidRow {
  id: string;
  student_id: string;
  name: string;
  shiur: string | null;
  amount_ils: number;
}

interface PHRow {
  id: string; student_id: string; amount_ils: number; payment_date: string;
  status_code: number; bounce_resolution: string | null; bounce_resolved_at: string | null; bounce_note: string | null;
}
interface StudentLite { id: string; first_name: string; last_name: string; shiur: string | null; family_id: string | null; }

// addMonths on a 'YYYY-MM' string
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function studentsByIds(ids: string[]): Promise<Map<string, StudentLite>> {
  const map = new Map<string, StudentLite>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await supabase
      .from('students')
      .select('id, first_name, last_name, shiur, family_id')
      .in('id', ids.slice(i, i + 100));
    for (const s of data || []) map.set(s.id, s as StudentLite);
  }
  return map;
}

export function useBounces() {
  // REQ5: all bounced charges (status_code=3), newest first, joined to student.
  const loadBounces = async (): Promise<BounceRow[]> => {
    const ph = await fetchAll<PHRow>(
      'payment_history',
      'id, student_id, amount_ils, payment_date, status_code, bounce_resolution, bounce_resolved_at, bounce_note',
      (q) => q.eq('status_code', 3).order('payment_date', { ascending: false })
    );
    const stMap = await studentsByIds([...new Set(ph.map((r) => r.student_id))]);
    return ph.map((r) => {
      const s = stMap.get(r.student_id);
      return {
        id: r.id, student_id: r.student_id,
        first_name: s?.first_name || '', last_name: s?.last_name || '',
        shiur: s?.shiur || null, family_id: s?.family_id || null,
        amount_ils: Number(r.amount_ils) || 0, payment_date: r.payment_date,
        bounce_resolution: r.bounce_resolution, bounce_resolved_at: r.bounce_resolved_at, bounce_note: r.bounce_note,
      };
    });
  };

  // REQ4 helper: this month's collected (status 2) rows, to pick which bounced.
  const loadPaidForMonth = async (month: string): Promise<PaidRow[]> => {
    // Real next-month boundary — `${month}-31` is invalid for 30-day months / February.
    const [my, mm] = month.split('-').map(Number);
    const nd = new Date(my, mm, 1);
    const nextStart = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-01`;
    const ph = await fetchAll<PHRow>(
      'payment_history',
      'id, student_id, amount_ils, payment_date, status_code, bounce_resolution, bounce_resolved_at, bounce_note',
      (q) => q.eq('status_code', 2).gte('payment_date', `${month}-01`).lt('payment_date', nextStart)
    );
    const stMap = await studentsByIds([...new Set(ph.map((r) => r.student_id))]);
    return ph.map((r) => {
      const s = stMap.get(r.student_id);
      return { id: r.id, student_id: r.student_id, name: `${s?.last_name || ''} ${s?.first_name || ''}`.trim(), shiur: s?.shiur || null, amount_ils: Number(r.amount_ils) || 0 };
    }).sort((a, b) => a.name.localeCompare(b.name, 'he'));
  };

  // REQ4: flip selected paid rows to 'חזר' (status 3).
  const markAsBounced = async (ids: string[]): Promise<boolean> => {
    if (ids.length === 0) return true;
    const { error } = await supabase
      .from('payment_history')
      .update({ status_code: 3, status_name: 'חזר' })
      .in('id', ids);
    if (error) { console.error('markAsBounced:', error.message); return false; }
    return true;
  };

  const setResolution = async (paymentId: string, resolution: string, note?: string) => {
    await supabase.from('payment_history')
      .update({ bounce_resolution: resolution, bounce_resolved_at: new Date().toISOString(), bounce_note: note || null })
      .eq('id', paymentId);
  };

  const dispatchMethodFor = async (studentId: string): Promise<string | null> => {
    const { data } = await supabase.from('student_tuition').select('payment_method').eq('student_id', studentId).maybeSingle();
    return data?.payment_method || null;
  };

  // REQ6a: handled outside the system.
  const resolveManual = async (b: BounceRow, note?: string) => { await setResolution(b.id, 'manual', note); };

  // REQ6b: add the bounced amount to a future month's collection (one adjustment).
  const resolveNextMonth = async (b: BounceRow, targetMonth: string, note?: string) => {
    const method = await dispatchMethodFor(b.student_id);
    await supabase.from('charge_adjustments').insert({
      student_id: b.student_id, month: targetMonth, kind: 'addition', amount: b.amount_ils,
      reason: note || `החזר הו"ק מ-${b.payment_date.slice(0, 7)}`,
      source: 'bounce', bounce_payment_id: b.id, dispatch_method: method,
    });
    await setResolution(b.id, 'next_month', note);
  };

  // REQ6c: split into N monthly installments starting from startMonth.
  const resolveInstallments = async (b: BounceRow, startMonth: string, count: number, note?: string) => {
    const method = await dispatchMethodFor(b.student_id);
    const per = Math.round((b.amount_ils / count) * 100) / 100;
    const rows = Array.from({ length: count }, (_, i) => ({
      student_id: b.student_id, month: addMonths(startMonth, i), kind: 'addition' as const,
      // last installment absorbs the rounding remainder
      amount: i === count - 1 ? Math.round((b.amount_ils - per * (count - 1)) * 100) / 100 : per,
      reason: note || `החזר הו"ק מ-${b.payment_date.slice(0, 7)} (תשלום ${i + 1}/${count})`,
      source: 'installment' as const, bounce_payment_id: b.id, dispatch_method: method,
    }));
    await supabase.from('charge_adjustments').insert(rows);
    await setResolution(b.id, 'installments', note);
  };

  // REQ6d: create a dated one-time charge (bank standing-order queue) for the bounced amount.
  const resolveRecharge = async (b: BounceRow, chargeDate: string, note?: string) => {
    if (!b.family_id) throw new Error('לתלמיד אין משפחה מקושרת');
    await supabase.from('one_time_charges').insert({
      student_id: b.student_id, family_id: b.family_id, amount: b.amount_ils, charge_date: chargeDate,
      description: note || `החזר הו"ק מ-${b.payment_date.slice(0, 7)}`, status: 'pending',
    });
    await setResolution(b.id, 'recharge', note);
  };

  return { loadBounces, loadPaidForMonth, markAsBounced, resolveManual, resolveNextMonth, resolveInstallments, resolveRecharge };
}
