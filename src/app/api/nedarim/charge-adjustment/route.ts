import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { chargeSingleFromKeva } from '@/lib/nedarim-api';

export const maxDuration = 30;

// POST /api/nedarim/charge-adjustment  { adjustment_id }
// Fires a single one-time charge on a credit student's existing Nedarim HK
// (TashlumBodedNew) for one 'addition' charge_adjustment. REAL money — so:
//  - requires an authenticated caller
//  - only credit_nedarim additions, positive amount, not already charged
//  - records the result on the adjustment and blocks a second charge

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  // Auth: this endpoint moves money — require a valid user session.
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ ok: false, error: 'לא מחובר' }, { status: 401 });
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: userData, error: authErr } = await authClient.auth.getUser(token);
  if (authErr || !userData?.user) return NextResponse.json({ ok: false, error: 'הרשאה נדחתה' }, { status: 401 });

  let adjustment_id: string | undefined;
  try {
    ({ adjustment_id } = await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: 'בקשה לא תקינה' }, { status: 400 });
  }
  if (!adjustment_id) return NextResponse.json({ ok: false, error: 'חסר מזהה שינוי' }, { status: 400 });

  const db = adminClient();

  const { data: adj } = await db.from('charge_adjustments').select('*').eq('id', adjustment_id).maybeSingle();
  if (!adj) return NextResponse.json({ ok: false, error: 'שינוי לא נמצא' }, { status: 404 });
  if (adj.status !== 'active') return NextResponse.json({ ok: false, error: 'השינוי בוטל' }, { status: 400 });
  if (adj.kind !== 'addition') return NextResponse.json({ ok: false, error: 'רק תוספת ניתנת לחיוב בודד בנדרים' }, { status: 400 });
  if (adj.nedarim_result === 'success') return NextResponse.json({ ok: false, error: 'כבר חויב בנדרים' }, { status: 400 });
  if (Number(adj.amount) <= 0) return NextResponse.json({ ok: false, error: 'הסכום חייב להיות חיובי' }, { status: 400 });

  const { data: tuition } = await db
    .from('student_tuition')
    .select('payment_method, nedarim_subscription_id')
    .eq('student_id', adj.student_id)
    .maybeSingle();
  if (!tuition || tuition.payment_method !== 'credit_nedarim')
    return NextResponse.json({ ok: false, error: 'התלמיד אינו באשראי נדרים' }, { status: 400 });
  if (!tuition.nedarim_subscription_id)
    return NextResponse.json({ ok: false, error: 'לא מקושר להוראת קבע בנדרים' }, { status: 400 });

  const { data: sub } = await db
    .from('nedarim_subscriptions')
    .select('nedarim_keva_id, status')
    .eq('id', tuition.nedarim_subscription_id)
    .maybeSingle();
  if (!sub?.nedarim_keva_id)
    return NextResponse.json({ ok: false, error: 'חסר מזהה הוראת קבע (KevaId)' }, { status: 400 });

  let result;
  try {
    result = await chargeSingleFromKeva(sub.nedarim_keva_id, Number(adj.amount), {
      comments: adj.reason || `תוספת ${adj.month}`,
      groupe: 'שכר לימוד',
    });
  } catch (e: any) {
    await db.from('charge_adjustments')
      .update({ nedarim_result: 'error', nedarim_error: String(e?.message || e) })
      .eq('id', adj.id);
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 502 });
  }

  await db.from('charge_adjustments').update({
    nedarim_result: result.ok ? 'success' : 'error',
    nedarim_transaction_id: result.transactionId || null,
    nedarim_error: result.ok ? null : (result.message || result.status || 'שגיאה'),
  }).eq('id', adj.id);

  if (!result.ok)
    return NextResponse.json({ ok: false, error: result.message || 'החיוב נכשל בנדרים' }, { status: 502 });
  return NextResponse.json({ ok: true, transactionId: result.transactionId });
}
