'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { TuitionCharge } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('tuition_charges')
          .select('*')
          .contains('student_ids', [studentId])
          .order('status', { ascending: true })
          .order('start_date', { ascending: false });
        if (error) throw error;
        setCharges((data || []) as TuitionCharge[]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [studentId]);

  if (loading) {
    return <div className="text-center py-8 text-gray-500">טוען...</div>;
  }

  if (charges.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        אין תרומות או גביות לתלמיד זה
      </div>
    );
  }

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
