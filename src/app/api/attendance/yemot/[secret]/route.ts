import { NextRequest } from 'next/server';
import { normPhone, tts } from '@/lib/attendance';
import { attendanceDialog } from '@/lib/attendance-dialog';
import { adminDb, getAuditStudents, getOpenAudit, lastMarked, markByInput, setCallStatus, yemotCallbackSecret } from '@/lib/attendance-server';

// ימות "API extension" callback (ext.ini: type=api, api_link=<this url>). ימות calls it when a
// caller enters the extension and again after every entry; the conversation itself (marking
// for the markers, the personal menu for a missing student) is lib/attendance-dialog.ts.

const text = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

async function handle(secret: string, params: URLSearchParams) {
  const expected = yemotCallbackSecret();
  if (!expected || secret !== expected) return new Response('not found', { status: 404 });
  if (params.get('hangup') === 'yes') return text('');

  const db = adminDb();
  const audit = await getOpenAudit(db);
  if (!audit) return text(`id_list_message=${tts('אין ביקורת פתוחה כרגע')}`);
  const phone = normPhone(params.get('ApiPhone'));

  return text(await attendanceDialog(params, {
    // the caller is "a missing student" only when exactly one missing person has this phone
    caller: async () => {
      if (!phone) return null;
      const mine = (await getAuditStudents(db, audit.id)).filter((r) => !r.present && normPhone(r.phone) === phone);
      return mine.length === 1 ? mine[0] : null;
    },
    mark: (input) => markByInput(db, audit, input, 'phone', phone || null),
    last: () => lastMarked(db, audit.id, 5),
    setCall: (row, status, note) => setCallStatus(db, audit.id, row.id, status, note, phone || null, 'self'),
  }));
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
