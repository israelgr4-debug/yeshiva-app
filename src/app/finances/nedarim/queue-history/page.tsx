'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';

interface QueueRow {
  id: string;
  action: string;
  nedarim_keva_id: string;
  subscription_id: string | null;
  params: any;
  status: 'pending' | 'in_progress' | 'done' | 'failed';
  attempts: number | null;
  last_error: string | null;
  triggered_by: string | null;
  created_at: string;
  processed_at: string | null;
  nedarim_subscriptions?: {
    client_name: string | null;
    client_zeout: string | null;
    amount_per_charge: number | null;
    status: string | null;
    kind: string | null;
  } | null;
}

const STATUS_META: Record<string, { label: string; color: string; emoji: string }> = {
  pending:     { label: 'ממתין',  color: 'bg-amber-50 text-amber-800 border-amber-200',     emoji: '⏳' },
  in_progress: { label: 'בעיבוד', color: 'bg-blue-50 text-blue-800 border-blue-200',         emoji: '⚙️' },
  done:        { label: 'הצליח',  color: 'bg-emerald-50 text-emerald-800 border-emerald-200', emoji: '✓' },
  failed:      { label: 'נכשל',   color: 'bg-red-50 text-red-800 border-red-200',           emoji: '✗' },
};

const ACTION_META: Record<string, { label: string; emoji: string }> = {
  suspend:       { label: 'השהיה',         emoji: '⏸' },
  resume:        { label: 'הפעלה מחדש',    emoji: '▶' },
  delete:        { label: 'מחיקה',         emoji: '🗑' },
  update_amount: { label: 'עדכון סכום',    emoji: '💲' },
};

export default function NedarimQueueHistoryPage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('nedarim_action_queue')
      .select(`
        id, action, nedarim_keva_id, subscription_id, params, status, attempts,
        last_error, triggered_by, created_at, processed_at,
        nedarim_subscriptions(client_name, client_zeout, amount_per_charge, status, kind)
      `)
      .order('created_at', { ascending: false })
      .limit(500);
    setRows((data || []) as any[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter);
    if (actionFilter !== 'all') list = list.filter((r) => r.action === actionFilter);
    const q = search.trim();
    if (q) {
      list = list.filter((r) => {
        const s = r.nedarim_subscriptions;
        return (
          (s?.client_name || '').includes(q) ||
          (s?.client_zeout || '').includes(q) ||
          (r.nedarim_keva_id || '').includes(q) ||
          (r.last_error || '').includes(q)
        );
      });
    }
    return list;
  }, [rows, statusFilter, actionFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  // Re-queue a failed action (clone with status='pending' so it'll be picked up next run)
  const handleRetry = async (r: QueueRow) => {
    if (!confirm(`להחזיר את הפעולה לתור (${ACTION_META[r.action]?.label || r.action} - ${r.nedarim_subscriptions?.client_name || ''})?`)) return;
    setRetryingId(r.id);
    try {
      const { error } = await supabase
        .from('nedarim_action_queue')
        .update({
          status: 'pending',
          last_error: null,
          processed_at: null,
        })
        .eq('id', r.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setRetryingId(null);
    }
  };

  const formatDT = (s: string | null) => {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
    } catch { return s; }
  };

  return (
    <>
      <Header title="היסטוריית פעולות נדרים+" subtitle="כל הפעולות שעובדו או נכשלו מול נדרים פלוס" />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Link href="/finances/nedarim" className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            ← הוראות קבע נדרים
          </Link>
          <Link href="/finances" className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            כספים
          </Link>
          <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
            🔄 רענן
          </Button>
        </div>

        {/* Stat chips */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {(['all', 'pending', 'in_progress', 'done', 'failed'] as const).map((k) => {
            const m = k === 'all' ? { label: 'הכל', color: 'bg-slate-50 text-slate-700 border-slate-200', emoji: '📋' } : STATUS_META[k];
            const active = statusFilter === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setStatusFilter(k)}
                className={`p-3 rounded-xl border-2 transition-all text-center ${
                  active ? 'border-blue-500 ring-2 ring-blue-200' : 'border-transparent'
                } ${m.color}`}
              >
                <div className="text-2xl font-bold tabular-nums">{counts[k] || 0}</div>
                <div className="text-xs">{m.emoji} {m.label}</div>
              </button>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש לפי שם / ת.ז / קוד / שגיאה..."
                  className="w-full px-3 py-2 pl-9 border border-gray-300 rounded-lg text-sm"
                />
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
              </div>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">כל הפעולות</option>
                {Object.entries(ACTION_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.emoji} {v.label}</option>
                ))}
              </select>
              <span className="text-sm text-gray-500">
                {filtered.length.toLocaleString('he-IL')} פעולות
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-gray-500">טוען...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-5xl mb-2 opacity-40">📭</p>
                <p>אין פעולות תואמות</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-start">סטטוס</th>
                      <th className="px-3 py-2 text-start">פעולה</th>
                      <th className="px-3 py-2 text-start">לקוח</th>
                      <th className="px-3 py-2 text-start">פרטים</th>
                      <th className="px-3 py-2 text-start">נוצר</th>
                      <th className="px-3 py-2 text-start">עובד</th>
                      <th className="px-3 py-2 text-start">שגיאה / סיבה</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const status = STATUS_META[r.status] || { label: r.status, color: 'bg-gray-50 text-gray-700 border-gray-200', emoji: '?' };
                      const action = ACTION_META[r.action] || { label: r.action, emoji: '⚙' };
                      const s = r.nedarim_subscriptions;
                      const newAmt = r.params?.amount_per_charge || r.params?.new_amount;
                      return (
                        <tr key={r.id} className="border-t border-gray-100 hover:bg-blue-50/30">
                          <td className="px-3 py-2">
                            <span className={`px-2 py-1 rounded-md text-xs font-semibold border ${status.color}`}>
                              {status.emoji} {status.label}
                            </span>
                            {(r.attempts || 0) > 0 && (
                              <div className="text-[10px] text-gray-500 mt-0.5">{r.attempts} ניסיונות</div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-medium">{action.emoji} {action.label}</span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{s?.client_name || '—'}</div>
                            <div className="text-xs text-gray-500">
                              {s?.client_zeout && <span>ת.ז {s.client_zeout}</span>}
                              {s?.kind && <span className="mr-2">· {s.kind === 'credit' ? '💳 אשראי' : '🏦 בנק'}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs">
                            <div>קוד: <span className="font-mono">{r.nedarim_keva_id}</span></div>
                            {s?.amount_per_charge && (
                              <div className="text-gray-600">
                                סכום: ₪{Number(s.amount_per_charge).toLocaleString('he-IL')}
                                {r.action === 'update_amount' && newAmt && (
                                  <span className="text-blue-700 font-semibold"> → ₪{Number(newAmt).toLocaleString('he-IL')}</span>
                                )}
                              </div>
                            )}
                            {r.triggered_by && (
                              <div className="text-gray-500">מקור: {r.triggered_by}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs tabular-nums text-gray-600">{formatDT(r.created_at)}</td>
                          <td className="px-3 py-2 text-xs tabular-nums text-gray-600">{formatDT(r.processed_at)}</td>
                          <td className="px-3 py-2 text-xs">
                            {r.last_error ? (
                              <span className="text-red-700 break-words" title={r.last_error}>
                                {r.last_error.length > 80 ? r.last_error.slice(0, 80) + '…' : r.last_error}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2">
                            {r.status === 'failed' && (
                              <button
                                type="button"
                                onClick={() => handleRetry(r)}
                                disabled={retryingId === r.id}
                                className="text-xs px-2 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 ring-1 ring-blue-200"
                                title="החזר את הפעולה לתור הממתינות"
                              >
                                {retryingId === r.id ? '...' : '🔁 נסה שוב'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-3 text-center">
              מוצגות 500 הפעולות האחרונות (בסדר זמני יורד)
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
