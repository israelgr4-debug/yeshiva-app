import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// POST /api/nedarim-plus/webhook
// Receives payment notifications from Nedarim Plus (or polling results).
// On success, marks the matching tuition_payment as 'collected'.

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Expected body shape (stub - adapt to actual Nedarim Plus webhook):
  // {
  //   externalChargeId: string,
  //   paymentDate: 'YYYY-MM-DD',
  //   amount: number,
  //   status: 'success' | 'failed',
  //   failureReason?: string,
  //   transactionId?: string,
  // }

  const { externalChargeId, paymentDate, status, failureReason, transactionId } = body;

  if (!externalChargeId || !paymentDate) {
    return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Find the tuition_charge that matches this external id
  const { data: charge } = await supabase
    .from('tuition_charges')
    .select('id, family_id')
    .eq('external_charge_id', externalChargeId)
    .maybeSingle();

  if (!charge) {
    return NextResponse.json({ success: false, error: 'Charge not found' }, { status: 404 });
  }

  // Extract the YYYY-MM from the payment date
  const month = paymentDate.slice(0, 7);

  if (status === 'success') {
    // Upsert the payment as collected
    await supabase
      .from('tuition_payments')
      .update({
        status: 'collected',
        payment_details: { transaction_id: transactionId, source: 'nedarim_plus' },
        updated_at: new Date().toISOString(),
      })
      .eq('tuition_charge_id', charge.id)
      .eq('payment_month', month);
  } else {
    await supabase
      .from('tuition_payments')
      .update({
        status: 'failed',
        payment_details: { failure_reason: failureReason, source: 'nedarim_plus' },
        updated_at: new Date().toISOString(),
      })
      .eq('tuition_charge_id', charge.id)
      .eq('payment_month', month);
  }

  return NextResponse.json({ success: true });
}
