import { NextRequest, NextResponse } from 'next/server';
import { AttendanceAudit } from '@/lib/attendance';
import { adminDb, authUser, runRobot, yemotCallbackSecret, ROBOT_TEMPLATE_SETTING, YEMOT_API, YEMOT_EXT_SETTING } from '@/lib/attendance-server';

// ביקורת נוכחות ↔ ימות המשיח setup (logged-in users only; the token never reaches the browser).
// GET  → is the marking extension set up, the system's top-level extensions, campaign templates
// POST → { action: 'create_extension', ext, force? }   write ext.ini of the marking extension
//        { action: 'set_template', templateId }        campaign template the robot runs
//        { action: 'robot', auditId }                  dial everyone still missing now

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

/** ext.ini text, or null when the extension has no such file. */
async function readIni(ext: string): Promise<string | null> {
  const token = process.env.YEMOT_API_TOKEN!;
  const r = await fetch(`${YEMOT_API}DownloadFile?token=${encodeURIComponent(token)}&path=${encodeURIComponent(iniOf(ext))}`, { cache: 'no-store' });
  const t = Buffer.from(await r.arrayBuffer()).toString('utf8');
  if (!r.ok || t.trim().startsWith('{"responseStatus"')) return null;
  return t;
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
    const [ext, templateId, tree, tpl] = await Promise.all([
      setting(YEMOT_EXT_SETTING), setting(ROBOT_TEMPLATE_SETTING),
      yemot('GetIvrTree', { path: 'ivr2:/' }), yemot('GetTemplates', {}),
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
      const w = await yemot('UploadTextFile', { what: iniOf(ext), contents }, true);
      if (w.responseStatus !== 'OK') throw new Error(`כתיבה לימות נכשלה: ${w.responseStatus} ${w.message || ''}`);
      const after = await readIni(ext);
      if (!after || !after.includes(secret)) throw new Error('הקובץ נכתב, אבל בקריאה חוזרת הוא לא נמצא כפי שנכתב');
      await saveSetting(YEMOT_EXT_SETTING, ext);
      return NextResponse.json({ ok: true, extension: ext });
    }
    return NextResponse.json({ ok: false, error: 'פעולה לא מוכרת' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
  }
}
