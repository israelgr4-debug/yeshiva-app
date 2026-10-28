'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useScholarships, OneTimeItem } from '@/hooks/useScholarships';
import { ScholarshipType } from '@/lib/types';
import {
  ScholarshipTabProps, SectionCard, EmptyState, ils, dmy, todayIso,
  StudentLite, fetchStudentsLite, shiurLabel, StudentSearchBox,
} from './shared';

// "תשלומים חד פעמיים": a running list — names are added by hand from time to time (and
// "צ׳ק חלופי" rows from cancelled checks land here automatically). When it's time to pay,
// "הפק לתשלום" opens the report for all open items; payment is marked as usual.

export function OneTimeTab({ perms, nav }: ScholarshipTabProps) {
  const sch = useScholarships();
  const [type, setType] = useState<ScholarshipType | null>(null);
  const [items, setItems] = useState<OneTimeItem[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPaid, setShowPaid] = useState(false);

  // add form
  const [student, setStudent] = useState<StudentLite | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, list, studs] = await Promise.all([sch.getOneTimeType(), sch.listOneTime(), fetchStudentsLite()]);
      setType(t);
      setItems(list);
      setStudents(studs);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [sch]);
  useEffect(() => { load(); }, [load]);

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const open = items.filter((i) => !i.entry.payment_id);
  const openTotal = open.reduce((s, i) => s + i.entry.amount, 0);
  const shown = showPaid ? items : open;

  const add = async () => {
    if (!student) { searchRef.current?.focus(); return; }
    const n = Number(amount);
    if (!(n > 0)) { amountRef.current?.focus(); return; }
    setBusy(true);
    try {
      await sch.addOneTime({ studentId: student.id, amount: n, description: description.trim() || 'תשלום חד פעמי', date });
      setStudent(null); setAmount('');
      await load();
      setTimeout(() => searchRef.current?.focus(), 0);
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  const remove = async (it: OneTimeItem) => {
    const s = byId.get(it.entry.student_id);
    if (!confirm(`להסיר את ${s ? `${s.first_name} ${s.last_name}` : 'התלמיד'} מהרשימה (${ils(it.entry.amount)})?`)) return;
    try { await sch.deleteOneTime(it.entry); await load(); } catch (e: any) { alert(e.message); }
  };

  if (loading) return <SectionCard><div className="py-8 text-center text-slate-400">טוען…</div></SectionCard>;
  if (error) return <SectionCard><EmptyState icon="⚠️" text={error} /></SectionCard>;

  const input = 'px-2 py-1.5 border border-slate-300 rounded-lg text-sm';
  return (
    <div className="space-y-4">
      <SectionCard title="💳 תשלומים חד פעמיים"
        actions={perms.canReport && open.length > 0 && type ? (
          <Button size="sm" onClick={() => nav('report', { type: type.id, all: '1' })}>
            🖨️ הפק לתשלום ({open.length} צ׳קים · {ils(openTotal)})
          </Button>
        ) : undefined}>
        <div className="space-y-3">
          {perms.canWrite && (
            <div className="p-3 rounded-xl bg-orange-50/60 border border-orange-200 space-y-2">
              <div className="text-sm font-semibold text-slate-700">➕ הוספה לרשימה</div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-64">
                  {student ? (
                    <div className="flex items-center justify-between bg-white rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
                      <span><b>{student.last_name}</b> {student.first_name} <span className="text-xs text-slate-500">· {shiurLabel(student)}</span></span>
                      <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => { setStudent(null); setTimeout(() => searchRef.current?.focus(), 0); }}>החלף</button>
                    </div>
                  ) : (
                    <StudentSearchBox students={students} inputRef={searchRef}
                      onPick={(s) => { setStudent(s); setTimeout(() => amountRef.current?.focus(), 0); }} />
                  )}
                </div>
                <input ref={amountRef} value={amount} inputMode="numeric" dir="ltr" placeholder="סכום ₪"
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') add(); }} className={`${input} w-28`} />
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="תיאור (לא חובה)"
                  onKeyDown={(e) => { if (e.key === 'Enter') add(); }} className={`${input} flex-1 min-w-[160px]`} />
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
                <Button size="sm" onClick={add} disabled={busy}>{busy ? '…' : 'הוסף'}</Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span><b>{open.length}</b> פתוחים · <b className="text-orange-700">{ils(openTotal)}</b></span>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} /> הצג גם ששולמו</label>
          </div>

          {shown.length === 0 ? (
            <EmptyState icon="💳" text={showPaid ? 'הרשימה ריקה' : 'אין תשלומים פתוחים'} hint={perms.canWrite ? 'הוסף תלמיד למעלה, או סמן "צ׳ק בוטל" בכרטיס תלמיד' : undefined} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                    <th className="text-start px-3 py-2">תאריך</th>
                    <th className="text-start px-3 py-2">תלמיד</th>
                    <th className="text-start px-3 py-2">תיאור</th>
                    <th className="text-start px-3 py-2">סכום</th>
                    <th className="text-start px-3 py-2">מצב</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((it) => {
                    const s = byId.get(it.entry.student_id);
                    const paid = !!it.entry.payment_id;
                    return (
                      <tr key={it.entry.id} className="border-b border-slate-50 hover:bg-blue-50/40">
                        <td className="px-3 py-2 tabular-nums">{dmy(it.entry.entry_date)}</td>
                        <td className="px-3 py-2">
                          {s ? <Link href={`/students/${s.id}`} className="text-blue-700 hover:underline font-medium">{s.last_name} {s.first_name}</Link> : '—'}
                          {s && <span className="text-xs text-slate-500"> · {shiurLabel(s)}</span>}
                        </td>
                        <td className="px-3 py-2">
                          {it.batch.title}
                          {it.entry.notes && <div className="text-[11px] text-slate-500">{it.entry.notes}</div>}
                        </td>
                        <td className="px-3 py-2 tabular-nums font-semibold">{ils(it.entry.amount)}</td>
                        <td className="px-3 py-2">
                          {paid
                            ? <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800">שולם {it.payment ? dmy(it.payment.paid_at) : ''}</span>
                            : <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">פתוח</span>}
                        </td>
                        <td className="px-3 py-2 text-end">
                          {perms.canWrite && !paid && (
                            <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => remove(it)}>הסר</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-slate-400">אחרי ההפקה, מסמנים את התשלום בלשונית "סימון תשלום" כרגיל. צ׳ק שבוטל ונבחר להעבירו לכאן מופיע כ"צ׳ק חלופי".</p>
        </div>
      </SectionCard>
    </div>
  );
}
