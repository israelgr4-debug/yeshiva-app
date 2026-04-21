'use client';

import { supabase } from '@/lib/supabase';
import { useCallback, useState } from 'react';

export function useSupabase() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async <T,>(
      table: string,
      filters?: Record<string, any>,
      options?: { limit?: number; offset?: number; order?: string }
    ): Promise<T[]> => {
      setLoading(true);
      setError(null);
      try {
        const buildQuery = () => {
          let q = supabase.from(table).select('*');
          if (filters) {
            Object.entries(filters).forEach(([key, value]) => {
              q = q.eq(key, value);
            });
          }
          if (options?.order) {
            q = q.order(options.order, { ascending: false });
          }
          return q;
        };

        // Explicit pagination: return exactly what caller asked for.
        if (options?.limit || options?.offset) {
          const from = options?.offset ?? 0;
          const to = from + (options?.limit ?? 1000) - 1;
          const { data, error: err } = await buildQuery().range(from, to);
          if (err) throw err;
          return (data || []) as T[];
        }

        // No pagination requested: auto-page through ALL rows (PostgREST caps at 1000 per request).
        const PAGE_SIZE = 1000;
        const all: T[] = [];
        for (let page = 0; page < 20; page++) {
          const from = page * PAGE_SIZE;
          const to = from + PAGE_SIZE - 1;
          const { data, error: err } = await buildQuery().range(from, to);
          if (err) throw err;
          if (!data || data.length === 0) break;
          all.push(...(data as T[]));
          if (data.length < PAGE_SIZE) break;
        }
        return all;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch data';
        setError(errorMessage);
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const insertData = useCallback(
    async <T,>(table: string, data: T): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        // Remove null/empty values and send single object (not array) to avoid columns parameter issue
        const cleanData: Record<string, any> = {};
        for (const [key, value] of Object.entries(data as any)) {
          if (value !== null && value !== undefined && value !== '') {
            cleanData[key] = value;
          }
        }
        const { data: result, error: err } = await supabase.from(table).insert(cleanData).select();

        if (err) throw err;
        return (result?.[0] || null) as T | null;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to insert data';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateData = useCallback(
    async <T,>(table: string, id: string, data: Partial<T>): Promise<T | null> => {
      setLoading(true);
      setError(null);
      try {
        const { data: result, error: err } = await supabase
          .from(table)
          .update(data)
          .eq('id', id)
          .select();

        if (err) throw err;
        return (result?.[0] || null) as T | null;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update data';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteData = useCallback(
    async (table: string, id: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const { error: err } = await supabase.from(table).delete().eq('id', id);

        if (err) throw err;
        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to delete data';
        setError(errorMessage);
        return false;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { fetchData, insertData, updateData, deleteData, loading, error };
}
