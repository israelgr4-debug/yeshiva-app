'use client';

import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface CollectionRun {
  payment_date: string;
  group_number: number | null;
  count_total: number;
  count_paid: number;
  count_returned: number;
  count_pending: number;
  count_cancelled: number;
  total_amount: number;
  total_paid_amount: number;
  total_returned_amount: number;
  unique_students: number;
}

interface PaymentRow {
  id: string;
  student_id: string;
  payment_date: string;
  amount_ils: number;
  status_code: number | null;
  status_name: string | null;
}

interface StudentLite {
  id: string;
  first_name: string;
  last_name: string;
}

type TabId = 'forecast' | 'history';

export default function CollectionHistoryPage() {
  const [runs, setRuns] = useState<CollectionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<PaymentRow[]>([]);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [students, setStudents] = useState<Record<string, StudentLite>>({});
  const [activeTab, setActiveTab] = useState<TabId>('history');
  const [markingRun, setMarkingRun] = useState<string | null>(null);
  const [refreshingForecast, setRefreshingForecast] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const perPage = 50;

  const loadRuns = async () => {
    setLoading(true);
    const all: CollectionRun[] = [];
    for (let p = 0; p < 20; p++) {
      const from = p * 1000;
      const to = from + 999;
      const { data, error } = await supabase
        .from('collection_runs')
        .select('*')
        .range(from, to);
      if (error) { console.error(error); break; }
      if (!data || data.length === 0) break;
      all.push(...(data as CollectionRun[]));
      if (data.length < 1000) break;
    }
    setRuns(all);
    setLoading(false);
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  // Split: if run has a group_number → it was sent to Masav (history)
  //        if no group_number → forecast (not yet sent)
  const tabRuns = useMemo(() => {
    if (activeTab === 'forecast') {
      // Forecast: only future dates, no group, sorted by nearest first
      return runs
        .filter(
          (r) =>
            (r.group_number === null || r.group_number === undefined) &&
            r.payment_date >= today
        )
        .sort((a, b) => a.payment_date.localeCompare(b.payment_date));
    }
    // History: has group_number, most recent first
    return runs
      .filter((r) => r.group_number !== null && r.group_number !== undefined)
      .sort((a, b) => b.payment_date.localeCompare(a.payment_date));
  }, [runs, activeTab, today]);

  // Reset page on tab change
  useEffect(() => {
    setPage(1);
    setExpandedKey(null);
  }, [activeTab]);

  const totalPages = Math.ceil(tabRuns.length / perPage);
  const pageRuns = useMemo(
    () => tabRuns.slice((page - 1) * perPage, page * perPage),
    [tabRuns, page]
  );

  // Summary of current tab
  const summary = useMemo(() => {
    let total = 0;
    let paid = 0;
    let returned = 0;
    let pending = 0;
    let paymentCount = 0;
    for (const r of tabRuns) {
      total += Number(r.total_amount) || 0;
      paid += Number(r.total_paid_amount) || 0;
      returned += Number(r.total_returned_amount) || 0;
      pending += Number(r.count_pending) || 0;
      paymentCount += Number(r.count_total) || 0;
    }
    return { runs: tabRuns.length, total, paid, returned, pending, paymentCount };
  }, [tabRuns]);

  const forecastCount = useMemo(
    () =>
      runs.filter(
        (r) => (r.group_number === null || r.group_number === undefined) && r.payment_date >= today
      ).length,
    [runs, today]
  );
  const historyCount = useMemo(
    () => runs.filter((r) => r.group_number !== null && r.group_number !== undefined).length,
    [runs]
  );

  const keyFor = (r: CollectionRun) => `${r.payment_date}|${r.group_number ?? 'null'}`;

  const handleExpand = async (r: CollectionRun) => {
    const key = keyFor(r);
    if (expandedKey === key) {
      setExpandedKey(null);
      setExpandedRows([]);
      return;
    }
    setExpandedKey(key);
    setExpandedLoading(true);

    let query = supabase
      .from('payment_history')
      .select('id,student_id,payment_date,amount_ils,status_code,status_name')
      .eq('payment_date', r.payment_date);
    if (r.group_number !== null && r.group_number !== undefined) {
      query = query.eq('group_number', r.group_number);
    } else {
      query = query.is('group_number', null);
    }

    const { data } = await query.order('amount_ils', { ascending: false }).range(0, 999);
    const rows = (data || []) as PaymentRow[];
    setExpandedRows(rows);

    const uniqueSids = [...new Set(rows.map((r) => r.student_id))];
    const needed = uniqueSids.filter((id) => !students[id]);
    if (needed.length > 0) {
      const newStudents: Record<string, StudentLite> = { ...students };
      for (let i = 0; i < needed.length; i += 100) {
        const chunk = needed.slice(i, i + 100);
        const { data: sd } = await supabase
          .from('students')
          .select('id,first_name,last_name')
          .in('id', chunk);
        for (const s of sd || []) newStudents[s.id] = s as StudentLite;
      }
      setStudents(newStudents);
    }

    setExpandedLoading(false);
  };

  // Mark all payments in a past run as paid (status 1 → 2)
  const handleMarkAsPaid = async (r: CollectionRun) => {
    if (!confirm(`לסמן את כל התשלומים ב-${r.payment_date} (${r.count_pending} ממתינים) כנפרעו?`)) return;

    const key = keyFor(r);
    setMarkingRun(key);
    try {
      let url = `payment_history?payment_date=eq.${r.payment_date}&status_code=eq.1`;
      if (r.group_number !== null && r.group_number !== undefined) {
        url += `&group_number=eq.${r.group_number}`;
      } else {
        url += '&group_number=is.null';
      }

      const { error } = await supabase
        .from('payment_history')
        .update({ status_code: 2, status_name: 'נפרע' })
        .match({
          payment_date: r.payment_date,
          status_code: 1,
          ...(r.group_number !== null && r.group_number !== undefined
            ? { group_number: r.group_number }
            : {}),
        });

      if (error) throw error;

      alert('עודכן בהצלחה');
      await loadRuns();
      setExpandedKey(null);
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setMarkingRun(null);
    }
  };

  const handleRefreshForecast = async () => {
    if (!confirm('לרענן צפי ל-12 חודשים? פעולה זו תמחק שורות צפי קיימות ותיצור חדשות לפי מצב הגביות הפעילות.')) return;
    setRefreshingForecast(true);
    try {
      const { data, error } = await supabase.rpc('refresh_forecast', { months_ahead: 12 });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      alert(
        `✓ רענון הושלם\n\n` +
          `שורות שנמחקו: ${row?.deleted_rows ?? 0}\n` +
          `שורות חדשות: ${row?.created_rows ?? 0}\n` +
          `תלמידים שעובדו: ${row?.students_processed ?? 0}\n` +
          `דולגו (לא פעיל/מושהה): ${row?.skipped_inactive ?? 0}`
      );
      await loadRuns();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setRefreshingForecast(false);
    }
  };

  const formatCurrency = (n: number) => `₪${(Number(n) || 0).toLocaleString('he-IL')}`;
  const monthYear = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  return (
    <>
      <Header title="גביות - צפי והיסטוריה" subtitle="רשימת הרצות מס״ב" />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Link
            href="/finances/collection"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            ← גביה חדשה
          </Link>
          <Link
            href="/finances"
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            כספים
          </Link>
          {activeTab === 'forecast' && (
            <Button
              size="sm"
              onClick={handleRefreshForecast}
              disabled={refreshingForecast}
              className="mr-auto"
            >
              {refreshingForecast ? 'מרענן...' : '🔄 רענן צפי 12 חודשים'}
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            📜 היסטוריה ({historyCount.toLocaleString('he-IL')})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('forecast')}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'forecast'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            📅 צפי ({forecastCount.toLocaleString('he-IL')})
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">
              {activeTab === 'forecast' ? 'הרצות צפויות' : 'הרצות שבוצעו'}
            </p>
            <p className="text-2xl font-bold text-blue-700">{summary.runs.toLocaleString('he-IL')}</p>
            <p className="text-xs text-gray-500 mt-1">{summary.paymentCount.toLocaleString('he-IL')} תשלומים</p>
          </div>
          {activeTab === 'history' ? (
            <>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <p className="text-xs text-gray-600 mb-1">שולם</p>
                <p className="text-2xl font-bold text-green-700">{formatCurrency(summary.paid)}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4 text-center">
                <p className="text-xs text-gray-600 mb-1">חזר</p>
                <p className="text-2xl font-bold text-red-700">{formatCurrency(summary.returned)}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-4 text-center">
                <p className="text-xs text-gray-600 mb-1">ממתין לעדכון</p>
                <p className="text-2xl font-bold text-orange-700">{summary.pending.toLocaleString('he-IL')}</p>
              </div>
            </>
          ) : (
            <>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-xs text-gray-600 mb-1">סה״כ צפוי</p>
                <p className="text-2xl font-bold text-gray-700">{formatCurrency(summary.total)}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-4 text-center">
                <p className="text-xs text-gray-600 mb-1">ממתינים</p>
                <p className="text-2xl font-bold text-orange-700">{summary.pending.toLocaleString('he-IL')}</p>
              </div>
              <div></div>
            </>
          )}
        </div>

        {/* Runs list */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">
                {activeTab === 'forecast' ? 'הרצות צפויות' : 'הרצות היסטוריות'} ({tabRuns.length.toLocaleString('he-IL')})
              </h3>
              {totalPages > 1 && (
                <span className="text-sm text-gray-500">עמוד {page} מתוך {totalPages}</span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">טוען...</div>
            ) : tabRuns.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {activeTab === 'forecast' ? 'אין גביות צפויות' : 'אין היסטוריה'}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {pageRuns.map((r) => {
                    const key = keyFor(r);
                    const isExpanded = expandedKey === key;
                    const successRate =
                      r.count_total > 0 ? Math.round((r.count_paid / r.count_total) * 100) : 0;
                    // History = has group_number (sent to Masav)
                    const isHistory = r.group_number !== null && r.group_number !== undefined;
                    const hasPending = r.count_pending > 0;

                    return (
                      <div
                        key={key}
                        className="bg-white border border-gray-200 rounded-lg overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => handleExpand(r)}
                          className="w-full text-right p-3 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400">{isExpanded ? '▼' : '◄'}</span>
                              <span className="font-bold">{r.payment_date}</span>
                              <span className="text-xs text-gray-500">({monthYear(r.payment_date)})</span>
                            </div>

                            {r.group_number !== null && r.group_number !== undefined && (
                              <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">
                                קבוצה {r.group_number}
                              </span>
                            )}

                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs">
                              {r.count_total} תשלומים
                            </span>

                            {r.count_paid > 0 && (
                              <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs">
                                ✓ {r.count_paid} נפרעו
                              </span>
                            )}

                            {r.count_returned > 0 && (
                              <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-xs">
                                ✗ {r.count_returned} חזרו
                              </span>
                            )}

                            {r.count_pending > 0 && (
                              <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded text-xs">
                                ⏳ {r.count_pending} ממתינים
                              </span>
                            )}

                            <span className="mr-auto font-bold text-lg">
                              {isHistory ? formatCurrency(r.total_paid_amount) : formatCurrency(r.total_amount)}
                            </span>

                            {isHistory && (
                              <span className="text-xs text-gray-500 w-16 text-center">
                                {successRate}% הצלחה
                              </span>
                            )}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-3">
                            {/* Mark-as-paid button for past runs with pending payments */}
                            {isHistory && hasPending && (
                              <div className="bg-amber-50 border border-amber-200 rounded p-3 flex items-center justify-between">
                                <span className="text-sm text-amber-800">
                                  ⚠️ יש {r.count_pending} תשלומים במצב "ממתין" (סטטוס 1). אם הם בוצעו - סמן אותם כנפרעו.
                                </span>
                                <Button
                                  size="sm"
                                  onClick={() => handleMarkAsPaid(r)}
                                  disabled={markingRun === key}
                                >
                                  {markingRun === key ? 'מסמן...' : 'סמן הכל כנפרעו'}
                                </Button>
                              </div>
                            )}

                            {expandedLoading ? (
                              <div className="text-center py-6 text-gray-500">טוען פירוט...</div>
                            ) : expandedRows.length === 0 ? (
                              <div className="text-center py-6 text-gray-500">אין פירוט</div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead className="bg-white text-gray-700">
                                    <tr>
                                      <th className="px-3 py-2 text-start">תלמיד</th>
                                      <th className="px-3 py-2 text-start">סכום</th>
                                      <th className="px-3 py-2 text-start">סטטוס</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedRows.map((p) => {
                                      const s = students[p.student_id];
                                      const color =
                                        p.status_code === 2
                                          ? 'text-green-700'
                                          : p.status_code === 3
                                          ? 'text-red-700'
                                          : p.status_code === 1
                                          ? 'text-orange-700'
                                          : 'text-gray-700';
                                      return (
                                        <tr key={p.id} className="border-t border-gray-200 bg-white">
                                          <td className="px-3 py-2">
                                            {s ? (
                                              <Link
                                                href={`/students/${s.id}`}
                                                className="text-blue-600 hover:underline"
                                              >
                                                {s.last_name} {s.first_name}
                                              </Link>
                                            ) : (
                                              <span className="text-gray-400">—</span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2 font-medium">
                                            {formatCurrency(p.amount_ils)}
                                          </td>
                                          <td className={`px-3 py-2 ${color}`}>
                                            {p.status_name || '-'}
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
                  })}
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
                    <Button size="sm" variant="secondary" onClick={() => setPage(1)} disabled={page === 1}>
                      ראשון
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      הקודם
                    </Button>
                    <span className="text-sm text-gray-600 px-2">
                      עמוד {page} מתוך {totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      הבא
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setPage(totalPages)}
                      disabled={page === totalPages}
                    >
                      אחרון
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
