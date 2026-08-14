import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { chargeSingleFromKeva } from '@/lib/nedarim-api';

export const maxDuration = 120;

// POST /api/nedarim/charge-onetime
//   { charge_id }  → fire one credit one-time charge now (UI button, user-auth)
//   { due: true }  → fire every pending credit charge whose date has arrived (cron)
// Fires Nedarim TashlumBodedNew on the student's HK, marks the charge paid, and mirrors
// it into payment_history. A Nedarim single charge is immediate, so a future-dated
// credit charge simply waits in the queue until its date (fired by the daily cron).
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function fireOne(db: any, charge: any): Promise<{ ok: boolean; error?: string }> {
  if (charge.channel !== 'credit' || charge.status !== 'pending') return { ok: false, error: 'לא רלוונטי' };
  const { data: tuition } = await db.from('student_tuition')
    .select('nedarim_subscription_id').eq('student_id', charge.student_id).maybeSingle();
  if (!tuition?.nedarim_subscription_id) return { ok: false, error: 'לא מקושר להו״ק נדרים' };
  const { data: sub } = await db.from('nedarim_subscriptions')
    .select('nedarim_keva_id').eq('id', tuition.nedarim_subscription_id).maybeSingle();
  if (!sub?.nedarim_keva_id) return { ok: false, error: 'חסר KevaId' };

  let res;
  try {
    res = await chargeSingleFromKeva(sub.nedarim_keva_id, Number(charge.amount), {
      comments: charge.description || `חיוב לתאריך ${charge.charge_date}`, groupe: 'שכר לימוד',
    });
  } catch (e: any) {
    await db.from('one_time_charges').update({ nedarim_error: String(e?.message || e) }).eq('id', charge.id);
    return { ok: false, error: String(e?.message || e) };
  }
  if (!res.ok) {
    await db.from('one_time_charges').update({ nedarim_error: res.message || res.status }).eq('id', charge.id);
    return { ok: false, error: res.message || 'נכשל בנדרים' };
  }
  await db.from('one_time_charges').update({
    status: 'paid', paid_at: new Date().toISOString(),
    nedarim_transaction_id: res.transactionId || null, nedarim_error: null,
  }).eq('id', charge.id);
  if (charge.student_id) {
    await db.from('payment_history').upsert({
      student_id: charge.student_id, payment_date: charge.charge_date, amount_ils: Number(charge.amount),
      status_code: 2, status_name: 'נפרע (אשראי)', nedarim_transaction_id: res.transactionId || `otc_${charge.id}`,
    }, { onConflict: 'nedarim_transaction_id,student_id', ignoreDuplicates: true });
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const isCron = !!process.env.CRON_SECRET && token === process.env.CRON_SECRET;
  let body: any = {};
  try { body = await req.json(); } catch {}

  if (!isCron) {
    // UI path — require an authenticated user (this moves real money).
    if (!token) return NextResponse.json({ ok: false, error: 'לא מחובר' }, { status: 401 });
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: u, error } = await auth.auth.getUser(token);
    if (error || !u?.user) return NextResponse.json({ ok: false, error: 'הרשאה נדחתה' }, { status: 401 });
  }

  const db = adminClient();

  if (body.charge_id) {
    const { data: c } = await db.from('one_time_charges').select('*').eq('id', body.charge_id).maybeSingle();
    if (!c) return NextResponse.json({ ok: false, error: 'חיוב לא נמצא' }, { status: 404 });
    const r = await fireOne(db, c);
    return NextResponse.json(r, { status: r.ok ? 200 : 502 });
  }

  if (body.due) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: due } = await db.from('one_time_charges').select('*')
      .eq('channel', 'credit').eq('status', 'pending').lte('charge_date', today);
    let ok = 0, failed = 0;
    for (const c of due || []) { const r = await fireOne(db, c); r.ok ? ok++ : failed++; }
    return NextResponse.json({ ok: true, fired: ok, failed });
  }

  return NextResponse.json({ ok: false, error: 'חסר charge_id או due' }, { status: 400 });
}
