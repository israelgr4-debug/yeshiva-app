import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { disableCreditKeva } from '@/lib/nedarim-api';

export const maxDuration = 60;

// POST /api/nedarim/suspend-hk  { student_id }
// For a LEAVING student on credit: suspend their Nedarim HK (DisableKeva) so the card
// stops being charged on Nedarim's side — setting student_tuition.active=false alone
// does NOT stop Nedarim. Skipped (and reported) if the HK is SHARED with another
// still-active student, since suspending it would stop that sibling too.
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
  const studentId = body.student_id;
  if (!studentId) return NextResponse.json({ ok: false, error: 'חסר student_id' }, { status: 400 });

  const db = adminClient();

  // The student's HK.
  const { data: t } = await db.from('student_tuition')
    .select('nedarim_subscription_id, payment_method').eq('student_id', studentId).maybeSingle();
  if (!t || t.payment_method !== 'credit_nedarim' || !t.nedarim_subscription_id) {
    return NextResponse.json({ ok: true, suspended: false, reason: 'not_credit' });
  }
  const subId = t.nedarim_subscription_id;

  const { data: sub } = await db.from('nedarim_subscriptions')
    .select('nedarim_keva_id, status').eq('id', subId).maybeSingle();
  if (!sub?.nedarim_keva_id) {
    return NextResponse.json({ ok: true, suspended: false, error: 'להו״ק אין מזהה (KevaId)' });
  }

  // Shared with a still-ACTIVE student? Don't suspend — it would stop the sibling too.
  const { data: others } = await db.from('student_tuition')
    .select('student_id, students!inner(first_name, last_name, status)')
    .eq('nedarim_subscription_id', subId)
    .neq('student_id', studentId)
    .eq('students.status', 'active');
  if (others && others.length > 0) {
    const names = others.map((o: any) => `${o.students.last_name} ${o.students.first_name}`);
    return NextResponse.json({ ok: true, suspended: false, shared: true, names });
  }

  // If already frozen in our mirror, treat as done (idempotent).
  if (sub.status === 'frozen') {
    return NextResponse.json({ ok: true, suspended: true, alreadyFrozen: true });
  }

  const res = await disableCreditKeva(sub.nedarim_keva_id);
  const success = res?.Result === 'OK' || res?.Status === 'OK' ||
    (typeof res?.raw === 'string' && res.raw.trim().startsWith('OK'));
  if (!success) {
    const msg = res?.Message || res?.raw || 'השהיית ההו״ק נכשלה';
    return NextResponse.json({ ok: false, error: String(msg) });
  }
  await db.from('nedarim_subscriptions').update({ status: 'frozen' }).eq('id', subId);
  return NextResponse.json({ ok: true, suspended: true });
}
