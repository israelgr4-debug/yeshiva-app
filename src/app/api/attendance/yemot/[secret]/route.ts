import { NextRequest } from 'next/server';
import { adminDb, getOpenAudit, lastMarked, markByInput, sayName, tts, yemotCallbackSecret } from '@/lib/attendance-server';

// ימות "API extension" callback (ext.ini: type=api, api_link=<this url>) — marking attendance
// from a kosher phone. ימות calls this URL when the marker enters the extension and again
// after every entry; we answer in ימות's command syntax:
//   read=<message>=<value name>,<use existing>,<max digits>,<min digits>,<seconds>,<playback>,<block *>,<block 0>
// Every step asks for a NEW value name (c1, c2, …), so the latest entry is always the
// highest-numbered parameter, whatever ימות does with earlier values.
//
// The marker keys the code from the printed sheet (or a full ת"ז) and #.
//   *code#  cancels a marking        0#  reads the last five marked

const text = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
const ask = (n: number, ...say: string[]) => text(`read=${say.join('.')}=c${n},no,10,1,30,No,no,no`);

async function handle(secret: string, params: URLSearchParams) {
  const expected = yemotCallbackSecret();
  if (!expected || secret !== expected) return new Response('not found', { status: 404 });
  if (params.get('hangup') === 'yes') return text('');

  const db = adminDb();
  const audit = await getOpenAudit(db);
  if (!audit) return text(`id_list_message=${tts('אין ביקורת פתוחה כרגע')}`);

  // latest entry = the highest c<n>
  let step = 0, value = '';
  params.forEach((v, k) => {
    const m = k.match(/^c(\d+)$/);
    if (m && Number(m[1]) >= step) { step = Number(m[1]); value = v; }
  });
  const next = step + 1;
  if (!step) return ask(next, tts('ביקורת נוכחות'), tts('הקישו קוד תלמיד וסולמית'));

  const input = value.trim();
  const phone = params.get('ApiPhone') || null;

  if (input === '0') {
    const last = await lastMarked(db, audit.id, 5);
    if (!last.length) return ask(next, tts('עדיין לא סומן אף אחד'));
    return ask(next, tts('האחרונים שסומנו'), ...last.map((s) => tts(sayName(s))));
  }

  try {
    const r = await markByInput(db, audit, input, 'phone', phone);
    if (!r.ok) return ask(next, tts('לא נמצא'), `d-${input.replace(/\D/g, '')}`, tts('הקישו שוב'));
    const name = sayName(r.student);
    if (r.kind === 'present') return ask(next, tts(name), tts('נוכח'));
    if (r.kind === 'already') return ask(next, tts(name), tts('כבר סומן'));
    if (r.kind === 'undone') return ask(next, tts('בוטל'), tts(name));
    return ask(next, tts(name), tts('לא היה מסומן'));
  } catch {
    return ask(next, tts('תקלה בשמירה נסו שוב'));
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  return handle(secret, req.nextUrl.searchParams);
}

// ימות can be set to POST the same parameters (api_url_post=yes)
export async function POST(req: NextRequest, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  const params = new URLSearchParams(req.nextUrl.searchParams);
  try { new URLSearchParams(await req.text()).forEach((v, k) => params.append(k, v)); } catch { /* no body */ }
  return handle(secret, params);
}
