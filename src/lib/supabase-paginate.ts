import { supabase } from './supabase';

/**
 * Fetch all rows from a table, paging past the Supabase 1000-row limit.
 * Usage:
 *   const families = await fetchAll<Family>('families', 'id, family_name, father_name');
 */
export async function fetchAll<T>(
  table: string,
  select = '*',
  filter?: (q: any) => any
): Promise<T[]> {
  const all: T[] = [];
  const PAGE = 1000;
  for (let p = 0; p < 50; p++) {
    let q = supabase.from(table).select(select).range(p * PAGE, p * PAGE + PAGE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as unknown as T[]));
    if (data.length < PAGE) break;
  }
  return all;
}
