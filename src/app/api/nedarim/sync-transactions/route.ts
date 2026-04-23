import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getCreditTransactionsHistory, normalizeDate, normalizeDateTime } from '@/lib/nedarim-api';

export const maxDuration = 300;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/nedarim/sync-transactions
 * Pull credit transaction history from Nedarim and upsert into nedarim_transactions.
 * Uses LastId pagination - we track the highest TransactionId we've already seen
 * so subsequent runs are incremental.
 * Rate limit: 20 requests/hour, max 2000 per request.
 */
export async function POST(req: NextRequest) {
  const started = Date.now();
  const db = adminClient();
  const summary = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    pages: 0,
    errors: [] as string[],
  };

  try {
    // Find highest TransactionId already in our DB (as string; nedarim's IDs are numeric strings)
    const { data: latest } = await db
      .from('nedarim_transactions')
      .select('nedarim_transaction_id')
      .not('nedarim_transaction_id', 'is', null)
      .order('nedarim_transaction_id', { ascending: false })
      .limit(1);

    let lastId = latest?.[0]?.nedarim_transaction_id || '';
    const body = await req.json().catch(() => ({}));
    if (body.from_beginning) lastId = '';

    // Paginate through
    for (let p = 0; p < 10; p++) { // cap at 10 pages = 20000 rows per run
      const page = await getCreditTransactionsHistory(lastId, 2000);
      if (!page.length) break;
      summary.pages++;

      // Collect family_id and subscription_id by KevaId lookups
      const kevaIds = [...new Set(page.map((t) => t.KevaId).filter(Boolean))] as string[];
      const subMap = new Map<string, { id: string; family_id: string | null }>();
      if (kevaIds.length > 0) {
        const { data: subs } = await db
          .from('nedarim_subscriptions')
          .select('id, nedarim_keva_id, family_id')
          .in('nedarim_keva_id', kevaIds);
        for (const s of subs || []) {
          subMap.set(s.nedarim_keva_id, { id: s.id, family_id: s.family_id });
        }
      }

      const rows = page.map((t) => {
        const sub = t.KevaId ? subMap.get(String(t.KevaId)) : null;
        return {
          nedarim_transaction_id: String(t.TransactionId),
          nedarim_keva_id: t.KevaId ? String(t.KevaId) : null,
          subscription_id: sub?.id || null,
          family_id: sub?.family_id || null,
          amount: Number(t.Amount) || 0,
          currency: Number(t.Currency) || 1,
          transaction_date: normalizeDate(t.TransactionTime) || null,
          transaction_time: normalizeDateTime(t.TransactionTime),
          result: 'success' as const, // History only returns completed transactions
          status_text: t.TransactionType || null,
          kind: 'credit' as const,
          confirmation: t.Confirmation || null,
          last_4: t.LastNum || null,
          client_name: t.ClientName || null,
          client_zeout: t.Zeout || null,
          groupe: t.Groupe || null,
          tashloumim: t.Tashloumim ? Number(t.Tashloumim) : null,
        };
      });

      // Upsert in chunks of 500
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { data, error } = await db
          .from('nedarim_transactions')
          .upsert(chunk, { onConflict: 'nedarim_transaction_id', ignoreDuplicates: false })
          .select('id');
        if (error) {
          summary.errors.push(`upsert chunk: ${error.message}`);
        } else {
          summary.inserted += data?.length || 0;
        }
      }

      if (page.length < 2000) break;
      const last = page[page.length - 1];
      if (!last?.TransactionId) break;
      lastId = String(last.TransactionId);
    }
  } catch (e: any) {
    summary.errors.push(e?.message || String(e));
  }

  const duration = Date.now() - started;
  await db.from('nedarim_sync_log').insert({
    sync_type: 'credit_tx',
    result: summary.errors.length ? 'error' : 'success',
    items_inserted: summary.inserted,
    items_updated: summary.updated,
    items_unchanged: summary.skipped,
    error_message: summary.errors.length ? summary.errors.slice(0, 5).join(' | ') : null,
    duration_ms: duration,
    finished_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, duration_ms: duration, summary });
}
