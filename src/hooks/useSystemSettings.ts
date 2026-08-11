'use client';

import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { DEFAULT_BASE_MACHZOR } from '@/lib/shiurim';

export interface SystemSettings {
  current_school_year: string;
  base_machzor_for_shiur_alef: number;
  current_registration_year: string;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  current_school_year: 'תשפ"ו',
  base_machzor_for_shiur_alef: DEFAULT_BASE_MACHZOR,
  current_registration_year: 'תשפ"ז',
};

export function useSystemSettings() {
  const getSetting = useCallback(async <T,>(key: string, fallback: T): Promise<T> => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();

      if (error || !data) return fallback;
      return (data.value as T) ?? fallback;
    } catch {
      return fallback;
    }
  }, []);

  const setSetting = useCallback(async (key: string, value: unknown): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      return !error;
    } catch {
      return false;
    }
  }, []);

  const getAllSettings = useCallback(async (): Promise<SystemSettings> => {
    const year = await getSetting<string>('current_school_year', DEFAULT_SETTINGS.current_school_year);
    const baseMachzor = await getSetting<number>(
      'base_machzor_for_shiur_alef',
      DEFAULT_SETTINGS.base_machzor_for_shiur_alef
    );
    const regYear = await getSetting<string>(
      'current_registration_year',
      DEFAULT_SETTINGS.current_registration_year
    );
    return {
      current_school_year: year,
      base_machzor_for_shiur_alef: baseMachzor,
      current_registration_year: regYear,
    };
  }, [getSetting]);

  return {
    getSetting,
    setSetting,
    getAllSettings,
  };
}
