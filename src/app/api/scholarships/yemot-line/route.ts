import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// GET  /api/scholarships/yemot-line  → current open window of the ימות line
// POST /api/scholarships/yemot-line  → change it (admin / secretary)
//
// The line's entry extension (default ivr2:/1/ext.ini) redirects callers to the data
// extension (/11) only inside a time window:
//   enter_after_time=YYYY-MM-DD-HH-MM-SS        line opens
//   enter_foldar_end_time=YYYY-MM-DD-HH-MM-SS   line closes   (ימות's own spelling)
// We change ONLY those two lines; everything else in the file is kept byte-for-byte.
// The previous file is saved in system_settings.yemot_line_backups before every write.

const API_BASE = 'https://www.call2all.co.il/ym/api/';
const DEFAULT_INI = 'ivr2:/1/ext.ini';
const OPEN_KEY = 'enter_after_time';
const CLOSE_KEY = 'enter_foldar_end_time';

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function authUser(req: NextRequest): Promise<{ email: string | null; role: string | null } | null> {
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!bearer) return null;
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: u, error } = await auth.auth.getUser(bearer);
  if (error || !u?.user) return null;
  const { data: au } = await admin().from('app_users').select('role, is_active').eq('id', u.user.id).maybeSingle();
  return { email: u.user.email || null, role: au?.is_active === false ? null : (au?.role || null) };
}

async function iniPath(): Promise<string> {
  const { data } = await admin().from('system_settings').select('value').eq('key', 'yemot_line_ini_path').maybeSingle();
  return (data?.value as string) || DEFAULT_INI;
}

async function readIni(token: string, path: string): Promise<string> {
  const r = await fetch(`${API_BASE}DownloadFile?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`, { cache: 'no-store' });
  const buf = Buffer.from(await r.arrayBuffer());
  const text = buf.toString('utf8');
  if (!r.ok || text.trim().startsWith('{"responseStatus"')) {
    let msg = text.slice(0, 200);
    try { const j = JSON.parse(text); msg = `${j.responseStatus} ${j.message || ''}`; } catch { /* raw */ }
    throw new Error(`קריאת ${path} נכשלה: ${msg}`);
  }
  return text;
}

// "2026-09-14-19-00-00" ↔ "2026-09-14T19:00" (Israel wall-clock)
const iniToLocal = (v: string | null) => {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})(?:-(\d{2}))?$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : null;
};
const localToIni = (v: string) => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) throw new Error('תאריך לא תקין: ' + v);
  return `${m[1]}-${m[2]}-${m[3]}-${m[4]}-${m[5]}-00`;
};
const nowIsraelLocal = () => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value;
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
};

function getKey(ini: string, key: string): string | null {
  const m = ini.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : null;
}
function setKey(ini: string, key: string, value: string): string {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(ini)) return ini.replace(re, `${key}=${value}`);
  return `${key}=${value}\n` + ini;
}

function state(ini: string) {
  const openAt = iniToLocal(getKey(ini, OPEN_KEY));
  const closeAt = iniToLocal(getKey(ini, CLOSE_KEY));
  const now = nowIsraelLocal();
  const isOpen = (!openAt || now >= openAt) && (!closeAt || now < closeAt);
  return { openAt, closeAt, now, isOpen, redirect: getKey(ini, 'go_to_folder') };
}

export async function GET(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ ok: false, error: 'לא מחובר' }, { status: 401 });
  const token = process.env.YEMOT_API_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: 'YEMOT_API_TOKEN לא מוגדר ב-Vercel' }, { status: 500 });
  try {
    const path = await iniPath();
    const ini = await readIni(token, path);
    return NextResponse.json({ ok: true, path, ...state(ini) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const user = await authUser(req);
  if (!user) return NextResponse.json({ ok: false, error: 'לא מחובר' }, { status: 401 });
  if (user.role !== 'admin' && user.role !== 'secretary') {
    return NextResponse.json({ ok: false, error: 'אין הרשאה לשנות את הקו' }, { status: 403 });
  }
  const token = process.env.YEMOT_API_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: 'YEMOT_API_TOKEN לא מוגדר ב-Vercel' }, { status: 500 });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  try {
    const path = await iniPath();
    const before = await readIni(token, path);
    if (before.includes('�')) throw new Error('הקובץ מכיל תווים בקידוד לא מוכר — לא נכתב כדי לא לפגוע בו');
    const cur = state(before);
    const now = cur.now;

    let openAt: string, closeAt: string;
    if (body.action === 'open_now') {
      if (!body.close_at) throw new Error('חובה לבחור מתי לסגור');
      openAt = now;
      closeAt = body.close_at;
    } else if (body.action === 'close_now') {
      openAt = cur.openAt && cur.openAt < now ? cur.openAt : now;
      closeAt = now;
    } else {
      if (!body.open_at || !body.close_at) throw new Error('חסר מועד פתיחה או סגירה');
      openAt = body.open_at;
      closeAt = body.close_at;
    }
    if (closeAt < openAt) throw new Error('מועד הסגירה לפני מועד הפתיחה');

    let after = setKey(before, OPEN_KEY, localToIni(openAt));
    after = setKey(after, CLOSE_KEY, localToIni(closeAt));
    if (after === before) return NextResponse.json({ ok: true, unchanged: true, path, ...state(before) });

    // backup (last 10 versions)
    const db = admin();
    const { data: bk } = await db.from('system_settings').select('value').eq('key', 'yemot_line_backups').maybeSingle();
    const backups = Array.isArray(bk?.value) ? bk!.value : [];
    backups.unshift({ at: new Date().toISOString(), by: user.email, path, contents: before });
    await db.from('system_settings').upsert({ key: 'yemot_line_backups', value: backups.slice(0, 10), updated_at: new Date().toISOString() }, { onConflict: 'key' });

    const form = new URLSearchParams({ token, what: path, contents: after });
    const w = await fetch(`${API_BASE}UploadTextFile`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString(),
    });
    const wj = await w.json().catch(() => ({}));
    if (wj.responseStatus !== 'OK') throw new Error(`כתיבה לימות נכשלה: ${wj.responseStatus || w.status} ${wj.message || ''}`);

    // verify by reading back
    const check = state(await readIni(token, path));
    if (check.openAt !== openAt || check.closeAt !== closeAt) {
      throw new Error(`נכתב אך הקריאה החוזרת שונה (${check.openAt} – ${check.closeAt})`);
    }
    return NextResponse.json({ ok: true, path, ...check });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
  }
}
