'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { SearchInput } from '@/components/ui/SearchInput';
import { useChargeAdjustments, MonthlyRow, PayMethod } from '@/hooks/useChargeAdjustments';
import { fetchAll } from '@/lib/supabase-paginate';
import { downloadFile } from '@/lib/masav';

const METHOD_LABELS: Record<PayMethod, string> = {
  bank_ho: 'הו"ק בנק', credit_nedarim: 'אשראי', office: 'משרד', exempt: 'פטור', none: 'לא מוגדר',
};

type StatusKey = 'none' | 'partial' | 'pending' | 'returned';
const STATUS_META: Record<StatusKey, { label: string; cls: string; hint: string }> = {
  none:     { label: '⭕ לא נגבה',      cls: 'bg-slate-100 text-slate-600',   hint: 'אין רישום גבייה החודש (אשראי שטרם סונכרן / מזומן שטרם התקבל / הו"ק שלא חויבה)' },
  partial:  { label: '🟡 נגבה חלקית',   cls: 'bg-orange-100 text-orange-800', hint: 'נגבה פחות מהצפוי (חיוב אשראי שונה מהבסיס / הו"ק משותפת / הנחה שלא נרשמה)' },
  pending:  { label: '⏳ ממתין',        cls: 'bg-amber-100 text-amber-800',   hint: 'נשלח לחיוב בבנק וטרם נפרע' },
  returned: { label: '↩️ חזר',          cls: 'bg-red-100 text-red-800',       hint: 'חיוב שחזר — צריך טיפול/חיוב חוזר' },
};

interface Item {
  row: MonthlyRow;
  expected: number;
  collected: number;
  outstanding: number;
  status: StatusKey;
}

function ils(n: number) { return '₪' + Math.round(n).toLocaleString('he-IL'); }
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthBounds(key: string): { start: string; end: string } {
  const [y, m] = key.split('-').map(Number);
  const start = `${key}-01`;
  const next = new Date(y, m, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
  return { start, end };
}
function monthOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  for (let i = 0; i <= 11; i++) {
    const dd = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ value: `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}`,
               label: `${String(dd.getMonth() + 1).padStart(2, '0')}/${dd.getFullYear()}` });
  }
  return out;
}

export default function UncollectedReportPage() {
  const { loadMonth } = useChargeAdjustments();
  const [month, setMonth] = useState(currentMonth());
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<PayMethod | ''>('');
  const [statusFilter, setStatusFilter] = useState<'' | StatusKey>('');

  const reload = useCallback(async () => {
    setLoading(true);
    const { start, end } = monthBounds(month);
    const [rows, ph, office] = await Promise.all([
      loadMonth(month),
      // Collected this month = every paid row (bank + mirrored credit) — status 2.
      fetchAll<{ student_id: string; amount_ils: number }>(
        'payment_history', 'student_id, amount_ils',
        (q) => q.eq('status_code', 2).gte('payment_date', start).lt('payment_date', end)
      ),
      fetchAll<{ student_id: string; amount: number }>(
        'office_payments', 'student_id, amount',
        (q) => q.gte('payment_date', start).lt('payment_date', end)
      ),
    ]);

    const collectedBySid = new Map<string, number>();
    for (const r of ph) collectedBySid.set(r.student_id, (collectedBySid.get(r.student_id) || 0) + (Number(r.amount_ils) || 0));
    for (const o of office) collectedBySid.set(o.student_id, (collectedBySid.get(o.student_id) || 0) + (Number(o.amount) || 0));

    const list: Item[] = [];
    for (const row of rows) {
      if (row.method === 'none' || row.method === 'exempt') continue;
      const expected = row.final;
      if (expected <= 0) continue;
      const collected = collectedBySid.get(row.student_id) || 0;
      const outstanding = expected - collected;
      if (outstanding < 1) continue; // fully (or over-) collected
      let status: StatusKey;
      if (row.collection === 'returned') status = 'returned';
      else if (row.collection === 'pending') status = 'pending';
      else if (collected <= 0) status = 'none';
      else status = 'partial';
      list.push({ row, expected, collected, outstanding, status });
    }
    setItems(list);
    setLoading(false);
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload]);

  const byStatus = useMemo(() => {
    const s: Record<StatusKey, { n: number; sum: number }> = {
      none: { n: 0, sum: 0 }, partial: { n: 0, sum: 0 }, pending: { n: 0, sum: 0 }, returned: { n: 0, sum: 0 },
    };
    for (const it of items) { s[it.status].n++; s[it.status].sum += it.outstanding; }
    return s;
  }, [items]);

  const byMethod = useMemo(() => {
    const m: Record<string, { n: number; sum: number }> = {};
    for (const it of items) { (m[it.row.method] ||= { n: 0, sum: 0 }); m[it.row.method].n++; m[it.row.method].sum += it.outstanding; }
    return m;
  }, [items]);

  const filtered = useMemo(() => {
    let l = items;
    if (methodFilter) l = l.filter((it) => it.row.method === methodFilter);
    if (statusFilter) l = l.filter((it) => it.status === statusFilter);
    const q = search.trim();
    if (q) l = l.filter((it) => `${it.row.last_name} ${it.row.first_name}`.includes(q));
    return [...l].sort((a, b) => b.outstanding - a.outstanding);
  }, [items, methodFilter, statusFilter, search]);

  const total = useMemo(() => items.reduce((s, it) => s + it.outstanding, 0), [items]);
  const filteredTotal = useMemo(() => filtered.reduce((s, it) => s + it.outstanding, 0), [filtered]);

  const exportCsv = () => {
    const head = ['שם', 'שיעור', 'אופן תשלום', 'צפוי', 'נגבה', 'חוסר', 'סטטוס'];
    const lines = filtered.map((it) => [
      `"${it.row.last_name} ${it.row.first_name}"`,
      (it.row.shiur || '').replace('שיעור ', '') || '',
      METHOD_LABELS[it.row.method],
      Math.round(it.expected), Math.round(it.collected), Math.round(it.outstanding),
      STATUS_META[it.status].label.replace(/^[^ ]+ /, ''),
    ].join(','));
    downloadFile(`uncollected_${month}.csv`, '﻿' + head.join(',') + '\r\n' + lines.join('\r\n') + '\r\n', 'text/csv');
  };

  return (
    <>
      <Header title="מה עוד לא נגבה" subtitle="צפי מול נגבה בפועל — לכל תלמיד שטרם נגבה במלואו החודש"
        action={<Link href="/finances"><Button variant="ghost">← כספים</Button></Link>} />

      <div className="p-4 md:p-8 space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <Select label="חודש" value={month} onChange={(e) => setMonth(e.target.value)} options={monthOptions()} />
          </div>
          <div className="w-40">
            <Select label="אופן תשלום" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value as PayMethod | '')}
              options={[{ value: '', label: 'הכל' }, { value: 'bank_ho', label: 'הו"ק בנק' }, { value: 'credit_nedarim', label: 'אשראי' }, { value: 'office', label: 'משרד' }]} />
          </div>
          <div className="w-40">
            <Select label="סטטוס" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
              options={[{ value: '', label: 'הכל' }, { value: 'none', label: 'לא נגבה' }, { value: 'partial', label: 'נגבה חלקית' }, { value: 'pending', label: 'ממתין' }, { value: 'returned', label: 'חזר' }]} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <SearchInput value={search} onSearch={setSearch} placeholder="חיפוש תלמיד..." />
          </div>
          <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>📥 ייצוא CSV</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="סה״כ חוסר" value={ils(total)} strong danger />
          {(['none', 'partial', 'pending', 'returned'] as StatusKey[]).map((k) => (
            <button key={k} onClick={() => setStatusFilter((s) => (s === k ? '' : k))} className="text-start">
              <StatCard label={`${STATUS_META[k].label} (${byStatus[k].n})`} value={ils(byStatus[k].sum)} active={statusFilter === k} />
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {(['bank_ho', 'credit_nedarim', 'office'] as PayMethod[]).map((m) => byMethod[m] && (
            <button key={m} onClick={() => setMethodFilter((v) => (v === m ? '' : m))}
              className={`px-3 py-1.5 rounded-full text-sm border ${methodFilter === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}>
              {METHOD_LABELS[m]}: <b>{ils(byMethod[m].sum)}</b> ({byMethod[m].n})
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="p-10 text-center text-slate-400">טוען…</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                    <th className="text-start px-3 py-2 font-semibold">תלמיד</th>
                    <th className="text-start px-3 py-2 font-semibold">שיעור</th>
                    <th className="text-start px-3 py-2 font-semibold">אופן</th>
                    <th className="text-start px-3 py-2 font-semibold">צפוי</th>
                    <th className="text-start px-3 py-2 font-semibold">נגבה</th>
                    <th className="text-start px-3 py-2 font-semibold">חוסר</th>
                    <th className="text-start px-3 py-2 font-semibold">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((it) => (
                    <tr key={it.row.student_id} className="border-b border-slate-50 hover:bg-amber-50/40">
                      <td className="px-3 py-2">
                        <Link href={`/students/${it.row.student_id}`} className="text-blue-700 hover:underline">{it.row.last_name} {it.row.first_name}</Link>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{(it.row.shiur || '').replace('שיעור ', '') || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{METHOD_LABELS[it.row.method]}</td>
                      <td className="px-3 py-2 text-slate-700">{ils(it.expected)}</td>
                      <td className="px-3 py-2 text-emerald-700">{it.collected > 0 ? ils(it.collected) : '—'}</td>
                      <td className="px-3 py-2 font-semibold text-red-700">{ils(it.outstanding)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_META[it.status].cls}`} title={STATUS_META[it.status].hint}>{STATUS_META[it.status].label}</span>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="p-10 text-center text-slate-400">
                      {items.length === 0 ? '✓ הכל נגבה החודש' : 'אין תוצאות לסינון'}
                    </td></tr>
                  )}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-slate-200 font-bold">
                      <td className="px-3 py-2" colSpan={5}>סה״כ חוסר מוצג</td>
                      <td className="px-3 py-2 text-red-700">{ils(filteredTotal)}</td>
                      <td className="px-3 py-2 text-slate-500 font-normal">{filtered.length} תלמידים</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-slate-500 leading-relaxed">
          💡 <b>חוסר = צפוי − נגבה בפועל</b> לכל תלמיד. <b>לא נגבה</b> = 0 נגבה (אשראי שטרם סונכרן / מזומן שטרם התקבל / הו"ק שלא חויבה).
          <b> נגבה חלקית</b> = נגבה פחות מהצפוי (חיוב אשראי שונה מהבסיס / הו"ק משותפת). <b>ממתין</b> = נשלח לבנק וטרם נפרע. <b>חזר</b> = חיוב שחזר.
          הצפוי כולל שינויים חודשיים (בסיס ± תוספות/override), ולכן הסה״כ עשוי להיות שונה מעט מ"נותר" בגייג' שמבוסס על הבסיס בלבד.
        </p>
      </div>
    </>
  );
}

function StatCard({ label, value, strong, danger, active }: { label: string; value: string; strong?: boolean; danger?: boolean; active?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl border elevation-1 px-4 py-3 ${active ? 'border-blue-400 ring-1 ring-blue-200' : danger ? 'border-red-200' : 'border-slate-200/70'}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 ${strong ? 'text-xl font-bold' : 'text-lg font-semibold'} ${danger ? 'text-red-700' : 'text-slate-800'}`}>{value}</div>
    </div>
  );
}
