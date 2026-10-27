'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useScholarships } from '@/hooks/useScholarships';
import { ScholarshipBatch, ScholarshipRun, ScholarshipType } from '@/lib/types';
import { ScholarshipTabProps, SectionCard, EmptyState, ils, dmy } from './shared';

// "סקירה": per-type totals (charged / paid / open), recent batches, recent report runs.

export function OverviewTab({ nav, perms }: ScholarshipTabProps) {
  const sch = useScholarships();
  const [types, setTypes] = useState<ScholarshipType[]>([]);
  const [byType, setByType] = useState<Record<string, { charged: number; paid: number; balance: number }>>({});
  const [batches, setBatches] = useState<ScholarshipBatch[]>([]);
  const [stats, setStats] = useState<Record<string, { students: number; total: number; paid: number }>>({});
  const [runs, setRuns] = useState<ScholarshipRun[]>([]);
  const [pendingCalls, setPendingCalls] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [t, bal, b, r, pend] = await Promise.all([
          sch.listTypes(true), sch.getBalances(), sch.listBatches({ limit: 10 }), sch.listRuns(8),
          supabase.from('scholarship_yemot_calls').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        ]);
        const agg: Record<string, { charged: number; paid: number; balance: number }> = {};
        for (const x of bal) {
          const a = (agg[x.type_id] ||= { charged: 0, paid: 0, balance: 0 });
          a.charged += x.total_charged; a.paid += x.total_paid; a.balance += x.balance;
        }
        setTypes(t);
        setByType(agg);
        setBatches(b);
        setRuns(r);
        setPendingCalls(pend.count || 0);
        setStats(await sch.batchStats(b.map((x) => x.id)));
      } catch (e: any) { alert('שגיאה בטעינה: ' + e.message); }
      setLoading(false);
    })();
  }, [sch]);

  const typeName = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);
  const shownTypes = types.filter((t) => t.is_active || byType[t.id]);

  if (loading) return <SectionCard><div className="py-10 text-center text-slate-400">טוען…</div></SectionCard>;

  return (
    <div className="space-y-4">
      {pendingCalls > 0 && perms.canWrite && (
        <button type="button" onClick={() => nav('yemot')} className="w-full text-start bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-sm text-blue-900 hover:bg-blue-100">
          📞 <b>{pendingCalls}</b> שיחות ימות ממתינות לחיוב הבא ←
        </button>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shownTypes.map((t) => {
          const a = byType[t.id] || { charged: 0, paid: 0, balance: 0 };
          return (
            <div key={t.id} className="bg-white rounded-2xl border border-slate-200/70 elevation-1 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-slate-800" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>{t.name}</h3>
                <span className="text-xs text-slate-400">{t.source === 'yemot' ? '📞 ימות' : '⌨️ ידני'}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><div className="text-[11px] text-slate-500">חויב</div><div className="font-bold tabular-nums">{ils(a.charged)}</div></div>
                <div><div className="text-[11px] text-emerald-700">שולם</div><div className="font-bold tabular-nums text-emerald-700">{ils(a.paid)}</div></div>
                <div><div className="text-[11px] text-orange-700">יתרה</div><div className="font-bold tabular-nums text-orange-700">{ils(a.balance)}</div></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="חיובים תקופתיים אחרונים" actions={<button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => nav('manual')}>לכל החיובים ←</button>}>
          {batches.length === 0 ? <EmptyState icon="🎁" text="אין חיובים עדיין" /> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                  <th className="text-start px-2 py-1.5">כותרת</th>
                  <th className="text-start px-2 py-1.5">תאריך</th>
                  <th className="text-start px-2 py-1.5">תלמידים</th>
                  <th className="text-start px-2 py-1.5">סה״כ</th>
                  <th className="text-start px-2 py-1.5">שולם</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const st = stats[b.id] || { students: 0, total: 0, paid: 0 };
                  return (
                    <tr key={b.id} onClick={() => nav('manual', { batch: b.id })} className="border-b border-slate-50 hover:bg-blue-50/40 cursor-pointer">
                      <td className="px-2 py-1.5 font-medium text-blue-700">{b.title} <span className="text-[11px] text-slate-400">{typeName.get(b.type_id)}</span></td>
                      <td className="px-2 py-1.5 tabular-nums">{dmy(b.entry_date)}</td>
                      <td className="px-2 py-1.5 tabular-nums">{st.students}</td>
                      <td className="px-2 py-1.5 tabular-nums">{ils(st.total)}</td>
                      <td className="px-2 py-1.5 tabular-nums">{st.paid ? <span className={st.paid >= st.total ? 'text-emerald-700' : 'text-amber-700'}>{ils(st.paid)}</span> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </SectionCard>

        <SectionCard title="הפקות אחרונות" accent="from-blue-500 to-indigo-600" actions={perms.canReport ? <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => nav('report')}>הפקה חדשה ←</button> : undefined}>
          {runs.length === 0 ? <EmptyState icon="🖨️" text="אין הפקות עדיין" /> : (
            <div className="divide-y divide-slate-100">
              {runs.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <div>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-slate-500">{new Date(r.created_at).toLocaleString('he-IL')}{r.created_by ? ` · ${r.created_by}` : ''} · {r.entry_ids?.length || 0} זכאויות</div>
                  </div>
                  {perms.canWrite && <button type="button" className="text-xs text-blue-600 hover:underline whitespace-nowrap" onClick={() => nav('payment', { run: r.id })}>סימון תשלום ←</button>}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
