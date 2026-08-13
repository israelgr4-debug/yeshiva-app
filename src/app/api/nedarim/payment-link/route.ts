import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 15;

// POST /api/nedarim/payment-link  { student_id, amount? }
// Builds a prefilled Nedarim payment-page link for creating a CREDIT standing order
// (OnlyKeva). Open it in the office (enter the card) or send it to the parent.
// Once the parent completes it, the HK syncs into nedarim_subscriptions and can be linked.
// (Creating a credit HK requires card entry — there is no server-side create in the API.)
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ ok: false, error: 'לא מחובר' }, { status: 401 });
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: u, error: authErr } = await auth.auth.getUser(token);
  if (authErr || !u?.user) return NextResponse.json({ ok: false, error: 'הרשאה נדחתה' }, { status: 401 });

  const mosad = process.env.NEDARIM_MOSAD_ID;
  if (!mosad) return NextResponse.json({ ok: false, error: 'NEDARIM_MOSAD_ID חסר' }, { status: 500 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const { student_id, amount } = body;
  if (!student_id) return NextResponse.json({ ok: false, error: 'חסר מזהה תלמיד' }, { status: 400 });

  const db = adminClient();
  const { data: st } = await db.from('students').select('first_name, last_name, family_id').eq('id', student_id).maybeSingle();
  if (!st) return NextResponse.json({ ok: false, error: 'תלמיד לא נמצא' }, { status: 404 });

  let clientName = `${st.last_name} ${st.first_name}`.trim();
  let phone = '', zeout = '';
  if (st.family_id) {
    const { data: fam } = await db.from('families').select('family_name, father_name, father_phone, father_id_number').eq('id', st.family_id).maybeSingle();
    if (fam) {
      if (fam.family_name && fam.father_name) clientName = `${fam.family_name} ${fam.father_name}`.trim();
      phone = fam.father_phone || '';
      zeout = fam.father_id_number || '';
    }
  }

  const params = new URLSearchParams({ mosad, OnlyKeva: '1', Groupe: 'שכר לימוד' });
  if (amount && Number(amount) > 0) { params.set('Amount', String(Number(amount))); }
  if (clientName) params.set('ClientName', clientName);
  if (phone) params.set('Phone', String(phone).replace(/\D/g, ''));
  if (zeout) params.set('Zeout', String(zeout));

  const url = `https://www.matara.pro/nedarimplus/online/?${params.toString()}`;
  return NextResponse.json({ ok: true, url });
}
