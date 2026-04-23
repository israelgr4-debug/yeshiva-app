import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getCreditKevaList,
  getBankKevaList,
  getBankKevaDetail,
  creditKevaStatus,
  bankKevaStatus,
  normalizeDate,
} from '@/lib/nedarim-api';

export const maxDuration = 300; // 5 minutes for the full sync

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Auto-classify group names. User can override manually in /finances/nedarim/groups.
function classifyGroupName(name: string): 'tuition' | 'donation' | 'unclassified' {
  if (!name) return 'unclassified';
  if (name.includes('שכר') || name.includes('לימוד')) return 'tuition';
  if (name.includes('תרומ')) return 'donation';
  return 'unclassified';
}

/**
 * POST /api/nedarim/sync
 * Full sync: pulls credit subs + bank subs + categories from Nedarim and
 * mirrors to our DB. Returns summary of changes.
 */
export async function POST(_req: NextRequest) {
  const started = Date.now();
  const db = adminClient();
  const summary = {
    credit_subs: { inserted: 0, updated: 0, unchanged: 0 },
    bank_subs: { inserted: 0, updated: 0, unchanged: 0 },
    groups: { inserted: 0 },
    errors: [] as string[],
  };

  // --- CREDIT SUBSCRIPTIONS ---
  try {
    const list = await getCreditKevaList();
    for (const k of list) {
      const kevaId = String(k.KevaId || '').trim();
      if (!kevaId) continue;

      const row = {
        nedarim_keva_id: kevaId,
        kind: 'credit' as const,
        status: creditKevaStatus(k.Enabled, undefined, k.ErrorText),
        amount_per_charge: Number(k.Amount) || 0,
        currency: Number(k.Currency) || 1,
        next_charge_date: normalizeDate(k.NextDate as string),
        remaining_charges: k.Itra !== undefined && k.Itra !== '' ? Number(k.Itra) : null,
        successful_charges: Number(k.Success) || 0,
        client_zeout: k.Zeout || null,
        client_name: k.ClientName || null,
        client_phone: k.Phone || null,
        client_mail: k.Mail || null,
        client_address: k.Adresse || null,
        last_4_digits: k.LastNum || null,
        card_tokef: k.Tokef || null,
        groupe: k.Groupe || null,
        comments: k.Comments || null,
        last_error: k.ErrorText || null,
        created_in_nedarim: normalizeDate(k.CreationDate),
        last_synced_at: new Date().toISOString(),
      };

      const { data: existing } = await db
        .from('nedarim_subscriptions')
        .select('id, status, amount_per_charge')
        .eq('nedarim_keva_id', kevaId)
        .maybeSingle();

      if (!existing) {
        const { error } = await db.from('nedarim_subscriptions').insert(row);
        if (error) summary.errors.push(`credit insert ${kevaId}: ${error.message}`);
        else summary.credit_subs.inserted++;
      } else if (
        existing.status !== row.status ||
        Number(existing.amount_per_charge) !== row.amount_per_charge
      ) {
        const { error } = await db.from('nedarim_subscriptions').update(row).eq('id', existing.id);
        if (error) summary.errors.push(`credit update ${kevaId}: ${error.message}`);
        else summary.credit_subs.updated++;
      } else {
        // Still touch last_synced_at
        await db
          .from('nedarim_subscriptions')
          .update({ last_synced_at: row.last_synced_at })
          .eq('id', existing.id);
        summary.credit_subs.unchanged++;
      }

      // Collect group
      if (row.groupe) {
        await db
          .from('nedarim_groups')
          .upsert(
            { name: row.groupe, category_type: classifyGroupName(row.groupe) },
            { onConflict: 'name', ignoreDuplicates: true }
          );
      }
    }
  } catch (e: any) {
    summary.errors.push(`credit list: ${e?.message || e}`);
  }

  // --- BANK SUBSCRIPTIONS ---
  try {
    const list = await getBankKevaList();
    for (const r of list) {
      const kevaId = String(r.DT_RowId || '').trim();
      if (!kevaId) continue;

      // GetMasavKevaNew gives minimal info; fetch detail for each.
      // Note: This is chatty but Masav API doesn't rate-limit the way credit does.
      let detail;
      try {
        detail = await getBankKevaDetail(kevaId);
      } catch (err: any) {
        summary.errors.push(`bank detail ${kevaId}: ${err?.message || err}`);
        continue;
      }

      if (detail?.Result === 'Error') {
        summary.errors.push(`bank detail ${kevaId}: ${(detail as any).Message || detail.StatusText || 'error'}`);
        continue;
      }

      const row = {
        nedarim_keva_id: kevaId,
        kind: 'bank' as const,
        status: bankKevaStatus(detail.Status, detail.Deleted),
        amount_per_charge: Number(detail.Amount) || 0,
        currency: 1, // bank is always NIS
        scheduled_day: detail.NextDate ? Number(detail.NextDate) : null,
        next_charge_date: normalizeDate(detail.FullNextDate),
        remaining_charges:
          detail.Tashlumim !== undefined && detail.Tashlumim !== ''
            ? Number(detail.Tashlumim)
            : null,
        client_zeout: detail.ClientZeout || null,
        client_name: detail.ClientName || null,
        client_phone: detail.ClientPhone || null,
        client_mail: detail.ClientMail || null,
        client_address: detail.ClientAdresse || null,
        bank_number: detail.Bank || null,
        bank_agency: detail.Agency || null,
        bank_account: detail.Account || null,
        groupe: detail.Groupe || null,
        comments: detail.Comments || null,
        last_synced_at: new Date().toISOString(),
      };

      const { data: existing } = await db
        .from('nedarim_subscriptions')
        .select('id, status, amount_per_charge')
        .eq('nedarim_keva_id', kevaId)
        .maybeSingle();

      if (!existing) {
        const { error } = await db.from('nedarim_subscriptions').insert(row);
        if (error) summary.errors.push(`bank insert ${kevaId}: ${error.message}`);
        else summary.bank_subs.inserted++;
      } else if (
        existing.status !== row.status ||
        Number(existing.amount_per_charge) !== row.amount_per_charge
      ) {
        const { error } = await db.from('nedarim_subscriptions').update(row).eq('id', existing.id);
        if (error) summary.errors.push(`bank update ${kevaId}: ${error.message}`);
        else summary.bank_subs.updated++;
      } else {
        await db
          .from('nedarim_subscriptions')
          .update({ last_synced_at: row.last_synced_at })
          .eq('id', existing.id);
        summary.bank_subs.unchanged++;
      }

      if (row.groupe) {
        await db
          .from('nedarim_groups')
          .upsert(
            { name: row.groupe, category_type: classifyGroupName(row.groupe) },
            { onConflict: 'name', ignoreDuplicates: true }
          );
      }
    }
  } catch (e: any) {
    summary.errors.push(`bank list: ${e?.message || e}`);
  }

  // Log the run
  const duration = Date.now() - started;
  await db.from('nedarim_sync_log').insert({
    sync_type: 'full',
    result: summary.errors.length ? 'error' : 'success',
    items_inserted: summary.credit_subs.inserted + summary.bank_subs.inserted,
    items_updated: summary.credit_subs.updated + summary.bank_subs.updated,
    items_unchanged: summary.credit_subs.unchanged + summary.bank_subs.unchanged,
    error_message: summary.errors.length ? summary.errors.slice(0, 5).join(' | ') : null,
    duration_ms: duration,
    finished_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, duration_ms: duration, summary });
}
