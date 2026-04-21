'use client';

import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { cancelRecurringCharge } from '@/lib/nedarim-plus';

// Hooks into the student lifecycle (status changes, leaving, etc.)
// When a student becomes non-active we want to stop charging them.

export type LeaveStatus = 'inactive' | 'graduated' | 'chizuk';

export interface StopChargesResult {
  success: boolean;
  modifiedCharges: number;
  cancelledCharges: number;
  errors: string[];
}

export function useTuitionLifecycle() {
  // Stop / reduce tuition charges for a student whose status changed away from 'active'.
  // Logic:
  //  - If the student is the only student on a charge -> cancel the charge entirely
  //  - If other students share the charge -> remove them from the charge and reduce the total
  // For credit (Nedarim Plus) charges, we also send a cancel to the external provider.
  const stopChargesForStudent = useCallback(
    async (studentId: string, _newStatus: LeaveStatus): Promise<StopChargesResult> => {
      const result: StopChargesResult = {
        success: true,
        modifiedCharges: 0,
        cancelledCharges: 0,
        errors: [],
      };

      // Fetch active charges that include this student
      const { data: charges, error } = await supabase
        .from('tuition_charges')
        .select('*')
        .eq('status', 'active')
        .contains('student_ids', [studentId]);

      if (error) {
        result.success = false;
        result.errors.push(error.message);
        return result;
      }

      if (!charges || charges.length === 0) return result;

      for (const charge of charges) {
        const studentIds: string[] = charge.student_ids || [];
        const breakdown: Record<string, number> = charge.amount_breakdown || {};
        const remainingIds = studentIds.filter((id) => id !== studentId);

        try {
          if (remainingIds.length === 0) {
            // Cancel entirely
            if (charge.payment_method === 'credit' && charge.external_charge_id) {
              const cancelRes = await cancelRecurringCharge({
                externalChargeId: charge.external_charge_id,
                reason: 'Student status changed, no remaining students',
              });
              if (!cancelRes.success && cancelRes.error) {
                result.errors.push(
                  `נדרים פלוס: ${cancelRes.error} (charge ${charge.id})`
                );
              }
            }

            const { error: upErr } = await supabase
              .from('tuition_charges')
              .update({
                status: 'cancelled',
                cancelled_at: new Date().toISOString(),
                cancellation_reason: 'שינוי סטטוס תלמיד',
              })
              .eq('id', charge.id);

            if (upErr) {
              result.errors.push(upErr.message);
            } else {
              result.cancelledCharges += 1;
            }
          } else {
            // Just remove this student from the charge
            const removedAmount = breakdown[studentId] || 0;
            const newBreakdown = { ...breakdown };
            delete newBreakdown[studentId];
            const newTotal = Math.max(0, charge.total_amount_per_month - removedAmount);

            const { error: upErr } = await supabase
              .from('tuition_charges')
              .update({
                student_ids: remainingIds,
                amount_breakdown: newBreakdown,
                total_amount_per_month: newTotal,
              })
              .eq('id', charge.id);

            if (upErr) {
              result.errors.push(upErr.message);
            } else {
              result.modifiedCharges += 1;
            }
          }
        } catch (e) {
          result.errors.push(e instanceof Error ? e.message : String(e));
        }
      }

      if (result.errors.length > 0) result.success = false;
      return result;
    },
    []
  );

  // Cancel a future charge explicitly (for a button on a charge row)
  const cancelCharge = useCallback(
    async (chargeId: string, reason: string): Promise<{ success: boolean; error?: string }> => {
      const { data: charge, error: fetchErr } = await supabase
        .from('tuition_charges')
        .select('*')
        .eq('id', chargeId)
        .maybeSingle();

      if (fetchErr || !charge) {
        return { success: false, error: fetchErr?.message || 'Charge not found' };
      }

      // If it's a credit charge, also cancel at Nedarim Plus
      if (charge.payment_method === 'credit' && charge.external_charge_id) {
        const res = await cancelRecurringCharge({
          externalChargeId: charge.external_charge_id,
          reason,
        });
        if (!res.success) {
          return {
            success: false,
            error: `שגיאה בביטול בנדרים פלוס: ${res.error}`,
          };
        }
      }

      const { error: upErr } = await supabase
        .from('tuition_charges')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
        })
        .eq('id', chargeId);

      if (upErr) return { success: false, error: upErr.message };
      return { success: true };
    },
    []
  );

  return { stopChargesForStudent, cancelCharge };
}
