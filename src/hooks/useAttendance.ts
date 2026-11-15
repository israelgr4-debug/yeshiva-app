'use client';

// Data layer for ביקורת נוכחות (mig 061) — the logged-in side: the eligible list, opening /
// closing an audit, history. The LIVE state of an open audit is read through the team
// endpoint (see components/attendance/live.tsx), the same one the public team link uses.

import { useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/supabase-paginate';
import {
  AttendanceAudit, AuditKind, AuditStudent, DatStored, DAT_SETTING, EligibleRow, NewAuditStudent,
  STUDENT_AUDIT_COLS, Squad, SquadInfo, SquadLeader, StudentForAudit, buildAuditRows, buildEligible, freeSquadName,
} from '@/lib/attendance';

async function currentEmail(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email || null;
}

function randomHex(bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
function randomCode(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(1000 + (a[0] % 9000));
}

/** The stored Ministry of Religion file + everyone on it who is eligible, matched to students. */
async function loadEligible(): Promise<{ dat: DatStored | null; rows: EligibleRow[]; excluded: EligibleRow[] }> {
  const [{ data: st }, students] = await Promise.all([
    supabase.from('system_settings').select('value').eq('key', DAT_SETTING).maybeSingle(),
    fetchAll<StudentForAudit>('students', STUDENT_AUDIT_COLS),
  ]);
  const dat = (st?.value as DatStored) || null;
  return { dat, ...buildEligible(dat, students) };
}

async function listAudits(): Promise<AttendanceAudit[]> {
  const { data, error } = await supabase.from('attendance_audits').select('*').order('opened_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data || []) as AttendanceAudit[];
}

async function getOpenAudit(): Promise<AttendanceAudit | null> {
  const { data, error } = await supabase.from('attendance_audits').select('*').eq('status', 'open').maybeSingle();
  if (error) throw error;
  return (data as AttendanceAudit) || null;
}

async function auditStudents(auditId: string): Promise<AuditStudent[]> {
  return fetchAll<AuditStudent>('attendance_audit_students', '*', (q) => q.eq('audit_id', auditId));
}

export interface OpenAuditInput {
  title: string;
  kind: AuditKind;
  targetPct: number;
  robotAuto: boolean;
  robotIntervalMin: number;
  /** real / practice: the eligible list as it is now */
  eligible?: EligibleRow[];
  dat?: DatStored | null;
  /** repeat: the audit it repeats — exactly the same list, the missing ones flagged */
  parentId?: string;
}

async function openAudit(input: OpenAuditInput): Promise<AttendanceAudit> {
  let rows: NewAuditStudent[];
  let codeLength: number;
  let datFile: string | null = input.dat?.fileName || null;
  let datAt: string | null = input.dat?.uploadedAt || null;

  if (input.kind === 'repeat') {
    if (!input.parentId) throw new Error('לביקורת חוזרת יש לבחור את הביקורת הקודמת');
    const { data: parent } = await supabase.from('attendance_audits').select('*').eq('id', input.parentId).maybeSingle();
    if (!parent) throw new Error('הביקורת הקודמת לא נמצאה');
    const prev = await auditStudents(input.parentId);
    rows = prev.map((p) => ({
      student_id: p.student_id, code: p.code, id_number: p.id_number, last_name: p.last_name, first_name: p.first_name,
      grp: p.grp, shiur: p.shiur, room: p.room, phone: p.phone, prev_missing: !p.present,
    }));
    codeLength = (parent as AttendanceAudit).code_length;
    datFile = (parent as AttendanceAudit).dat_file_name;
    datAt = (parent as AttendanceAudit).dat_uploaded_at;
  } else {
    const built = buildAuditRows(input.eligible || []);
    rows = built.rows;
    codeLength = built.codeLength;
  }
  if (!rows.length) throw new Error('רשימת הזכאים ריקה — יש להעלות קובץ דתות בפעולות → השוואה למשרדים');

  // the division into groups is frozen with the list (nothing is sent before mig 062 / without groups)
  const snap = await squadSnapshot().catch(() => null);
  const withSquads = !!snap && snap.info.length > 0;
  if (withSquads) rows = rows.map((r) => ({ ...r, squad: (r.student_id && snap!.byStudent.get(r.student_id)) || null }));

  const { data: audit, error } = await supabase.from('attendance_audits').insert({
    title: input.title.trim(), kind: input.kind, status: 'open', target_pct: input.targetPct,
    parent_audit_id: input.parentId || null, access_token: randomHex(20), access_code: randomCode(), code_length: codeLength,
    dat_file_name: datFile, dat_uploaded_at: datAt,
    robot_auto: input.robotAuto, robot_interval_min: input.robotIntervalMin,
    opened_by: await currentEmail(),
    ...(withSquads ? { squads: snap!.info } : {}),
  }).select().single();
  if (error || !audit) {
    if (/attendance_audits_one_open/.test(error?.message || '')) throw new Error('כבר יש ביקורת פתוחה — יש לסגור אותה קודם');
    throw new Error(error?.message || 'פתיחת הביקורת נכשלה');
  }
  try {
    for (let i = 0; i < rows.length; i += 500) {
      const { error: e2 } = await supabase.from('attendance_audit_students').insert(rows.slice(i, i + 500).map((r) => ({ ...r, audit_id: audit.id })));
      if (e2) throw new Error(e2.message);
    }
  } catch (e) {
    await supabase.from('attendance_audits').delete().eq('id', audit.id);
    throw e;
  }
  return audit as AttendanceAudit;
}

async function closeAudit(id: string, notes?: string | null): Promise<void> {
  const { error } = await supabase.from('attendance_audits')
    .update({ status: 'closed', closed_at: new Date().toISOString(), closed_by: await currentEmail(), notes: notes || null }).eq('id', id);
  if (error) throw new Error(error.message);
}

async function updateAudit(id: string, patch: Partial<Pick<AttendanceAudit, 'robot_auto' | 'robot_interval_min' | 'title' | 'target_pct' | 'notes'>>): Promise<void> {
  const { error } = await supabase.from('attendance_audits').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

/** Admin only (gated in the UI). Rows and events go with it (cascade). */
async function deleteAudit(id: string): Promise<void> {
  const { error } = await supabase.from('attendance_audits').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** present / total per audit, for the history list. */
async function auditCounts(ids: string[]): Promise<Record<string, { total: number; present: number }>> {
  const out: Record<string, { total: number; present: number }> = {};
  for (const id of ids) {
    const rows = await fetchAll<{ present: boolean }>('attendance_audit_students', 'id, present', (q) => q.eq('audit_id', id));
    out[id] = { total: rows.length, present: rows.filter((r) => r.present).length };
  }
  return out;
}

// ---------------------------------------------------------------- groups (mig 062)

export interface SquadsData {
  /** false until migration 062 was run */
  ready: boolean;
  squads: Squad[];
  /** student id → squad id */
  memberOf: Record<string, string>;
}

const noTable = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''));

async function loadSquads(): Promise<SquadsData> {
  const { data, error } = await supabase.from('attendance_squads').select('*').order('sort_order').order('name');
  if (error) {
    if (noTable(error)) return { ready: false, squads: [], memberOf: {} };
    throw new Error(error.message);
  }
  const members = await fetchAll<{ student_id: string; squad_id: string }>('attendance_squad_members', 'student_id, squad_id');
  const memberOf: Record<string, string> = {};
  for (const m of members) memberOf[m.student_id] = m.squad_id;
  const squads = (data || []).map((r: any) => ({ ...r, leaders: Array.isArray(r.leaders) ? r.leaders : [] })) as Squad[];
  return { ready: true, squads, memberOf };
}

async function createSquad(name: string, sortOrder: number): Promise<Squad> {
  const { data, error } = await supabase.from('attendance_squads').insert({ name: name.trim(), sort_order: sortOrder }).select().single();
  if (error || !data) throw new Error(/duplicate|unique/i.test(error?.message || '') ? 'כבר יש קבוצה בשם הזה' : error?.message || 'יצירת הקבוצה נכשלה');
  return { ...(data as any), leaders: [] } as Squad;
}

async function updateSquad(id: string, patch: { name?: string; leaders?: SquadLeader[]; sort_order?: number }): Promise<void> {
  const { error } = await supabase.from('attendance_squads').update(patch).eq('id', id);
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'כבר יש קבוצה בשם הזה' : error.message);
}

/** The members go with it (cascade) — they become unassigned. */
async function deleteSquad(id: string): Promise<void> {
  const { error } = await supabase.from('attendance_squads').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Move students into a group (they leave the one they were in), or out of every group (null). */
async function assignSquad(studentIds: string[], squadId: string | null): Promise<void> {
  for (let i = 0; i < studentIds.length; i += 200) {
    const part = studentIds.slice(i, i + 200);
    const { error } = squadId
      ? await supabase.from('attendance_squad_members').upsert(part.map((student_id) => ({ student_id, squad_id: squadId })), { onConflict: 'student_id' })
      : await supabase.from('attendance_squad_members').delete().in('student_id', part);
    if (error) throw new Error(error.message);
  }
}

/** Create the groups of an automatic division. `replace` deletes every existing group first. */
async function applyAutoSquads(groups: { name: string; ids: string[] }[], replace: boolean): Promise<void> {
  const cur = await loadSquads();
  if (replace && cur.squads.length) {
    const { error } = await supabase.from('attendance_squads').delete().in('id', cur.squads.map((q) => q.id));
    if (error) throw new Error(error.message);
  }
  const taken = replace ? [] : cur.squads.map((q) => q.name);
  let order = replace ? 0 : cur.squads.reduce((a, q) => Math.max(a, q.sort_order), 0);
  for (const g of groups) {
    if (!g.ids.length) continue;
    const name = freeSquadName(g.name, taken);
    taken.push(name);
    const sq = await createSquad(name, ++order);
    await assignSquad(g.ids, sq.id);
  }
}

/** The division as an audit keeps it: group names + leaders, and each student's group name. */
async function squadSnapshot(): Promise<{ info: SquadInfo[]; byStudent: Map<string, string> }> {
  const { squads, memberOf } = await loadSquads();
  const name = new Map(squads.map((q) => [q.id, q.name]));
  const byStudent = new Map<string, string>();
  for (const [st, sq] of Object.entries(memberOf)) { const n = name.get(sq); if (n) byStudent.set(st, n); }
  return { info: squads.map((q) => ({ name: q.name, leaders: q.leaders.map((l) => ({ name: l.name, phone: l.phone || null })) })), byStudent };
}

/** Bring an OPEN audit up to date with the division as it is now. */
async function syncAuditSquads(auditId: string): Promise<void> {
  const snap = await squadSnapshot();
  const { error } = await supabase.from('attendance_audits').update({ squads: snap.info }).eq('id', auditId);
  if (error) throw new Error(error.message);
  const { error: e1 } = await supabase.from('attendance_audit_students').update({ squad: null }).eq('audit_id', auditId);
  if (e1) throw new Error(e1.message);
  const bySquad = new Map<string, string[]>();
  snap.byStudent.forEach((sq, st) => { if (!bySquad.has(sq)) bySquad.set(sq, []); bySquad.get(sq)!.push(st); });
  for (const [sq, ids] of Array.from(bySquad.entries())) {
    for (let i = 0; i < ids.length; i += 100) {
      const { error: e2 } = await supabase.from('attendance_audit_students').update({ squad: sq }).eq('audit_id', auditId).in('student_id', ids.slice(i, i + 100));
      if (e2) throw new Error(e2.message);
    }
  }
}

/** Bearer header for the /api/attendance/setup route. */
async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` };
}

export function useAttendance() {
  return useMemo(() => ({
    loadEligible, listAudits, getOpenAudit, auditStudents, openAudit, closeAudit, updateAudit, deleteAudit, auditCounts, authHeaders,
    loadSquads, createSquad, updateSquad, deleteSquad, assignSquad, applyAutoSquads, syncAuditSquads,
  }), []);
}

