import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { yemotJsonToRows, parseYemotRows } from '@/lib/yemot-parse';
import { stripIdLeadingZeros } from '@/lib/israeli-validators';

export const maxDuration = 120;

// POST /api/scholarships/yemot-import
// Pulls the ימות המשיח data-extension file (RenderYMGRFile → JSON), converts it to the
// same A..M rows as the xlsx and stores new calls in scholarship_yemot_calls (dedup by
// dedupe_key, matched to students by ת"ז / alias). NEVER creates batches.
//   body {}            — UI "pull now" (requires a logged-in user)
//   body {auto:true}   — daily cron (CRON_SECRET); skipped unless yemot_auto_enabled
//   body {test:true}   — connection test: fetch + count, store nothing
// The token is the YEMOT_API_TOKEN env var (system_settings is readable by every user).

const API_BASE = 'https://www.call2all.co.il/ym/api/';
const DEFAULT_PATH = 'ivr2:/11/ApprovalAll.ymgr';

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function getSetting<T>(db: SupabaseClient, key: string, fallback: T): Promise<T> {
  const { data } = await db.from('system_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

async function fetchAllRows<T>(db: SupabaseClient, table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < 50; p++) {
    const { data, error } = await db.from(table).select(cols).order('id').range(p * 1000, p * 1000 + 999);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...(data as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

export async function GET() {
  // lets the settings screen show whether the token is configured (never the value)
  return NextResponse.json({ ok: true, tokenConfigured: !!process.env.YEMOT_API_TOKEN });
}

export async function POST(req: NextRequest) {
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const isCron = !!process.env.CRON_SECRET && bearer === process.env.CRON_SECRET;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body */ }

  if (!isCron) {
    if (!bearer) return NextResponse.json({ ok: false, error: 'לא מחובר' }, { status: 401 });
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: u, error } = await auth.auth.getUser(bearer);
    if (error || !u?.user) return NextResponse.json({ ok: false, error: 'הרשאה נדחתה' }, { status: 401 });
  }

  const token = process.env.YEMOT_API_TOKEN;
  if (!token) return NextResponse.json({ ok: false, error: 'YEMOT_API_TOKEN לא מוגדר ב-Vercel' }, { status: 500 });

  const db = adminClient();
  if (body.auto && !(await getSetting<boolean>(db, 'yemot_auto_enabled', false))) {
    return NextResponse.json({ ok: true, skipped: 'משיכה אוטומטית כבויה בהגדרות' });
  }
  const path = (await getSetting<string>(db, 'yemot_ymgr_path', DEFAULT_PATH)) || DEFAULT_PATH;

  // 1. fetch from ימות
  let data: Record<string, any>[];
  try {
    const url = `${API_BASE}RenderYMGRFile?token=${encodeURIComponent(token)}&wath=${encodeURIComponent(path)}&convertType=json&notLoadLang=0`;
    const r = await fetch(url, { cache: 'no-store' });
    const j = await r.json();
    if (j.responseStatus !== 'OK') {
      return NextResponse.json({ ok: false, error: `ימות: ${j.responseStatus || r.status} ${j.message || ''}`.trim() }, { status: 502 });
    }
    data = Array.isArray(j.data) ? j.data : [];
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'שגיאה בפנייה לימות: ' + (e?.message || e) }, { status: 502 });
  }

  // 2. only the extensions of active ימות scholarship types (the file also holds old tests)
  const { data: types } = await db.from('scholarship_types').select('yemot_extension').eq('source', 'yemot').eq('is_active', true);
  const exts = new Set((types || []).map((t: any) => String(t.yemot_extension || '').trim()).filter(Boolean));
  const parsed = parseYemotRows(yemotJsonToRows(data), null).filter((c) => !exts.size || (c.extension && exts.has(c.extension)));

  if (body.test) {
    const last = parsed.reduce<string | null>((m, c) => (c.call_at && (!m || c.call_at > m) ? c.call_at : m), null);
    return NextResponse.json({ ok: true, test: true, totalRecords: data.length, relevant: parsed.length, extensions: Array.from(exts), lastCall: last });
  }

  // 3. match ת"ז → student (id / passport without leading zeros, then aliases)
  const [studs, aliases] = await Promise.all([
    fetchAllRows<{ id: string; id_number: string | null; passport_number: string | null }>(db, 'students', 'id, id_number, passport_number'),
    fetchAllRows<{ raw_id_number: string; student_id: string }>(db, 'scholarship_id_aliases', 'id, raw_id_number, student_id'),
  ]);
  const byId = new Map<string, string>();
  for (const s of studs) for (const v of [s.id_number, s.passport_number]) {
    const k = stripIdLeadingZeros(v);
    if (k && !byId.has(k)) byId.set(k, s.id);
  }
  const aliasMap = new Map(aliases.map((a) => [stripIdLeadingZeros(a.raw_id_number), a.student_id]));

  // 4. store new calls (existing dedupe_key rows are untouched)
  const rows = parsed.map((c) => {
    const k = stripIdLeadingZeros(c.raw_id_number);
    const student_id = (k && (byId.get(k) || aliasMap.get(k))) || null;
    return {
      source: 'api', record_number: c.record_number, dedupe_key: c.dedupe_key, extension: c.extension,
      phone: c.phone, phone2: c.phone2, raw_id_number: c.raw_id_number, raw_name: c.raw_name, raw_shiur: c.raw_shiur,
      call_at: c.call_at, hebrew_date: c.hebrew_date, amount: c.amount, raw: c.raw,
      student_id, status: student_id ? 'pending' : 'unmatched',
    };
  });
  let inserted = 0, unmatched = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const { data: ins, error } = await db.from('scholarship_yemot_calls')
      .upsert(rows.slice(i, i + 500), { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('id, status');
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    inserted += ins?.length || 0;
    unmatched += (ins || []).filter((x: any) => x.status === 'unmatched').length;
  }

  await db.from('system_settings').upsert(
    { key: 'yemot_last_pull', value: { at: new Date().toISOString(), inserted, total: rows.length, auto: !!body.auto }, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );

  return NextResponse.json({ ok: true, totalRecords: data.length, relevant: rows.length, inserted, unmatched });
}
