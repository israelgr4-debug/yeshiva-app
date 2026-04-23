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

interface NedarimSub {
  id: string;
  nedarim_keva_id: string;
  kind: 'credit' | 'bank';
  status: string;
  amount_per_charge: number;
  scheduled_day: number | null;
  next_charge_date: string | null;
  last_4_digits: string | null;
  groupe: string | null;
  client_name: string | null;
  family_id: string | null;
  student_ids: string[] | null;
}

interface Props {
  studentId: string;
  familyId?: string;
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

export function StudentDonationsTab({ studentId, familyId }: Props) {
  const [charges, setCharges] = useState<TuitionCharge[]>([]);
  const [history, setHistory] = useState<PaymentHistoryRow[]>([]);
  const [nedarimSubs, setNedarimSubs] = useState<NedarimSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const promises: any[] = [
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
        ];
        // Nedarim subscriptions - match by family_id (subscriptions are family-level)
        if (familyId) {
          promises.push(
            supabase
              .from('nedarim_subscriptions')
              .select('id, nedarim_keva_id, kind, status, amount_per_charge, scheduled_day, next_charge_date, last_4_digits, groupe, client_name, family_id, student_ids')
              .eq('family_id', familyId)
              .neq('status', 'deleted')
          );
        }
        const results = await Promise.all(promises);
        if (results[0].error) throw results[0].error;
        if (results[1].error) throw results[1].error;
        setCharges((results[0].data || []) as TuitionCharge[]);
        setHistory((results[1].data || []) as PaymentHistoryRow[]);
        if (familyId && results[2]) {
          setNedarimSubs((results[2].data || []) as NedarimSub[]);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [studentId, familyId]);

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

      {/* Nedarim active subscriptions (family-level) */}
      {nedarimSubs.filter((s) => s.status === 'active').length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            💳 הוראות קבע פעילות בנדרים פלוס
            <span className="text-xs font-normal text-gray-500">(ברמת משפחה)</span>
          </h4>
          <div className="space-y-2">
            {nedarimSubs
              .filter((s) => s.status === 'active')
              .map((s) => (
                <div
                  key={s.id}
                  className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        {s.kind === 'credit' ? '💳 אשראי' : '🏦 בנקאי'}
                      </span>
                      {s.groupe && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                          {s.groupe}
                        </span>
                      )}
                      {s.student_ids?.includes(studentId) && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                          ✓ מיוחס לתלמיד זה
                        </span>
                      )}
                    </div>
                    <p className="text-sm mt-1">
                      {s.scheduled_day && <span>חיוב ב-{s.scheduled_day} לחודש</span>}
                      {s.last_4_digits && <span className="ms-2 text-gray-500">כרטיס ****{s.last_4_digits}</span>}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-bold text-lg text-green-700">
                      ₪{Number(s.amount_per_charge).toLocaleString('he-IL')}
                    </p>
                    <p className="text-xs text-gray-500">/ חודש</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Active */}
      {active.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">גביות פעילות (ישנות)</h4>
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
