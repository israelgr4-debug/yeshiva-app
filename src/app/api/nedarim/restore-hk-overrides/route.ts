import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateCreditKevaAmount, getCreditKevaDetail } from '@/lib/nedarim-api';

export const maxDuration = 120;

// POST /api/nedarim/restore-hk-overrides
// Safety net: restore every temporarily-overridden credit HK back to its base amount
// once the override month's charge day has passed. Runs daily from cron-sync; can also
// be triggered by an authenticated user. Idempotent.
function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const isCron = !!process.env.CRON_SECRET && token === process.env.CRON_SECRET;
  if (!isCron) {
    if (!token) return NextResponse.json({ ok: false, error: 'לא מחובר' }, { status: 401 });
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { data: u, error } = await auth.auth.getUser(token);
    if (error || !u?.user) return NextResponse.json({ ok: false, error: 'הרשאה נדחתה' }, { status: 401 });
  }

  const db = adminClient();
  let body: any = {};
  try { body = await req.json(); } catch {}
  const force = body?.force === true;         // ignore the charge-day wait (explicit click)
  const reprocess = body?.reprocess === true; // also re-check rows already marked restored (self-heal + verify vs Nedarim)

  // reprocess → EVERY applied override (verify vs Nedarim, even if we thought it was restored).
  let query = db.from('charge_adjustments')
    .select('*, students(first_name,last_name)')
    .not('hk_override_applied_at', 'is', null);
  if (!reprocess) query = query.is('hk_override_restored_at', null);
  const { data: pending } = await query;

  const today = new Date().toISOString().slice(0, 10);
  let restored = 0, waiting = 0, failed = 0, alreadyOk = 0;
  const details: { name: string; base: number; before: number | null; after: number | null; ok: boolean; message?: string }[] = [];
  let sample: any = null; // raw Nedarim responses for the first update attempt (diagnostics)
  const nameOf = (adj: any) => adj.students ? `${adj.students.last_name} ${adj.students.first_name}` : (adj.hk_keva_id || adj.id);
  const amt = (d: any) => { const n = Number(d?.KevaAmount); return isNaN(n) ? null : n; };

  for (const adj of pending || []) {
    if (!adj.hk_keva_id) { failed++; details.push({ name: nameOf(adj), base: Number(adj.hk_base_amount) || 0, before: null, after: null, ok: false, message: 'חסר KevaId' }); continue; }
    const base = Number(adj.hk_base_amount) || 0;
    const day = String(adj.hk_charge_day || 20).padStart(2, '0');
    const chargeDate = `${adj.month}-${day}`;
    if (!force && !reprocess && today <= chargeDate) { waiting++; continue; }

    // Nedarim is the source of truth — read the ACTUAL current amount.
    const before = amt(await getCreditKevaDetail(adj.hk_keva_id));
    if (before === base) { // already correct in Nedarim → heal our DB, no need to write
      await db.from('charge_adjustments').update({ hk_override_restored_at: adj.hk_override_restored_at || new Date().toISOString(), hk_error: null }).eq('id', adj.id);
      await db.from('nedarim_subscriptions').update({ amount_per_charge: base }).eq('nedarim_keva_id', adj.hk_keva_id);
      alreadyOk++; details.push({ name: nameOf(adj), base, before, after: before, ok: true, message: 'כבר תקין בנדרים' });
      continue;
    }

    const res = await updateCreditKevaAmount(adj.hk_keva_id, base);
    const afterDetail = await getCreditKevaDetail(adj.hk_keva_id); // VERIFY the change actually took effect
    const after = amt(afterDetail);

    if (!sample) sample = {
      name: nameOf(adj), keva: adj.hk_keva_id, base, before, after,
      updateResult: res.raw?.Result ?? res.raw?.Status ?? null,
      updateMessage: res.raw?.Message ?? null,
      updateRaw: (typeof res.raw === 'string' ? res.raw : JSON.stringify(res.raw)).slice(0, 500),
      kevaStatus: afterDetail?.KevaStatus ?? null,
    };

    if (after === base) {
      await db.from('charge_adjustments').update({ hk_override_restored_at: new Date().toISOString(), hk_error: null }).eq('id', adj.id);
      await db.from('nedarim_subscriptions').update({ amount_per_charge: base }).eq('nedarim_keva_id', adj.hk_keva_id);
      restored++; details.push({ name: nameOf(adj), base, before, after, ok: true });
    } else {
      // Nedarim did NOT apply the change (even if it returned OK) → keep it flagged as pending.
      const msg = `נדרים לא החיל — עדיין ${after ?? '?'} (ביקשנו ${base})${res.message ? ' · ' + res.message : ''}`;
      await db.from('charge_adjustments').update({ hk_override_restored_at: null, hk_error: msg }).eq('id', adj.id);
      failed++; details.push({ name: nameOf(adj), base, before, after, ok: false, message: msg });
    }
  }

  return NextResponse.json({ ok: true, restored, waiting, failed, alreadyOk, sample, details: details.slice(0, 60) });
}
