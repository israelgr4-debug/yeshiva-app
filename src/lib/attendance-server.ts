// Server side of ביקורת נוכחות — used by the API routes only (service role).
//   - marking present from the kosher phone (ימות API extension) and from the team link
//   - call-status updates
//   - the robot: a ימות campaign that dials everyone who is still missing

import { createHmac } from 'crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { AttendanceAudit, AuditStudent, CallStatus, MarkResult, comingUntil, isValidPhone, normPhone } from './attendance';

export const YEMOT_API = 'https://www.call2all.co.il/ym/api/';
export const ROBOT_TEMPLATE_SETTING = 'attendance_robot_template';
export const YEMOT_EXT_SETTING = 'attendance_yemot_extension';

export const adminDb = (): SupabaseClient =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

/** Logged-in app user (Bearer token) + role. */
export async function authUser(req: NextRequest): Promise<{ email: string | null; role: string | null } | null> {
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!bearer) return null;
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: u, error } = await auth.auth.getUser(bearer);
  if (error || !u?.user) return null;
  const { data: au } = await adminDb().from('app_users').select('role, is_active').eq('id', u.user.id).maybeSingle();
  return { email: u.user.email || null, role: au?.is_active === false ? null : (au?.role || null) };
}

/**
 * Secret path segment of the ימות callback URL. Derived from the ימות token, so it needs
 * no new env var and is never stored in the database.
 */
export function yemotCallbackSecret(): string | null {
  const token = process.env.YEMOT_API_TOKEN;
  if (!token) return null;
  return createHmac('sha256', token).update('attendance-audit-callback').digest('hex').slice(0, 28);
}

export async function getOpenAudit(db: SupabaseClient): Promise<AttendanceAudit | null> {
  const { data } = await db.from('attendance_audits').select('*').eq('status', 'open').maybeSingle();
  return (data as AttendanceAudit) || null;
}

export async function getAuditStudents(db: SupabaseClient, auditId: string): Promise<AuditStudent[]> {
  const all: AuditStudent[] = [];
  for (let p = 0; p < 10; p++) {
    const { data, error } = await db.from('attendance_audit_students').select('*').eq('audit_id', auditId).order('code').range(p * 1000, p * 1000 + 999);
    if (error) throw error;
    all.push(...((data || []) as AuditStudent[]));
    if (!data || data.length < 1000) break;
  }
  return all;
}

async function logEvent(db: SupabaseClient, auditId: string, studentRowId: string | null, action: string, via: string, actor: string | null, details?: any) {
  await db.from('attendance_audit_events').insert({ audit_id: auditId, audit_student_id: studentRowId, action, via, actor, details: details ?? null });
}

/** Mark one row present / undo. Only flips rows that are really in the other state (no double log). */
export async function setPresent(db: SupabaseClient, row: AuditStudent, present: boolean, via: string, actor: string | null): Promise<MarkResult> {
  const patch = present
    ? { present: true, present_at: new Date().toISOString(), marked_by: actor, marked_via: via }
    : { present: false, present_at: null, marked_by: null, marked_via: null };
  const { data, error } = await db.from('attendance_audit_students').update(patch)
    .eq('id', row.id).eq('present', !present).select('*');
  if (error) throw error;
  if (!data?.length) return { ok: true, kind: present ? 'already' : 'not_marked', student: row };
  await logEvent(db, row.audit_id, row.id, present ? 'present' : 'undo', via, actor);
  return { ok: true, kind: present ? 'present' : 'undone', student: data[0] as AuditStudent };
}

/**
 * What the marker keyed on the phone: the code from the printed sheet, or a full ת"ז
 * (8–9 digits). A leading * cancels a marking.
 */
export async function markByInput(db: SupabaseClient, audit: AttendanceAudit, raw: string, via: string, actor: string | null): Promise<MarkResult> {
  const undo = raw.startsWith('*');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return { ok: false, kind: 'not_found' };
  let row: AuditStudent | null = null;
  if (digits.length >= 8) {
    const want = digits.replace(/^0+/, '');
    const rows = await getAuditStudents(db, audit.id);
    row = rows.find((r) => String(r.id_number || '').replace(/\D/g, '').replace(/^0+/, '') === want) || null;
  } else {
    const { data } = await db.from('attendance_audit_students').select('*').eq('audit_id', audit.id).eq('code', digits).maybeSingle();
    row = (data as AuditStudent) || null;
  }
  if (!row) return { ok: false, kind: 'not_found' };
  return setPresent(db, row, !undo, via, actor);
}

export async function setCallStatus(db: SupabaseClient, auditId: string, rowId: string, status: CallStatus, note: string | null, actor: string | null, via = 'team') {
  const { error } = await db.from('attendance_audit_students')
    .update({ call_status: status, call_note: note, call_by: actor, call_at: new Date().toISOString() })
    .eq('id', rowId).eq('audit_id', auditId);
  if (error) throw error;
  await logEvent(db, auditId, rowId, 'call', via, actor, { status, note });
}

export async function lastMarked(db: SupabaseClient, auditId: string, n = 5): Promise<AuditStudent[]> {
  const { data } = await db.from('attendance_audit_students').select('*').eq('audit_id', auditId).eq('present', true)
    .order('present_at', { ascending: false }).limit(n);
  return (data || []) as AuditStudent[];
}

// ---------------- robot ----------------

export interface RobotResult { ok: boolean; skipped?: string; dialed?: number; error?: string; campaignId?: string }

/**
 * Dial everyone who is still missing with the ימות campaign template chosen in the settings.
 * Not dialed: no valid phone, "לא יכול", and "בדרך" until the time he gave has passed.
 * Whoever was missing in the previous audit is dialed first.
 * `auto` runs are throttled by robot_interval_min (claimed atomically, so two screens
 * ticking at once start one campaign).
 */
export async function runRobot(db: SupabaseClient, audit: AttendanceAudit, mode: 'manual' | 'auto', actor: string | null): Promise<RobotResult> {
  const token = process.env.YEMOT_API_TOKEN;
  if (!token) return { ok: false, error: 'YEMOT_API_TOKEN לא מוגדר ב-Vercel' };
  if (audit.status !== 'open') return { ok: false, skipped: 'הביקורת סגורה' };
  const { data: st } = await db.from('system_settings').select('value').eq('key', ROBOT_TEMPLATE_SETTING).maybeSingle();
  const templateId = st?.value ? String(st.value) : '';
  if (!templateId) return { ok: false, error: 'לא נבחרה תבנית קמפיין לרובוט (ביקורת נוכחות → הגדרות)' };

  const now = Date.now();
  if (mode === 'auto') {
    if (!audit.robot_auto) return { ok: true, skipped: 'רובוט אוטומטי כבוי' };
    const gapMs = Math.max(2, audit.robot_interval_min) * 60000;
    if (audit.robot_last_run_at && now - new Date(audit.robot_last_run_at).getTime() < gapMs) return { ok: true, skipped: 'עוד לא הגיע הזמן' };
  }
  // claim the run (compare-and-set on the previous timestamp)
  let claim = db.from('attendance_audits').update({ robot_last_run_at: new Date(now).toISOString(), robot_runs: (audit.robot_runs || 0) + 1 })
    .eq('id', audit.id).eq('status', 'open');
  claim = audit.robot_last_run_at ? claim.eq('robot_last_run_at', audit.robot_last_run_at) : claim.is('robot_last_run_at', null);
  const { data: claimed } = await claim.select('id');
  if (!claimed?.length) return { ok: true, skipped: 'ריצה אחרת כבר התחילה' };

  const rows = await getAuditStudents(db, audit.id);
  const phones = Array.from(new Set(rows
    .filter((r) => !r.present && isValidPhone(r.phone) && r.call_status !== 'cant' && now >= comingUntil(r))
    .sort((a, b) => Number(b.prev_missing) - Number(a.prev_missing))
    .map((r) => normPhone(r.phone))));
  if (!phones.length) return { ok: true, skipped: 'אין למי לחייג', dialed: 0 };

  try {
    const body = new URLSearchParams({ token, templateId, phones: phones.join(':') });
    const r = await fetch(`${YEMOT_API}RunCampaign`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(), cache: 'no-store' });
    const j: any = await r.json().catch(() => ({}));
    const ok = j.responseStatus === 'OK';
    await logEvent(db, audit.id, null, 'robot', 'robot', actor || mode, { mode, phones: phones.length, ok, campaignId: j.campaignId || null, message: j.message || null, status: j.responseStatus || r.status });
    if (!ok) return { ok: false, error: `ימות: ${j.responseStatus || r.status} ${j.message || ''}`.trim() };
    return { ok: true, dialed: phones.length, campaignId: j.campaignId };
  } catch (e: any) {
    await logEvent(db, audit.id, null, 'robot', 'robot', actor || mode, { mode, phones: phones.length, ok: false, message: e.message });
    return { ok: false, error: e.message };
  }
}
