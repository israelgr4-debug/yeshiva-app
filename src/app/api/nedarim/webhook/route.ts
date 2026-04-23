import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeDate } from '@/lib/nedarim-api';

// Nedarim webhook source IP per docs
const NEDARIM_SOURCE_IP = '18.194.219.73';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/nedarim/webhook
 * Receives notifications from Nedarim on new credit transactions
 * and new credit Hora'at Keva creations.
 * Docs say the payload is JSON with fields like TransactionId, Amount, etc.
 */
export async function POST(req: NextRequest) {
  // Optional IP check (Vercel forwards the originating IP in x-forwarded-for)
  const forwardedFor = req.headers.get('x-forwarded-for') || '';
  const realIp = req.headers.get('x-real-ip') || '';
  const seenIps = [forwardedFor.split(',')[0].trim(), realIp].filter(Boolean);
  const ipOk = seenIps.some((ip) => ip === NEDARIM_SOURCE_IP);
  const skipIpCheck = process.env.NEDARIM_WEBHOOK_SKIP_IP_CHECK === '1';

  if (!ipOk && !skipIpCheck) {
    // Log suspicious request but accept for debugging - we don't want to lose data
    console.warn(`[nedarim-webhook] unexpected source IP: ${seenIps.join(', ')}`);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    const text = await req.text();
    return NextResponse.json({ error: 'invalid JSON', body: text.slice(0, 500) }, { status: 400 });
  }

  const db = adminClient();

  // Differentiate: if TransactionId is present → it's a transaction.
  // If KevaId present without TransactionId → it's a new standing order creation.
  const txId = body.TransactionId ? String(body.TransactionId) : null;
  const kevaId = body.KevaId ? String(body.KevaId) : null;

  try {
    if (txId) {
      // A transaction happened (charge completed or attempt)
      await handleTransaction(db, body);
    } else if (kevaId) {
      // A new credit HK was created via iFrame
      await handleNewKeva(db, body);
    } else {
      console.warn('[nedarim-webhook] payload has neither TransactionId nor KevaId', body);
    }
  } catch (e: any) {
    console.error('[nedarim-webhook] error:', e);
    // Still return 200 so Nedarim doesn't retry (they retry only once anyway per docs)
    return NextResponse.json({ received: true, error: e?.message || 'server error' }, { status: 200 });
  }

  return NextResponse.json({ received: true });
}

async function handleTransaction(db: ReturnType<typeof adminClient>, body: any) {
  const txId = String(body.TransactionId);
  const kevaId = body.KevaId ? String(body.KevaId) : null;

  // Resolve subscription + family by kevaId
  let subscriptionId: string | null = null;
  let familyId: string | null = null;
  if (kevaId) {
    const { data: sub } = await db
      .from('nedarim_subscriptions')
      .select('id, family_id')
      .eq('nedarim_keva_id', kevaId)
      .maybeSingle();
    if (sub) {
      subscriptionId = sub.id;
      familyId = sub.family_id;
    }
  }

  // Confirmation present = real charge success. Missing confirmation = pending/temp.
  const result = body.Confirmation ? 'success' : 'pending';

  const row = {
    nedarim_transaction_id: txId,
    nedarim_keva_id: kevaId,
    subscription_id: subscriptionId,
    family_id: familyId,
    amount: Number(body.Amount) || 0,
    currency: Number(body.Currency) || 1,
    transaction_date: normalizeDate(body.TransactionTime),
    transaction_time: body.TransactionTime || null,
    result,
    status_text: body.TransactionType || null,
    kind: 'credit' as const,
    confirmation: body.Confirmation || null,
    last_4: body.LastNum || null,
    client_name: body.ClientName || null,
    client_zeout: body.Zeout || null,
    groupe: body.Groupe || null,
    tashloumim: body.Tashloumim ? Number(body.Tashloumim) : null,
    receipt_data: body.ReceiptData || null,
    receipt_doc_num: body.ReceiptDocNum || null,
  };

  await db.from('nedarim_transactions').upsert(row, {
    onConflict: 'nedarim_transaction_id',
    ignoreDuplicates: false,
  });
}

async function handleNewKeva(db: ReturnType<typeof adminClient>, body: any) {
  const kevaId = String(body.KevaId);
  const row = {
    nedarim_keva_id: kevaId,
    kind: 'credit' as const,
    status: 'active',
    amount_per_charge: Number(body.Amount) || 0,
    currency: Number(body.Currency) || 1,
    next_charge_date: normalizeDate(body.NextDate),
    remaining_charges: body.Tashloumim ? Number(body.Tashloumim) : null,
    client_zeout: body.Zeout || null,
    client_name: body.ClientName || null,
    client_phone: body.Phone || null,
    client_mail: body.Mail || null,
    client_address: body.Adresse || null,
    last_4_digits: body.LastNum || null,
    card_tokef: body.Tokef || null,
    groupe: body.Groupe || null,
    comments: body.Comments || null,
    last_synced_at: new Date().toISOString(),
  };

  await db
    .from('nedarim_subscriptions')
    .upsert(row, { onConflict: 'nedarim_keva_id', ignoreDuplicates: false });
}
