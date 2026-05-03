'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Select } from '@/components/ui/Select';
import { SearchInput } from '@/components/ui/SearchInput';
import { SHIURIM } from '@/lib/shiurim';

interface Debtor {
  student_id: string;
  first_name: string;
  last_name: string;
  family_id: string | null;
  family_name: string | null;
  father_phone: string | null;
  payment_method: 'bank_ho' | 'credit_nedarim';
  amount: number;
  due_day: number | null;
  institution: string;
  shiur: string;
}

const METHOD_LABELS: Record<string, string> = {
  bank_ho: '🏦 בנק',
  credit_nedarim: '💳 אשראי',
};

const METHOD_TONE: Record<string, string> = {
  bank_ho: 'bg-blue-50 text-blue-800 ring-blue-200',
  credit_nedarim: 'bg-violet-50 text-violet-800 ring-violet-200',
};

function monthLabel(ym: string): string {
  // ym = "YYYY-MM"
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
}

function lastDayOfMonth(year: number, month1based: number): string {
  return new Date(year, month1based, 0).toISOString().slice(0, 10);
}

function firstDayOfMonth(year: number, month1based: number): string {
  return `${year}-${String(month1based).padStart(2, '0')}-01`;
}

export function OverdueDebtorsCard() {
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  // Filters
  const today = new Date();
  const defaultYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(defaultYm);
  const [institutionFilter, setInstitutionFilter] = useState<'all' | 'ישיבה' | 'כולל'>('all');
  const [shiurFilter, setShiurFilter] = useState<string>('');
  const [methodFilter, setMethodFilter] = useState<'all' | 'bank_ho' | 'credit_nedarim'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [yStr, mStr] = selectedMonth.split('-');
      const y = Number(yStr);
      const m = Number(mStr);
      const monthStart = firstDayOfMonth(y, m);
      const monthEnd = lastDayOfMonth(y, m);

      // 1. Active student_tuition with bank_ho or credit_nedarim
      const allTuitions: any[] = [];
      for (let p = 0; p < 20; p++) {
        const { data } = await supabase
          .from('student_tuition')
          .select(`
            student_id, payment_method, monthly_amount, bank_day, nedarim_subscription_id,
            students!inner(id, first_name, last_name, family_id, status, institution_name, shiur),
            nedarim_subscriptions(status, scheduled_day)
          `)
          .in('students.status', ['active', 'chizuk'])
          .in('students.institution_name', ['ישיבה', 'כולל'])
          .eq('active', true)
          .in('payment_method', ['bank_ho', 'credit_nedarim'])
          .range(p * 1000, (p + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        allTuitions.push(...data);
        if (data.length < 1000) break;
      }

      // 2. Families lookup
      const { data: familiesList } = await supabase
        .from('families')
        .select('id, family_name, father_phone')
        .limit(5000);
      const famById: Record<string, any> = {};
      for (const f of familiesList || []) famById[f.id] = f;

      // 3. Successful Nedarim transactions for the month
      const paidCreditSubIds = new Set<string>();
      for (let p = 0; p < 10; p++) {
        const { data } = await supabase
          .from('nedarim_transactions')
          .select('subscription_id, result, transaction_date')
          .eq('result', 'success')
          .gte('transaction_date', monthStart)
          .lte('transaction_date', monthEnd)
          .range(p * 1000, (p + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        for (const t of data) if (t.subscription_id) paidCreditSubIds.add(t.subscription_id);
        if (data.length < 1000) break;
      }

      // 4. Successful bank payment_history for the month (status=2)
      const paidBankStudents = new Set<string>();
      for (let p = 0; p < 10; p++) {
        const { data } = await supabase
          .from('payment_history')
          .select('student_id, status_code, payment_date')
          .eq('status_code', 2)
          .gte('payment_date', monthStart)
          .lte('payment_date', monthEnd)
          .range(p * 1000, (p + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        for (const t of data) if (t.student_id) paidBankStudents.add(t.student_id);
        if (data.length < 1000) break;
      }

      // 5. Build list - student is in "not paid" group if no successful record exists
      const list: Debtor[] = [];
      for (const t of allTuitions) {
        const s = t.students;
        const fam = s.family_id ? famById[s.family_id] : null;
        let dueDay: number | null = null;
        let paid = false;

        if (t.payment_method === 'bank_ho') {
          dueDay = Number(t.bank_day) || null;
          paid = paidBankStudents.has(t.student_id);
        } else if (t.payment_method === 'credit_nedarim') {
          const sub = Array.isArray(t.nedarim_subscriptions)
            ? t.nedarim_subscriptions[0]
            : t.nedarim_subscriptions;
          if (sub?.status && sub.status !== 'active') continue; // skip frozen
          dueDay = sub?.scheduled_day || null;
          if (t.nedarim_subscription_id) paid = paidCreditSubIds.has(t.nedarim_subscription_id);
        }

        // Skip if paid - we only want NOT paid
        if (paid) continue;

        list.push({
          student_id: t.student_id,
          first_name: s.first_name || '',
          last_name: s.last_name || '',
          family_id: s.family_id,
          family_name: fam?.family_name || null,
          father_phone: fam?.father_phone || null,
          payment_method: t.payment_method,
          amount: Number(t.monthly_amount) || 0,
          due_day: dueDay,
          institution: s.institution_name || '',
          shiur: s.shiur || '',
        });
      }

      list.sort((a, b) => b.amount - a.amount);
      if (!cancelled) {
        setDebtors(list);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedMonth]);

  // Apply UI filters
  const filtered = useMemo(() => {
    return debtors.filter((d) => {
      if (institutionFilter !== 'all' && d.institution !== institutionFilter) return false;
      if (shiurFilter && d.shiur !== shiurFilter) return false;
      if (methodFilter !== 'all' && d.payment_method !== methodFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const txt = `${d.first_name} ${d.last_name} ${d.family_name || ''} ${d.father_phone || ''}`.toLowerCase();
        if (!txt.includes(q)) return false;
      }
      return true;
    });
  }, [debtors, institutionFilter, shiurFilter, methodFilter, search]);

  // Month options - last 12 months + next 1 month
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (let offset = 1; offset >= -11; offset--) {
      const d = new Date(today.getFullYear(), today.getMonth() - offset, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      opts.push({ value: ym, label: monthLabel(ym) });
    }
    return opts.reverse();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalAmount = filtered.reduce((sum, d) => sum + d.amount, 0);
  const formatCurrency = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;

  // Group by institution for summary
  const byInstitution = useMemo(() => {
    const out: Record<string, { count: number; sum: number }> = {};
    for (const d of filtered) {
      if (!out[d.institution]) out[d.institution] = { count: 0, sum: 0 };
      out[d.institution].count++;
      out[d.institution].sum += d.amount;
    }
    return out;
  }, [filtered]);

  const shiurOptions = [
    { value: '', label: 'כל השיעורים' },
    ...SHIURIM.map((s) => ({ value: s.name, label: s.name })),
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 elevation-1 overflow-hidden">
      <div className="px-4 md:px-5 py-4 border-b border-slate-100 bg-gradient-to-l from-red-50/60 to-white">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3
            className="text-lg font-bold text-slate-900 flex items-center gap-2"
            style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
          >
            <span className="w-1 h-5 bg-gradient-to-b from-red-500 to-amber-500 rounded-full" />
            ⚠️ מסומנים לגביה אך לא נגבו
          </h3>
          <div className="text-sm">
            {loading ? (
              <span className="text-slate-400">טוען...</span>
            ) : (
              <>
                <span className="font-bold text-slate-900">{filtered.length.toLocaleString('he-IL')}</span>
                <span className="text-slate-500"> תלמידים · </span>
                <span className="font-bold text-red-700">{formatCurrency(totalAmount)}</span>
              </>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          תלמידים פעילים עם הוראת קבע / אשראי שאין להם תשלום מוצלח בחודש המבוקש.
        </p>
      </div>

      {/* Filters bar */}
      <div className="px-4 md:px-5 py-3 bg-slate-50/50 border-b border-slate-100">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <FilterField label="חודש">
            <Select
              options={monthOptions}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </FilterField>
          <FilterField label="מוסד">
            <Select
              options={[
                { value: 'all', label: 'הכל' },
                { value: 'ישיבה', label: 'ישיבה' },
                { value: 'כולל', label: 'כולל' },
              ]}
              value={institutionFilter}
              onChange={(e) => setInstitutionFilter(e.target.value as any)}
            />
          </FilterField>
          <FilterField label="שיעור">
            <Select
              options={shiurOptions}
              value={shiurFilter}
              onChange={(e) => setShiurFilter(e.target.value)}
            />
          </FilterField>
          <FilterField label="שיטה">
            <Select
              options={[
                { value: 'all', label: 'הכל' },
                { value: 'bank_ho', label: 'בנק' },
                { value: 'credit_nedarim', label: 'אשראי' },
              ]}
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value as any)}
            />
          </FilterField>
          <FilterField label="חיפוש">
            <SearchInput
              placeholder="שם / טלפון..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </FilterField>
        </div>

        {/* Institution summary chips */}
        {Object.keys(byInstitution).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {Object.entries(byInstitution).map(([inst, agg]) => (
              <span
                key={inst}
                className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-full px-3 py-1 text-xs"
              >
                <span className="font-semibold text-slate-700">{inst}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600 tabular-nums">{agg.count}</span>
                <span className="text-slate-400">·</span>
                <span className="text-red-700 font-semibold tabular-nums">{formatCurrency(agg.sum)}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm mt-3">טוען...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-emerald-50/40">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-emerald-800 font-semibold">אין תלמידים עם חוב לחודש {monthLabel(selectedMonth)}</p>
          <p className="text-slate-500 text-sm mt-1">כל הגביות הצליחו!</p>
        </div>
      ) : (
        <>
          {/* Toggle */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 border-b border-slate-100"
          >
            {expanded ? '▲ הסתר רשימה' : `▼ הצג רשימה מלאה (${filtered.length})`}
          </button>

          {expanded && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-start font-semibold">תלמיד</th>
                    <th className="px-3 py-2 text-start font-semibold">משפחה</th>
                    <th className="px-3 py-2 text-start font-semibold">שיעור</th>
                    <th className="px-3 py-2 text-start font-semibold">שיטה</th>
                    <th className="px-3 py-2 text-start font-semibold">יום</th>
                    <th className="px-3 py-2 text-start font-semibold">סכום</th>
                    <th className="px-3 py-2 text-start font-semibold">טלפון אב</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr key={d.student_id} className="border-t border-slate-100 hover:bg-blue-50/40 transition-colors">
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/students/${d.student_id}`}
                          className="text-blue-700 hover:text-blue-900 hover:underline font-semibold"
                        >
                          {d.last_name} {d.first_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5">
                        {d.family_id && d.family_name ? (
                          <Link
                            href={`/families/${d.family_id}`}
                            className="text-blue-700 hover:underline text-xs"
                          >
                            {d.family_name}
                          </Link>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 text-xs">{d.shiur || '—'}</td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ${METHOD_TONE[d.payment_method]}`}
                        >
                          {METHOD_LABELS[d.payment_method]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 text-xs tabular-nums">{d.due_day || '—'}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-900 tabular-nums">
                        {formatCurrency(d.amount)}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {d.father_phone ? (
                          <a
                            href={`tel:${d.father_phone}`}
                            className="text-blue-700 hover:text-blue-900 hover:underline tabular-nums"
                          >
                            {d.father_phone}
                          </a>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
