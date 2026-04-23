import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  disableCreditKeva,
  enableCreditKeva,
  deleteCreditKeva,
} from '@/lib/nedarim-api';

export const maxDuration = 60;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/nedarim/process-queue
 * Drains nedarim_action_queue - calls Nedarim API for each pending action.
 * Typical actions: suspend / resume / delete an HK.
 *
 * Should be called:
 *   - Manually by admin via a button
 *   - On a cron schedule (e.g. every hour)
 */
export async function POST(_req: NextRequest) {
  const db = adminClient();
  const summary = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    errors: [] as string[],
  };

  const { data: queue } = await db
    .from('nedarim_action_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50);

  for (const item of queue || []) {
    summary.processed++;
    // Mark in_progress
    await db
      .from('nedarim_action_queue')
      .update({ status: 'in_progress', attempts: (item.attempts || 0) + 1 })
      .eq('id', item.id);

    try {
      let res: any;
      switch (item.action) {
        case 'suspend':
          res = await disableCreditKeva(item.nedarim_keva_id);
          break;
        case 'resume':
          res = await enableCreditKeva(item.nedarim_keva_id);
          break;
        case 'delete':
          res = await deleteCreditKeva(item.nedarim_keva_id);
          break;
        default:
          throw new Error(`Unknown action: ${item.action}`);
      }

      // Nedarim returns OK/Error in text or JSON - treat non-OK string as failure
      const success =
        res?.Result === 'OK' ||
        res?.Status === 'OK' ||
        (typeof res?.raw === 'string' && res.raw.trim().startsWith('OK'));

      if (!success) {
        const msg = res?.Message || res?.raw || 'unknown response';
        throw new Error(`Nedarim refused: ${msg}`);
      }

      await db
        .from('nedarim_action_queue')
        .update({ status: 'done', processed_at: new Date().toISOString(), last_error: null })
        .eq('id', item.id);
      summary.succeeded++;
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      summary.errors.push(`${item.action} ${item.nedarim_keva_id}: ${errorMsg}`);
      summary.failed++;
      await db
        .from('nedarim_action_queue')
        .update({ status: 'failed', last_error: errorMsg, processed_at: new Date().toISOString() })
        .eq('id', item.id);
    }
  }

  return NextResponse.json({ ok: true, summary });
}

/**
 * GET /api/nedarim/process-queue
 * Returns current queue state (pending/in-progress/failed items) for UI.
 */
export async function GET() {
  const db = adminClient();
  const { data } = await db
    .from('nedarim_action_queue')
    .select('*')
    .in('status', ['pending', 'in_progress', 'failed'])
    .order('created_at', { ascending: false })
    .limit(100);
  return NextResponse.json({ items: data || [] });
}
