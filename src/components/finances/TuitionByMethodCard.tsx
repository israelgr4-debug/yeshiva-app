'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface MethodStat {
  method: string;
  students: number;
  monthly: number;
}

const METHOD_CONFIG: Record<string, { label: string; icon: string; color: string; hint?: string }> = {
  bank_ho: {
    label: 'הוראת קבע בנקאית',
    icon: '🏦',
    color: 'bg-blue-50 text-blue-900',
  },
  credit_nedarim: {
    label: 'אשראי (נדרים)',
    icon: '💳',
    color: 'bg-purple-50 text-purple-900',
  },
  office: {
    label: 'תשלום במשרד',
    icon: '💰',
    color: 'bg-green-50 text-green-900',
  },
  exempt: {
    label: 'פטור',
    icon: '🎓',
    color: 'bg-gray-50 text-gray-700',
  },
  none: {
    label: 'לא מוגדר',
    icon: '⚠️',
    color: 'bg-red-50 text-red-800',
    hint: 'דורש טיפול',
  },
};

const METHOD_ORDER = ['bank_ho', 'credit_nedarim', 'office', 'exempt', 'none'];

export function TuitionByMethodCard() {
  const [stats, setStats] = useState<MethodStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalMonthly, setTotalMonthly] = useState(0);
  const [totalStudents, setTotalStudents] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Join with students to count only active students
      const { data } = await supabase
        .from('student_tuition')
        .select('payment_method, monthly_amount, student_id, students!inner(status)')
        .eq('students.status', 'active');

      const grouped: Record<string, MethodStat> = {};
      for (const m of METHOD_ORDER) {
        grouped[m] = { method: m, students: 0, monthly: 0 };
      }
      for (const row of (data || []) as any[]) {
        const m = row.payment_method;
        if (!grouped[m]) grouped[m] = { method: m, students: 0, monthly: 0 };
        grouped[m].students++;
        grouped[m].monthly += Number(row.monthly_amount) || 0;
      }

      const ordered = METHOD_ORDER.map((m) => grouped[m]);
      setStats(ordered);

      // totals: collecting methods only (exclude exempt and none)
      let tm = 0;
      let ts = 0;
      for (const s of ordered) {
        if (s.method === 'bank_ho' || s.method === 'credit_nedarim' || s.method === 'office') {
          tm += s.monthly;
          ts += s.students;
        }
      }
      setTotalMonthly(tm);
      setTotalStudents(ts);

      setLoading(false);
    })();
  }, []);

  const formatCurrency = (n: number) => `₪${Number(n).toLocaleString('he-IL')}`;

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 text-center text-gray-500">
        טוען...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-lg font-bold">📊 שכר לימוד - לפי שיטת תשלום</h3>
        <div className="text-sm text-gray-600">
          סה"כ צפי חודשי (גבייה בפועל):{' '}
          <span className="font-bold text-green-700 text-lg">
            {formatCurrency(totalMonthly)}
          </span>{' '}
          · <span className="font-medium">{totalStudents}</span> תלמידים
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {stats.map((s) => {
          const cfg = METHOD_CONFIG[s.method];
          return (
            <div key={s.method} className={`rounded-lg p-4 ${cfg.color}`}>
              <div className="flex items-center gap-1 mb-1">
                <span>{cfg.icon}</span>
                <span className="text-sm font-medium">{cfg.label}</span>
              </div>
              <p className="text-2xl font-bold">
                {s.method === 'exempt' || s.method === 'none' ? s.students : formatCurrency(s.monthly)}
              </p>
              <p className="text-xs mt-1 opacity-75">
                {s.method === 'exempt' || s.method === 'none'
                  ? `${s.students} תלמידים`
                  : `${s.students} תלמידים`}
              </p>
              {cfg.hint && s.students > 0 && (
                <Link
                  href="/finances/tuition/setup"
                  className="text-xs mt-2 inline-block underline"
                >
                  {cfg.hint} →
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
