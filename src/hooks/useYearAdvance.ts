'use client';

import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { SHIURIM, getNextShiur, getShiurByIndex, KIBUTZ_INDEX } from '@/lib/shiurim';

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

// Derive a student's shiur from their (permanent) machzor number and the base:
//   index = base - machzor_number ; 0..10 → שיעור א..יא ; ≥11 → קיבוץ ; <0 → null
function shiurFromMachzor(machzorNumber: number, base: number): string | null {
  const idx = base - machzorNumber;
  if (idx < 0) return null;                       // future cohort - not enrolled yet
  if (idx >= KIBUTZ_INDEX) return 'קיבוץ';        // past יא → kibbutz
  return getShiurByIndex(idx)?.name || null;
}

export function useYearAdvance() {
  // Preview: count active students per shiur so the user sees the a→b mapping.
  const previewAdvance = useCallback(async (): Promise<AdvancePreview> => {
    const { data: students } = await supabase
      .from('students')
      .select('id, shiur, status')
      .in('status', ['active', 'chizuk']);

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

  // Execute the annual advance. The shiur is a FUNCTION of the (permanent)
  // machzor + base: advancing a year just means raising the base by one, then
  // re-deriving every student's shiur from their machzor. This way ALL
  // students move up - including inactive/graduated - so a student who returns
  // to active is automatically at the right shiur (no per-status advancing).
  //
  // baseMachzor = the CURRENT base (before MachzorTab increments it after).
  // A שיעור 0 student (no machzor) is enrolled: gets the new שיעור א machzor.
  // כולל students and students without a machzor are left untouched.
  const executeAdvance = useCallback(async (baseMachzor: number): Promise<AdvanceResult> => {
    try {
      const newBase = baseMachzor + 1;

      // machzor id ↔ number
      const { data: machzorot } = await supabase.from('machzorot').select('id, number');
      const numberById = new Map<string, number>();
      const idByNumber = new Map<number, string>();
      for (const m of machzorot || []) {
        numberById.set(m.id as string, m.number as number);
        idByNumber.set(m.number as number, m.id as string);
      }
      const newAlefMachzorId = idByNumber.get(newBase) || null;

      // Every student (any status) - paginated.
      const students: any[] = [];
      for (let p = 0; p < 30; p++) {
        const { data, error } = await supabase
          .from('students')
          .select('id, shiur, machzor_id, status, institution_name')
          .range(p * 1000, p * 1000 + 999);
        if (error) return { success: false, updatedCount: 0, error: error.message };
        if (!data || data.length === 0) break;
        students.push(...data);
        if (data.length < 1000) break;
      }

      let updatedCount = 0;
      let machzorAssigned = 0;
      const errors: string[] = [];

      for (const s of students) {
        if ((s.institution_name || '').includes('כולל')) continue; // dorm/shiur n/a

        const patch: Record<string, any> = {};
        let machId: string | null = s.machzor_id || null;

        // שיעור 0 → enrolled into שיעור א: assign the new cohort's machzor.
        if (s.shiur === 'שיעור 0') {
          if (!newAlefMachzorId) continue;
          machId = newAlefMachzorId;
          if (s.machzor_id !== newAlefMachzorId) patch.machzor_id = newAlefMachzorId;
        }
        if (!machId) continue; // no machzor → can't derive (old alumni etc.)

        const mnum = numberById.get(machId);
        if (mnum == null) continue;
        const target = shiurFromMachzor(mnum, newBase);
        if (!target) continue;
        if (target !== s.shiur) patch.shiur = target;

        if (Object.keys(patch).length === 0) continue;
        patch.updated_at = new Date().toISOString();

        const { error: updErr } = await supabase.from('students').update(patch).eq('id', s.id);
        if (updErr) {
          errors.push(`${s.id}: ${updErr.message}`);
        } else {
          updatedCount += 1;
          if (patch.machzor_id) machzorAssigned += 1;
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
