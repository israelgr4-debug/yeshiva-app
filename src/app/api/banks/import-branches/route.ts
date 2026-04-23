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
    // 1. Discover the current resource_id via data.gov.il package_search
    //    (Bank of Israel's branches dataset gets republished periodically
    //    under new resource IDs - so we look it up dynamically.)
    let resourceId: string | null = null;
    try {
      const pkgRes = await fetch(
        'https://data.gov.il/api/3/action/package_search?q=bank+branches+israel+bank',
        { cache: 'no-store' }
      );
      if (pkgRes.ok) {
        const pkgJson = await pkgRes.json();
        const results = pkgJson?.result?.results || [];
        // Find the package that looks like bank branches (title contains "סניפי" or bank keywords)
        for (const pkg of results) {
          const title = (pkg.title || '') + ' ' + (pkg.name || '');
          if (/branch|סניף|בנק/i.test(title)) {
            const activeResources = (pkg.resources || []).filter((r: any) => r?.active !== false);
            if (activeResources.length > 0) {
              resourceId = activeResources[0].id;
              break;
            }
          }
        }
      }
    } catch (e: any) {
      summary.errors.push(`package_search: ${e?.message}`);
    }

    // Fallback: try known resource IDs in order
    const fallbackIds = [
      '1c5bc716-8210-4ec7-85be-92e6271955c2',
      '3bbfda1a-32f6-4f46-855a-7a4b9a2b4b9e',
      '7d6c8fe3-df8a-4b99-93db-0e7c8e9f8b12',
    ];
    const candidateIds = resourceId ? [resourceId, ...fallbackIds] : fallbackIds;

    const collected: any[] = [];
    let chosenId: string | null = null;
    for (const rid of candidateIds) {
      // Test with a small fetch
      const testUrl = `https://data.gov.il/api/3/action/datastore_search?resource_id=${rid}&limit=5`;
      const tr = await fetch(testUrl, { cache: 'no-store' });
      if (!tr.ok) continue;
      const tj = await tr.json();
      if (tj?.success && tj?.result?.records?.length > 0) {
        chosenId = rid;
        break;
      }
    }

    if (!chosenId) {
      summary.errors.push('לא נמצא resource_id תקין. כנראה יש שינוי ב-data.gov.il - יש לקבל ID חדש.');
      return NextResponse.json({ ok: false, summary }, { status: 200 });
    }

    let offset = 0;
    const pageSize = 500;
    while (collected.length < 20000) {
      const url =
        `https://data.gov.il/api/3/action/datastore_search?` +
        `resource_id=${chosenId}&limit=${pageSize}&offset=${offset}`;
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

    // Parse + upsert in chunks (handle various Hebrew/English field names)
    const pick = (r: any, ...keys: string[]) => {
      for (const k of keys) {
        if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k];
      }
      return null;
    };

    const rows = collected
      .map((r: any) => ({
        bank_code: Number(
          pick(r, 'Bank_Code', 'bank_code', 'BankCode', 'קוד_בנק', 'קוד בנק')
        ),
        branch_code: Number(
          pick(r, 'Branch_Code', 'branch_code', 'BranchCode', 'קוד_סניף', 'קוד סניף', 'מספר סניף')
        ),
        branch_name: pick(r, 'Branch_Name', 'branch_name', 'BranchName', 'שם_סניף', 'שם סניף'),
        address: pick(r, 'Branch_Address', 'address', 'Address', 'כתובת_סניף', 'כתובת'),
        city: pick(r, 'City', 'city', 'עיר', 'ישוב'),
        phone: pick(r, 'Branch_Telephone', 'phone', 'Phone', 'Telephone', 'טלפון'),
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
