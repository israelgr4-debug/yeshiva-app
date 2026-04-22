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

export default function CollectionHistoryPage() {
  const [runs, setRuns] = useState<CollectionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<PaymentRow[]>([]);
  const [expandedLoading, setExpandedLoading] = useState(false);
  const [students, setStudents] = useState<Record<string, StudentLite>>({});

  // Pagination
  const [page, setPage] = useState(1);
  const perPage = 50;

  // Load runs (aggregated)
  useEffect(() => {
    async function load() {
      setLoading(true);

      // Fetch the view - it may have many rows, paginate
      const all: CollectionRun[] = [];
      for (let p = 0; p < 20; p++) {
        const from = p * 1000;
        const to = from + 999;
        const { data, error } = await supabase
          .from('collection_runs')
          .select('*')
          .range(from, to);
        if (error) {
          console.error(error);
          break;
        }
        if (!data || data.length === 0) break;
        all.push(...(data as CollectionRun[]));
        if (data.length < 1000) break;
      }
      setRuns(all);
      setLoading(false);
    }
    load();
  }, []);

  const totalPages = Math.ceil(runs.length / perPage);
  const pageRuns = useMemo(() => {
    return runs.slice((page - 1) * perPage, page * perPage);
  }, [runs, page]);

  // Summary across all runs
  const summary = useMemo(() => {
    let total = 0;
    let paid = 0;
    let returned = 0;
    for (const r of runs) {
      total += Number(r.total_amount) || 0;
      paid += Number(r.total_paid_amount) || 0;
      returned += Number(r.total_returned_amount) || 0;
    }
    return {
      runs: runs.length,
      total,
      paid,
      returned,
    };
  }, [runs]);

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

    // Load student names for these rows
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

  const formatCurrency = (n: number) => `₪${(Number(n) || 0).toLocaleString('he-IL')}`;
  const monthYear = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  return (
    <>
      <Header title="היסטוריית גביה" subtitle="רשימת כל הרצות המס״ב שבוצעו" />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Link
            href="/finances/collection"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            ← חזרה לגביה חדשה
          </Link>
          <Link
            href="/finances"
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            כספים
          </Link>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">הרצות</p>
            <p className="text-2xl font-bold text-blue-700">{summary.runs.toLocaleString('he-IL')}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">סה״כ שולם</p>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(summary.paid)}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">חזר</p>
            <p className="text-2xl font-bold text-red-700">{formatCurrency(summary.returned)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">סה״כ לגביה</p>
            <p className="text-2xl font-bold text-gray-700">{formatCurrency(summary.total)}</p>
          </div>
        </div>

        {/* Runs list */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold">הרצות ({runs.length.toLocaleString('he-IL')})</h3>
              {totalPages > 1 && (
                <span className="text-sm text-gray-500">עמוד {page} מתוך {totalPages}</span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">טוען...</div>
            ) : runs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">אין הרצות עד כה</div>
            ) : (
              <>
                <div className="space-y-2">
                  {pageRuns.map((r) => {
                    const key = keyFor(r);
                    const isExpanded = expandedKey === key;
                    const successRate =
                      r.count_total > 0 ? Math.round((r.count_paid / r.count_total) * 100) : 0;

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

                            <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs">
                              ✓ {r.count_paid} נפרעו
                            </span>

                            {r.count_returned > 0 && (
                              <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-xs">
                                ✗ {r.count_returned} חזרו
                              </span>
                            )}

                            <span className="mr-auto font-bold text-lg">
                              {formatCurrency(r.total_paid_amount)}
                            </span>

                            <span className="text-xs text-gray-500 w-16 text-center">
                              {successRate}% הצלחה
                            </span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-gray-200 bg-gray-50 p-3">
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

                {/* Pagination */}
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
