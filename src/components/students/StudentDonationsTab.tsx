'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { TuitionCharge } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';

interface PaymentHistoryRow {
  id: string;
  payment_date: string | null;
  amount_ils: number;
  status_code: number | null;
  status_name: string | null;
  legacy_donation_id: number | null;
  legacy_detail_number: number | null;
}

interface Props {
  studentId: string;
}

const methodLabels: Record<string, string> = {
  standing_order: 'הוראת קבע',
  check: 'צ"ק',
  credit: 'אשראי',
  office: 'במשרד',
  exempt: 'פטור',
};

const statusLabels: Record<string, { label: string; variant: any }> = {
  active: { label: 'פעיל', variant: 'success' },
  suspended: { label: 'מושהה', variant: 'warning' },
  cancelled: { label: 'בוטל', variant: 'gray' },
};

export function StudentDonationsTab({ studentId }: Props) {
  const [charges, setCharges] = useState<TuitionCharge[]>([]);
  const [history, setHistory] = useState<PaymentHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [chargesRes, historyRes] = await Promise.all([
          supabase
            .from('tuition_charges')
            .select('*')
            .contains('student_ids', [studentId])
            .order('status', { ascending: true })
            .order('start_date', { ascending: false }),
          supabase
            .from('payment_history')
            .select('id,payment_date,amount_ils,status_code,status_name,legacy_donation_id,legacy_detail_number')
            .eq('student_id', studentId)
            .order('payment_date', { ascending: false })
            .limit(1000),
        ]);
        if (chargesRes.error) throw chargesRes.error;
        if (historyRes.error) throw historyRes.error;
        setCharges((chargesRes.data || []) as TuitionCharge[]);
        setHistory((historyRes.data || []) as PaymentHistoryRow[]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [studentId]);

  if (loading) {
    return <div className="text-center py-8 text-gray-500">טוען...</div>;
  }

  if (charges.length === 0 && history.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        אין תרומות או גביות לתלמיד זה
      </div>
    );
  }

  // Payment history stats
  const paidCount = history.filter((h) => h.status_code === 2).length;
  const returnedCount = history.filter((h) => h.status_code === 3).length;
  const totalPaid = history
    .filter((h) => h.status_code === 2)
    .reduce((sum, h) => sum + (Number(h.amount_ils) || 0), 0);

  const active = charges.filter((c) => c.status === 'active');
  const cancelled = charges.filter((c) => c.status !== 'active');
  const activeTotal = active.reduce((sum, c) => {
    const breakdown = c.amount_breakdown || {};
    return sum + (Number(breakdown[studentId]) || c.total_amount_per_month || 0);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-green-50 rounded-lg p-4 text-center">
          <p className="text-xs text-gray-600 mb-1">גביות פעילות</p>
          <p className="text-2xl font-bold text-green-700">{active.length}</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 text-center">
          <p className="text-xs text-gray-600 mb-1">סכום חודשי</p>
          <p className="text-2xl font-bold text-blue-700">
            ₪{activeTotal.toLocaleString('he-IL')}
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <p className="text-xs text-gray-600 mb-1">גביות בארכיון</p>
          <p className="text-2xl font-bold text-gray-700">{cancelled.length}</p>
        </div>
      </div>

      {/* Active */}
      {active.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">גביות פעילות</h4>
          <div className="space-y-2">
            {active.map((c) => (
              <ChargeRow key={c.id} charge={c} studentId={studentId} />
            ))}
          </div>
        </div>
      )}

      {/* Cancelled */}
      {cancelled.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-500 mb-3">
            ארכיון ({cancelled.length})
          </h4>
          <div className="space-y-2">
            {cancelled.map((c) => (
              <ChargeRow key={c.id} charge={c} studentId={studentId} />
            ))}
          </div>
        </div>
      )}

      {/* Payment history */}
      {history.length > 0 && (
        <div className="pt-4 border-t border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-semibold text-gray-700">
              היסטוריית תשלומים ({history.length})
            </h4>
            <button
              type="button"
              onClick={() => setShowHistory((s) => !s)}
              className="text-sm text-blue-600 hover:underline"
            >
              {showHistory ? 'הסתר' : 'הצג הכל'}
            </button>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-green-50 rounded p-2 text-center">
              <p className="text-xs text-gray-600">נפרעו</p>
              <p className="font-bold text-green-700">{paidCount}</p>
            </div>
            <div className="bg-blue-50 rounded p-2 text-center">
              <p className="text-xs text-gray-600">סה"כ שולם</p>
              <p className="font-bold text-blue-700">₪{totalPaid.toLocaleString('he-IL')}</p>
            </div>
            <div className="bg-red-50 rounded p-2 text-center">
              <p className="text-xs text-gray-600">חזרו</p>
              <p className="font-bold text-red-700">{returnedCount}</p>
            </div>
          </div>

          {/* History table */}
          {showHistory && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="text-start px-3 py-2 font-semibold">תאריך</th>
                    <th className="text-start px-3 py-2 font-semibold">סכום</th>
                    <th className="text-start px-3 py-2 font-semibold">סטטוס</th>
                    <th className="text-start px-3 py-2 font-semibold">הו"ק/פרוט</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const color =
                      h.status_code === 2
                        ? 'text-green-700'
                        : h.status_code === 3
                        ? 'text-red-700'
                        : 'text-gray-700';
                    return (
                      <tr key={h.id} className="border-b border-gray-100">
                        <td className="px-3 py-2">{h.payment_date || '-'}</td>
                        <td className="px-3 py-2 font-medium">
                          ₪{Number(h.amount_ils || 0).toLocaleString('he-IL')}
                        </td>
                        <td className={`px-3 py-2 ${color}`}>{h.status_name || '-'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {h.legacy_donation_id}/{h.legacy_detail_number}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChargeRow({ charge, studentId }: { charge: TuitionCharge; studentId: string }) {
  const breakdown = charge.amount_breakdown || {};
  const amount = Number(breakdown[studentId]) || charge.total_amount_per_month || 0;
  const method = methodLabels[charge.payment_method] || charge.payment_method;
  const status = statusLabels[charge.status] || { label: charge.status, variant: 'gray' };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-lg">
            ₪{amount.toLocaleString('he-IL')}
          </span>
          <span className="text-xs text-gray-500">/ חודש</span>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-600 mt-1">
          <span>{method}</span>
          {charge.scheduled_day_of_month && (
            <span>• יום {charge.scheduled_day_of_month} בחודש</span>
          )}
          {charge.start_date && <span>• החל מ-{charge.start_date}</span>}
        </div>
      </div>
    </div>
  );
}
