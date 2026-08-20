'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Stats {
  target: number;            // bank target = pending+paid+returned, OR for current/future = roster-based
  creditCollected: number;
  officeCollected: number;
  bankCollected: number;     // status=2 (paid)
  bankPending: number;       // status=1 (scheduled / not yet paid)
  bankReturned: number;      // status=3 (returned)
}

/** Returns YYYY-MM for the current month. */
function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Add `delta` months to a YYYY-MM key. */
function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthBounds(key: string): { start: string; end: string } {
  const [y, m] = key.split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const next = new Date(y, m, 1); // m is 1-based, this gives next month
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
  return { start, end };
}

function formatMonthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('he-IL', { month: 'long', year: 'numeric' });
}

export function MonthlyCollectionGauge() {
  const [monthKey, setMonthKey] = useState<string>(currentMonthKey());
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const isCurrent = monthKey === currentMonthKey();
  const isFuture = monthKey > currentMonthKey();

  // Build a list of last 24 months for the dropdown
  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const today = currentMonthKey();
    for (let i = 0; i < 24; i++) {
      opts.push(shiftMonth(today, -i));
    }
    return opts;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { start: monthStart, end: monthEnd } = monthBounds(monthKey);

      // For past months: skip the roster-based target altogether — we'll
      // derive a real one from payment_history below.
      // For current/future: target = Σ FINAL per student = (override ?? base) + additions,
      // folding in this month's charge_adjustments (e.g. a שיעור א group override to a
      // partial-year amount). Using the raw base overstated the target and the "remaining".
      let rosterTarget = 0;
      if (monthKey >= currentMonthKey()) {
        const baseBySid = new Map<string, number>();
        for (let p = 0; p < 20; p++) {
          const { data } = await supabase
            .from('student_tuition')
            .select('student_id, monthly_amount, payment_method, students!inner(status, institution_name)')
            .eq('students.status', 'active')
            .eq('students.institution_name', 'ישיבה')
            .in('payment_method', ['bank_ho', 'credit_nedarim', 'office'])
            .range(p * 1000, (p + 1) * 1000 - 1);
          if (!data || data.length === 0) break;
          for (const r of data as any[]) baseBySid.set(r.student_id, Number(r.monthly_amount) || 0);
          if (data.length < 1000) break;
        }
        // This month's adjustments: override replaces the base, additions add on top.
        const overrideBySid = new Map<string, number>();
        const addBySid = new Map<string, number>();
        for (let p = 0; p < 10; p++) {
          const { data } = await supabase
            .from('charge_adjustments')
            .select('student_id, kind, amount')
            .eq('month', monthKey)
            .eq('status', 'active')
            .range(p * 1000, (p + 1) * 1000 - 1);
          if (!data || data.length === 0) break;
          for (const a of data as any[]) {
            if (a.kind === 'override') overrideBySid.set(a.student_id, Number(a.amount) || 0);
            else addBySid.set(a.student_id, (addBySid.get(a.student_id) || 0) + (Number(a.amount) || 0));
          }
          if (data.length < 1000) break;
        }
        for (const [sid, base] of baseBySid) {
          const ov = overrideBySid.get(sid);
          rosterTarget += (ov != null ? ov : base) + (addBySid.get(sid) || 0);
        }
      }

      let creditCollected = 0;
      for (let p = 0; p < 10; p++) {
        const { data } = await supabase
          .from('nedarim_transactions')
          .select('amount,result,transaction_date')
          .eq('result', 'success')
          .gte('transaction_date', monthStart)
          .lt('transaction_date', monthEnd)
          .range(p * 1000, (p + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        creditCollected += data.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
        if (data.length < 1000) break;
      }

      const { data: office } = await supabase
        .from('office_payments')
        .select('amount')
        .gte('payment_date', monthStart)
        .lt('payment_date', monthEnd);
      const officeCollected = (office || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

      // Pull ALL payment_history for the month (not just paid) so we can
      // split paid / pending / returned and derive a real bank target.
      let bankCollected = 0;
      let bankPending   = 0;
      let bankReturned  = 0;
      let bankRealTarget = 0;
      for (let p = 0; p < 10; p++) {
        const { data } = await supabase
          .from('payment_history')
          .select('amount_ils,status_code')
          .gte('payment_date', monthStart)
          .lt('payment_date', monthEnd)
          .is('nedarim_transaction_id', null) // BANK only — exclude mirrored credit charges (counted in creditCollected)
          .range(p * 1000, (p + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        for (const r of data) {
          const amt = Number(r.amount_ils) || 0;
          const sc  = r.status_code;
          if (sc === 2) {
            bankCollected += amt;
            bankRealTarget += amt;
          } else if (sc === 1) {
            bankPending += amt;
            bankRealTarget += amt;
          } else if (sc === 3) {
            bankReturned += amt;
            bankRealTarget += amt;
          }
          // sc 4 (לא לחייב), 9 (בוטל) and others are excluded from the target
        }
        if (data.length < 1000) break;
      }

      // Target: for past months use what was actually billed (bank) + actuals
      // for credit/office. For current/future months use roster-based target.
      const target = monthKey >= currentMonthKey()
        ? rosterTarget
        : bankRealTarget + creditCollected + officeCollected;

      if (!cancelled) {
        setStats({ target, creditCollected, officeCollected, bankCollected, bankPending, bankReturned });
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [monthKey]);

  const total = stats ? stats.creditCollected + stats.officeCollected + stats.bankCollected : 0;
  const pct = stats && stats.target > 0 ? Math.min(100, (total / stats.target) * 100) : 0;
  const formatCurrency = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`;

  const color = pct >= 85 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626';
  // The fixed semicircle track. Progress is revealed with stroke-dasharray on the
  // SAME path (pathLength normalised to 100) — it can never overflow the arc.
  const ARC = 'M 20 120 A 100 100 0 0 1 220 120';

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-lg font-bold">⏱️ גבייה</h3>
          {/* Prev / Month label / Next */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            <button
              type="button"
              onClick={() => setMonthKey((k) => shiftMonth(k, -1))}
              className="px-2 py-1 rounded-md hover:bg-white text-slate-600 text-lg leading-none"
              title="חודש קודם"
            >‹</button>
            <select
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
              className="bg-transparent px-2 py-1 text-sm font-bold focus:outline-none cursor-pointer min-w-[140px] text-center"
            >
              {monthOptions.map((k) => (
                <option key={k} value={k}>
                  {formatMonthLabel(k)}{k === currentMonthKey() ? ' (החודש)' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => !isCurrent && setMonthKey((k) => shiftMonth(k, +1))}
              disabled={isCurrent}
              className="px-2 py-1 rounded-md hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed text-slate-600 text-lg leading-none"
              title={isCurrent ? 'אין חודש קדימה - זה החודש הנוכחי' : 'חודש הבא'}
            >›</button>
          </div>
          {!isCurrent && (
            <button
              type="button"
              onClick={() => setMonthKey(currentMonthKey())}
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              חזרה להיום
            </button>
          )}
        </div>
        <span className="text-xs text-gray-500">
          {isCurrent ? 'מתעדכן מנתוני הסנכרון' : 'נתוני עבר'}
        </span>
      </div>

      {loading || !stats ? (
        <div className="text-center py-12 text-gray-500">טוען...</div>
      ) : isFuture ? (
        <div className="text-center py-12 text-gray-400">חודש עתידי - אין נתונים</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="flex justify-center">
            <svg width="240" height="140" viewBox="0 0 240 140" className="max-w-full h-auto">
              <path d={ARC} fill="none" stroke="#e5e7eb" strokeWidth="20" strokeLinecap="round" />
              {pct > 0 && (
                <path
                  d={ARC}
                  fill="none"
                  stroke={color}
                  strokeWidth="20"
                  strokeLinecap="round"
                  pathLength={100}
                  strokeDasharray={`${pct} 100`}
                />
              )}
              <text x="120" y="100" textAnchor="middle" fontSize="36" fontWeight="bold" fill={color}>
                {Math.round(pct)}%
              </text>
              <text x="120" y="125" textAnchor="middle" fontSize="12" fill="#6b7280">
                מהיעד
              </text>
            </svg>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-sm pb-2 border-b border-gray-200">
              <span className="font-medium">
                {isCurrent ? 'יעד חודשי:' : 'חויב בפועל בחודש זה:'}
              </span>
              <span className="font-bold text-lg">{formatCurrency(stats.target)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-purple-500"></span>
                💳 אשראי
              </span>
              <span className="font-semibold text-purple-700">{formatCurrency(stats.creditCollected)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-blue-500"></span>
                🏦 בנק
              </span>
              <span className="font-semibold text-blue-700">{formatCurrency(stats.bankCollected)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
                💰 משרד
              </span>
              <span className="font-semibold text-green-700">{formatCurrency(stats.officeCollected)}</span>
            </div>
            {(stats.bankPending > 0 || stats.bankReturned > 0) && (
              <>
                {stats.bankPending > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2 text-amber-700">
                      <span className="inline-block w-3 h-3 rounded-full bg-amber-400"></span>
                      ⏳ ממתינים בבנק (status=1)
                    </span>
                    <span className="font-semibold text-amber-700">{formatCurrency(stats.bankPending)}</span>
                  </div>
                )}
                {stats.bankReturned > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2 text-red-700">
                      <span className="inline-block w-3 h-3 rounded-full bg-red-500"></span>
                      ↩ חזרות בנק (status=3)
                    </span>
                    <span className="font-semibold text-red-700">{formatCurrency(stats.bankReturned)}</span>
                  </div>
                )}
              </>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-gray-200">
              <span className="font-bold">נגבה סה&quot;כ:</span>
              <span className="font-bold text-lg" style={{ color }}>{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">{isCurrent ? 'נותר:' : 'לא נגבה:'}</span>
              <span className="text-gray-700 font-semibold">{formatCurrency(Math.max(0, stats.target - total))}</span>
            </div>
            <div className="text-end">
              <Link href="/finances/uncollected" className="text-xs text-blue-600 hover:text-blue-800 hover:underline">
                🔎 פירוט: מה עוד לא נגבה ←
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
