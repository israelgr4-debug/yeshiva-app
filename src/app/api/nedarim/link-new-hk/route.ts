import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCreditKevaDetail } from '@/lib/nedarim-api';

export const maxDuration = 30;

// POST /api/nedarim/link-new-hk  { student_id, keva_id, amount }
// Called right after a credit HK was created via the embedded iframe. Pulls the new
// HK's details (GetKevaId), stores it in nedarim_subscriptions, and links the student
// (student_tuition → credit_nedarim + this subscription). The daily sync reconciles later.
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
  const { student_id, keva_id, amount } = body;
  if (!student_id || !keva_id) return NextResponse.json({ ok: false, error: 'חסר מזהה תלמיד / הו״ק' }, { status: 400 });

  const db = adminClient();
  const { data: st } = await db.from('students').select('family_id').eq('id', student_id).maybeSingle();

  // Pull the new HK details from Nedarim (best-effort — fall back to the entered amount).
  let d: any = {};
  try { d = await getCreditKevaDetail(String(keva_id)); } catch { /* ignore */ }
  const amt = Number(d?.KevaAmount) || Number(amount) || 0;

  const subPayload: Record<string, any> = {
    nedarim_keva_id: String(keva_id),
    kind: 'credit',
    status: 'active',
    amount_per_charge: amt,
    family_id: st?.family_id || null,
    client_zeout: d?.KevaZeout || null,
    client_name: d?.KevaName || null,
    client_phone: d?.KevaPhone || null,
    scheduled_day: d?.KevaNextDate ? Number(String(d.KevaNextDate).slice(-2)) || null : null,
    last_4_digits: d?.KevaLastNum || null,
    card_tokef: d?.KevaTokef || null,
    next_charge_date: null,
    last_synced_at: new Date().toISOString(),
  };
  const { data: sub, error: subErr } = await db
    .from('nedarim_subscriptions')
    .upsert(subPayload, { onConflict: 'nedarim_keva_id' })
    .select('id')
    .single();
  if (subErr) return NextResponse.json({ ok: false, error: 'שמירת הו״ק: ' + subErr.message }, { status: 500 });

  const { error: tuErr } = await db.from('student_tuition').upsert({
    student_id,
    payment_method: 'credit_nedarim',
    monthly_amount: Number(amount) || amt,
    nedarim_subscription_id: sub.id,
    active: true,
  }, { onConflict: 'student_id' });
  if (tuErr) return NextResponse.json({ ok: false, error: 'קישור לתלמיד: ' + tuErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, subscription_id: sub.id });
}
