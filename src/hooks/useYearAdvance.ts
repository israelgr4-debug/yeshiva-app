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
  machzorAssigned?: number; // how many שיעור 0 → שיעור א got a machzor assigned
  error?: string;
}

// Statuses that advance a year. Chizuk students are part of the cohort and move
// up with everyone else (only inactive/graduated stay put).
const ADVANCING_STATUSES = ['active', 'chizuk'];

export function useYearAdvance() {
  // Preview: count students per shiur so the user can see what will happen
  const previewAdvance = useCallback(async (): Promise<AdvancePreview> => {
    const { data: students } = await supabase
      .from('students')
      .select('id, shiur, status')
      .in('status', ADVANCING_STATUSES);

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

  // Execute: move every active/chizuk student to the next shiur (existing
  // machzor unchanged). EXCEPTION: a שיעור 0 student promoted to שיעור א gets
  // NEXT year's machzor assigned (baseMachzor + 1), since they had none.
  // baseMachzor = the CURRENT base_machzor_for_shiur_alef (before MachzorTab
  // increments it after a successful advance).
  const executeAdvance = useCallback(async (baseMachzor: number): Promise<AdvanceResult> => {
    try {
      const { data: students, error: fetchErr } = await supabase
        .from('students')
        .select('id, shiur, machzor_id')
        .in('status', ADVANCING_STATUSES);

      if (fetchErr) return { success: false, updatedCount: 0, error: fetchErr.message };

      // Map machzor number → machzorot.id (machzor_id is a UUID FK).
      const { data: machzorot } = await supabase.from('machzorot').select('id, number');
      const idByNumber = new Map<number, string>();
      for (const m of machzorot || []) idByNumber.set(m.number as number, m.id as string);
      // New שיעור א cohort = the machzor for (base + 1), the post-advance base.
      const newAlefMachzorId = idByNumber.get(baseMachzor + 1) || null;

      let updatedCount = 0;
      let machzorAssigned = 0;
      const errors: string[] = [];

      for (const s of students || []) {
        if (!s.shiur) continue;
        const next = getNextShiur(s.shiur);
        if (!next) continue;
        // If already in kibutz, nothing to do
        if (next.name === s.shiur) continue;

        const patch: Record<string, any> = {
          shiur: next.name,
          updated_at: new Date().toISOString(),
        };
        // שיעור 0 → שיעור א: assign the new cohort's machzor (they had none).
        const assigningMachzor =
          s.shiur === 'שיעור 0' && next.name === 'שיעור א' && !!newAlefMachzorId;
        if (assigningMachzor) patch.machzor_id = newAlefMachzorId;

        const { error: updErr } = await supabase
          .from('students')
          .update(patch)
          .eq('id', s.id);

        if (updErr) {
          errors.push(`${s.id}: ${updErr.message}`);
        } else {
          updatedCount += 1;
          if (assigningMachzor) machzorAssigned += 1;
        }
      }

      if (errors.length > 0) {
        return {
          success: false,
          updatedCount,
          machzorAssigned,
          error: `שגיאות: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`,
        };
      }

      return { success: true, updatedCount, machzorAssigned };
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
