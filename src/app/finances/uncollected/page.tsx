'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { SearchInput } from '@/components/ui/SearchInput';
import { useChargeAdjustments, MonthlyRow, PayMethod, CollectionStatus } from '@/hooks/useChargeAdjustments';
import { downloadFile } from '@/lib/masav';

const METHOD_LABELS: Record<PayMethod, string> = {
  bank_ho: 'הו"ק בנק', credit_nedarim: 'אשראי', office: 'משרד', exempt: 'פטור', none: 'לא מוגדר',
};
// Uncollected = anything not confirmed paid this month.
const STATUS_META: Record<Exclude<CollectionStatus, 'paid'>, { label: string; cls: string; hint: string }> = {
  returned:  { label: '↩️ חזר',        cls: 'bg-red-100 text-red-800',       hint: 'חיוב שחזר (בנק) — צריך טיפול/חיוב חוזר' },
  pending:   { label: '⏳ ממתין',       cls: 'bg-amber-100 text-amber-800',   hint: 'נשלח לחיוב וטרם נפרע' },
  none:      { label: '⭕ לא נגבה',      cls: 'bg-slate-100 text-slate-600',   hint: 'אין רישום גבייה החודש (אשראי שטרם סונכרן / מזומן שטרם שולם / לא חויב)' },
};
function ils(n: number) { return '₪' + Math.round(n).toLocaleString('he-IL'); }
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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
  const [rows, setRows] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<PayMethod | ''>('');
  const [statusFilter, setStatusFilter] = useState<'' | 'returned' | 'pending' | 'none'>('');

  const reload = useCallback(async () => {
    setLoading(true);
    setRows(await loadMonth(month));
    setLoading(false);
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload]);

  // Students expected to pay this month but NOT confirmed paid.
  const uncollected = useMemo(
    () => rows.filter((r) => r.method !== 'none' && r.method !== 'exempt' && r.final > 0 && r.collection !== 'paid'),
    [rows]
  );

  const byStatus = useMemo(() => {
    const s = { returned: { n: 0, sum: 0 }, pending: { n: 0, sum: 0 }, none: { n: 0, sum: 0 } };
    for (const r of uncollected) { const k = r.collection as 'returned' | 'pending' | 'none'; s[k].n++; s[k].sum += r.final; }
    return s;
  }, [uncollected]);

  const byMethod = useMemo(() => {
    const m: Record<string, { n: number; sum: number }> = {};
    for (const r of uncollected) { (m[r.method] ||= { n: 0, sum: 0 }); m[r.method].n++; m[r.method].sum += r.final; }
    return m;
  }, [uncollected]);

  const filtered = useMemo(() => {
    let l = uncollected;
    if (methodFilter) l = l.filter((r) => r.method === methodFilter);
    if (statusFilter) l = l.filter((r) => r.collection === statusFilter);
    const q = search.trim();
    if (q) l = l.filter((r) => `${r.last_name} ${r.first_name}`.includes(q));
    return [...l].sort((a, b) => b.final - a.final);
  }, [uncollected, methodFilter, statusFilter, search]);

  const total = useMemo(() => uncollected.reduce((s, r) => s + r.final, 0), [uncollected]);
  const filteredTotal = useMemo(() => filtered.reduce((s, r) => s + r.final, 0), [filtered]);

  const exportCsv = () => {
    const head = ['שם', 'שיעור', 'אופן תשלום', 'סכום צפוי', 'סטטוס'];
    const lines = filtered.map((r) => [
      `"${r.last_name} ${r.first_name}"`,
      (r.shiur || '').replace('שיעור ', '') || '',
      METHOD_LABELS[r.method],
      Math.round(r.final),
      r.collection === 'returned' ? 'חזר' : r.collection === 'pending' ? 'ממתין' : 'לא נגבה',
    ].join(','));
    const csv = '﻿' + head.join(',') + '\r\n' + lines.join('\r\n') + '\r\n';
    downloadFile(`uncollected_${month}.csv`, csv, 'text/csv');
  };

  return (
    <>
      <Header title="מה עוד לא נגבה" subtitle="תלמידים שצפויים לשלם החודש אך טרם נגבו — לפי סטטוס ואופן תשלום"
        action={<Link href="/finances"><Button variant="ghost">← כספים</Button></Link>} />

      <div className="p-4 md:p-8 space-y-5">
        {/* Controls */}
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
              options={[{ value: '', label: 'הכל' }, { value: 'none', label: 'לא נגבה' }, { value: 'pending', label: 'ממתין' }, { value: 'returned', label: 'חזר' }]} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <SearchInput value={search} onSearch={setSearch} placeholder="חיפוש תלמיד..." />
          </div>
          <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>📥 ייצוא CSV</Button>
        </div>

        {/* Headline */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="סה״כ לא נגבה" value={ils(total)} strong danger />
          <button onClick={() => setStatusFilter((s) => (s === 'none' ? '' : 'none'))} className="text-start">
            <StatCard label={`⭕ לא נגבה (${byStatus.none.n})`} value={ils(byStatus.none.sum)} active={statusFilter === 'none'} />
          </button>
          <button onClick={() => setStatusFilter((s) => (s === 'pending' ? '' : 'pending'))} className="text-start">
            <StatCard label={`⏳ ממתין (${byStatus.pending.n})`} value={ils(byStatus.pending.sum)} active={statusFilter === 'pending'} />
          </button>
          <button onClick={() => setStatusFilter((s) => (s === 'returned' ? '' : 'returned'))} className="text-start">
            <StatCard label={`↩️ חזר (${byStatus.returned.n})`} value={ils(byStatus.returned.sum)} active={statusFilter === 'returned'} />
          </button>
        </div>

        {/* By method */}
        <div className="flex flex-wrap gap-2">
          {(['bank_ho', 'credit_nedarim', 'office'] as PayMethod[]).map((m) => byMethod[m] && (
            <button key={m} onClick={() => setMethodFilter((v) => (v === m ? '' : m))}
              className={`px-3 py-1.5 rounded-full text-sm border ${methodFilter === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}>
              {METHOD_LABELS[m]}: <b>{ils(byMethod[m].sum)}</b> ({byMethod[m].n})
            </button>
          ))}
        </div>

        {/* Table */}
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
                    <th className="text-start px-3 py-2 font-semibold">סכום צפוי</th>
                    <th className="text-start px-3 py-2 font-semibold">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const meta = STATUS_META[r.collection as 'returned' | 'pending' | 'none'];
                    return (
                      <tr key={r.student_id} className="border-b border-slate-50 hover:bg-amber-50/40">
                        <td className="px-3 py-2">
                          <Link href={`/students/${r.student_id}`} className="text-blue-700 hover:underline">{r.last_name} {r.first_name}</Link>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{(r.shiur || '').replace('שיעור ', '') || '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{METHOD_LABELS[r.method]}</td>
                        <td className="px-3 py-2 font-semibold text-red-700">{ils(r.final)}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${meta.cls}`} title={meta.hint}>{meta.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="p-10 text-center text-slate-400">
                      {uncollected.length === 0 ? '✓ הכל נגבה החודש' : 'אין תוצאות לסינון'}
                    </td></tr>
                  )}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-slate-200 font-bold">
                      <td className="px-3 py-2" colSpan={3}>סה״כ מוצג</td>
                      <td className="px-3 py-2 text-red-700">{ils(filteredTotal)}</td>
                      <td className="px-3 py-2 text-slate-500 font-normal">{filtered.length} תלמידים</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-slate-500">
          💡 "לא נגבה" = אין רישום גבייה החודש (אשראי שטרם סונכרן / מזומן שטרם התקבל / הו"ק שלא חויבה).
          "ממתין" = נשלח לחיוב וטרם נפרע. "חזר" = חיוב שחזר. הסכום הוא הצפי החודשי (בסיס ± שינויים).
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
