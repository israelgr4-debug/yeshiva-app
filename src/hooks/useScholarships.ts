'use client';

// Data layer for the מלגות module (mig 056):
// רכיב (type) → חיוב תקופתי (batch) → זכאות (entry) → תשלום (payment).
// Writes go straight to Supabase; audit_log is filled by DB triggers, and the DB itself
// blocks editing/deleting paid entries and overlapping ימות batches.

import { useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/supabase-paginate';
import {
  ScholarshipType, ScholarshipBatch, ScholarshipEntry, ScholarshipPayment,
  ScholarshipRun, ScholarshipRunFilters, ScholarshipBalance, ScholarshipSource,
} from '@/lib/types';

const IN_CHUNK = 150; // ids per .in() — keeps the request URL short

async function currentEmail(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email || null;
}

function chunks<T>(arr: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const blankToNull = (v: any) => (v === '' || v === undefined ? null : v);

/** Turn a Postgres/PostgREST error into a Hebrew-friendly message (trigger messages are Hebrew already). */
export function scholarshipError(e: any): string {
  const msg = e?.message || String(e);
  if (/duplicate key.*scholarship_types_name/.test(msg)) return 'כבר קיים רכיב בשם הזה';
  if (/duplicate key.*batch_id_student_id/.test(msg)) return 'לתלמיד כבר יש זכאות בחיוב הזה';
  if (/violates foreign key.*scholarship_entries_type_id/.test(msg)) return 'לרכיב יש זכאויות — אפשר רק להשבית אותו';
  return msg;
}

// ---------------- types (רכיבים) ----------------

async function listTypes(includeInactive = true): Promise<ScholarshipType[]> {
  let q = supabase.from('scholarship_types').select('*').order('sort_order').order('name');
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as ScholarshipType[];
}

async function saveType(t: Partial<ScholarshipType> & { name: string }): Promise<ScholarshipType> {
  const row = {
    name: t.name.trim(),
    source: t.source || 'manual',
    yemot_extension: t.source === 'yemot' ? blankToNull(t.yemot_extension) : null,
    default_amount: t.default_amount === null || t.default_amount === undefined || (t.default_amount as any) === '' ? null : Number(t.default_amount),
    sort_order: Number(t.sort_order) || 0,
    is_active: t.is_active ?? true,
  };
  const q = t.id
    ? supabase.from('scholarship_types').update(row).eq('id', t.id).select().single()
    : supabase.from('scholarship_types').insert(row).select().single();
  const { data, error } = await q;
  if (error) throw new Error(scholarshipError(error));
  return data as ScholarshipType;
}

async function typeHasEntries(typeId: string): Promise<boolean> {
  const { count } = await supabase.from('scholarship_entries').select('id', { count: 'exact', head: true }).eq('type_id', typeId);
  return (count || 0) > 0;
}

/** A type with entries is never deleted — only deactivated. Returns what happened. */
async function removeType(typeId: string): Promise<'deleted' | 'deactivated'> {
  const { count } = await supabase.from('scholarship_batches').select('id', { count: 'exact', head: true }).eq('type_id', typeId);
  if ((count || 0) > 0 || (await typeHasEntries(typeId))) {
    const { error } = await supabase.from('scholarship_types').update({ is_active: false }).eq('id', typeId);
    if (error) throw new Error(scholarshipError(error));
    return 'deactivated';
  }
  const { error } = await supabase.from('scholarship_types').delete().eq('id', typeId);
  if (error) throw new Error(scholarshipError(error));
  return 'deleted';
}

// ---------------- batches (חיובים תקופתיים) ----------------

async function listBatches(opts: { typeId?: string; source?: ScholarshipSource; limit?: number } = {}): Promise<ScholarshipBatch[]> {
  let q = supabase.from('scholarship_batches').select('*')
    .order('entry_date', { ascending: false }).order('created_at', { ascending: false });
  if (opts.typeId) q = q.eq('type_id', opts.typeId);
  if (opts.source) q = q.eq('source', opts.source);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as ScholarshipBatch[];
}

async function getBatch(id: string): Promise<ScholarshipBatch | null> {
  const { data, error } = await supabase.from('scholarship_batches').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as ScholarshipBatch) || null;
}

async function createBatch(b: {
  type_id: string; title: string; entry_date: string; source: ScholarshipSource;
  date_from?: string | null; date_to?: string | null; notes?: string | null;
}): Promise<ScholarshipBatch> {
  const { data, error } = await supabase.from('scholarship_batches').insert({
    type_id: b.type_id, title: b.title.trim(), entry_date: b.entry_date, source: b.source,
    date_from: blankToNull(b.date_from), date_to: blankToNull(b.date_to), notes: blankToNull(b.notes),
    created_by: await currentEmail(),
  }).select().single();
  if (error) throw new Error(scholarshipError(error));
  return data as ScholarshipBatch;
}

async function updateBatch(id: string, patch: Partial<Pick<ScholarshipBatch, 'title' | 'entry_date' | 'notes' | 'date_from' | 'date_to'>>): Promise<void> {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(patch)) clean[k] = blankToNull(v);
  const { error } = await supabase.from('scholarship_batches').update(clean).eq('id', id);
  if (error) throw new Error(scholarshipError(error));
}

/** Admin only (gated in UI). The DB refuses if the batch has paid entries. */
async function deleteBatch(id: string): Promise<void> {
  const { error } = await supabase.from('scholarship_batches').delete().eq('id', id);
  if (error) throw new Error(scholarshipError(error));
}

/** Day after the latest ימות batch of this type ended (default start for the next one). */
async function nextYemotStart(typeId: string): Promise<string | null> {
  const { data } = await supabase.from('scholarship_batches').select('date_to')
    .eq('type_id', typeId).eq('source', 'yemot').not('date_to', 'is', null)
    .order('date_to', { ascending: false }).limit(1);
  const last = data?.[0]?.date_to as string | undefined;
  if (!last) return null;
  const d = new Date(last + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Per-batch totals: students, sum, paid sum. */
async function batchStats(batchIds: string[]): Promise<Record<string, { students: number; total: number; paid: number }>> {
  const out: Record<string, { students: number; total: number; paid: number }> = {};
  for (const ids of chunks(batchIds)) {
    const rows = await fetchAll<{ batch_id: string; amount: number; payment_id: string | null }>(
      'scholarship_entries', 'batch_id, amount, payment_id', (q) => q.in('batch_id', ids));
    for (const r of rows) {
      const s = (out[r.batch_id] ||= { students: 0, total: 0, paid: 0 });
      s.students++;
      s.total += Number(r.amount) || 0;
      if (r.payment_id) s.paid += Number(r.amount) || 0;
    }
  }
  return out;
}

// ---------------- entries (זכאויות) ----------------

async function getBatchEntries(batchId: string): Promise<ScholarshipEntry[]> {
  return fetchAll<ScholarshipEntry>('scholarship_entries', '*', (q) => q.eq('batch_id', batchId));
}

/**
 * Save a batch's amounts from the quick-entry grid. amounts[student_id] = number (>0) or
 * null/0 (= no entitlement). Upserts changed unpaid rows; an emptied cell deletes the entry
 * unless it was paid (paid rows are never touched).
 */
async function saveBatchAmounts(
  batchId: string,
  amounts: Record<string, number | null>,
): Promise<{ upserted: number; deleted: number; skippedPaid: number }> {
  const existing = await getBatchEntries(batchId);
  const byStudent = new Map(existing.map((e) => [e.student_id, e]));
  const upserts: { batch_id: string; student_id: string; amount: number }[] = [];
  const deletes: string[] = [];
  let skippedPaid = 0;

  for (const [studentId, raw] of Object.entries(amounts)) {
    const amount = raw === null || raw === undefined || !Number.isFinite(Number(raw)) ? 0 : Math.round(Number(raw) * 100) / 100;
    const ex = byStudent.get(studentId);
    if (ex?.payment_id) {
      if (Number(ex.amount) !== amount) skippedPaid++;
      continue;
    }
    if (amount > 0) {
      if (!ex || Number(ex.amount) !== amount) upserts.push({ batch_id: batchId, student_id: studentId, amount });
    } else if (ex) {
      deletes.push(ex.id);
    }
  }

  for (const part of chunks(upserts, 500)) {
    const { error } = await supabase.from('scholarship_entries').upsert(part, { onConflict: 'batch_id,student_id' });
    if (error) throw new Error(scholarshipError(error));
  }
  for (const ids of chunks(deletes)) {
    const { error } = await supabase.from('scholarship_entries').delete().in('id', ids);
    if (error) throw new Error(scholarshipError(error));
  }
  return { upserted: upserts.length, deleted: deletes.length, skippedPaid };
}

async function addEntry(batchId: string, studentId: string, amount: number, notes?: string | null): Promise<ScholarshipEntry> {
  const { data, error } = await supabase.from('scholarship_entries')
    .insert({ batch_id: batchId, student_id: studentId, amount, notes: blankToNull(notes) })
    .select().single();
  if (error) throw new Error(scholarshipError(error));
  return data as ScholarshipEntry;
}

async function updateEntry(id: string, patch: { amount?: number; notes?: string | null }): Promise<void> {
  const { error } = await supabase.from('scholarship_entries').update(patch).eq('id', id);
  if (error) throw new Error(scholarshipError(error));
}

async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('scholarship_entries').delete().eq('id', id);
  if (error) throw new Error(scholarshipError(error));
}

export interface EntryFilter {
  typeIds?: string[];
  batchIds?: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
  onlyUnpaid?: boolean;
  studentIds?: string[];
}

/** Entries matching a report filter (paginated past 1000). */
async function fetchEntries(f: EntryFilter): Promise<ScholarshipEntry[]> {
  const apply = (q: any) => {
    if (f.batchIds?.length) q = q.in('batch_id', f.batchIds);
    else if (f.typeIds?.length) q = q.in('type_id', f.typeIds);
    if (f.dateFrom) q = q.gte('entry_date', f.dateFrom);
    if (f.dateTo) q = q.lte('entry_date', f.dateTo);
    if (f.onlyUnpaid) q = q.is('payment_id', null);
    return q;
  };
  if (f.studentIds?.length) {
    const out: ScholarshipEntry[] = [];
    for (const ids of chunks(f.studentIds)) out.push(...await fetchAll<ScholarshipEntry>('scholarship_entries', '*', (q) => apply(q.in('student_id', ids))));
    return out;
  }
  return fetchAll<ScholarshipEntry>('scholarship_entries', '*', apply);
}

async function fetchEntriesByIds(ids: string[]): Promise<ScholarshipEntry[]> {
  const out: ScholarshipEntry[] = [];
  for (const part of chunks(ids)) {
    const { data, error } = await supabase.from('scholarship_entries').select('*').in('id', part);
    if (error) throw error;
    out.push(...((data || []) as ScholarshipEntry[]));
  }
  return out;
}

// ---------------- runs (הפקות) ----------------

async function createRun(title: string, filters: ScholarshipRunFilters, entryIds: string[]): Promise<ScholarshipRun> {
  const { data, error } = await supabase.from('scholarship_runs')
    .insert({ title, filters, entry_ids: entryIds, created_by: await currentEmail() })
    .select().single();
  if (error) throw new Error(scholarshipError(error));
  return data as ScholarshipRun;
}

async function listRuns(limit = 50): Promise<ScholarshipRun[]> {
  const { data, error } = await supabase.from('scholarship_runs').select('*')
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data || []) as ScholarshipRun[];
}

async function getRun(id: string): Promise<ScholarshipRun | null> {
  const { data, error } = await supabase.from('scholarship_runs').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as ScholarshipRun) || null;
}

// ---------------- payments (תשלומים) ----------------

/**
 * Mark entries as paid on a date: one scholarship_payments row per student (amount = sum of
 * that student's marked entries), and payment_id set on each entry. Already-paid entries
 * are skipped.
 */
async function markPaid(opts: { entryIds: string[]; paidAt: string; notes?: string | null; runId?: string | null }):
  Promise<{ payments: number; entries: number; total: number }> {
  const entries = (await fetchEntriesByIds(opts.entryIds)).filter((e) => !e.payment_id);
  const byStudent = new Map<string, ScholarshipEntry[]>();
  for (const e of entries) {
    if (!byStudent.has(e.student_id)) byStudent.set(e.student_id, []);
    byStudent.get(e.student_id)!.push(e);
  }
  const createdBy = await currentEmail();
  let payments = 0, done = 0, total = 0;
  for (const [studentId, list] of byStudent) {
    const amount = Math.round(list.reduce((s, e) => s + Number(e.amount), 0) * 100) / 100;
    const { data: pay, error } = await supabase.from('scholarship_payments').insert({
      student_id: studentId, paid_at: opts.paidAt, amount,
      run_id: opts.runId || null, notes: blankToNull(opts.notes), created_by: createdBy,
    }).select('id').single();
    if (error || !pay) throw new Error(scholarshipError(error));
    const { error: e2 } = await supabase.from('scholarship_entries')
      .update({ payment_id: pay.id }).in('id', list.map((e) => e.id)).is('payment_id', null);
    if (e2) throw new Error(scholarshipError(e2));
    payments++; done += list.length; total += amount;
  }
  return { payments, entries: done, total: Math.round(total * 100) / 100 };
}

/** Admin only (gated in UI): delete the payment → its entries become open debt again (FK SET NULL). */
async function cancelPayment(paymentId: string): Promise<void> {
  const { error } = await supabase.from('scholarship_payments').delete().eq('id', paymentId);
  if (error) throw new Error(scholarshipError(error));
}

// ---------------- one-time payments (תשלומים חד פעמיים, mig 058) ----------------
// Each one-time item = its own batch (title = description) + one entry, under the
// type with kind='one_time'. So reports, mark-payment and the student ledger just work.

async function getOneTimeType(): Promise<ScholarshipType> {
  const { data, error } = await supabase.from('scholarship_types').select('*').eq('kind', 'one_time').order('created_at').limit(1);
  if (error) throw new Error(scholarshipError(error));
  if (!data?.[0]) throw new Error('חסר סוג "תשלומים חד פעמיים" — יש להריץ את מיגרציה 058');
  return data[0] as ScholarshipType;
}

export interface OneTimeItem {
  entry: ScholarshipEntry;
  batch: ScholarshipBatch;
  payment: ScholarshipPayment | null;
}

async function addOneTime(opts: { studentId: string; amount: number; description: string; date: string; notes?: string | null }): Promise<ScholarshipEntry> {
  const type = await getOneTimeType();
  const batch = await createBatch({ type_id: type.id, title: opts.description.trim() || 'תשלום חד פעמי', entry_date: opts.date, source: 'manual' });
  try {
    return await addEntry(batch.id, opts.studentId, opts.amount, opts.notes);
  } catch (e) {
    await supabase.from('scholarship_batches').delete().eq('id', batch.id);
    throw e;
  }
}

async function listOneTime(): Promise<OneTimeItem[]> {
  const type = await getOneTimeType();
  const [batches, entries] = await Promise.all([
    fetchAll<ScholarshipBatch>('scholarship_batches', '*', (q) => q.eq('type_id', type.id)),
    fetchAll<ScholarshipEntry>('scholarship_entries', '*', (q) => q.eq('type_id', type.id)),
  ]);
  const byBatch = new Map(batches.map((b) => [b.id, b]));
  const payIds = Array.from(new Set(entries.map((e) => e.payment_id).filter(Boolean))) as string[];
  const pays = payIds.length ? await fetchPayments({ ids: payIds }) : [];
  const payById = new Map(pays.map((p) => [p.id, p]));
  return entries
    .filter((e) => byBatch.has(e.batch_id))
    .map((e) => ({ entry: { ...e, amount: Number(e.amount) }, batch: byBatch.get(e.batch_id)!, payment: e.payment_id ? payById.get(e.payment_id) || null : null }))
    .sort((a, b) => b.entry.entry_date.localeCompare(a.entry.entry_date) || b.entry.created_at.localeCompare(a.entry.created_at));
}

/** Remove an unpaid one-time item (its batch holds only this entry). */
async function deleteOneTime(entry: ScholarshipEntry): Promise<void> {
  if (entry.payment_id) throw new Error('התשלום כבר שולם — לא ניתן למחוק');
  const { error } = await supabase.from('scholarship_batches').delete().eq('id', entry.batch_id);
  if (error) throw new Error(scholarshipError(error));
}

/**
 * צ'ק בוטל (lost / torn / bounced): the payment is KEPT with status 'cancelled' (history on
 * the student card) and its entries are released back to open debt. With moveToOneTime the
 * amount becomes a one-time item ("צ'ק חלופי") and the released entries are closed by a
 * 'transfer' row, so they are not paid twice.
 */
async function cancelCheck(paymentId: string, reason: string, moveToOneTime: boolean): Promise<{ replacement?: ScholarshipEntry }> {
  const by = await currentEmail();
  const { data: pay, error } = await supabase.from('scholarship_payments').select('*').eq('id', paymentId).single();
  if (error || !pay) throw new Error('התשלום לא נמצא');
  if ((pay.status || 'paid') !== 'paid') throw new Error('הצ\'ק כבר מסומן כמבוטל');

  const { data: ents, error: e1 } = await supabase.from('scholarship_entries')
    .select('id, amount, scholarship_batches(title)').eq('payment_id', paymentId);
  if (e1) throw new Error(scholarshipError(e1));
  const entryIds = (ents || []).map((e: any) => e.id);

  // 1. release the entries (allowed by the lock trigger: only payment_id is cleared)
  if (entryIds.length) {
    const { error: e2 } = await supabase.from('scholarship_entries').update({ payment_id: null }).in('id', entryIds);
    if (e2) throw new Error(scholarshipError(e2));
  }
  // 2. mark the check cancelled
  const { error: e3 } = await supabase.from('scholarship_payments').update({
    status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: by, cancel_reason: reason || null,
  }).eq('id', paymentId);
  if (e3) throw new Error(scholarshipError(e3));

  if (!moveToOneTime || !entryIds.length) return {};

  // 3. replacement one-time item + close the released entries with a 'transfer' row
  const titles = Array.from(new Set((ents || []).map((e: any) => e.scholarship_batches?.title).filter(Boolean))).join(', ');
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const replacement = await addOneTime({
    studentId: pay.student_id, amount: Number(pay.amount), date: iso,
    description: `צ'ק חלופי${titles ? ` — ${titles}` : ''}`,
    notes: `במקום צ'ק מ-${String(pay.paid_at).split('-').reverse().join('/')} שבוטל${reason ? ` (${reason})` : ''}`,
  });
  const { data: tr, error: e4 } = await supabase.from('scholarship_payments').insert({
    student_id: pay.student_id, paid_at: iso, amount: Number(pay.amount), status: 'transfer',
    notes: 'הועבר לתשלום חד פעמי (צ\'ק חלופי)', created_by: by,
  }).select('id').single();
  if (e4 || !tr) throw new Error(scholarshipError(e4));
  const { error: e5 } = await supabase.from('scholarship_entries').update({ payment_id: tr.id }).in('id', entryIds).is('payment_id', null);
  if (e5) throw new Error(scholarshipError(e5));
  await supabase.from('scholarship_payments').update({ replacement_entry_id: replacement.id }).eq('id', paymentId);
  return { replacement };
}

async function fetchPayments(opts: { studentId?: string; ids?: string[]; runId?: string } = {}): Promise<ScholarshipPayment[]> {
  if (opts.ids) {
    const out: ScholarshipPayment[] = [];
    for (const part of chunks(opts.ids)) {
      const { data, error } = await supabase.from('scholarship_payments').select('*').in('id', part);
      if (error) throw error;
      out.push(...((data || []) as ScholarshipPayment[]));
    }
    return out;
  }
  return fetchAll<ScholarshipPayment>('scholarship_payments', '*', (q) => {
    if (opts.studentId) q = q.eq('student_id', opts.studentId);
    if (opts.runId) q = q.eq('run_id', opts.runId);
    return q;
  });
}

// ---------------- balances + student ledger ----------------

async function getBalances(studentIds?: string[]): Promise<ScholarshipBalance[]> {
  const norm = (r: any): ScholarshipBalance => ({
    ...r, total_charged: Number(r.total_charged) || 0, total_paid: Number(r.total_paid) || 0, balance: Number(r.balance) || 0,
  });
  if (studentIds) {
    const out: ScholarshipBalance[] = [];
    for (const part of chunks(studentIds)) {
      const { data, error } = await supabase.from('scholarship_balances').select('*').in('student_id', part);
      if (error) throw error;
      out.push(...(data || []).map(norm));
    }
    return out;
  }
  // view has no id column → plain pagination by student_id
  const all: ScholarshipBalance[] = [];
  for (let p = 0; p < 50; p++) {
    const { data, error } = await supabase.from('scholarship_balances').select('*')
      .order('student_id').order('type_id').range(p * 1000, p * 1000 + 999);
    if (error) throw error;
    if (!data?.length) break;
    all.push(...data.map(norm));
    if (data.length < 1000) break;
  }
  return all;
}

async function openBalance(studentId: string): Promise<number> {
  const rows = await getBalances([studentId]);
  return rows.reduce((s, r) => s + r.balance, 0);
}

export interface StudentLedger {
  entries: (ScholarshipEntry & { batch_title: string })[];
  payments: ScholarshipPayment[];
  balances: ScholarshipBalance[];
}

async function getStudentLedger(studentId: string): Promise<StudentLedger> {
  const [entriesRaw, payments, balances] = await Promise.all([
    fetchAll<any>('scholarship_entries', '*, scholarship_batches(title)', (q) => q.eq('student_id', studentId)),
    fetchPayments({ studentId }),
    getBalances([studentId]),
  ]);
  const entries = entriesRaw.map((e: any) => {
    const { scholarship_batches, ...rest } = e;
    return { ...rest, amount: Number(rest.amount), batch_title: scholarship_batches?.title || '' };
  });
  return { entries, payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })), balances };
}

export function useScholarships() {
  return useMemo(() => ({
    listTypes, saveType, removeType, typeHasEntries,
    listBatches, getBatch, createBatch, updateBatch, deleteBatch, nextYemotStart, batchStats,
    getBatchEntries, saveBatchAmounts, addEntry, updateEntry, deleteEntry, fetchEntries, fetchEntriesByIds,
    createRun, listRuns, getRun,
    markPaid, cancelPayment, cancelCheck, fetchPayments,
    getOneTimeType, addOneTime, listOneTime, deleteOneTime,
    getBalances, openBalance, getStudentLedger,
  }), []);
}
