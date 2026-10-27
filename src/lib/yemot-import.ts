// DB side of the ימות המשיח import: store calls (dedup), match ת"ז → student
// (students.id_number / passport_number ignoring leading zeros, then scholarship_id_aliases),
// manual rows, and status updates.

import { supabase } from './supabase';
import { fetchAll } from './supabase-paginate';
import { stripIdLeadingZeros } from './israeli-validators';
import { ParsedYemotCall, israelIso } from './yemot-parse';
import { ScholarshipYemotCall, ScholarshipIdAlias } from './types';

export interface IdIndex {
  byId: Map<string, string>;       // stripped ID → student_id
  aliases: Map<string, string>;    // stripped raw ID → student_id
}

export async function loadIdIndex(): Promise<IdIndex> {
  const [studs, aliases] = await Promise.all([
    fetchAll<{ id: string; id_number: string | null; passport_number: string | null }>('students', 'id, id_number, passport_number'),
    fetchAll<ScholarshipIdAlias>('scholarship_id_aliases', '*'),
  ]);
  const byId = new Map<string, string>();
  for (const s of studs) {
    for (const v of [s.id_number, s.passport_number]) {
      const k = stripIdLeadingZeros(v);
      if (k && !byId.has(k)) byId.set(k, s.id);
    }
  }
  return { byId, aliases: new Map(aliases.map((a) => [stripIdLeadingZeros(a.raw_id_number), a.student_id])) };
}

export function resolveStudent(rawId: string | null | undefined, idx: IdIndex): string | null {
  const k = stripIdLeadingZeros(rawId);
  if (!k) return null;
  return idx.byId.get(k) || idx.aliases.get(k) || null;
}

async function me(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email || null;
}

/** Save parsed calls; existing ones (same dedupe_key) are left untouched. */
export async function storeCalls(calls: ParsedYemotCall[], source: 'file' | 'api', idx: IdIndex): Promise<{ total: number; inserted: number }> {
  let inserted = 0;
  const rows = calls.map((c) => {
    const student_id = resolveStudent(c.raw_id_number, idx);
    return {
      source, record_number: c.record_number, dedupe_key: c.dedupe_key, extension: c.extension,
      phone: c.phone, phone2: c.phone2, raw_id_number: c.raw_id_number, raw_name: c.raw_name, raw_shiur: c.raw_shiur,
      call_at: c.call_at, hebrew_date: c.hebrew_date, amount: c.amount, raw: c.raw,
      student_id, status: student_id ? 'pending' : 'unmatched',
    };
  });
  for (let i = 0; i < rows.length; i += 500) {
    const { data, error } = await supabase.from('scholarship_yemot_calls')
      .upsert(rows.slice(i, i + 500), { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    inserted += data?.length || 0;
  }
  return { total: rows.length, inserted };
}

/** Unmatched calls whose ת"ז is now known (new student / new alias) → pending. */
export async function rematchUnmatched(idx: IdIndex): Promise<number> {
  const calls = await fetchAll<{ id: string; raw_id_number: string | null }>('scholarship_yemot_calls', 'id, raw_id_number',
    (q) => q.eq('status', 'unmatched').not('raw_id_number', 'is', null));
  const byStudent = new Map<string, string[]>();
  for (const c of calls) {
    const sid = resolveStudent(c.raw_id_number, idx);
    if (sid) { if (!byStudent.has(sid)) byStudent.set(sid, []); byStudent.get(sid)!.push(c.id); }
  }
  let n = 0;
  for (const [sid, ids] of byStudent) {
    const { error } = await supabase.from('scholarship_yemot_calls').update({ student_id: sid, status: 'pending' }).in('id', ids);
    if (error) throw error;
    n += ids.length;
  }
  return n;
}

/** Calls in [from..to] (Israel dates), plus undated hand-typed rows that are still unmatched. */
export async function fetchCallsForRange(from: string, to: string, extension: string | null): Promise<ScholarshipYemotCall[]> {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const lo = israelIso(fy, fm, fd, 0, 0, 0);
  const hi = israelIso(ty, tm, td, 23, 59, 59);
  const ext = (q: any) => (extension ? q.or(`extension.eq.${extension},extension.is.null`) : q);
  const [dated, undated] = await Promise.all([
    fetchAll<ScholarshipYemotCall>('scholarship_yemot_calls', '*', (q) => ext(q.gte('call_at', lo).lte('call_at', hi))),
    fetchAll<ScholarshipYemotCall>('scholarship_yemot_calls', '*', (q) => ext(q.is('call_at', null).eq('status', 'unmatched'))),
  ]);
  return [...dated, ...undated];
}

export async function addManualCall(opts: {
  studentId: string; rawId: string | null; name: string; shiur: string | null;
  amount: number; date: string; extension: string | null;
}): Promise<ScholarshipYemotCall> {
  const [y, m, d] = opts.date.split('-').map(Number);
  const { data, error } = await supabase.from('scholarship_yemot_calls').insert({
    source: 'manual', record_number: null, dedupe_key: null, added_by: await me(),
    extension: opts.extension, raw_id_number: stripIdLeadingZeros(opts.rawId) || null,
    raw_name: opts.name, raw_shiur: opts.shiur, call_at: israelIso(y, m, d, 12, 0, 0),
    amount: opts.amount, student_id: opts.studentId, status: 'pending',
  }).select().single();
  if (error) throw error;
  return data as ScholarshipYemotCall;
}

export async function updateCall(id: string, patch: Partial<Pick<ScholarshipYemotCall, 'amount' | 'call_at' | 'status' | 'student_id' | 'batch_id' | 'entry_id' | 'notes'>>) {
  const { error } = await supabase.from('scholarship_yemot_calls').update(patch).eq('id', id);
  if (error) throw error;
}

export async function updateCalls(ids: string[], patch: Partial<Pick<ScholarshipYemotCall, 'status' | 'student_id' | 'batch_id' | 'entry_id' | 'notes'>>) {
  for (let i = 0; i < ids.length; i += 150) {
    const { error } = await supabase.from('scholarship_yemot_calls').update(patch).in('id', ids.slice(i, i + 150));
    if (error) throw error;
  }
}

export async function deleteCall(id: string) {
  const { error } = await supabase.from('scholarship_yemot_calls').delete().eq('id', id).neq('status', 'included');
  if (error) throw error;
}

export async function createAlias(rawId: string, studentId: string, notes?: string | null) {
  const { error } = await supabase.from('scholarship_id_aliases').upsert({
    raw_id_number: stripIdLeadingZeros(rawId), student_id: studentId, notes: notes || null, created_by: await me(),
  }, { onConflict: 'raw_id_number' });
  if (error) throw error;
}

export async function listAliases(): Promise<ScholarshipIdAlias[]> {
  return fetchAll<ScholarshipIdAlias>('scholarship_id_aliases', '*');
}

export async function deleteAlias(id: string) {
  const { error } = await supabase.from('scholarship_id_aliases').delete().eq('id', id);
  if (error) throw error;
}

/** "HH:MM" Israel time of an ISO timestamp. */
export function israelTime(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}
