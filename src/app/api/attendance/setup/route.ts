import { NextRequest, NextResponse } from 'next/server';
import { AttendanceAudit, isValidPhone, normPhone } from '@/lib/attendance';
import {
  adminDb, authUser, defaultRobotText, robotConfig, robotDial, robotProblem, runRobot, yemotCallbackSecret,
  ROBOT_MODES, ROBOT_MODE_SETTING, ROBOT_TEMPLATE_SETTING, ROBOT_TEXT_SETTING, YEMOT_API, YEMOT_EXT_SETTING,
} from '@/lib/attendance-server';

// ביקורת נוכחות ↔ ימות המשיח setup (logged-in users only; the token never reaches the browser).
// GET  → is the marking extension set up, the system's top-level extensions, campaign templates
// POST → { action: 'create_extension', ext, force? }   write ext.ini of the marking extension
//        { action: 'confirm_extension', ext }          the admin wrote it by hand in ימות — check and remember
//        { action: 'set_template', templateId }        campaign template the robot runs
//        { action: 'robot', auditId }                  dial everyone still missing now
//        { action: 'set_robot', mode, text? }          how the robot calls: tts / template / bridge (+ the text it reads)
//        { action: 'robot_test', phone }               dial ONE number the way the robot would (try it before an audit)

export const maxDuration = 60;

const iniOf = (ext: string) => `ivr2:/${ext}/ext.ini`;

async function yemot(method: string, params: Record<string, string>, post = false): Promise<any> {
  const token = process.env.YEMOT_API_TOKEN!;
  const q = new URLSearchParams({ token, ...params });
  const r = post
    ? await fetch(`${YEMOT_API}${method}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: q.toString(), cache: 'no-store' })
    : await fetch(`${YEMOT_API}${method}?${q.toString()}`, { cache: 'no-store' });
  return r.json().catch(() => ({ responseStatus: 'ERROR', message: `HTTP ${r.status}` }));
}

/**
 * ext.ini text, or null when the extension has no such file. Two ways to read it, because
 * ימות answers differently for a file that was just created: DownloadFile (raw file), then
 * GetTextFile ({ contents }). `why` collects what ימות said, for the error message.
 */
async function readIni(ext: string, why?: string[]): Promise<string | null> {
  const token = process.env.YEMOT_API_TOKEN!;
  try {
    const r = await fetch(`${YEMOT_API}DownloadFile?token=${encodeURIComponent(token)}&path=${encodeURIComponent(iniOf(ext))}`, { cache: 'no-store' });
    const t = Buffer.from(await r.arrayBuffer()).toString('utf8');
    if (r.ok && t.trim() && !t.trim().startsWith('{"responseStatus"')) return t;
    why?.push(`DownloadFile: ${t.trim().slice(0, 140) || 'HTTP ' + r.status}`);
  } catch (e: any) { why?.push(`DownloadFile: ${e.message}`); }
  try {
    const j = await yemot('GetTextFile', { what: iniOf(ext) });
    if (j.responseStatus === 'OK' && typeof j.contents === 'string' && j.contents.trim()) return j.contents;
    why?.push(`GetTextFile: ${j.responseStatus || ''} ${j.message || ''}`.trim());
  } catch (e: any) { why?.push(`GetTextFile: ${e.message}`); }
  return null;
}

async function setting(key: string): Promise<string> {
  const { data } = await adminDb().from('system_settings').select('value').eq('key', key).maybeSingle();
  return data?.value ? String(data.value) : '';
}
const saveSetting = (key: string, value: string) =>
  adminDb().from('system_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

export async function GET(req: NextRequest) {
  const user = await authUser(req);
  if (!user?.role || !['admin', 'secretary', 'manager'].includes(user.role)) return NextResponse.json({ ok: false, error: 'אין הרשאה' }, { status: 401 });
  const secret = yemotCallbackSecret();
  if (!secret) return NextResponse.json({ ok: true, tokenMissing: true });
  try {
    const [ext, templateId, tree, tpl, robot] = await Promise.all([
      setting(YEMOT_EXT_SETTING), setting(ROBOT_TEMPLATE_SETTING),
      yemot('GetIvrTree', { path: 'ivr2:/' }), yemot('GetTemplates', {}), robotConfig(adminDb()),
    ]);
    const ini = ext ? await readIni(ext) : null;
    return NextResponse.json({
      ok: true,
      extension: ext,
      extensionOk: !!ini && ini.includes(secret),
      rootFolders: (tree.items || []).map((i: any) => String(i.name || '')).filter((n: string) => /^\d+$/.test(n))
        .sort((a: string, b: string) => Number(a) - Number(b)),
      treeError: tree.responseStatus === 'OK' ? null : (tree.message || tree.responseStatus),
      templateId,
      robotMode: robot.mode, robotText: robot.text, robotTextDefault: defaultRobotText(ext),
      templates: (tpl.templates || []).map((t: any) => ({ id: String(t.templateId), description: t.description || '', callerId: t.callerId || '', hasMessage: !!t.messageExists })),
      templatesError: tpl.responseStatus === 'OK' ? null : (tpl.message || tpl.responseStatus),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const user = await authUser(req);
  if (!user?.role) return NextResponse.json({ ok: false, error: 'לא מחובר' }, { status: 401 });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const secret = yemotCallbackSecret();
  if (!secret) return NextResponse.json({ ok: false, error: 'YEMOT_API_TOKEN לא מוגדר ב-Vercel' }, { status: 500 });

  try {
    if (body.action === 'robot') {
      if (!['admin', 'secretary'].includes(user.role)) return NextResponse.json({ ok: false, error: 'אין הרשאה' }, { status: 403 });
      const { data } = await adminDb().from('attendance_audits').select('*').eq('id', body.auditId).maybeSingle();
      if (!data) return NextResponse.json({ ok: false, error: 'הביקורת לא נמצאה' }, { status: 404 });
      return NextResponse.json(await runRobot(adminDb(), data as AttendanceAudit, 'manual', user.email));
    }

    if (user.role !== 'admin') return NextResponse.json({ ok: false, error: 'הגדרות ימות — למנהל מערכת בלבד' }, { status: 403 });

    if (body.action === 'set_template') {
      await saveSetting(ROBOT_TEMPLATE_SETTING, String(body.templateId || ''));
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'set_robot') {
      if (!ROBOT_MODES.includes(body.mode)) return NextResponse.json({ ok: false, error: 'מצב לא מוכר' }, { status: 400 });
      await saveSetting(ROBOT_MODE_SETTING, body.mode);
      if (typeof body.text === 'string') await saveSetting(ROBOT_TEXT_SETTING, body.text.trim().slice(0, 600));
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'robot_test') {
      const phone = normPhone(body.phone);
      if (!isValidPhone(phone)) return NextResponse.json({ ok: false, error: 'מספר הטלפון לא תקין' }, { status: 400 });
      const cfg = await robotConfig(adminDb());
      const problem = robotProblem(cfg);
      if (problem) return NextResponse.json({ ok: false, error: problem }, { status: 400 });
      const r = await robotDial(cfg, [phone]);
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
      return NextResponse.json({ ok: true, campaignId: r.campaignId || null });
    }

    if (body.action === 'confirm_extension') {
      const ext = String(body.ext || '').trim();
      if (!/^\d{1,3}$/.test(ext)) return NextResponse.json({ ok: false, error: 'מספר שלוחה לא תקין' }, { status: 400 });
      const why: string[] = [];
      const ini = await readIni(ext, why);
      if (!ini || !ini.includes(secret)) {
        return NextResponse.json({ ok: false, error: ini ? `בשלוחה ${ext} יש הגדרה אחרת, לא הקישור של סימון הנוכחות` : `לא הצלחתי לקרוא את ההגדרה של שלוחה ${ext} מימות (${why.join(' | ')})` }, { status: 409 });
      }
      await saveSetting(YEMOT_EXT_SETTING, ext);
      return NextResponse.json({ ok: true, extension: ext });
    }

    if (body.action === 'create_extension') {
      const ext = String(body.ext || '').trim();
      if (!/^\d{1,3}$/.test(ext)) return NextResponse.json({ ok: false, error: 'מספר שלוחה לא תקין' }, { status: 400 });
      const before = await readIni(ext);
      // never overwrite someone else's extension without an explicit yes
      if (before && !before.includes(secret) && !body.force) {
        return NextResponse.json({ ok: false, exists: true, current: before.slice(0, 600), error: `שלוחה ${ext} כבר קיימת ומוגדרת למשהו אחר` }, { status: 409 });
      }
      const link = `${req.nextUrl.origin}/api/attendance/yemot/${secret}`;
      const contents = `type=api\napi_link=${link}\napi_hangup_send=no\n`;
      if (before && !before.includes(secret)) {
        const db = adminDb();
        const { data: bk } = await db.from('system_settings').select('value').eq('key', 'yemot_line_backups').maybeSingle();
        const backups = Array.isArray(bk?.value) ? bk!.value : [];
        backups.unshift({ at: new Date().toISOString(), by: user.email, path: iniOf(ext), contents: before });
        await db.from('system_settings').upsert({ key: 'yemot_line_backups', value: backups.slice(0, 10), updated_at: new Date().toISOString() }, { onConflict: 'key' });
      }
      // Two ways to write, each verified by reading back: the ini file itself, and — for an
      // extension that does not exist yet — UpdateExtension, which creates the folder.
      const steps: string[] = [];
      const written = async () => { const t = await readIni(ext, steps); return !!t && t.includes(secret); };
      const w = await yemot('UploadTextFile', { what: iniOf(ext), contents }, true);
      steps.push(`UploadTextFile: ${w.responseStatus || ''} ${w.message || ''}`.trim());
      let ok = w.responseStatus === 'OK' && await written();
      if (!ok) {
        const u = await yemot('UpdateExtension', { path: `ivr2:/${ext}`, type: 'api', api_link: link, api_hangup_send: 'no' }, true);
        steps.push(`UpdateExtension: ${u.responseStatus || ''} ${u.message || ''}`.trim());
        ok = u.responseStatus === 'OK' && await written();
      }
      if (!ok) {
        // the admin can still set it by hand in ימות — hand him the exact lines
        return NextResponse.json({
          ok: false, manual: contents, ext,
          error: `ימות לא אישרה את כתיבת השלוחה. (${steps.join(' | ').split(secret).join('…')})`,
        }, { status: 502 });
      }
      await saveSetting(YEMOT_EXT_SETTING, ext);
      return NextResponse.json({ ok: true, extension: ext });
    }
    return NextResponse.json({ ok: false, error: 'פעולה לא מוכרת' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
  }
}
