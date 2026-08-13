'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { PageGuard } from '@/components/ui/PageGuard';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/supabase-paginate';

interface Subscription {
  id: string;
  nedarim_keva_id: string;
  kind: 'credit' | 'bank';
  status: string;
  family_id: string | null;
  client_zeout: string | null;
  client_name: string | null;
  client_phone: string | null;
  amount_per_charge: number;
  scheduled_day: number | null;
  next_charge_date: string | null;
  remaining_charges: number | null;
  successful_charges: number | null;
  last_4_digits: string | null;
  bank_number: string | null;
  bank_agency: string | null;
  bank_account: string | null;
  groupe: string | null;
  last_error: string | null;
  last_synced_at: string;
}

interface FamilyLite {
  id: string;
  family_name: string;
  father_name: string | null;
}

type Tab = 'credit' | 'bank' | 'unmatched';

const STATUS_LABELS: Record<string, string> = {
  active: 'פעיל',
  frozen: 'מוקפא',
  deleted: 'מחוק',
  pending_bank: 'ממתין לבנק',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  frozen: 'bg-amber-100 text-amber-800',
  deleted: 'bg-gray-100 text-gray-600',
  pending_bank: 'bg-blue-100 text-blue-800',
};

export default function NedarimPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [families, setFamilies] = useState<Record<string, FamilyLite>>({});
  const [tab, setTab] = useState<Tab>('credit');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [processingQueue, setProcessingQueue] = useState(false);
  const [queuePending, setQueuePending] = useState(0);
  const [previewItems, setPreviewItems] = useState<any[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);

    // Nedarim subscriptions (credit from API)
    const ned = await fetchAll<Subscription>('nedarim_subscriptions', '*', (q) =>
      q
        .neq('status', 'deleted')
        .order('status', { ascending: true })
        .order('client_name', { ascending: true })
    );

    setSubs([...ned]);

    const fams = await fetchAll<FamilyLite>('families', 'id, family_name, father_name');
    const map: Record<string, FamilyLite> = {};
    for (const f of fams) map[f.id] = f;
    setFamilies(map);

    const { data: log } = await supabase
      .from('nedarim_sync_log')
      .select('finished_at')
      .eq('result', 'success')
      .order('started_at', { ascending: false })
      .limit(1);
    setLastSync(log?.[0]?.finished_at || null);

    // Count pending queue items
    const { count } = await supabase
      .from('nedarim_action_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    setQueuePending(count || 0);

    setLoading(false);
  };

  // Step 1: open preview of pending queue items
  const handleOpenQueuePreview = async () => {
    setLoadingPreview(true);
    try {
      const { data } = await supabase
        .from('nedarim_action_queue')
        .select(`
          id, action, nedarim_keva_id, subscription_id, params, triggered_by, created_at,
          nedarim_subscriptions(client_name, client_zeout, amount_per_charge, status, kind)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });
      setPreviewItems((data || []) as any[]);
    } catch (e: any) {
      alert('שגיאה בטעינת פעולות: ' + (e?.message || e));
    } finally {
      setLoadingPreview(false);
    }
  };

  // Step 2: actually run the queue
  const handleConfirmProcessQueue = async () => {
    setProcessingQueue(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/nedarim/process-queue', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה');
      alert(
        `✓ עובדו ${json.summary.processed} פעולות\n\n` +
          `הצליחו: ${json.summary.succeeded}\n` +
          `נכשלו: ${json.summary.failed}\n` +
          (json.summary.errors?.length ? `שגיאות:\n${json.summary.errors.slice(0, 3).join('\n')}` : '')
      );
      setPreviewItems(null);
      await load();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setProcessingQueue(false);
    }
  };

  // Cancel ALL pending queue items (mark them as failed with a reason)
  const handleCancelAllPending = async () => {
    if (!previewItems) return;
    if (!confirm(`לבטל את כל ${previewItems.length} הפעולות הממתינות? הן יסומנו כ"בוטלו" ולא יישלחו לנדרים.`)) return;
    setProcessingQueue(true);
    try {
      const { error } = await supabase
        .from('nedarim_action_queue')
        .update({ status: 'failed', last_error: 'בוטל ידנית על ידי המשתמש', processed_at: new Date().toISOString() })
        .eq('status', 'pending');
      if (error) throw error;
      setPreviewItems(null);
      await load();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setProcessingQueue(false);
    }
  };

  // Cancel a single pending item
  const handleCancelOne = async (id: string) => {
    if (!confirm('לבטל את הפעולה הזו?')) return;
    await supabase
      .from('nedarim_action_queue')
      .update({ status: 'failed', last_error: 'בוטל ידנית על ידי המשתמש', processed_at: new Date().toISOString() })
      .eq('id', id);
    setPreviewItems((items) => items ? items.filter((x) => x.id !== id) : null);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/nedarim/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'שגיאה');
      const s = json.summary;
      alert(
        `✓ סנכרון הושלם (${Math.round(json.duration_ms / 1000)} שניות)\n\n` +
          `אשראי: +${s.credit_subs.inserted} חדשים, ${s.credit_subs.updated} עודכנו, ${s.credit_subs.unchanged} ללא שינוי\n` +
          `בנקאי: +${s.bank_subs.inserted} חדשים, ${s.bank_subs.updated} עודכנו, ${s.bank_subs.unchanged} ללא שינוי\n` +
          (s.errors?.length ? `\n⚠️ שגיאות (${s.errors.length}):\n${s.errors.slice(0, 3).join('\n')}` : '')
      );
      await load();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    let list = subs;
    if (tab === 'credit') list = list.filter((s) => s.kind === 'credit');
    else if (tab === 'bank') list = list.filter((s) => s.kind === 'bank');
    else if (tab === 'unmatched') list = list.filter((s) => !s.family_id);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          (s.client_name || '').toLowerCase().includes(q) ||
          (s.client_zeout || '').includes(q) ||
          (s.nedarim_keva_id || '').includes(q)
      );
    }
    return list;
  }, [subs, tab, search]);

  const counts = {
    credit: subs.filter((s) => s.kind === 'credit').length,
    bank: subs.filter((s) => s.kind === 'bank').length,
    unmatched: subs.filter((s) => !s.family_id).length,
  };

  const activeTotal = filtered
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => sum + Number(s.amount_per_charge), 0);

  const formatCurrency = (n: number) => `₪${(Number(n) || 0).toLocaleString('he-IL')}`;
  const formatDT = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <>
      <Header title="נדרים פלוס" subtitle="גביות אשראי ובנקאיות" />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <Link
              href="/finances"
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              ← כספים
            </Link>
            {counts.unmatched > 0 && (
              <Link
                href="/finances/nedarim/match"
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                🔗 שיוך למשפחות ({counts.unmatched})
              </Link>
            )}
            <Link
              href="/finances/nedarim/groups"
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              🏷️ קטגוריות
            </Link>
            <Link
              href="/finances/nedarim/transactions"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              💰 עסקאות
            </Link>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {queuePending > 0 && (
              <Button
                onClick={handleOpenQueuePreview}
                disabled={processingQueue || loadingPreview}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {loadingPreview ? 'טוען...' : `⚡ בצע ${queuePending} פעולות ממתינות בנדרים`}
              </Button>
            )}
            {lastSync && (
              <span className="text-xs text-gray-500">סונכרן לאחרונה: {formatDT(lastSync)}</span>
            )}
            <Button onClick={handleSync} disabled={syncing}>
              {syncing ? 'מסנכרן...' : '🔄 סנכרן מנדרים'}
            </Button>
            <Link
              href="/finances/nedarim/queue-history"
              className="bg-slate-600 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center"
            >
              📜 היסטוריית פעולות
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
          {(
            [
              ['credit', '💳 הוראות קבע אשראי', counts.credit],
              ['bank', '🏦 הוראות קבע בנקאיות', counts.bank],
              ['unmatched', '⚠️ לא משויכות', counts.unmatched],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                tab === key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">הוראות פעילות ברשימה</p>
            <p className="text-2xl font-bold text-blue-700">
              {filtered.filter((s) => s.status === 'active').length}
            </p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">סכום חודשי פעיל</p>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(activeTotal)}</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">מוקפאות / בעיה</p>
            <p className="text-2xl font-bold text-amber-700">
              {filtered.filter((s) => s.status !== 'active').length}
            </p>
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="חיפוש לפי שם / ת.ז / מזהה..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        />

        {/* Subscriptions list */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-bold">
              רשימה ({filtered.length.toLocaleString('he-IL')})
            </h3>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">טוען...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {subs.length === 0
                  ? 'לא נטענו נתונים עדיין - לחץ על "סנכרן מנדרים"'
                  : 'לא נמצאו תוצאות'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-start">שם / ת.ז</th>
                      <th className="px-3 py-2 text-start">משפחה</th>
                      <th className="px-3 py-2 text-start">סכום</th>
                      <th className="px-3 py-2 text-start">יום חיוב</th>
                      <th className="px-3 py-2 text-start">הבא</th>
                      <th className="px-3 py-2 text-start">פרטים</th>
                      <th className="px-3 py-2 text-start">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => {
                      const fam = s.family_id ? families[s.family_id] : null;
                      return (
                        <tr key={s.id} className="border-t border-gray-200 hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <div className="font-medium">{s.client_name || '—'}</div>
                            {s.client_zeout && (
                              <div className="text-xs text-gray-500">{s.client_zeout}</div>
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
                              <span className="text-amber-600 text-xs">לא משויך</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-medium">
                            {formatCurrency(s.amount_per_charge)}
                          </td>
                          <td className="px-3 py-2">{s.scheduled_day || '—'}</td>
                          <td className="px-3 py-2 text-xs">{s.next_charge_date || '—'}</td>
                          <td className="px-3 py-2 text-xs">
                            {s.kind === 'credit' ? (
                              s.last_4_digits ? (
                                <span>****{s.last_4_digits}</span>
                              ) : (
                                '—'
                              )
                            ) : (
                              <span>
                                {s.bank_number}-{s.bank_agency}-{s.bank_account}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[s.status] || 'bg-gray-100'}`}
                            >
                              {STATUS_LABELS[s.status] || s.status}
                            </span>
                            {s.last_error && (
                              <div className="text-xs text-red-600 mt-1" title={s.last_error}>
                                ⚠ {s.last_error.slice(0, 40)}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {previewItems && (
        <QueuePreviewDialog
          items={previewItems}
          processing={processingQueue}
          onConfirm={handleConfirmProcessQueue}
          onCancelAll={handleCancelAllPending}
          onCancelOne={handleCancelOne}
          onClose={() => setPreviewItems(null)}
        />
      )}
    </>
  );
}

const ACTION_LABEL: Record<string, { label: string; emoji: string; color: string }> = {
  suspend: { label: 'השהיה', emoji: '⏸', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  resume: { label: 'הפעלה מחדש', emoji: '▶', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  delete: { label: 'מחיקה', emoji: '🗑', color: 'bg-red-50 text-red-800 border-red-200' },
  update_amount: { label: 'עדכון סכום', emoji: '💲', color: 'bg-blue-50 text-blue-800 border-blue-200' },
};

function QueuePreviewDialog({
  items, processing, onConfirm, onCancelAll, onCancelOne, onClose,
}: {
  items: any[];
  processing: boolean;
  onConfirm: () => void;
  onCancelAll: () => void;
  onCancelOne: (id: string) => void;
  onClose: () => void;
}) {
  const grouped = items.reduce<Record<string, any[]>>((acc, it) => {
    (acc[it.action] ||= []).push(it);
    return acc;
  }, {});

  return (
    <PageGuard requires="write" message="עמוד זה דורש הרשאת כתיבה (admin / secretary). למנהל ולצופה אין גישה לפעולות כתיבה.">

    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b bg-amber-50 flex justify-between items-start">
          <div>
            <h3 className="text-xl font-bold text-amber-900">⚡ אישור פעולות לנדרים+</h3>
            <p className="text-sm text-amber-700 mt-1">
              {items.length} פעולות מחכות להישלח לנדרים+. אישור = שליחה אמיתית לשרת.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {items.length === 0 ? (
            <p className="text-center py-10 text-slate-500">אין פעולות ממתינות</p>
          ) : (
            Object.entries(grouped).map(([action, list]) => {
              const meta = ACTION_LABEL[action] || { label: action, emoji: '⚙', color: 'bg-gray-50 text-gray-800 border-gray-200' };
              return (
                <div key={action} className="mb-5">
                  <h4 className={`text-sm font-bold px-3 py-2 rounded-lg border inline-block mb-2 ${meta.color}`}>
                    {meta.emoji} {meta.label} ({list.length})
                  </h4>
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-start">לקוח</th>
                          <th className="px-3 py-2 text-start">ת.ז</th>
                          <th className="px-3 py-2 text-start">סוג</th>
                          <th className="px-3 py-2 text-start">סכום</th>
                          {action === 'update_amount' && <th className="px-3 py-2 text-start">→ סכום חדש</th>}
                          <th className="px-3 py-2 text-start">סיבה</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((it) => {
                          const s = it.nedarim_subscriptions;
                          const newAmt = it.params?.amount_per_charge || it.params?.new_amount;
                          return (
                            <tr key={it.id} className="border-t border-gray-100">
                              <td className="px-3 py-2 font-medium">{s?.client_name || '—'}</td>
                              <td className="px-3 py-2 font-mono text-xs">{s?.client_zeout || '—'}</td>
                              <td className="px-3 py-2 text-xs">{s?.kind === 'credit' ? '💳 אשראי' : '🏦 בנק'}</td>
                              <td className="px-3 py-2 tabular-nums">
                                {s?.amount_per_charge ? `₪${Number(s.amount_per_charge).toLocaleString('he-IL')}` : '—'}
                              </td>
                              {action === 'update_amount' && (
                                <td className="px-3 py-2 font-bold text-blue-700 tabular-nums">
                                  {newAmt ? `₪${Number(newAmt).toLocaleString('he-IL')}` : '?'}
                                </td>
                              )}
                              <td className="px-3 py-2 text-xs text-slate-500">{it.triggered_by || ''}</td>
                              <td className="px-3 py-2">
                                <button
                                  type="button"
                                  onClick={() => onCancelOne(it.id)}
                                  className="text-xs text-red-600 hover:underline"
                                  disabled={processing}
                                >
                                  בטל
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 border-t bg-gray-50 flex justify-between items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={onCancelAll}
            disabled={processing || items.length === 0}
            className="text-sm text-red-600 hover:text-red-800 hover:underline disabled:opacity-50"
          >
            ❌ בטל את כל הפעולות (לא ישלח כלום)
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={processing}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-sm"
            >
              סגור (השאר ממתינות)
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={processing || items.length === 0}
              className="px-5 py-2 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700 disabled:opacity-60 text-sm"
            >
              {processing ? 'מעבד...' : `✓ אשר ושלח ${items.length} פעולות`}
            </button>
          </div>
        </div>
      </div>
    </div>
    </PageGuard>
  );
}
