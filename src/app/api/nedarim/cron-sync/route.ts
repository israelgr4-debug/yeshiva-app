import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

// GET /api/nedarim/cron-sync — daily Vercel Cron (see vercel.json).
// Runs, in order: subscription sync, transaction sync (mirrors successful credit
// charges into payment_history), and process-queue (executes queued HK actions —
// suspend a leaver's HK / resume on return). Set CRON_SECRET in Vercel env to lock
// this to Vercel Cron; Vercel sends it as `Authorization: Bearer <secret>`.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const origin = req.nextUrl.origin;
  const results: Record<string, any> = {};
  // process-queue LAST: execute queued HK actions (suspend on leave / resume on return)
  // after subscriptions are synced.
  for (const path of ['/api/nedarim/sync', '/api/nedarim/sync-transactions', '/api/nedarim/process-queue']) {
    try {
      const r = await fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      results[path] = await r.json().catch(() => ({ ok: r.ok }));
    } catch (e: any) {
      results[path] = { ok: false, error: e?.message || String(e) };
    }
  }
  return NextResponse.json({ ok: true, results });
}
