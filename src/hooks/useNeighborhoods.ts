'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface Neighborhood {
  code: number;
  name: string;
  city_name: string;
}

/** Lightweight cache shared across components in the same session */
let cache: Neighborhood[] | null = null;
let cachePromise: Promise<Neighborhood[]> | null = null;

async function fetchAll(): Promise<Neighborhood[]> {
  if (cache) return cache;
  if (cachePromise) return cachePromise;
  cachePromise = (async () => {
    const { data, error } = await supabase
      .from('lookup_neighborhoods')
      .select('code,name,city_name')
      .order('city_name', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    cache = (data || []) as Neighborhood[];
    return cache;
  })();
  return cachePromise;
}

export function useNeighborhoods() {
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>(cache || []);
  const [loading, setLoading] = useState(!cache);

  const reload = useCallback(async () => {
    cache = null;
    cachePromise = null;
    setLoading(true);
    try {
      const data = await fetchAll();
      setNeighborhoods(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((d) => {
        if (!cancelled) {
          setNeighborhoods(d);
          setLoading(false);
        }
      })
      .catch(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Get the name for a code (or '' if not found) */
  const nameByCode = useCallback(
    (code: number | null | undefined): string => {
      if (code == null) return '';
      const n = neighborhoods.find((x) => x.code === code);
      return n?.name || '';
    },
    [neighborhoods]
  );

  /** Filter neighborhoods for a given city (case-insensitive trim match) */
  const forCity = useCallback(
    (city: string | null | undefined): Neighborhood[] => {
      if (!city) return [];
      const c = city.trim();
      return neighborhoods.filter((n) => (n.city_name || '').trim() === c);
    },
    [neighborhoods]
  );

  /** All distinct cities that have at least one neighborhood */
  const cities = Array.from(
    new Set(neighborhoods.map((n) => n.city_name).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'he'));

  const create = useCallback(
    async (city: string, name: string): Promise<Neighborhood> => {
      const { data, error } = await supabase
        .from('lookup_neighborhoods')
        .insert({ city_name: city.trim(), name: name.trim() })
        .select('code,name,city_name')
        .single();
      if (error) throw error;
      cache = null;
      await reload();
      return data as Neighborhood;
    },
    [reload]
  );

  const remove = useCallback(
    async (code: number) => {
      const { error } = await supabase.from('lookup_neighborhoods').delete().eq('code', code);
      if (error) throw error;
      cache = null;
      await reload();
    },
    [reload]
  );

  const rename = useCallback(
    async (code: number, name: string) => {
      const { error } = await supabase
        .from('lookup_neighborhoods')
        .update({ name: name.trim() })
        .eq('code', code);
      if (error) throw error;
      cache = null;
      await reload();
    },
    [reload]
  );

  return { neighborhoods, loading, reload, nameByCode, forCity, cities, create, remove, rename };
}
