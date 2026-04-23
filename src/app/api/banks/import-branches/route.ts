import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 120;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/banks/import-branches
 * Import/update bank branches from Bank of Israel open data.
 *
 * Source: data.gov.il Bank of Israel branches dataset
 * https://data.gov.il/api/3/action/datastore_search?resource_id=1c5bc716-8210-4ec7-85be-92e6271955c2
 *
 * Idempotent: upserts on (bank_code, branch_code).
 */
export async function POST(_req: NextRequest) {
  const db = adminClient();
  const summary = { fetched: 0, upserted: 0, errors: [] as string[] };

  try {
    // Bank of Israel public dataset via data.gov.il - resource_id for bank branches
    // This is the official "סניפי בנקים" dataset.
    let offset = 0;
    const pageSize = 500;
    const collected: any[] = [];
    while (collected.length < 20000) {
      const url =
        `https://data.gov.il/api/3/action/datastore_search?` +
        `resource_id=1c5bc716-8210-4ec7-85be-92e6271955c2&limit=${pageSize}&offset=${offset}`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) {
        summary.errors.push(`Fetch ${offset}: ${r.status}`);
        break;
      }
      const json = await r.json();
      const records = json?.result?.records || [];
      if (!records.length) break;
      collected.push(...records);
      summary.fetched += records.length;
      if (records.length < pageSize) break;
      offset += pageSize;
    }

    // Parse + upsert in chunks
    const rows = collected
      .map((r: any) => ({
        bank_code: Number(r['Bank_Code'] || r['bank_code']),
        branch_code: Number(r['Branch_Code'] || r['branch_code']),
        branch_name: r['Branch_Name'] || r['branch_name'] || null,
        address: r['Branch_Address'] || r['address'] || null,
        city: r['City'] || r['city'] || null,
        phone: r['Branch_Telephone'] || r['phone'] || null,
      }))
      .filter((r) => Number.isFinite(r.bank_code) && Number.isFinite(r.branch_code));

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await db
        .from('bank_branches')
        .upsert(chunk, { onConflict: 'bank_code,branch_code', ignoreDuplicates: false });
      if (error) summary.errors.push(`upsert chunk ${i}: ${error.message}`);
      else summary.upserted += chunk.length;
    }
  } catch (e: any) {
    summary.errors.push(e?.message || String(e));
  }

  return NextResponse.json({ ok: true, summary });
}
