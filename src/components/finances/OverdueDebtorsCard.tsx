'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Debtor {
  student_id: string;
  student_name: string;
  family_id: string | null;
  family_name: string | null;
  father_phone: string | null;
  payment_method: string;
  amount: number;
  due_day: number;
  due_date: string; // this month's expected date in ISO
  reason: string;
}

const METHOD_LABELS: Record<string, string> = {
  bank_ho: '🏦 בנק',
  credit_nedarim: '💳 אשראי',
  office: '💰 משרד',
};

export function OverdueDebtorsCard() {
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const today = new Date();
      const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

      // Load all active student_tuition with families (paginated)
      const allTuitions: any[] = [];
      for (let p = 0; p < 20; p++) {
        const { data } = await supabase
          .from('student_tuition')
          .select(`
            student_id, payment_method, monthly_amount, bank_day, nedarim_subscription_id,
            students!inner(id, first_name, last_name, family_id, status, institution_name),
            nedarim_subscriptions(status, scheduled_day, next_charge_date)
          `)
          .eq('students.status', 'active')
          .eq('students.institution_name', 'ישיבה')
          .eq('active', true)
          .in('payment_method', ['bank_ho', 'credit_nedarim'])
          .range(p * 1000, (p + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        allTuitions.push(...data);
        if (data.length < 1000) break;
      }

      // Load families once
      const { data: familiesList } = await supabase
        .from('families')
        .select('id, family_name, father_phone')
        .limit(3000);
      const famById: Record<string, any> = {};
      for (const f of familiesList || []) famById[f.id] = f;

      // Load successful transactions this month (for detecting paid students)
      const paidCreditSubIds = new Set<string>();
      for (let p = 0; p < 10; p++) {
        const { data } = await supabase
          .from('nedarim_transactions')
          .select('subscription_id, result, transaction_date')
          .eq('result', 'success')
          .gte('transaction_date', monthStart)
          .range(p * 1000, (p + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        for (const t of data) if (t.subscription_id) paidCreditSubIds.add(t.subscription_id);
        if (data.length < 1000) break;
      }

      // Load bank payment_history this month (success code 2)
      const paidBankStudents = new Set<string>();
      for (let p = 0; p < 10; p++) {
        const { data } = await supabase
          .from('payment_history')
          .select('student_id, status_code, payment_date')
          .eq('status_code', 2)
          .gte('payment_date', monthStart)
          .range(p * 1000, (p + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        for (const t of data) if (t.student_id) paidBankStudents.add(t.student_id);
        if (data.length < 1000) break;
      }

      // Build debtor list
      const list: Debtor[] = [];
      for (const t of allTuitions) {
        const s = t.students;
        const fam = s.family_id ? famById[s.family_id] : null;
        let dueDay: number | null = null;
        let paid = false;
        let subStatus: string | null = null;

        if (t.payment_method === 'bank_ho') {
          dueDay = Number(t.bank_day) || 20;
          paid = paidBankStudents.has(t.student_id);
        } else if (t.payment_method === 'credit_nedarim') {
          const sub = Array.isArray(t.nedarim_subscriptions)
            ? t.nedarim_subscriptions[0]
            : t.nedarim_subscriptions;
          subStatus = sub?.status || null;
          if (subStatus !== 'active') continue; // skip frozen HKs
          dueDay = sub?.scheduled_day || null;
          if (t.nedarim_subscription_id) paid = paidCreditSubIds.has(t.nedarim_subscription_id);
        }

        if (!dueDay) continue;
        // Determine due date this month
        const dueDate = new Date(today.getFullYear(), today.getMonth(),
          Math.min(dueDay, new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()));
        // Only include if due date is past
        if (dueDate >= today) continue;
        // Skip if already paid
        if (paid) continue;

        list.push({
          student_id: t.student_id,
          student_name: `${s.first_name} ${s.last_name}`,
          family_id: s.family_id,
          family_name: fam?.family_name || null,
          father_phone: fam?.father_phone || null,
          payment_method: t.payment_method,
          amount: Number(t.monthly_amount) || 0,
          due_day: dueDay,
          due_date: dueDate.toISOString().slice(0, 10),
          reason: `לא התקבל תשלום מ-${dueDate.toISOString().slice(0, 10)}`,
        });
      }

      list.sort((a, b) => b.amount - a.amount);
      setDebtors(list);
      setLoading(false);
    })();
  }, []);

  const total = debtors.reduce((sum, d) => sum + d.amount, 0);
  const formatCurrency = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 text-center text-gray-500">
        טוען...
      </div>
    );
  }

  if (debtors.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center text-sm text-green-800">
        ✓ כל התלמידים ששם לתאריך השילום שלהם עבר - שילמו 🎉
      </div>
    );
  }

  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-5">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-lg font-bold text-red-900">⚠️ חייבים שעבר תאריך הפירעון</h3>
        <div className="text-sm text-red-800">
          <b>{debtors.length}</b> תלמידים · סה"כ: <b>{formatCurrency(total)}</b>
        </div>
      </div>
      <p className="text-xs text-red-700 mt-1">
        תלמידים פעילים שתאריך החיוב עבר החודש, אך לא נמצא תשלום מוצלח.
      </p>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-sm text-red-700 hover:text-red-900 mt-2 underline"
      >
        {expanded ? '▲ הסתר פירוט' : '▼ הצג פירוט'}
      </button>

      {expanded && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm bg-white rounded border border-red-200">
            <thead className="bg-red-100">
              <tr>
                <th className="px-3 py-2 text-start">תלמיד</th>
                <th className="px-3 py-2 text-start">משפחה</th>
                <th className="px-3 py-2 text-start">שיטה</th>
                <th className="px-3 py-2 text-start">יום</th>
                <th className="px-3 py-2 text-start">סכום</th>
                <th className="px-3 py-2 text-start">טלפון</th>
              </tr>
            </thead>
            <tbody>
              {debtors.map((d) => (
                <tr key={d.student_id} className="border-t border-red-100">
                  <td className="px-3 py-2">
                    <Link href={`/students/${d.student_id}`} className="text-blue-600 hover:underline">
                      {d.student_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {d.family_id ? (
                      <Link href={`/families/${d.family_id}`} className="text-blue-600 hover:underline text-xs">
                        {d.family_name}
                      </Link>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">{METHOD_LABELS[d.payment_method] || d.payment_method}</td>
                  <td className="px-3 py-2 text-xs">{d.due_day}</td>
                  <td className="px-3 py-2 font-medium">{formatCurrency(d.amount)}</td>
                  <td className="px-3 py-2 text-xs">
                    {d.father_phone ? (
                      <a href={`tel:${d.father_phone}`} className="text-blue-600 hover:underline">
                        {d.father_phone}
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
