'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';

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
  // Synthetic: whether this record comes from our own tuition_charges (bank)
  isLocalBank?: boolean;
  localChargeId?: string;
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
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);

    // Nedarim subscriptions (credit from API)
    const { data: ned } = await supabase
      .from('nedarim_subscriptions')
      .select('*')
      .neq('status', 'deleted')
      .order('status', { ascending: true })
      .order('client_name', { ascending: true });

    // Our own bank HKs from tuition_charges (Masav managed in-house)
    const { data: tc } = await supabase
      .from('tuition_charges')
      .select('id, family_id, total_amount_per_month, scheduled_day_of_month, status, payment_method, notes, student_ids')
      .eq('payment_method', 'standing_order')
      .neq('status', 'cancelled');

    const localBank: Subscription[] = (tc || []).map((c: any) => ({
      id: `tc_${c.id}`,
      localChargeId: c.id,
      isLocalBank: true,
      nedarim_keva_id: '—',
      kind: 'bank' as const,
      status: c.status === 'active' ? 'active' : c.status === 'suspended' ? 'frozen' : c.status,
      family_id: c.family_id,
      client_zeout: null,
      client_name: null,
      client_phone: null,
      amount_per_charge: Number(c.total_amount_per_month) || 0,
      scheduled_day: c.scheduled_day_of_month || null,
      next_charge_date: null,
      remaining_charges: null,
      successful_charges: null,
      last_4_digits: null,
      bank_number: null,
      bank_agency: null,
      bank_account: null,
      groupe: 'שכר לימוד',
      last_error: null,
      last_synced_at: new Date().toISOString(),
    }));

    setSubs([...(ned || []) as Subscription[], ...localBank]);

    const { data: fams } = await supabase
      .from('families')
      .select('id, family_name, father_name');
    const map: Record<string, FamilyLite> = {};
    for (const f of fams || []) map[f.id] = f as FamilyLite;
    setFamilies(map);

    const { data: log } = await supabase
      .from('nedarim_sync_log')
      .select('finished_at')
      .eq('result', 'success')
      .order('started_at', { ascending: false })
      .limit(1);
    setLastSync(log?.[0]?.finished_at || null);

    setLoading(false);
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
    else if (tab === 'unmatched') list = list.filter((s) => !s.family_id && !s.isLocalBank);

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
    unmatched: subs.filter((s) => !s.family_id && !s.isLocalBank).length,
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
          </div>
          <div className="flex gap-2 items-center">
            {lastSync && (
              <span className="text-xs text-gray-500">סונכרן לאחרונה: {formatDT(lastSync)}</span>
            )}
            <Button onClick={handleSync} disabled={syncing}>
              {syncing ? 'מסנכרן...' : '🔄 סנכרן מנדרים'}
            </Button>
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
    </>
  );
}
