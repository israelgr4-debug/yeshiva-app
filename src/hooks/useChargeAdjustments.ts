'use client';

import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/supabase-paginate';
import { ChargeAdjustment } from '@/lib/types';

export type PayMethod = 'bank_ho' | 'credit_nedarim' | 'office' | 'exempt' | 'none';

export interface MonthlyRow {
  student_id: string;
  first_name: string;
  last_name: string;
  shiur: string | null;
  status: string;
  institution_name: string | null;
  family_id: string | null;
  method: PayMethod;
  base: number;
  adjustments: ChargeAdjustment[];
  override: number | null;         // active override amount for the month, if any
  additionsTotal: number;          // sum of active additions
  final: number;                   // (override ?? base) + additionsTotal
}

interface StudentLite {
  id: string;
  first_name: string;
  last_name: string;
  shiur: string | null;
  status: string;
  institution_name: string | null;
  family_id: string | null;
}
interface TuitionLite {
  student_id: string;
  payment_method: PayMethod;
  monthly_amount: number;
  active: boolean;
}

function computeRow(base: MonthlyRow): MonthlyRow {
  const active = base.adjustments.filter((a) => a.status === 'active');
  const override = active.find((a) => a.kind === 'override');
  const additionsTotal = active
    .filter((a) => a.kind === 'addition')
    .reduce((s, a) => s + Number(a.amount || 0), 0);
  const overrideAmt = override ? Number(override.amount) : null;
  return {
    ...base,
    override: overrideAmt,
    additionsTotal,
    final: (overrideAmt ?? base.base) + additionsTotal,
  };
}

export function useChargeAdjustments() {
  // Load one month's collection run: every active payer + their adjustments + computed final.
  const loadMonth = async (month: string): Promise<MonthlyRow[]> => {
    const tuition = await fetchAll<TuitionLite>(
      'student_tuition',
      'student_id, payment_method, monthly_amount, active',
      (q) => q.eq('active', true)
    );
    const sids = tuition.map((t) => t.student_id);
    if (sids.length === 0) return [];

    const students = await fetchAll<StudentLite>(
      'students',
      'id, first_name, last_name, shiur, status, institution_name, family_id',
      (q) => q.eq('status', 'active')
    );
    const stById = new Map(students.map((s) => [s.id, s]));

    const adjustments = await fetchAll<ChargeAdjustment>(
      'charge_adjustments',
      '*',
      (q) => q.eq('month', month)
    );
    const adjBySid = new Map<string, ChargeAdjustment[]>();
    for (const a of adjustments) {
      const arr = adjBySid.get(a.student_id) || [];
      arr.push(a);
      adjBySid.set(a.student_id, arr);
    }

    const rows: MonthlyRow[] = [];
    for (const t of tuition) {
      const s = stById.get(t.student_id);
      if (!s) continue; // only active students
      rows.push(
        computeRow({
          student_id: t.student_id,
          first_name: s.first_name,
          last_name: s.last_name,
          shiur: s.shiur,
          status: s.status,
          institution_name: s.institution_name,
          family_id: s.family_id,
          method: t.payment_method,
          base: Number(t.monthly_amount || 0),
          adjustments: adjBySid.get(t.student_id) || [],
          override: null,
          additionsTotal: 0,
          final: 0,
        })
      );
    }
    return rows;
  };

  // REQ7: a single one-time adjustment for a student in a month.
  const addAdjustment = async (params: {
    student_id: string;
    month: string;
    kind: 'addition' | 'override';
    amount: number;
    reason?: string;
    dispatch_method?: PayMethod;
  }): Promise<ChargeAdjustment | null> => {
    // Snapshot the dispatch method from student_tuition if not supplied.
    let method = params.dispatch_method;
    if (!method) {
      const { data } = await supabase
        .from('student_tuition')
        .select('payment_method')
        .eq('student_id', params.student_id)
        .maybeSingle();
      method = (data?.payment_method as PayMethod) ?? undefined;
    }
    // An override replaces any existing active override for that student+month.
    if (params.kind === 'override') {
      await supabase
        .from('charge_adjustments')
        .update({ status: 'cancelled' })
        .eq('student_id', params.student_id)
        .eq('month', params.month)
        .eq('kind', 'override')
        .eq('status', 'active');
    }
    const { data, error } = await supabase
      .from('charge_adjustments')
      .insert({
        student_id: params.student_id,
        month: params.month,
        kind: params.kind,
        amount: params.amount,
        reason: params.reason || null,
        source: 'manual',
        dispatch_method: method || null,
      })
      .select()
      .single();
    if (error) {
      console.error('addAdjustment failed:', error.message);
      return null;
    }
    return data as ChargeAdjustment;
  };

  const cancelAdjustment = async (id: string): Promise<boolean> => {
    const { error } = await supabase
      .from('charge_adjustments')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (error) {
      console.error('cancelAdjustment failed:', error.message);
      return false;
    }
    return true;
  };

  // REQ8/REQ9: a group action that fans out into per-student adjustments,
  // skipping exempt/none students. Returns number of students affected.
  const createGroupAction = async (params: {
    month: string;
    action_kind: 'addition' | 'override';
    amount: number;
    target_type: 'shiur' | 'status' | 'institution';
    target_value: string;
    reason?: string;
    skip_exempt?: boolean;
  }): Promise<{ ok: boolean; count: number; error?: string }> => {
    const skipExempt = params.skip_exempt !== false;

    // Resolve matching active students by the chosen target.
    let studentQuery = supabase.from('students').select('id').eq('status', 'active');
    if (params.target_type === 'shiur') studentQuery = studentQuery.eq('shiur', params.target_value);
    else if (params.target_type === 'institution')
      studentQuery = studentQuery.eq('institution_name', params.target_value);
    else if (params.target_type === 'status')
      studentQuery = studentQuery.eq('status', params.target_value);
    const { data: students, error: sErr } = await studentQuery;
    if (sErr) return { ok: false, count: 0, error: sErr.message };
    const ids = (students || []).map((s: any) => s.id);
    if (ids.length === 0) return { ok: false, count: 0, error: 'לא נמצאו תלמידים תואמים' };

    // Their tuition methods (to snapshot dispatch + skip exempt/none).
    const tuition = await fetchAll<TuitionLite>(
      'student_tuition',
      'student_id, payment_method, active',
      (q) => q.in('student_id', ids).eq('active', true)
    );
    const methodBy = new Map(tuition.map((t) => [t.student_id, t.payment_method]));

    const targets = ids.filter((id) => {
      const m = methodBy.get(id);
      if (!m) return false; // no active tuition row -> skip
      if (skipExempt && (m === 'exempt' || m === 'none')) return false;
      return true;
    });
    if (targets.length === 0) return { ok: false, count: 0, error: 'כל התלמידים התואמים פטורים/לא מוגדרים' };

    // Create the parent group_action.
    const { data: ga, error: gErr } = await supabase
      .from('group_actions')
      .insert({
        month: params.month,
        action_kind: params.action_kind,
        amount: params.amount,
        target_type: params.target_type,
        target_value: params.target_value,
        reason: params.reason || null,
        skip_exempt: skipExempt,
        student_count: targets.length,
        total_amount: params.action_kind === 'addition' ? params.amount * targets.length : 0,
      })
      .select()
      .single();
    if (gErr) return { ok: false, count: 0, error: gErr.message };

    // For overrides: cancel any existing active override for these students this month.
    if (params.action_kind === 'override') {
      await supabase
        .from('charge_adjustments')
        .update({ status: 'cancelled' })
        .in('student_id', targets)
        .eq('month', params.month)
        .eq('kind', 'override')
        .eq('status', 'active');
    }

    const rows = targets.map((id) => ({
      student_id: id,
      month: params.month,
      kind: params.action_kind,
      amount: params.amount,
      reason: params.reason || null,
      source: 'group' as const,
      group_action_id: ga.id,
      dispatch_method: methodBy.get(id) || null,
    }));
    // Insert in batches of 200.
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabase.from('charge_adjustments').insert(rows.slice(i, i + 200));
      if (error) return { ok: false, count: 0, error: error.message };
    }
    return { ok: true, count: targets.length };
  };

  return { loadMonth, addAdjustment, cancelAdjustment, createGroupAction };
}
