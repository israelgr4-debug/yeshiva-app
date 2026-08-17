import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateCreditKevaAmount } from '@/lib/nedarim-api';

export const maxDuration = 120;

// POST /api/nedarim/apply-hk-override  { group_action_id }
// For each CREDIT override adjustment of a group action, temporarily change the
// student's Nedarim HK amount to the month's override amount (UpdateKevaNew). The
// original amount is saved so the daily cron can restore it after the charge day.
// Shared HKs (more than one student on the same HK) are skipped — changing them
// would affect siblings — and reported for manual handling.
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ ok: false, error: 'לא מחובר' }, { status: 401 });
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: u, error: authErr } = await auth.auth.getUser(token);
  if (authErr || !u?.user) return NextResponse.json({ ok: false, error: 'הרשאה נדחתה' }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  if (!body.group_action_id) return NextResponse.json({ ok: false, error: 'חסר group_action_id' }, { status: 400 });

  const db = adminClient();
  const { data: adjs } = await db.from('charge_adjustments').select('*')
    .eq('group_action_id', body.group_action_id)
    .eq('kind', 'override').eq('status', 'active').eq('dispatch_method', 'credit_nedarim')
    .is('hk_override_applied_at', null);

  let applied = 0, skipped = 0, failed = 0;
  const skippedNames: string[] = [];

  for (const adj of adjs || []) {
    const { data: t } = await db.from('student_tuition')
      .select('nedarim_subscription_id').eq('student_id', adj.student_id).maybeSingle();
    if (!t?.nedarim_subscription_id) {
      await db.from('charge_adjustments').update({ hk_error: 'לא מקושר להו״ק נדרים' }).eq('id', adj.id);
      failed++; continue;
    }
    const { data: sub } = await db.from('nedarim_subscriptions')
      .select('nedarim_keva_id, amount_per_charge, scheduled_day').eq('id', t.nedarim_subscription_id).maybeSingle();
    if (!sub?.nedarim_keva_id) {
      await db.from('charge_adjustments').update({ hk_error: 'חסר KevaId' }).eq('id', adj.id);
      failed++; continue;
    }
    // Shared HK? count active students pointing at this subscription.
    const { count } = await db.from('student_tuition')
      .select('student_id', { count: 'exact', head: true })
      .eq('nedarim_subscription_id', t.nedarim_subscription_id).eq('active', true);
    if ((count || 0) > 1) {
      await db.from('charge_adjustments').update({ hk_error: 'הו״ק משותפת — טופל ידנית' }).eq('id', adj.id);
      skipped++;
      const { data: st } = await db.from('students').select('first_name,last_name').eq('id', adj.student_id).maybeSingle();
      skippedNames.push(st ? `${st.last_name} ${st.first_name}` : adj.student_id);
      continue;
    }

    const baseAmount = Number(sub.amount_per_charge) || 0;
    const res = await updateCreditKevaAmount(sub.nedarim_keva_id, Number(adj.amount));
    if (!res.ok) {
      await db.from('charge_adjustments').update({ hk_error: res.message || 'שינוי סכום נכשל' }).eq('id', adj.id);
      failed++; continue;
    }
    await db.from('charge_adjustments').update({
      hk_keva_id: sub.nedarim_keva_id, hk_base_amount: baseAmount, hk_charge_day: sub.scheduled_day || 20,
      hk_override_applied_at: new Date().toISOString(), hk_error: null,
    }).eq('id', adj.id);
    await db.from('nedarim_subscriptions').update({ amount_per_charge: Number(adj.amount) })
      .eq('id', t.nedarim_subscription_id);
    applied++;
  }

  return NextResponse.json({ ok: true, applied, skipped, failed, skippedNames });
}
