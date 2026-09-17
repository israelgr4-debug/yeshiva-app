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
  // `force` (from an explicit user click) restores regardless of the charge-day wait.
  let body: any = {};
  try { body = await req.json(); } catch {}
  const force = body?.force === true;

  const { data: pending } = await db.from('charge_adjustments')
    .select('*, students(first_name,last_name)')
    .not('hk_override_applied_at', 'is', null)
    .is('hk_override_restored_at', null);

  const today = new Date().toISOString().slice(0, 10);
  let restored = 0, waiting = 0, failed = 0;
  const errors: { name: string; message: string }[] = [];
  const nameOf = (adj: any) => adj.students ? `${adj.students.last_name} ${adj.students.first_name}` : (adj.hk_keva_id || adj.id);

  for (const adj of pending || []) {
    if (!adj.hk_keva_id) { failed++; errors.push({ name: nameOf(adj), message: 'חסר KevaId — לא ניתן להחזיר אוטומטית' }); continue; }
    const day = String(adj.hk_charge_day || 20).padStart(2, '0');
    const chargeDate = `${adj.month}-${day}`;      // e.g. 2026-09-20
    if (!force && today <= chargeDate) { waiting++; continue; } // charge day not passed yet

    const res = await updateCreditKevaAmount(adj.hk_keva_id, Number(adj.hk_base_amount) || 0);
    if (!res.ok) {
      const msg = res.message || (typeof res.raw === 'string' ? res.raw : JSON.stringify(res.raw)) || 'נכשל בנדרים';
      await db.from('charge_adjustments').update({ hk_error: 'החזרה נכשלה: ' + msg }).eq('id', adj.id);
      failed++; errors.push({ name: nameOf(adj), message: msg });
      continue;
    }
    await db.from('charge_adjustments').update({ hk_override_restored_at: new Date().toISOString(), hk_error: null }).eq('id', adj.id);
    await db.from('nedarim_subscriptions').update({ amount_per_charge: Number(adj.hk_base_amount) || 0 })
      .eq('nedarim_keva_id', adj.hk_keva_id);
    restored++;
  }

  return NextResponse.json({ ok: true, restored, waiting, failed, errors: errors.slice(0, 50) });
}
