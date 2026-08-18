import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { disableCreditKeva, enableCreditKeva } from '@/lib/nedarim-api';

export const maxDuration = 60;

// POST /api/nedarim/freeze-hk  { op: 'apply' | 'cancel', freeze_group }
//
// apply : for a CREDIT student's freeze, suspend the HK now (DisableKeva) and queue
//         a RESUME scheduled for the 1st of the month after the freeze ends. Shared
//         HKs are skipped and flagged for manual handling. Bank/office freezes need
//         nothing here (the override-0 rows already zero the MASAV charge).
// cancel: resume the HK now (EnableKevaNew) and drop the scheduled resume.
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// 'YYYY-MM' + k → 'YYYY-MM'
function addMonths(ym: string, k: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, (m - 1) + k, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ ok: false, error: 'לא מחובר' }, { status: 401 });
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: u, error: authErr } = await auth.auth.getUser(token);
  if (authErr || !u?.user) return NextResponse.json({ ok: false, error: 'הרשאה נדחתה' }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const { op, freeze_group } = body;
  if (!freeze_group) return NextResponse.json({ ok: false, error: 'חסר freeze_group' }, { status: 400 });

  const db = adminClient();
  const { data: rows } = await db.from('charge_adjustments').select('*')
    .eq('freeze_group', freeze_group)
    .order('month', { ascending: true });
  if (!rows || rows.length === 0) return NextResponse.json({ ok: false, error: 'הקפאה לא נמצאה' }, { status: 404 });

  const first = rows[0];
  const studentId = first.student_id;

  // Look up the student's Nedarim HK.
  const { data: t } = await db.from('student_tuition')
    .select('nedarim_subscription_id, payment_method').eq('student_id', studentId).maybeSingle();

  // ---------------------------------------------------------------- CANCEL -----
  if (op === 'cancel') {
    const suspended = rows.find((r: any) => r.hk_suspended_at && r.hk_keva_id);
    if (!suspended) return NextResponse.json({ ok: true, resumed: false }); // bank/office or never suspended
    const res = await enableCreditKeva(suspended.hk_keva_id);
    const success = res?.Result === 'OK' || res?.Status === 'OK' ||
      (typeof res?.raw === 'string' && res.raw.trim().startsWith('OK'));
    if (t?.nedarim_subscription_id) {
      await db.from('nedarim_subscriptions').update({ status: 'active' }).eq('id', t.nedarim_subscription_id);
    }
    // Drop the still-pending scheduled resume so it doesn't fire twice.
    const queueId = suspended.hk_resume_queue_id;
    if (queueId) await db.from('nedarim_action_queue').delete().eq('id', queueId).eq('status', 'pending');
    await db.from('charge_adjustments')
      .update({ hk_resume_scheduled_for: null, hk_resume_queue_id: null, hk_error: success ? null : 'חידוש ידני נכשל — בדוק בנדרים' })
      .eq('freeze_group', freeze_group);
    return NextResponse.json({ ok: true, resumed: success });
  }

  // ----------------------------------------------------------------- APPLY -----
  const method = first.dispatch_method || t?.payment_method;
  if (method !== 'credit_nedarim') {
    return NextResponse.json({ ok: true, suspended: false, shared: false }); // nothing to do
  }
  if (!t?.nedarim_subscription_id) {
    await db.from('charge_adjustments').update({ hk_error: 'לא מקושר להו״ק נדרים' }).eq('freeze_group', freeze_group);
    return NextResponse.json({ ok: true, suspended: false, shared: false, error: 'התלמיד באשראי אך אינו מקושר להו״ק נדרים' });
  }

  const { data: sub } = await db.from('nedarim_subscriptions')
    .select('nedarim_keva_id, amount_per_charge, scheduled_day').eq('id', t.nedarim_subscription_id).maybeSingle();
  if (!sub?.nedarim_keva_id) {
    await db.from('charge_adjustments').update({ hk_error: 'חסר KevaId' }).eq('freeze_group', freeze_group);
    return NextResponse.json({ ok: true, suspended: false, shared: false, error: 'להו״ק אין מזהה (KevaId)' });
  }

  // Shared HK (siblings on one card)? Don't suspend — it would stop the siblings too.
  const { count } = await db.from('student_tuition')
    .select('student_id', { count: 'exact', head: true })
    .eq('nedarim_subscription_id', t.nedarim_subscription_id).eq('active', true);
  if ((count || 0) > 1) {
    await db.from('charge_adjustments').update({ hk_error: 'הו״ק משותפת (אחים) — השהה ידנית בנדרים' }).eq('freeze_group', freeze_group);
    return NextResponse.json({ ok: true, suspended: false, shared: true });
  }

  // Resume on the 1st of the month AFTER the last frozen month.
  const lastMonth = rows[rows.length - 1].month;
  const resumeDate = `${addMonths(lastMonth, 1)}-01`;

  // Was this month's charge likely already taken (freeze starts too late)?
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const alreadyCharged = first.month === thisMonth && (sub.scheduled_day || 20) <= now.getDate();

  const res = await disableCreditKeva(sub.nedarim_keva_id);
  const success = res?.Result === 'OK' || res?.Status === 'OK' ||
    (typeof res?.raw === 'string' && res.raw.trim().startsWith('OK'));
  if (!success) {
    const msg = res?.Message || res?.raw || 'השהיית ההו״ק נכשלה';
    await db.from('charge_adjustments').update({ hk_error: String(msg) }).eq('freeze_group', freeze_group);
    return NextResponse.json({ ok: false, error: String(msg) });
  }

  await db.from('nedarim_subscriptions').update({ status: 'frozen' }).eq('id', t.nedarim_subscription_id);

  // Queue the scheduled resume (fired by the daily cron when the date arrives).
  const { data: q } = await db.from('nedarim_action_queue').insert({
    action: 'resume',
    nedarim_keva_id: sub.nedarim_keva_id,
    subscription_id: t.nedarim_subscription_id,
    params: { reason: 'סיום הקפאה', freeze_group },
    triggered_by: 'freeze',
    scheduled_for: resumeDate,
  }).select('id').single();

  await db.from('charge_adjustments').update({
    hk_keva_id: sub.nedarim_keva_id,
    hk_base_amount: Number(sub.amount_per_charge) || 0,
    hk_suspended_at: new Date().toISOString(),
    hk_resume_scheduled_for: resumeDate,
    hk_resume_queue_id: q?.id || null,
    hk_error: null,
  }).eq('freeze_group', freeze_group);

  return NextResponse.json({ ok: true, suspended: true, shared: false, resume_date: resumeDate, already_charged: alreadyCharged });
}
