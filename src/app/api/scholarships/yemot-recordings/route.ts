import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parseRecordingName, DEFAULT_RECORDINGS_PATH } from '@/lib/yemot-recordings';

// GET /api/scholarships/yemot-recordings?from=YYYY-MM-DD&to=YYYY-MM-DD → recordings list
// GET /api/scholarships/yemot-recordings?file=<what>                 → the audio (wav)
// Recordings stay in ימות; we only list them (GetIvrTree) and stream one on demand
// (DownloadFile) — the YEMOT_API_TOKEN never reaches the browser.

export const maxDuration = 60;
const API_BASE = 'https://www.call2all.co.il/ym/api/';

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function allowed(req: NextRequest): Promise<boolean> {
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!bearer) return false;
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: u, error } = await auth.auth.getUser(bearer);
  if (error || !u?.user) return false;
  const { data: au } = await admin().from('app_users').select('role, is_active').eq('id', u.user.id).maybeSingle();
  return !!au && au.is_active !== false && ['admin', 'secretary', 'manager'].includes(au.role);
}

async function recordingsPath(): Promise<string> {
  const { data } = await admin().from('system_settings').select('value').eq('key', 'yemot_recordings_path').maybeSingle();
  return ((data?.value as string) || DEFAULT_RECORDINGS_PATH).trim();
}

// "ivr2:/11/Record" and "ivr2:11/Record" are the same folder
const norm = (p: string) => p.replace(/^ivr2:\/?/, '').replace(/\/+$/, '');

export async function GET(req: NextRequest) {
  if (!(await allowed(req))) return NextResponse.json({ ok: false, error: 'אין הרשאה' }, { status: 401 });
  const token = process.env.YEMOT_API_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: 'YEMOT_API_TOKEN לא מוגדר ב-Vercel' }, { status: 500 });

  const sp = req.nextUrl.searchParams;
  const folder = await recordingsPath();

  // ---- one audio file ----
  const file = sp.get('file');
  if (file) {
    // only files inside the configured recordings folder, no path tricks
    const rel = norm(file);
    if (!rel.startsWith(norm(folder) + '/') || rel.includes('..') || !/\.wav$/i.test(rel)) {
      return NextResponse.json({ ok: false, error: 'קובץ לא חוקי' }, { status: 400 });
    }
    const r = await fetch(`${API_BASE}DownloadFile?token=${encodeURIComponent(token)}&path=${encodeURIComponent('ivr2:' + rel)}`, { cache: 'no-store' });
    const buf = await r.arrayBuffer();
    const head = new TextDecoder().decode(buf.slice(0, 40));
    if (!r.ok || head.startsWith('{')) {
      return NextResponse.json({ ok: false, error: 'הורדת ההקלטה מימות נכשלה' }, { status: 502 });
    }
    return new NextResponse(buf, {
      headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'private, max-age=3600' },
    });
  }

  // ---- list ----
  try {
    const r = await fetch(`${API_BASE}GetIvrTree?token=${encodeURIComponent(token)}&path=${encodeURIComponent(folder)}`, { cache: 'no-store' });
    const j = await r.json();
    if (j.responseStatus !== 'OK') {
      return NextResponse.json({ ok: false, error: `ימות: ${j.message || j.responseStatus}` }, { status: 502 });
    }
    const from = sp.get('from'), to = sp.get('to');
    let items = (j.items || [])
      .filter((it: any) => it.fileType === 'AUDIO' && /\.wav$/i.test(it.name || ''))
      .map((it: any) => parseRecordingName(it.name, it.what || `ivr2:${norm(folder)}/${it.name}`, it.duration, it.size));
    if (from || to) {
      items = items.filter((x: any) => {
        const d = x.callAt ? x.callAt.slice(0, 10) : null;
        return d && (!from || d >= from) && (!to || d <= to);
      });
    }
    items.sort((a: any, b: any) => (b.callAt || '').localeCompare(a.callAt || ''));
    return NextResponse.json({ ok: true, folder, total: (j.items || []).length, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'שגיאה בפנייה לימות: ' + (e?.message || e) }, { status: 502 });
  }
}
