'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useScholarships } from '@/hooks/useScholarships';
import { ScholarshipBatch } from '@/lib/types';
import { ScholarshipTabProps, ScholarshipTabId, SectionCard, EmptyState, ils, dmy } from './shared';
import { WorkflowStatus } from './workflow';

// "סקירה": what is waiting at each of the three work steps (קליטה → הפקה → סימון תשלום),
// then per-type totals (charged / paid / open), recent batches and recent report runs.

type Totals = { charged: number; paid: number; balance: number };

function Bar({ paid, total }: { paid: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  return (
    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden" title={`${pct}% שולם`}>
      <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-orange-400 to-emerald-500'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StepCard({ step, title, tone, children, action }: {
  step: number; title: string; tone: 'todo' | 'done'; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className={`bg-white rounded-2xl border elevation-1 p-4 flex flex-col gap-2 ${tone === 'todo' ? 'border-orange-200' : 'border-slate-200/70'}`}>
      <div className="flex items-center gap-2">
        <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${tone === 'todo' ? 'bg-gradient-to-br from-orange-500 to-red-600 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
          {tone === 'todo' ? step : '✓'}
        </span>
        <h3 className="font-bold text-slate-800" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>{title}</h3>
      </div>
      <div className="flex-1 space-y-1.5 text-sm">{children}</div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

export function OverviewTab({ nav, perms, status, loading: statusLoading }: ScholarshipTabProps & { status: WorkflowStatus; loading: boolean }) {
  const sch = useScholarships();
  const [byType, setByType] = useState<Record<string, Totals>>({});
  const [batches, setBatches] = useState<ScholarshipBatch[]>([]);
  const [stats, setStats] = useState<Record<string, { students: number; total: number; paid: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [bal, b] = await Promise.all([sch.getBalances(), sch.listBatches({ limit: 8 })]);
        const agg: Record<string, Totals> = {};
        for (const x of bal) {
          const a = (agg[x.type_id] ||= { charged: 0, paid: 0, balance: 0 });
          a.charged += x.total_charged; a.paid += x.total_paid; a.balance += x.balance;
        }
        setByType(agg);
        setBatches(b);
        setStats(await sch.batchStats(b.map((x) => x.id)));
      } catch (e: any) { alert('שגיאה בטעינה: ' + e.message); }
      setLoading(false);
    })();
  }, [sch]);

  const types = status.types;
  const typeName = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);
  const shownTypes = types.filter((t) => t.is_active || byType[t.id]);
  const all = Object.values(byType).reduce((s, a) => ({ charged: s.charged + a.charged, paid: s.paid + a.paid, balance: s.balance + a.balance }), { charged: 0, paid: 0, balance: 0 });

  if (loading || statusLoading) return <SectionCard><div className="py-10 text-center text-slate-400">טוען…</div></SectionCard>;

  const link = 'text-sm font-semibold text-orange-700 hover:underline';
  const go = (t: ScholarshipTabId, label: string, p?: Record<string, string>) => (
    <button type="button" className={link} onClick={() => nav(t, p)}>{label} ←</button>
  );
  const intakeTodo = status.pendingCalls > 0 || status.unmatchedIds > 0;
  const awaiting = status.runs.filter((r) => r.openEntries > 0);

  return (
    <div className="space-y-4">
      {/* what is waiting, by work step */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <StepCard step={1} title="קליטת זכאויות" tone={intakeTodo ? 'todo' : 'done'}
          action={perms.canWrite ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {go('yemot', '📞 יבוא ימות')}
              {go('manual', '⌨️ הזנה ידנית')}
              {go('onetime', '💳 חד פעמי')}
            </div>
          ) : undefined}>
          {status.pendingCalls > 0 && <div>📞 <b>{status.pendingCalls}</b> שיחות ימות ממתינות לחיוב</div>}
          {status.unmatchedIds > 0 && (
            <button type="button" className="block text-start text-red-700 hover:underline" onClick={() => nav('unmatched')}>
              ❓ <b>{status.unmatchedIds}</b> ת״ז לא מזוהות — לשיוך
            </button>
          )}
          {!intakeTodo && <div className="text-slate-500">אין שיחות או ת״ז שמחכות לטיפול.</div>}
        </StepCard>

        <StepCard step={2} title="הפקה לתשלום" tone={status.notInRun.entries > 0 ? 'todo' : 'done'}
          action={perms.canReport && status.notInRun.entries > 0 ? go('report', '🖨️ הפק דוח לתשלום') : undefined}>
          {status.notInRun.entries > 0 ? (
            <>
              <div><b>{status.notInRun.students}</b> תלמידים · <b className="text-orange-700">{ils(status.notInRun.total)}</b></div>
              <div className="text-slate-500">זכאויות פתוחות שעוד לא נכנסו לאף הפקה.</div>
              {status.oneTimeOpen.entries > 0 && <div className="text-xs text-slate-500">כולל {status.oneTimeOpen.entries} חד פעמיים ({ils(status.oneTimeOpen.total)}) — מופקים מלשונית &quot;חד פעמיים&quot;.</div>}
            </>
          ) : <div className="text-slate-500">כל הזכאויות הפתוחות כבר נמצאות בהפקה.</div>}
        </StepCard>

        <StepCard step={3} title="סימון תשלום" tone={awaiting.length > 0 ? 'todo' : 'done'}>
          {awaiting.length === 0 ? <div className="text-slate-500">כל ההפקות סומנו כשולמו.</div> : (
            <>
              {awaiting.slice(0, 4).map((r) => (
                <button key={r.run.id} type="button" disabled={!perms.canWrite} onClick={() => nav('payment', { run: r.run.id })}
                  className="block w-full text-start rounded-lg px-2 py-1 -mx-2 hover:bg-orange-50 disabled:hover:bg-transparent">
                  <div className="font-medium truncate">{r.run.title}</div>
                  <div className="text-xs text-slate-500 mb-1">נותרו <b className="text-slate-700">{r.openStudents}</b> צ׳קים · {ils(r.openTotal)} · {dmy(r.run.created_at)}</div>
                  <Bar paid={r.entries - r.openEntries} total={r.entries} />
                </button>
              ))}
              {awaiting.length > 4 && <div className="text-xs text-slate-500">ועוד {awaiting.length - 4} הפקות פתוחות</div>}
            </>
          )}
        </StepCard>
      </div>

      {/* totals per type */}
      <SectionCard title="מצב לפי סוג מלגה"
        actions={perms.canReport ? <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => nav('analysis')}>📈 דוחות ופילוחים ←</button> : undefined}>
        {shownTypes.length === 0 ? <EmptyState icon="🏷️" text="אין סוגי מלגות עדיין" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                  <th className="text-start px-2 py-1.5">סוג</th>
                  <th className="text-start px-2 py-1.5">חויב</th>
                  <th className="text-start px-2 py-1.5">שולם</th>
                  <th className="text-start px-2 py-1.5">פתוח</th>
                  <th className="px-2 py-1.5 w-1/4"></th>
                </tr>
              </thead>
              <tbody>
                {shownTypes.map((t) => {
                  const a = byType[t.id] || { charged: 0, paid: 0, balance: 0 };
                  return (
                    <tr key={t.id} className="border-b border-slate-50">
                      <td className="px-2 py-1.5 font-medium">{t.name} <span className="text-[11px] text-slate-400">{t.kind === 'one_time' ? '💳' : t.source === 'yemot' ? '📞 ימות' : '⌨️ ידני'}</span></td>
                      <td className="px-2 py-1.5 tabular-nums">{ils(a.charged)}</td>
                      <td className="px-2 py-1.5 tabular-nums text-emerald-700">{ils(a.paid)}</td>
                      <td className="px-2 py-1.5 tabular-nums text-orange-700 font-semibold">{a.balance ? ils(a.balance) : '—'}</td>
                      <td className="px-2 py-1.5"><Bar paid={a.paid} total={a.charged} /></td>
                    </tr>
                  );
                })}
                <tr className="font-bold bg-slate-50">
                  <td className="px-2 py-1.5">סה״כ</td>
                  <td className="px-2 py-1.5 tabular-nums">{ils(all.charged)}</td>
                  <td className="px-2 py-1.5 tabular-nums text-emerald-700">{ils(all.paid)}</td>
                  <td className="px-2 py-1.5 tabular-nums text-orange-700">{ils(all.balance)}</td>
                  <td className="px-2 py-1.5"><Bar paid={all.paid} total={all.charged} /></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

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
          {status.runs.length === 0 ? <EmptyState icon="🖨️" text="אין הפקות עדיין" /> : (
            <div className="divide-y divide-slate-100">
              {status.runs.slice(0, 8).map((r) => {
                const done = r.openEntries === 0;
                return (
                  <div key={r.run.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.run.title}</div>
                      <div className="text-xs text-slate-500">{new Date(r.run.created_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}{r.run.created_by ? ` · ${r.run.created_by}` : ''} · {r.entries} זכאויות</div>
                    </div>
                    {done
                      ? <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800 whitespace-nowrap">✓ שולם</span>
                      : perms.canWrite
                        ? <button type="button" className="text-xs text-orange-700 font-semibold hover:underline whitespace-nowrap" onClick={() => nav('payment', { run: r.run.id })}>נותרו {r.openStudents} צ׳קים ←</button>
                        : <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 whitespace-nowrap">נותרו {r.openStudents}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
