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
    // Find the LARGEST bank branches dataset on data.gov.il.
    // data.gov.il has multiple related datasets (ATMs, corps, branches) and some
    // are small/stale. We pick by row count.
    const candidates: Array<{ id: string; count: number; title?: string }> = [];

    try {
      const pkgRes = await fetch(
        'https://data.gov.il/api/3/action/package_search?q=סניפי+בנקים&rows=30',
        { cache: 'no-store' }
      );
      if (pkgRes.ok) {
        const pkgJson = await pkgRes.json();
        const results = pkgJson?.result?.results || [];
        for (const pkg of results) {
          const title = (pkg.title || '') + ' ' + (pkg.name || '');
          // Include package if it mentions branches explicitly
          const looksRelevant = /branch|סניפ|ATM|מסוף|כספומט|בנק/i.test(title);
          if (!looksRelevant) continue;
          for (const res of pkg.resources || []) {
            if (res?.active === false) continue;
            if (res?.datastore_active !== true) continue;
            // Probe for record count
            try {
              const testUrl = `https://data.gov.il/api/3/action/datastore_search?resource_id=${res.id}&limit=1`;
              const tr = await fetch(testUrl, { cache: 'no-store' });
              if (!tr.ok) continue;
              const tj = await tr.json();
              if (tj?.success) {
                const total = tj?.result?.total || 0;
                candidates.push({ id: res.id, count: total, title: `${title} / ${res.name || res.id}` });
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch (e: any) {
      summary.errors.push(`package_search: ${e?.message}`);
    }

    // Also try English keyword search
    try {
      const pkgRes = await fetch(
        'https://data.gov.il/api/3/action/package_search?q=bank+branches&rows=30',
        { cache: 'no-store' }
      );
      if (pkgRes.ok) {
        const pkgJson = await pkgRes.json();
        const results = pkgJson?.result?.results || [];
        for (const pkg of results) {
          for (const res of pkg.resources || []) {
            if (res?.active === false || res?.datastore_active !== true) continue;
            if (candidates.find((c) => c.id === res.id)) continue;
            try {
              const testUrl = `https://data.gov.il/api/3/action/datastore_search?resource_id=${res.id}&limit=1`;
              const tr = await fetch(testUrl, { cache: 'no-store' });
              if (!tr.ok) continue;
              const tj = await tr.json();
              if (tj?.success) {
                candidates.push({
                  id: res.id,
                  count: tj?.result?.total || 0,
                  title: `${pkg.title || ''} / ${res.name || res.id}`,
                });
              }
            } catch { /* skip */ }
          }
        }
      }
    } catch { /* skip */ }

    // Sort by row count descending - the biggest one is most likely the full branches
    candidates.sort((a, b) => b.count - a.count);

    const chosenId = candidates[0]?.id;
    if (!chosenId) {
      summary.errors.push('לא נמצא resource_id תקין. יש לקבל ID חדש.');
      return NextResponse.json({ ok: false, summary }, { status: 200 });
    }
    (summary as any).dataset = candidates[0].title;
    (summary as any).datasetTotalRows = candidates[0].count;
    (summary as any).allCandidates = candidates.slice(0, 10).map((c) => ({
      id: c.id,
      rows: c.count,
      title: c.title,
    }));

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
