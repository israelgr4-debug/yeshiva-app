import { NextRequest, NextResponse } from 'next/server';
import { AttendanceAudit, AuditStudent, CallStatus, TeamAudit, TeamStudent } from '@/lib/attendance';
import { adminDb, getAuditStudents, runRobot, setCallStatus, setPresent } from '@/lib/attendance-server';

// The dedicated team link (/g/audit/<token>) — NO login. Identity = the link's token + the
// short code the manager gives the team. Works only while the audit is open; the payload
// has no ID numbers. The logged-in live screens use the same endpoint (they read the token
// and code from the audit row).
//
// GET  → live state (audit + list)
// POST → { action: 'present' | 'undo' | 'call' | 'tick', id?, status?, note?, actor? }

const CALL: CallStatus[] = ['none', 'coming', 'no_answer', 'cant'];

async function gate(token: string, code: string | null) {
  const db = adminDb();
  const { data } = await db.from('attendance_audits').select('*').eq('access_token', token).maybeSingle();
  const audit = data as AttendanceAudit | null;
  if (!audit) return { error: NextResponse.json({ ok: false, error: 'הקישור לא תקין' }, { status: 404 }) };
  if (!code || code.trim() !== audit.access_code) return { error: NextResponse.json({ ok: false, error: 'קוד שגוי' }, { status: 401 }) };
  if (audit.status !== 'open') return { error: NextResponse.json({ ok: false, closed: true, title: audit.title, error: 'הביקורת נסגרה' }, { status: 410 }) };
  return { db, audit };
}

const teamAudit = (a: AttendanceAudit): TeamAudit => ({
  title: a.title, kind: a.kind, status: a.status, target_pct: Number(a.target_pct), code_length: a.code_length,
  opened_at: a.opened_at, robot_auto: a.robot_auto, robot_interval_min: a.robot_interval_min,
  robot_last_run_at: a.robot_last_run_at, robot_runs: a.robot_runs,
});
const teamStudent = (s: AuditStudent): TeamStudent => ({
  id: s.id, code: s.code, last_name: s.last_name, first_name: s.first_name, grp: s.grp, shiur: s.shiur, room: s.room, phone: s.phone,
  present: s.present, present_at: s.present_at, marked_via: s.marked_via,
  call_status: s.call_status, call_note: s.call_note, call_at: s.call_at, prev_missing: s.prev_missing,
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const g = await gate(token, req.headers.get('x-audit-code'));
  if (g.error) return g.error;
  try {
    const students = await getAuditStudents(g.db, g.audit.id);
    return NextResponse.json({ ok: true, audit: teamAudit(g.audit), students: students.map(teamStudent), now: new Date().toISOString() },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const g = await gate(token, req.headers.get('x-audit-code'));
  if (g.error) return g.error;
  const { db, audit } = g;
  const actor = String(body.actor || '').slice(0, 60) || 'צוות';

  try {
    if (body.action === 'tick') {
      // the open screens drive the automatic robot (throttled + claimed on the server)
      const r = await runRobot(db, audit, 'auto', 'auto');
      return NextResponse.json({ ok: true, robot: r });
    }
    if (!body.id) return NextResponse.json({ ok: false, error: 'חסר מזהה' }, { status: 400 });
    const { data } = await db.from('attendance_audit_students').select('*').eq('id', body.id).eq('audit_id', audit.id).maybeSingle();
    const row = data as AuditStudent | null;
    if (!row) return NextResponse.json({ ok: false, error: 'לא נמצא ברשימה' }, { status: 404 });

    if (body.action === 'present' || body.action === 'undo') {
      const r = await setPresent(db, row, body.action === 'present', 'screen', actor);
      return NextResponse.json({ ok: true, kind: r.ok ? r.kind : 'not_found' });
    }
    if (body.action === 'call') {
      if (!CALL.includes(body.status)) return NextResponse.json({ ok: false, error: 'מצב לא מוכר' }, { status: 400 });
      await setCallStatus(db, audit.id, row.id, body.status, body.note ? String(body.note).slice(0, 200) : null, actor);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: 'פעולה לא מוכרת' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
