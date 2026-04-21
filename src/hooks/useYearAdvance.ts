'use client';

import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { SHIURIM, getNextShiur } from '@/lib/shiurim';

export interface AdvancePreview {
  totalActive: number;
  byShiur: { fromShiur: string; toShiur: string; count: number }[];
  kibutzCount: number; // how many are already in kibutz (don't advance)
}

export interface AdvanceResult {
  success: boolean;
  updatedCount: number;
  error?: string;
}

export function useYearAdvance() {
  // Preview: count students per shiur so the user can see what will happen
  const previewAdvance = useCallback(async (): Promise<AdvancePreview> => {
    const { data: students } = await supabase
      .from('students')
      .select('id, shiur, status')
      .eq('status', 'active');

    const counts: Record<string, number> = {};
    let kibutzCount = 0;

    for (const s of students || []) {
      const shiurName = s.shiur as string;
      if (!shiurName) continue;
      counts[shiurName] = (counts[shiurName] || 0) + 1;
      const next = getNextShiur(shiurName);
      if (next?.isKibutz && shiurName === 'קיבוץ') kibutzCount += 1;
    }

    const byShiur = SHIURIM.filter((s) => !s.isKibutz)
      .map((s) => {
        const next = getNextShiur(s.name);
        return {
          fromShiur: s.name,
          toShiur: next ? next.name : s.name,
          count: counts[s.name] || 0,
        };
      })
      .filter((row) => row.count > 0);

    return {
      totalActive: students?.length || 0,
      byShiur,
      kibutzCount,
    };
  }, []);

  // Execute: move every active student to the next shiur (machzor unchanged)
  const executeAdvance = useCallback(async (): Promise<AdvanceResult> => {
    try {
      const { data: students, error: fetchErr } = await supabase
        .from('students')
        .select('id, shiur')
        .eq('status', 'active');

      if (fetchErr) return { success: false, updatedCount: 0, error: fetchErr.message };

      let updatedCount = 0;
      const errors: string[] = [];

      for (const s of students || []) {
        if (!s.shiur) continue;
        const next = getNextShiur(s.shiur);
        if (!next) continue;
        // If already in kibutz, nothing to do
        if (next.name === s.shiur) continue;

        const { error: updErr } = await supabase
          .from('students')
          .update({ shiur: next.name, updated_at: new Date().toISOString() })
          .eq('id', s.id);

        if (updErr) {
          errors.push(`${s.id}: ${updErr.message}`);
        } else {
          updatedCount += 1;
        }
      }

      if (errors.length > 0) {
        return {
          success: false,
          updatedCount,
          error: `שגיאות: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`,
        };
      }

      return { success: true, updatedCount };
    } catch (e) {
      return {
        success: false,
        updatedCount: 0,
        error: e instanceof Error ? e.message : 'שגיאה לא ידועה',
      };
    }
  }, []);

  return { previewAdvance, executeAdvance };
}
