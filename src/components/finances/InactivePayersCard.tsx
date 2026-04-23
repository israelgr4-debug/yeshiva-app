'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Row {
  student_id: string;
  student_name: string;
  student_status: string;
  family_id: string | null;
  payment_method: string;
  monthly_amount: number;
  sub_status?: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  bank_ho: 'הו"ק בנק',
  credit_nedarim: 'אשראי',
  office: 'משרד',
};

export function InactivePayersCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Fetch all inactive students with an active payment method (not none/exempt)
      const { data } = await supabase
        .from('student_tuition')
        .select(`
          student_id, payment_method, monthly_amount, nedarim_subscription_id,
          students!inner(id, first_name, last_name, family_id, status),
          nedarim_subscriptions(status)
        `)
        .neq('students.status', 'active')
        .in('payment_method', ['credit_nedarim', 'bank_ho', 'office'])
        .eq('active', true);

      const list: Row[] = [];
      for (const r of (data || []) as any[]) {
        const sub = r.nedarim_subscriptions;
        const subStatus = Array.isArray(sub) ? sub[0]?.status : sub?.status;
        // If credit_nedarim but the HK is frozen → exclude
        if (r.payment_method === 'credit_nedarim' && subStatus !== 'active') continue;
        list.push({
          student_id: r.student_id,
          student_name: `${r.students.first_name} ${r.students.last_name}`,
          student_status: r.students.status,
          family_id: r.students.family_id,
          payment_method: r.payment_method,
          monthly_amount: Number(r.monthly_amount) || 0,
          sub_status: subStatus || null,
        });
      }
      // Sort: highest amount first
      list.sort((a, b) => b.monthly_amount - a.monthly_amount);
      setRows(list);
      setLoading(false);
    })();
  }, []);

  const total = rows.reduce((sum, r) => sum + r.monthly_amount, 0);
  const formatCurrency = (n: number) => `₪${Number(n).toLocaleString('he-IL')}`;

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 text-center text-gray-500">
        טוען...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center text-sm text-green-800">
        ✓ אין תלמידים לא-פעילים שעדיין משלמים
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-5">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-lg font-bold text-amber-900">
          ⚠️ תלמידים לא-פעילים שעדיין משלמים
        </h3>
        <div className="text-sm text-amber-800">
          <b>{rows.length}</b> תלמידים · סה"כ חודשי: <b>{formatCurrency(total)}</b>
        </div>
      </div>
      <p className="text-xs text-amber-700 mt-1">
        תלמידים שעזבו/לא-פעילים עם הוק פעילה (לא כולל מוקפאות). יש לבדוק אם לעצור את הגביה.
      </p>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-sm text-amber-700 hover:text-amber-900 mt-2 underline"
      >
        {expanded ? '▲ הסתר פירוט' : '▼ הצג פירוט'}
      </button>

      {expanded && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm bg-white rounded border border-amber-200">
            <thead className="bg-amber-100">
              <tr>
                <th className="px-3 py-2 text-start">תלמיד</th>
                <th className="px-3 py-2 text-start">סטטוס</th>
                <th className="px-3 py-2 text-start">שיטה</th>
                <th className="px-3 py-2 text-start">סכום חודשי</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.student_id} className="border-t border-amber-100">
                  <td className="px-3 py-2">
                    <Link href={`/students/${r.student_id}`} className="text-blue-600 hover:underline">
                      {r.student_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.student_status}</td>
                  <td className="px-3 py-2 text-xs">
                    {METHOD_LABELS[r.payment_method] || r.payment_method}
                  </td>
                  <td className="px-3 py-2 font-medium">{formatCurrency(r.monthly_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
