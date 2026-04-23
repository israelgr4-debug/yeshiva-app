'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Stats {
  target: number;
  creditCollected: number;
  officeCollected: number;
  bankCollected: number;
}

export function MonthlyCollectionGauge() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

      // Target: sum of active students' tuition (paginated)
      let target = 0;
      for (let p = 0; p < 20; p++) {
        const { data } = await supabase
          .from('student_tuition')
          .select('monthly_amount, payment_method, students!inner(status)')
          .eq('students.status', 'active')
          .in('payment_method', ['bank_ho', 'credit_nedarim', 'office'])
          .range(p * 1000, (p + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        target += data.reduce((sum, r) => sum + (Number(r.monthly_amount) || 0), 0);
        if (data.length < 1000) break;
      }

      // Credit collected (Nedarim transactions this month)
      let creditCollected = 0;
      for (let p = 0; p < 10; p++) {
        const { data } = await supabase
          .from('nedarim_transactions')
          .select('amount,result,transaction_date')
          .eq('result', 'success')
          .gte('transaction_date', monthStart)
          .lt('transaction_date', monthEnd)
          .range(p * 1000, (p + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        creditCollected += data.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
        if (data.length < 1000) break;
      }

      // Office payments this month
      const { data: office } = await supabase
        .from('office_payments')
        .select('amount')
        .gte('payment_date', monthStart)
        .lt('payment_date', monthEnd);
      const officeCollected = (office || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

      // Bank collected (payment_history status=paid/2 this month)
      let bankCollected = 0;
      for (let p = 0; p < 10; p++) {
        const { data } = await supabase
          .from('payment_history')
          .select('amount_ils,status_code,payment_date')
          .eq('status_code', 2)
          .gte('payment_date', monthStart)
          .lt('payment_date', monthEnd)
          .range(p * 1000, (p + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        bankCollected += data.reduce((sum, r) => sum + (Number(r.amount_ils) || 0), 0);
        if (data.length < 1000) break;
      }

      setStats({ target, creditCollected, officeCollected, bankCollected });
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
  if (!stats) return null;

  const total = stats.creditCollected + stats.officeCollected + stats.bankCollected;
  const pct = stats.target > 0 ? Math.min(100, (total / stats.target) * 100) : 0;
  const formatCurrency = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;

  // Semi-circle gauge: 180deg arc from left (0%) to right (100%)
  // SVG path for semicircle arc
  const radius = 100;
  const centerX = 120;
  const centerY = 120;
  const angle = Math.PI * (pct / 100); // 0..π
  const endX = centerX - Math.cos(angle) * radius;
  const endY = centerY - Math.sin(angle) * radius;

  // Color: red < 60, amber 60-85, green >= 85
  const color = pct >= 85 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626';

  const now = new Date();
  const monthName = now.toLocaleString('he-IL', { month: 'long', year: 'numeric' });

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-lg font-bold">⏱️ גבייה החודש - {monthName}</h3>
        <span className="text-xs text-gray-500">מתעדכן מנתוני הסנכרון</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        {/* Gauge */}
        <div className="flex justify-center">
          <svg width="240" height="140" viewBox="0 0 240 140">
            {/* Background arc */}
            <path
              d={`M 20 ${centerY} A ${radius} ${radius} 0 0 1 220 ${centerY}`}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="20"
              strokeLinecap="round"
            />
            {/* Progress arc */}
            {pct > 0 && (
              <path
                d={`M 20 ${centerY} A ${radius} ${radius} 0 ${pct > 50 ? 1 : 0} 1 ${endX} ${endY}`}
                fill="none"
                stroke={color}
                strokeWidth="20"
                strokeLinecap="round"
              />
            )}
            {/* Percentage text */}
            <text x="120" y="100" textAnchor="middle" fontSize="36" fontWeight="bold" fill={color}>
              {Math.round(pct)}%
            </text>
            <text x="120" y="125" textAnchor="middle" fontSize="12" fill="#6b7280">
              מהיעד
            </text>
          </svg>
        </div>

        {/* Breakdown */}
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm pb-2 border-b border-gray-200">
            <span className="font-medium">יעד חודשי:</span>
            <span className="font-bold text-lg">{formatCurrency(stats.target)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-purple-500"></span>
              💳 אשראי
            </span>
            <span className="font-semibold text-purple-700">{formatCurrency(stats.creditCollected)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-blue-500"></span>
              🏦 בנק
            </span>
            <span className="font-semibold text-blue-700">{formatCurrency(stats.bankCollected)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
              💰 משרד
            </span>
            <span className="font-semibold text-green-700">{formatCurrency(stats.officeCollected)}</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-gray-200">
            <span className="font-bold">נגבה סה"כ:</span>
            <span className="font-bold text-lg" style={{ color }}>{formatCurrency(total)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">נותר:</span>
            <span className="text-gray-700 font-semibold">{formatCurrency(Math.max(0, stats.target - total))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
