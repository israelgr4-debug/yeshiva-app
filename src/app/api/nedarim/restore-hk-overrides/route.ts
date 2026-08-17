import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateCreditKevaAmount } from '@/lib/nedarim-api';

export const maxDuration = 120;

// POST /api/nedarim/restore-hk-overrides
// Safety net: restore every temporarily-overridden credit HK back to its base amount
// once the override month's charge day has passed. Runs daily from cron-sync; can also
// be triggered by an authenticated user. Idempotent.
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const isCron = !!process.env.CRON_SECRET && token === process.env.CRON_SECRET;
  if (!isCron) {
    if (!token) return NextResponse.json({ ok: false, error: 'לא מחובר' }, { status: 401 });
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: u, error } = await auth.auth.getUser(token);
    if (error || !u?.user) return NextResponse.json({ ok: false, error: 'הרשאה נדחתה' }, { status: 401 });
  }

  const db = adminClient();
  const { data: pending } = await db.from('charge_adjustments').select('*')
    .not('hk_override_applied_at', 'is', null)
    .is('hk_override_restored_at', null);

  const today = new Date().toISOString().slice(0, 10);
  let restored = 0, waiting = 0, failed = 0;

  for (const adj of pending || []) {
    if (!adj.hk_keva_id) continue;
    const day = String(adj.hk_charge_day || 20).padStart(2, '0');
    const chargeDate = `${adj.month}-${day}`;      // e.g. 2026-09-20
    if (today <= chargeDate) { waiting++; continue; } // charge day not passed yet

    const res = await updateCreditKevaAmount(adj.hk_keva_id, Number(adj.hk_base_amount) || 0);
    if (!res.ok) {
      await db.from('charge_adjustments').update({ hk_error: 'החזרה נכשלה: ' + (res.message || '') }).eq('id', adj.id);
      failed++; continue;
    }
    await db.from('charge_adjustments').update({ hk_override_restored_at: new Date().toISOString(), hk_error: null }).eq('id', adj.id);
    await db.from('nedarim_subscriptions').update({ amount_per_charge: Number(adj.hk_base_amount) || 0 })
      .eq('nedarim_keva_id', adj.hk_keva_id);
    restored++;
  }

  return NextResponse.json({ ok: true, restored, waiting, failed });
}
