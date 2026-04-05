'use client';

import { TuitionCharge, TuitionPayment, Student } from '@/lib/types';
import { useSupabase } from './useSupabase';
import { supabase } from '@/lib/supabase';

export function useTuitionPayments() {
  const { fetchData, insertData, updateData, deleteData } = useSupabase();

  // Create a new tuition charge (recurring monthly)
  const createTuitionCharge = async (
    familyId: string,
    students: Student[],
    paymentMethod: 'standing_order' | 'check' | 'credit' | 'office',
    scheduledDayOfMonth?: number,
    notes?: string,
    amounts?: Record<string, number>
  ): Promise<TuitionCharge | null> => {
    try {
      const studentIds = students.map((s) => s.id);
      const amountBreakdown: Record<string, number> = {};
      let totalAmount = 0;

      students.forEach((s) => {
        // Use provided amounts or default to 0
        const amount = amounts?.[s.id] || 0;
        amountBreakdown[s.id] = amount;
        totalAmount += amount;
      });

      const charge: Record<string, any> = {
        family_id: familyId,
        student_ids: studentIds,
        total_amount_per_month: totalAmount,
        amount_breakdown: amountBreakdown,
        payment_method: paymentMethod,
        status: 'active',
        start_date: new Date().toISOString().split('T')[0],
        notes: notes || '',
      };

      if (paymentMethod === 'standing_order' && scheduledDayOfMonth) {
        charge.scheduled_day_of_month = scheduledDayOfMonth;
      }

      const result = await insertData<any>('tuition_charges', charge);
      return result as TuitionCharge;
    } catch (error) {
      console.error('Error creating tuition charge:', error);
      return null;
    }
  };

  // Get all tuition charges for a family
  const getTuitionChargesByFamily = async (familyId: string): Promise<TuitionCharge[]> => {
    try {
      return await fetchData<TuitionCharge>('tuition_charges', { family_id: familyId });
    } catch (error) {
      console.error('Error fetching tuition charges:', error);
      return [];
    }
  };

  // Update a tuition charge
  const updateTuitionCharge = async (id: string, data: Partial<TuitionCharge>): Promise<boolean> => {
    try {
      await updateData('tuition_charges', id, data);
      return true;
    } catch (error) {
      console.error('Error updating tuition charge:', error);
      return false;
    }
  };

  // Delete a tuition charge
  const deleteTuitionCharge = async (id: string): Promise<boolean> => {
    try {
      await deleteData('tuition_charges', id);
      return true;
    } catch (error) {
      console.error('Error deleting tuition charge:', error);
      return false;
    }
  };

  // Generate monthly payment records for standing orders (call on 1st of month or manually)
  const generateMonthlyPayments = async (): Promise<TuitionPayment[]> => {
    try {
      const charges = await fetchData<TuitionCharge>('tuition_charges', { status: 'active' });
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const monthStr = nextMonth.toISOString().slice(0, 7); // YYYY-MM

      const createdPayments: TuitionPayment[] = [];

      for (const charge of charges) {
        // Check if payment for this month already exists
        const existing = await fetchData<TuitionPayment>('tuition_payments', {
          tuition_charge_id: charge.id,
          payment_month: monthStr,
        });

        if (existing.length === 0) {
          // Calculate scheduled date
          const day = charge.scheduled_day_of_month || 1;
          const scheduledDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), day);

          const payment: Record<string, any> = {
            family_id: charge.family_id,
            tuition_charge_id: charge.id,
            payment_month: monthStr,
            scheduled_date: scheduledDate.toISOString().split('T')[0],
            total_amount: charge.total_amount_per_month,
            amount_breakdown: charge.amount_breakdown,
            payment_method: charge.payment_method,
            status: 'scheduled',
            notes: '',
          };

          const result = await insertData<any>('tuition_payments', payment);
          createdPayments.push(result as TuitionPayment);
        }
      }

      return createdPayments;
    } catch (error) {
      console.error('Error generating monthly payments:', error);
      return [];
    }
  };

  // Get tuition payments with optional filters
  const getTuitionPayments = async (filters?: {
    familyId?: string;
    month?: string;
    status?: string;
  }): Promise<TuitionPayment[]> => {
    try {
      let query = supabase.from('tuition_payments').select('*');

      if (filters?.familyId) {
        query = query.eq('family_id', filters.familyId);
      }
      if (filters?.month) {
        query = query.eq('payment_month', filters.month);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      query = query.order('scheduled_date', { ascending: true });

      const { data, error } = await query;
      if (error) throw error;

      return data as TuitionPayment[];
    } catch (error) {
      console.error('Error fetching tuition payments:', error);
      return [];
    }
  };

  // Update payment status
  const updatePaymentStatus = async (
    paymentId: string,
    status: string,
    paymentDetails?: Record<string, any>
  ): Promise<boolean> => {
    try {
      const updatePayload: Record<string, any> = { status };
      if (paymentDetails) {
        updatePayload.payment_details = paymentDetails;
      }

      await updateData('tuition_payments', paymentId, updatePayload);
      return true;
    } catch (error) {
      console.error('Error updating payment status:', error);
      return false;
    }
  };

  // Bulk update multiple payments (for monthly reconciliation)
  const bulkUpdatePayments = async (
    paymentIds: string[],
    status: string
  ): Promise<boolean> => {
    try {
      for (const id of paymentIds) {
        await updateData('tuition_payments', id, { status });
      }
      return true;
    } catch (error) {
      console.error('Error bulk updating payments:', error);
      return false;
    }
  };

  // Get summary statistics for dashboard
  const getTuitionSummary = async (): Promise<{
    thisMonth: number;
    collected: number;
    pending: number;
  }> => {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);

      const thisMonthPayments = await getTuitionPayments({ month: currentMonth });
      const thisMonthTotal = thisMonthPayments.reduce((sum, p) => sum + p.total_amount, 0);
      const collectedThisMonth = thisMonthPayments
        .filter((p) => p.status === 'collected')
        .reduce((sum, p) => sum + p.total_amount, 0);
      const pendingThisMonth = thisMonthTotal - collectedThisMonth;

      return {
        thisMonth: thisMonthTotal,
        collected: collectedThisMonth,
        pending: pendingThisMonth,
      };
    } catch (error) {
      console.error('Error calculating tuition summary:', error);
      return { thisMonth: 0, collected: 0, pending: 0 };
    }
  };

  return {
    createTuitionCharge,
    getTuitionChargesByFamily,
    updateTuitionCharge,
    deleteTuitionCharge,
    generateMonthlyPayments,
    getTuitionPayments,
    updatePaymentStatus,
    bulkUpdatePayments,
    getTuitionSummary,
  };
}
