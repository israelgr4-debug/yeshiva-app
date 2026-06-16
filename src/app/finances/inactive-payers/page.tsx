'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { PageGuard } from '@/components/ui/PageGuard';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

interface Row {
  tuition_id: string;
  student_id: string;
  student_name: string;
  student_status: string;
  family_id: string | null;
  payment_method: string;
  monthly_amount: number;
  sub_status?: string | null;
  nedarim_sub_id?: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  bank_ho: '🏦 הו"ק בנק',
  credit_nedarim: '💳 אשראי',
  office: '💰 משרד',
};

const STATUS_LABELS: Record<string, string> = {
  inactive: 'לא פעיל',
  chizuk: 'בחיזוק',
  graduated: 'סיים',
};

export default function InactivePayersPage() {
  const { permissions } = useAuth();
  const canWrite = permissions.canWrite;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('student_tuition')
      .select(`
        id, student_id, payment_method, monthly_amount, nedarim_subscription_id,
        students!inner(id, first_name, last_name, family_id, status, institution_name),
        nedarim_subscriptions(status)
      `)
      .neq('students.status', 'active')
      .in('payment_method', ['credit_nedarim', 'bank_ho', 'office'])
      .eq('active', true);

    const list: Row[] = [];
    for (const r of (data || []) as any[]) {
      const sub = r.nedarim_subscriptions;
      const subStatus = Array.isArray(sub) ? sub[0]?.status : sub?.status;
      if (r.payment_method === 'credit_nedarim' && subStatus !== 'active') continue;
      list.push({
        tuition_id: r.id,
        student_id: r.student_id,
        student_name: `${r.students.first_name} ${r.students.last_name}`,
        student_status: r.students.status,
        family_id: r.students.family_id,
        payment_method: r.payment_method,
        monthly_amount: Number(r.monthly_amount) || 0,
        sub_status: subStatus || null,
        nedarim_sub_id: r.nedarim_subscription_id,
      });
    }
    list.sort((a, b) => b.monthly_amount - a.monthly_amount);
    setRows(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let l = rows;
    if (methodFilter !== 'all') l = l.filter((r) => r.payment_method === methodFilter);
    const q = search.trim();
    if (q) l = l.filter((r) => r.student_name.includes(q));
    return l;
  }, [rows, methodFilter, search]);

  const total = filtered.reduce((sum, r) => sum + r.monthly_amount, 0);
  const formatCurrency = (n: number) => `₪${Number(n).toLocaleString('he-IL')}`;

  // Mark this student's tuition as inactive (active=false) so it stops being charged.
  // Does NOT touch the Nedarim HK on the provider's side - admin needs to do that
  // separately in /finances/nedarim if needed.
  const stopTuition = async (r: Row) => {
    if (!confirm(
      `להפסיק את חיוב שכר הלימוד של ${r.student_name}?\n\n` +
      `הסטטוס שלו: ${STATUS_LABELS[r.student_status] || r.student_status}\n` +
      `שיטה: ${METHOD_LABELS[r.payment_method]}\n` +
      `סכום חודשי: ${formatCurrency(r.monthly_amount)}\n\n` +
      `הפעולה תסיר אותו מהחיוב הבא. ההוק עצמה בבנק / נדרים לא תיגע - יש לטפל בה בנפרד.`
    )) return;
    setStoppingId(r.tuition_id);
    try {
      const { error } = await supabase
        .from('student_tuition')
        .update({ active: false })
        .eq('id', r.tuition_id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setStoppingId(null);
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.payment_method] = (c[r.payment_method] || 0) + 1;
    return c;
  }, [rows]);

  return (
    <PageGuard requires="write" message="עמוד זה דורש הרשאת כתיבה (admin / secretary).">
    <>
      <Header
        title="תלמידים לא-פעילים עם חיוב פעיל"
        subtitle="תלמידים שעזבו / מושהים / סיימו אך עדיין מוגדרים לחיוב בשכר לימוד"
      />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Link href="/finances" className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            ← כספים
          </Link>
          <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
            🔄 רענן
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(['all', 'bank_ho', 'credit_nedarim', 'office'] as const).map((k) => {
            const label = k === 'all' ? '📋 הכל' : METHOD_LABELS[k];
            const active = methodFilter === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setMethodFilter(k)}
                className={`p-3 rounded-xl border-2 transition-all text-center ${
                  active ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="text-2xl font-bold tabular-nums">{counts[k] || 0}</div>
                <div className="text-xs">{label}</div>
              </button>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש שם תלמיד..."
                  className="w-full px-3 py-2 pl-9 border border-gray-300 rounded-lg text-sm"
                />
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
              </div>
              <div className="text-sm text-gray-600">
                <b>{filtered.length}</b> תלמידים · סה"כ חודשי: <b className="text-red-700">{formatCurrency(total)}</b>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-gray-500">טוען...</div>
            ) : filtered.length === 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-8 text-center text-emerald-800">
                <p className="text-5xl mb-2">✓</p>
                <p className="font-semibold">אין תלמידים לא-פעילים עם חיוב פעיל</p>
                <p className="text-sm mt-1">כל מי שעזב כבר הוסר מהחיובים.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-start">תלמיד</th>
                      <th className="px-3 py-2 text-start">סטטוס</th>
                      <th className="px-3 py-2 text-start">שיטת תשלום</th>
                      <th className="px-3 py-2 text-start">סכום חודשי</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.tuition_id} className="border-t border-gray-100 hover:bg-amber-50/30">
                        <td className="px-3 py-2">
                          <Link href={`/students/${r.student_id}`} className="text-blue-700 hover:underline font-medium">
                            {r.student_name}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-1 rounded-md text-xs bg-red-50 text-red-700 border border-red-200">
                            {STATUS_LABELS[r.student_status] || r.student_status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {METHOD_LABELS[r.payment_method] || r.payment_method}
                        </td>
                        <td className="px-3 py-2 font-bold tabular-nums text-red-700">
                          {formatCurrency(r.monthly_amount)}
                        </td>
                        <td className="px-3 py-2">
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => stopTuition(r)}
                              disabled={stoppingId === r.tuition_id}
                              className="text-xs px-2 py-1 rounded-md bg-red-50 text-red-700 hover:bg-red-100 ring-1 ring-red-200 disabled:opacity-50"
                              title="הפסק את חיוב שכר הלימוד (ההוק עצמה לא תיגע)"
                            >
                              {stoppingId === r.tuition_id ? '...' : '🛑 הפסק חיוב'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-3 text-center">
              💡 הפסקת חיוב משנה רק את <code>student_tuition.active</code> ל-false. כדי לבטל את ההוק
              עצמה (בנדרים / מס״ב) - יש לעשות זאת בנפרד מתוך דף הוראות הקבע.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
    </PageGuard>
  );
}
