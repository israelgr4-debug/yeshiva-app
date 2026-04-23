'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface MonthData {
  year: number;
  month: number;
  label: string;
  amount: number;
}

export function Forecast12MonthsCard() {
  const [months, setMonths] = useState<MonthData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Compute monthly total from active student_tuition (paginated)
      let monthly = 0;
      for (let p = 0; p < 20; p++) {
        const { data } = await supabase
          .from('student_tuition')
          .select('monthly_amount, payment_method, students!inner(status)')
          .eq('students.status', 'active')
          .in('payment_method', ['bank_ho', 'credit_nedarim', 'office'])
          .range(p * 1000, (p + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        monthly += data.reduce((sum, r) => sum + (Number(r.monthly_amount) || 0), 0);
        if (data.length < 1000) break;
      }

      // Build next 12 months
      const now = new Date();
      const arr: MonthData[] = [];
      for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        arr.push({
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          label: d.toLocaleString('he-IL', { month: 'short', year: '2-digit' }),
          amount: monthly,
        });
      }
      setMonths(arr);
      setTotal(monthly * 12);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 text-center text-gray-500">
        טוען...
      </div>
    );
  }

  const maxAmount = Math.max(...months.map((m) => m.amount), 1);
  const formatCurrency = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-lg font-bold">📈 צפי 12 חודשים קדימה</h3>
        <div className="text-sm text-gray-600">
          סה"כ צפי שנתי:{' '}
          <span className="font-bold text-green-700 text-lg">{formatCurrency(total)}</span>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        מבוסס על שכר לימוד של תלמידים פעילים כרגע. לא לוקח בחשבון תלמידים שיצטרפו/יעזבו בעתיד.
      </p>

      {/* Bar chart */}
      <div className="flex items-end justify-between gap-1 h-40 border-b border-gray-200 pb-1">
        {months.map((m, i) => {
          const height = (m.amount / maxAmount) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end">
              <div
                className="w-full bg-blue-500 hover:bg-blue-600 rounded-t transition-colors relative group"
                style={{ height: `${height}%`, minHeight: '2px' }}
                title={`${m.label}: ${formatCurrency(m.amount)}`}
              >
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap transition-opacity pointer-events-none">
                  {formatCurrency(m.amount)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        {months.map((m, i) => (
          <div key={i} className="flex-1 text-center">
            {m.label}
          </div>
        ))}
      </div>
    </div>
  );
}
