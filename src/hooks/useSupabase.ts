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
        let query = supabase.from(table).select('*');

        if (filters) {
          Object.entries(filters).forEach(([key, value]) => {
            query = query.eq(key, value);
          });
        }

        if (options?.order) {
          query = query.order(options.order, { ascending: false });
        }

        if (options?.limit) {
          query = query.limit(options.limit);
        }

        if (options?.offset) {
          query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
        }

        const { data, error: err } = await query;

        if (err) throw err;
        return (data || []) as T[];
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
        const { data: result, error: err } = await supabase.from(table).insert([data]).select();

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
