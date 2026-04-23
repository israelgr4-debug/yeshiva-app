'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';

interface Transaction {
  id: string;
  nedarim_transaction_id: string;
  nedarim_keva_id: string | null;
  subscription_id: string | null;
  family_id: string | null;
  amount: number;
  currency: number;
  transaction_date: string | null;
  result: string;
  status_text: string | null;
  kind: string;
  confirmation: string | null;
  last_4: string | null;
  client_name: string | null;
  client_zeout: string | null;
  groupe: string | null;
  tashloumim: number | null;
}

interface FamilyLite {
  id: string;
  family_name: string;
  father_name: string | null;
}

export default function NedarimTransactionsPage() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [families, setFamilies] = useState<Record<string, FamilyLite>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState<string>('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('nedarim_transactions')
      .select('*')
      .order('transaction_date', { ascending: false, nullsFirst: false })
      .limit(2000);
    setTxs((data || []) as Transaction[]);

    const { data: fams } = await supabase
      .from('families')
      .select('id, family_name, father_name');
    const map: Record<string, FamilyLite> = {};
    for (const f of fams || []) map[f.id] = f as FamilyLite;
    setFamilies(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/nedarim/sync-transactions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה');
      alert(
        `✓ סנכרון עסקאות הושלם (${Math.round(json.duration_ms / 1000)}שנ')\n\n` +
          `נוספו/עודכנו: ${json.summary.inserted}\n` +
          `דפים: ${json.summary.pages}\n` +
          (json.summary.errors?.length ? `שגיאות: ${json.summary.errors.slice(0, 3).join(', ')}` : '')
      );
      await load();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    let list = txs;
    if (monthFilter) {
      list = list.filter((t) => t.transaction_date?.startsWith(monthFilter));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          (t.client_name || '').toLowerCase().includes(q) ||
          (t.client_zeout || '').includes(q) ||
          (t.groupe || '').includes(q) ||
          (t.nedarim_transaction_id || '').includes(q)
      );
    }
    return list;
  }, [txs, search, monthFilter]);

  const totalAmount = filtered.reduce((sum, t) => sum + Number(t.amount), 0);
  const formatCurrency = (n: number) => `₪${Number(n).toLocaleString('he-IL')}`;

  // Build month options from transactions
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    for (const t of txs) {
      if (t.transaction_date) months.add(t.transaction_date.slice(0, 7));
    }
    return Array.from(months).sort().reverse();
  }, [txs]);

  return (
    <>
      <Header title="עסקאות אשראי - נדרים" subtitle="היסטוריית עסקאות שבוצעו" />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <Link
            href="/finances/nedarim"
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            ← חזרה לרשימת הוראות
          </Link>
          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? 'מסנכרן...' : '🔄 סנכרן עסקאות חדשות'}
          </Button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          ℹ️ טעינת עסקאות מ-Nedarim מוגבלת ל-20 פניות בשעה. סנכרון אינקרמנטלי (רק חדשות).
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="חיפוש לפי שם / ת.ז / קטגוריה / מזהה"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          />
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">כל החודשים</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-center bg-green-50 rounded-lg p-3 text-center">
            <div>
              <p className="text-xs text-gray-600">סה"כ מוצג</p>
              <p className="text-xl font-bold text-green-700">{formatCurrency(totalAmount)}</p>
              <p className="text-xs text-gray-500">{filtered.length.toLocaleString('he-IL')} עסקאות</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-bold">עסקאות</h3>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">טוען...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {txs.length === 0 ? 'לא נטענו עסקאות - לחץ סנכרון' : 'לא נמצאו תוצאות'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-start">תאריך</th>
                      <th className="px-3 py-2 text-start">לקוח</th>
                      <th className="px-3 py-2 text-start">משפחה</th>
                      <th className="px-3 py-2 text-start">קטגוריה</th>
                      <th className="px-3 py-2 text-start">סכום</th>
                      <th className="px-3 py-2 text-start">תשלומים</th>
                      <th className="px-3 py-2 text-start">4 ספרות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 500).map((t) => {
                      const fam = t.family_id ? families[t.family_id] : null;
                      return (
                        <tr key={t.id} className="border-t border-gray-200 hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs">{t.transaction_date || '—'}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{t.client_name || '—'}</div>
                            {t.client_zeout && (
                              <div className="text-xs text-gray-500">{t.client_zeout}</div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {fam ? (
                              <Link
                                href={`/families/${fam.id}`}
                                className="text-blue-600 hover:underline"
                              >
                                {fam.family_name}
                              </Link>
                            ) : (
                              <span className="text-gray-400 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs">{t.groupe || '—'}</td>
                          <td className="px-3 py-2 font-medium">{formatCurrency(t.amount)}</td>
                          <td className="px-3 py-2 text-xs">{t.tashloumim || '1'}</td>
                          <td className="px-3 py-2 text-xs">
                            {t.last_4 ? `****${t.last_4}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filtered.length > 500 && (
                  <p className="text-center text-xs text-gray-500 mt-3">
                    מוצגות 500 ראשונות מתוך {filtered.length.toLocaleString('he-IL')}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
