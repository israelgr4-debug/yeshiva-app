// מלגות — the smallest check that is issued (manager's rule, 2026-11-16): no check for less
// than this amount. A student whose open entitlements add up to less WAITS — nothing is
// deleted, the entitlements stay open and join the next run, until the sum reaches the
// minimum; then he is issued one check for all of it.
// The amount is a setting (`scholarship_min_check`), 0 = no minimum.

import { supabase } from './supabase';

export const MIN_CHECK_SETTING = 'scholarship_min_check';
export const DEFAULT_MIN_CHECK = 30;

export async function loadMinCheck(): Promise<number> {
  try {
    const { data } = await supabase.from('system_settings').select('value').eq('key', MIN_CHECK_SETTING).maybeSingle();
    const n = Number(data?.value);
    return data && Number.isFinite(n) && n >= 0 ? n : DEFAULT_MIN_CHECK;
  } catch { return DEFAULT_MIN_CHECK; }
}

export async function saveMinCheck(amount: number): Promise<void> {
  const { error } = await supabase.from('system_settings')
    .upsert({ key: MIN_CHECK_SETTING, value: amount, description: 'מלגות: הסכום הקטן ביותר שמופק עליו צ׳ק', updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

/** Students (ids) whose entries add up to less than the minimum. */
export function belowMinimum(entries: { student_id: string; amount: number | string }[], min: number): Set<string> {
  const out = new Set<string>();
  if (!(min > 0)) return out;
  const sum = new Map<string, number>();
  for (const e of entries) sum.set(e.student_id, (sum.get(e.student_id) || 0) + (Number(e.amount) || 0));
  // cents, so 29.999… from float sums is not "below 30"
  sum.forEach((v, id) => { if (Math.round(v * 100) < Math.round(min * 100)) out.add(id); });
  return out;
}
