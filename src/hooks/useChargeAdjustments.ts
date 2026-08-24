'use client';

import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/supabase-paginate';
import { ChargeAdjustment } from '@/lib/types';
import { validateBankAccountFull } from '@/lib/israeli-validators';

export type PayMethod = 'bank_ho' | 'credit_nedarim' | 'office' | 'exempt' | 'none';

export type CollectionStatus = 'paid' | 'pending' | 'returned' | 'none';

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
  collection: CollectionStatus;    // this month's collection status (from payment_history)
  account: 'valid' | 'bad-check' | 'invalid' | 'na'; // bank account validity (bank_ho only)
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

// 'YYYY-MM' + k months → 'YYYY-MM'
function addMonths(ym: string, k: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, (m - 1) + k, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
  // Load one month's collection run: EVERY active Yeshiva student (kollel excluded),
  // including students with no payment setup yet (shiur א) — they show as 'none' so
  // they can be defined right here. Base + adjustments = final.
  const loadMonth = async (month: string): Promise<MonthlyRow[]> => {
    // All active Yeshiva students (kollel does not pay -> excluded).
    const students = await fetchAll<StudentLite>(
      'students',
      'id, first_name, last_name, shiur, status, institution_name, family_id',
      (q) => q.eq('status', 'active').eq('institution_name', 'ישיבה')
    );
    if (students.length === 0) return [];

    const tuition = await fetchAll<TuitionLite>(
      'student_tuition',
      'student_id, payment_method, monthly_amount, active',
      (q) => q.eq('active', true)
    );
    const tuitionBySid = new Map(tuition.map((t) => [t.student_id, t]));

    // Family bank details, to validate bank_ho accounts.
    const fams = await fetchAll<{ id: string; bank_number: any; bank_branch: any; bank_account: any }>(
      'families', 'id, bank_number, bank_branch, bank_account'
    );
    const famById = new Map(fams.map((f) => [f.id, f]));
    const acctStatus = (method: PayMethod, familyId: string | null): MonthlyRow['account'] => {
      if (method !== 'bank_ho') return 'na';
      const f = familyId ? famById.get(familyId) : null;
      if (!f || !f.bank_account || !f.bank_number || !f.bank_branch) return 'invalid';
      const r = validateBankAccountFull(f.bank_number, f.bank_branch, f.bank_account);
      return r === 'valid' ? 'valid' : r === 'invalid' ? 'invalid' : r === 'bad-check' ? 'bad-check' : 'na';
    };

    const adjustments = await fetchAll<ChargeAdjustment>('charge_adjustments', '*', (q) => q.eq('month', month));
    const adjBySid = new Map<string, ChargeAdjustment[]>();
    for (const a of adjustments) {
      const arr = adjBySid.get(a.student_id) || [];
      arr.push(a);
      adjBySid.set(a.student_id, arr);
    }

    // This month's collection status from payment_history (bank + mirrored credit).
    // Priority when a student has several rows: returned > paid > pending.
    // Use a real next-month boundary — `${month}-31` is an INVALID date for 30-day
    // months (Sep/Apr/Jun/Nov) and February, which made Postgres reject the query.
    const [my, mm] = month.split('-').map(Number);
    const nd = new Date(my, mm, 1);
    const nextMonthStart = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-01`;
    const ph = await fetchAll<{ student_id: string; status_code: number }>(
      'payment_history', 'student_id, status_code',
      (q) => q.gte('payment_date', `${month}-01`).lt('payment_date', nextMonthStart)
    );
    const rank: Record<number, number> = { 3: 3, 2: 2, 1: 1 };
    const statusBySid = new Map<string, CollectionStatus>();
    const bestRank = new Map<string, number>();
    for (const r of ph) {
      const rk = rank[r.status_code] || 0;
      if (rk === 0) continue;
      if (rk > (bestRank.get(r.student_id) || 0)) {
        bestRank.set(r.student_id, rk);
        statusBySid.set(r.student_id, r.status_code === 3 ? 'returned' : r.status_code === 2 ? 'paid' : 'pending');
      }
    }

    const rows: MonthlyRow[] = [];
    for (const s of students) {
      const t = tuitionBySid.get(s.id);
      rows.push(
        computeRow({
          student_id: s.id,
          first_name: s.first_name,
          last_name: s.last_name,
          shiur: s.shiur,
          status: s.status,
          institution_name: s.institution_name,
          family_id: s.family_id,
          method: (t?.payment_method as PayMethod) || 'none',
          base: t ? Number(t.monthly_amount || 0) : 0,
          adjustments: adjBySid.get(s.id) || [],
          override: null,
          additionsTotal: 0,
          final: 0,
          collection: statusBySid.get(s.id) || 'none',
          account: acctStatus((t?.payment_method as PayMethod) || 'none', s.family_id),
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

  // --- Freeze (הקפאה): stop charging a single student for X consecutive months ---
  // Modelled as N override-0 rows (one per month) sharing a freeze_group. For a
  // credit (Nedarim) student we also suspend the HK now and schedule a resume
  // (handled by /api/nedarim/freeze-hk). Returns credit outcome for the UI.
  const createFreeze = async (params: {
    student_id: string;
    start_month: string;   // 'YYYY-MM' — first frozen month
    months: number;        // how many consecutive months
    reason?: string;
    dispatch_method?: PayMethod;
  }): Promise<{
    ok: boolean;
    error?: string;
    freeze_group?: string;
    credit?: { suspended: boolean; shared: boolean; resume_date?: string; already_charged?: boolean; error?: string };
  }> => {
    const n = Math.max(1, Math.floor(params.months));
    let method = params.dispatch_method;
    if (!method) {
      const { data } = await supabase
        .from('student_tuition').select('payment_method')
        .eq('student_id', params.student_id).maybeSingle();
      method = (data?.payment_method as PayMethod) ?? undefined;
    }

    const months = Array.from({ length: n }, (_, k) => addMonths(params.start_month, k));
    const freezeGroup = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID() : `${params.student_id}-${params.start_month}-${n}`;

    // A freeze replaces any existing active override in each frozen month.
    await supabase
      .from('charge_adjustments')
      .update({ status: 'cancelled' })
      .eq('student_id', params.student_id)
      .in('month', months)
      .eq('kind', 'override')
      .eq('status', 'active');

    const rows = months.map((m) => ({
      student_id: params.student_id,
      month: m,
      kind: 'override' as const,
      amount: 0,
      reason: params.reason || 'הקפאה',
      source: 'manual' as const,
      dispatch_method: method || null,
      is_freeze: true,
      freeze_group: freezeGroup,
    }));
    const { error } = await supabase.from('charge_adjustments').insert(rows);
    if (error) { console.error('createFreeze failed:', error.message); return { ok: false, error: error.message }; }

    // Credit students: suspend the HK now + schedule the resume.
    let credit: { suspended: boolean; shared: boolean; resume_date?: string; already_charged?: boolean; error?: string } | undefined;
    if (method === 'credit_nedarim') {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/nedarim/freeze-hk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
          body: JSON.stringify({ op: 'apply', freeze_group: freezeGroup }),
        });
        const j = await res.json();
        if (j.ok) credit = { suspended: !!j.suspended, shared: !!j.shared, resume_date: j.resume_date, already_charged: !!j.already_charged, error: j.error };
        else credit = { suspended: false, shared: false, error: j.error || 'שגיאה בהשהיית ההו״ק' };
      } catch (e: any) {
        credit = { suspended: false, shared: false, error: e?.message || 'שגיאת תקשורת מול נדרים' };
      }
    }
    return { ok: true, freeze_group: freezeGroup, credit };
  };

  // Cancel an entire freeze (all its months). For credit, resume the HK now and
  // drop the scheduled resume (handled server-side).
  const cancelFreeze = async (freezeGroup: string, method?: PayMethod): Promise<boolean> => {
    if (method === 'credit_nedarim') {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        await fetch('/api/nedarim/freeze-hk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
          body: JSON.stringify({ op: 'cancel', freeze_group: freezeGroup }),
        });
      } catch { /* still cancel the DB rows below */ }
    }
    const { error } = await supabase
      .from('charge_adjustments')
      .update({ status: 'cancelled' })
      .eq('freeze_group', freezeGroup)
      .eq('status', 'active');
    if (error) { console.error('cancelFreeze failed:', error.message); return false; }
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
  }): Promise<{ ok: boolean; count: number; error?: string; credit?: { applied: number; skipped: number; failed: number; skippedNames: string[] } }> => {
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

    // For an OVERRIDE, temporarily change credit students' Nedarim HK to the month's
    // amount (restored after the charge day by the daily cron). Bank is handled by MASAV.
    let credit: { applied: number; skipped: number; failed: number; skippedNames: string[] } | undefined;
    if (params.action_kind === 'override') {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/nedarim/apply-hk-override', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
          body: JSON.stringify({ group_action_id: ga.id }),
        });
        const j = await res.json();
        if (j.ok) credit = { applied: j.applied, skipped: j.skipped, failed: j.failed, skippedNames: j.skippedNames || [] };
      } catch { /* non-fatal — adjustments are saved regardless */ }
    }

    return { ok: true, count: targets.length, credit };
  };

  // --- Onboarding (REQ5): define how an undefined student pays ---------------

  // Family context for the setup dialog: current bank details + the family's
  // Nedarim standing orders (to link a credit student without re-entering a card).
  const getFamilyPaymentContext = async (familyId: string) => {
    const [{ data: fam }, subsRes] = await Promise.all([
      supabase.from('families').select('bank_number, bank_branch, bank_account, father_id_number').eq('id', familyId).maybeSingle(),
      supabase.from('nedarim_subscriptions')
        .select('id, amount_per_charge, last_4_digits, scheduled_day, status, kind')
        .eq('family_id', familyId).neq('status', 'deleted'),
    ]);
    return {
      bank: {
        bank_number: fam?.bank_number ?? null,
        bank_branch: fam?.bank_branch ?? null,
        bank_account: fam?.bank_account ?? null,
      },
      nedarimSubs: (subsRes.data || []) as Array<{ id: string; amount_per_charge: number; last_4_digits: string | null; scheduled_day: number | null; status: string; kind: string }>,
    };
  };

  // Create/update the student's payment setup (student_tuition).
  const saveTuitionSetup = async (studentId: string, p: {
    method: PayMethod; amount: number; bank_day?: number; nedarim_subscription_id?: string | null;
  }): Promise<boolean> => {
    const payload = {
      student_id: studentId,
      payment_method: p.method,
      monthly_amount: p.method === 'exempt' || p.method === 'none' ? 0 : p.amount,
      bank_day: p.method === 'bank_ho' ? (p.bank_day || 20) : null,
      nedarim_subscription_id: p.method === 'credit_nedarim' ? (p.nedarim_subscription_id || null) : null,
      active: true,
    };
    const { error } = await supabase.from('student_tuition').upsert(payload, { onConflict: 'student_id' });
    if (error) { console.error('saveTuitionSetup:', error.message); return false; }
    return true;
  };

  // Write bank details onto the family (so the MASAV/הו"ק can charge them).
  const saveFamilyBank = async (familyId: string, bank: { bank_number: string; bank_branch: string; bank_account: string }): Promise<boolean> => {
    const { error } = await supabase.from('families').update({
      bank_number: bank.bank_number ? Number(bank.bank_number) : null,
      bank_branch: bank.bank_branch || null,
      bank_account: bank.bank_account || null,
    }).eq('id', familyId);
    if (error) { console.error('saveFamilyBank:', error.message); return false; }
    return true;
  };

  return { loadMonth, addAdjustment, cancelAdjustment, createFreeze, cancelFreeze, createGroupAction, getFamilyPaymentContext, saveTuitionSetup, saveFamilyBank };
}
