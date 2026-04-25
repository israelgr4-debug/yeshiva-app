'use client';

import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Graduate } from '@/lib/types';

const NULLABLE_DATE_FIELDS = new Set(['left_date']);
const NULLABLE_UUID_FIELDS = new Set(['student_id', 'family_id', 'machzor_id']);

function sanitize(input: Partial<Graduate>): Partial<Graduate> {
  const out: any = {};
  for (const [k, v] of Object.entries(input)) {
    if ((NULLABLE_DATE_FIELDS.has(k) || NULLABLE_UUID_FIELDS.has(k)) && (v === '' || v === undefined)) {
      out[k] = null;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function useGraduates() {
  const list = useCallback(async (): Promise<Graduate[]> => {
    const all: Graduate[] = [];
    for (let p = 0; p < 30; p++) {
      const { data } = await supabase
        .from('graduates')
        .select('*')
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })
        .range(p * 1000, p * 1000 + 999);
      if (!data || data.length === 0) break;
      all.push(...(data as Graduate[]));
      if (data.length < 1000) break;
    }
    return all;
  }, []);

  const create = useCallback(async (input: Partial<Graduate>): Promise<Graduate> => {
    const { data, error } = await supabase
      .from('graduates')
      .insert(sanitize(input))
      .select()
      .single();
    if (error) throw error;
    return data as Graduate;
  }, []);

  const update = useCallback(async (id: string, patch: Partial<Graduate>): Promise<void> => {
    const { error } = await supabase.from('graduates').update(sanitize(patch)).eq('id', id);
    if (error) throw error;
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from('graduates').delete().eq('id', id);
    if (error) throw error;
  }, []);

  const promoteFromPending = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('graduates')
      .update({ is_pending: false })
      .eq('id', id);
    if (error) throw error;
  }, []);

  return { list, create, update, remove, promoteFromPending };
}
