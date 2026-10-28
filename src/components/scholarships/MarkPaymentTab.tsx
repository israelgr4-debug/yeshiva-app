'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useScholarships } from '@/hooks/useScholarships';
import { ScholarshipPayment, ScholarshipRun } from '@/lib/types';
import { buildScholarshipReport, ScholarshipReport, ReportRow } from '@/lib/scholarship-report';
import { CancelCheckDialog } from './CancelCheckDialog';
import { ScholarshipTabProps, SectionCard, EmptyState, ils, dmy, todayIso, fetchStudentsLite, StudentLite } from './shared';

// "סימון תשלום": open a saved report run, tick the cells that were paid, save with a date.
// One scholarship_payments row per student; payment_id is set on each ticked entry.

const cellKey = (studentId: string, typeId: string) => `${studentId}|${typeId}`;

export function MarkPaymentTab({ perms, params, nav }: ScholarshipTabProps) {
  const sch = useScholarships();
  const [runs, setRuns] = useState<ScholarshipRun[]>([]);
  const [runId, setRunId] = useState(params.run || '');
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ScholarshipReport | null>(null);
  const [payments, setPayments] = useState<Map<string, ScholarshipPayment>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paidAt, setPaidAt] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [focus, setFocus] = useState<{ r: number; c: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sch.listRuns(100).then((r) => {
      setRuns(r);
      if (!params.run && r[0]) setRunId(r[0].id);
    }).catch((e) => alert('שגיאה: ' + e.message));
  }, [sch, params.run]);

  const loadRun = useCallback(async (id: string) => {
    if (!id) { setReport(null); return; }
    setLoading(true);
    setSelected(new Set());
    try {
      const run = await sch.getRun(id);
      if (!run) { setReport(null); setLoading(false); return; }
      const [entries, types] = await Promise.all([sch.fetchEntriesByIds(run.entry_ids || []), sch.listTypes(true)]);
      const studs = await fetchStudentsLite({ ids: Array.from(new Set(entries.map((e) => e.student_id))) });
      const smap = new Map<string, StudentLite>(studs.map((s) => [s.id, s]));
      const payIds = Array.from(new Set(entries.map((e) => e.payment_id).filter(Boolean))) as string[];
      const pays = payIds.length ? await sch.fetchPayments({ ids: payIds }) : [];
      setPayments(new Map(pays.map((p) => [p.id, p])));
      setReport(buildScholarshipReport(entries, smap, types));
    } catch (e: any) { alert('שגיאה בטעינה: ' + e.message); }
    setLoading(false);
  }, [sch]);
  useEffect(() => { loadRun(runId); }, [runId, loadRun]);

  // flat list of rows (across groups) for keyboard navigation
  const flatRows = useMemo(() => (report ? report.groups.flatMap((g) => g.rows) : []), [report]);
  const rowById = useMemo(() => new Map(flatRows.map((r) => [r.student.id, r])), [flatRows]);
  const cols = report?.columns || [];

  const openOf = (row: ReportRow, typeId: string) => row.cells[typeId]?.entries.filter((e) => !e.payment_id) || [];
  const selectable = (row: ReportRow, typeId: string) => openOf(row, typeId).length > 0;

  const setKeys = (keys: string[], on?: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = keys.every((k) => next.has(k));
      const turnOn = on ?? !allOn;
      for (const k of keys) { if (turnOn) next.add(k); else next.delete(k); }
      return next;
    });
  };
  const rowKeys = (row: ReportRow) => cols.filter((c) => selectable(row, c.id)).map((c) => cellKey(row.student.id, c.id));
  const colKeys = (typeId: string) => flatRows.filter((r) => selectable(r, typeId)).map((r) => cellKey(r.student.id, typeId));
  const groupKeys = (rows: ReportRow[]) => rows.flatMap(rowKeys);
  const allKeys = () => flatRows.flatMap(rowKeys);

  const focusedRow = focus ? flatRows[focus.r] : null;
  const focusedGroup = focusedRow && report ? report.groups.find((g) => g.rows.includes(focusedRow)) : null;

  const summary = useMemo(() => {
    let amount = 0;
    const studs = new Set<string>();
    for (const k of selected) {
      const [sid, tid] = k.split('|');
      const row = rowById.get(sid);
      if (!row) continue;
      const open = openOf(row, tid);
      if (open.length) { studs.add(sid); amount += open.reduce((s, e) => s + Number(e.amount), 0); }
    }
    return { students: studs.size, amount };
  }, [selected, rowById]); // eslint-disable-line react-hooks/exhaustive-deps

  const onCellKey = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    const dirs: Record<string, [number, number]> = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, 1], ArrowRight: [0, -1] }; // RTL
    const d = dirs[e.key];
    if (!d) return;
    e.preventDefault();
    let nr = r + d[0], nc = c + d[1];
    while (nr >= 0 && nr < flatRows.length && nc >= 0 && nc < cols.length) {
      const el = document.querySelector<HTMLInputElement>(`[data-cell="${nr}:${nc}"]`);
      if (el) { el.focus(); return; }
      nr += d[0]; nc += d[1];
    }
  };

  const save = async () => {
    const entryIds: string[] = [];
    for (const k of selected) {
      const [sid, tid] = k.split('|');
      const row = rowById.get(sid);
      if (row) entryIds.push(...openOf(row, tid).map((e) => e.id));
    }
    if (!entryIds.length) { alert('לא סומנו תאים'); return; }
    if (!paidAt) { alert('בחר תאריך תשלום'); return; }
    if (!confirm(`לסמן כשולם בתאריך ${dmy(paidAt)}?\n${summary.students} תלמידים · ${ils(summary.amount)}`)) return;
    setSaving(true);
    try {
      const r = await sch.markPaid({ entryIds, paidAt, notes, runId });
      alert(`✓ נשמר: ${r.payments} תשלומים · ${r.entries} זכאויות · ${ils(r.total)}`);
      setNotes('');
      await loadRun(runId);
    } catch (e: any) { alert('שגיאה בשמירה: ' + e.message); }
    setSaving(false);
  };

  const [cancelling, setCancelling] = useState<{ payment: ScholarshipPayment; name: string } | null>(null);

  const cancelPayment = async (p: ScholarshipPayment, name: string) => {
    if (!confirm(`למחוק את רישום התשלום של ${name} מ-${dmy(p.paid_at)} (${ils(p.amount)})?\nרק כשהתשלום סומן בטעות. לצ׳ק שאבד / נקרע / לא עבר — "צ׳ק בוטל".`)) return;
    try { await sch.cancelPayment(p.id); await loadRun(runId); } catch (e: any) { alert(e.message); }
  };

  if (!perms.canWrite) {
    return <SectionCard><EmptyState icon="🔒" text="סימון תשלום — למזכירות ולמנהל מערכת" /></SectionCard>;
  }

  const input = 'px-2 py-1.5 border border-slate-300 rounded-lg text-sm';
  let rIndex = -1;

  return (
    <div className="space-y-4">
      {cancelling && (
        <CancelCheckDialog payment={cancelling.payment} studentName={cancelling.name} onClose={() => setCancelling(null)}
          onDone={(msg) => { setCancelling(null); alert(msg); loadRun(runId); }} />
      )}
      <SectionCard title="סימון תשלום לפי הפקה">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-600 flex flex-col flex-1 min-w-[260px]">הפקה
            <select className={input} value={runId} onChange={(e) => setRunId(e.target.value)}>
              {runs.length === 0 && <option value="">אין הפקות — הפק דוח בלשונית &quot;דוח והדפסה&quot;</option>}
              {runs.map((r) => (
                <option key={r.id} value={r.id}>{r.title} · {new Date(r.created_at).toLocaleDateString('he-IL')} · {r.entry_ids?.length || 0} זכאויות</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-600 flex flex-col">תאריך תשלום
            <input type="date" className={input} value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </label>
          <label className="text-xs text-slate-600 flex flex-col flex-1 min-w-[180px]">הערה
            <input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="לא חובה" />
          </label>
        </div>
        {runs.length === 0 && (
          <div className="mt-3"><Button size="sm" variant="secondary" onClick={() => nav('report')}>🖨️ לדוח והדפסה ←</Button></div>
        )}
      </SectionCard>

      {loading ? (
        <SectionCard><div className="py-10 text-center text-slate-400">טוען…</div></SectionCard>
      ) : report && report.studentCount > 0 ? (
        <SectionCard
          title={`${report.studentCount} תלמידים · ${ils(report.total)}`}
          actions={<>
            <Button size="sm" variant="secondary" disabled={!focusedRow} onClick={() => focusedRow && setKeys(rowKeys(focusedRow))}>סמן שורה</Button>
            <Button size="sm" variant="secondary" disabled={!focus} onClick={() => focus && cols[focus.c] && setKeys(colKeys(cols[focus.c].id))}>סמן עמודה</Button>
            <Button size="sm" variant="secondary" disabled={!focusedGroup} onClick={() => focusedGroup && setKeys(groupKeys(focusedGroup.rows))}>סמן שיעור</Button>
            <Button size="sm" variant="secondary" onClick={() => setKeys(allKeys())}>סמן הכל</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>נקה סימון</Button>
          </>}
        >
          <div className="border border-slate-200 rounded-xl overflow-auto max-h-[65vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="text-start px-3 py-2">שם משפחה</th>
                  <th className="text-start px-3 py-2">שם פרטי</th>
                  <th className="text-start px-3 py-2">ת״ז</th>
                  {cols.map((c) => (
                    <th key={c.id} className="px-3 py-2 text-center">
                      <button type="button" className="hover:underline" title="סמן / בטל עמודה" onClick={() => setKeys(colKeys(c.id))}>{c.name}</button>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-center">סה״כ</th>
                </tr>
              </thead>
              <tbody>
                {report.groups.map((g) => (
                  <React.Fragment key={g.name}>
                    <tr className="bg-orange-50/70">
                      <td colSpan={cols.length + 4} className="px-3 py-1.5 font-bold text-orange-900">
                        <button type="button" className="hover:underline" title="סמן / בטל שיעור" onClick={() => setKeys(groupKeys(g.rows))}>{g.name}</button>
                        <span className="text-xs font-normal text-slate-500 ms-2">{g.rows.length} תלמידים · {ils(g.total)}</span>
                      </td>
                    </tr>
                    {g.rows.map((row) => {
                      rIndex++;
                      const r = rIndex;
                      return (
                        <tr key={row.student.id} className={`border-b border-slate-50 ${focus?.r === r ? 'bg-blue-50/60' : ''}`}>
                          <td className="px-3 py-1">
                            <button type="button" className="hover:underline text-start" title="סמן / בטל שורה" onClick={() => setKeys(rowKeys(row))}>{row.student.last_name}</button>
                          </td>
                          <td className="px-3 py-1">{row.student.first_name}</td>
                          <td className="px-3 py-1 tabular-nums text-slate-500" dir="ltr">{row.student.id_number || row.student.passport_number || ''}</td>
                          {cols.map((c, ci) => {
                            const cell = row.cells[c.id];
                            if (!cell) return <td key={c.id} className="px-3 py-1" />;
                            const open = openOf(row, c.id);
                            const paidPays = Array.from(new Set(cell.entries.filter((e) => e.payment_id).map((e) => e.payment_id!)))
                              .map((id) => payments.get(id)).filter(Boolean) as ScholarshipPayment[];
                            const k = cellKey(row.student.id, c.id);
                            return (
                              <td key={c.id} className={`px-2 py-1 text-center tabular-nums ${open.length === 0 ? 'bg-emerald-50 text-emerald-800' : selected.has(k) ? 'bg-orange-100' : ''}`}>
                                {open.length > 0 ? (
                                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                    <input type="checkbox" data-cell={`${r}:${ci}`} checked={selected.has(k)}
                                      onChange={() => setKeys([k])}
                                      onFocus={() => setFocus({ r, c: ci })}
                                      onKeyDown={(e) => onCellKey(e, r, ci)} />
                                    {ils(open.reduce((s, e) => s + Number(e.amount), 0))}
                                  </label>
                                ) : null}
                                {paidPays.map((p) => (
                                  <div key={p.id} className="text-[11px] text-emerald-800 whitespace-nowrap">
                                    {p.status === 'transfer'
                                      ? <>↪ {ils(cell.entries.filter((e) => e.payment_id === p.id).reduce((s, e) => s + Number(e.amount), 0))} · הועבר לחד פעמי</>
                                      : <>🔒 {ils(cell.entries.filter((e) => e.payment_id === p.id).reduce((s, e) => s + Number(e.amount), 0))} · {dmy(p.paid_at)}</>}
                                    {(p.status || 'paid') === 'paid' && (
                                      <button type="button" title="צ׳ק אבד / נקרע / לא עבר בבנק" className="text-red-600 hover:underline ms-1"
                                        onClick={() => setCancelling({ payment: p, name: `${row.student.first_name} ${row.student.last_name}` })}>צ׳ק בוטל</button>
                                    )}
                                    {perms.canAdmin && (p.status || 'paid') === 'paid' && (
                                      <button type="button" title="מחיקת התשלום — רק כשסומן בטעות (מנהל מערכת)" className="text-slate-400 hover:text-red-600 hover:underline ms-1"
                                        onClick={() => cancelPayment(p, `${row.student.first_name} ${row.student.last_name}`)}>מחק</button>
                                    )}
                                  </div>
                                ))}
                              </td>
                            );
                          })}
                          <td className="px-3 py-1 text-center tabular-nums font-semibold">{ils(row.total)}</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sticky bottom-0 z-20 -mx-4 -mb-4 mt-3 px-4 py-3 bg-white/95 backdrop-blur border-t border-slate-200 rounded-b-2xl flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">מסומן: <b>{summary.students}</b> תלמידים · <b className="text-orange-700">{ils(summary.amount)}</b> · תאריך {dmy(paidAt)}</span>
            <span className="text-[11px] text-slate-400 hidden md:inline">חצים בין התאים · רווח מסמן · לחיצה על שם / עמודה / שיעור מסמנת את כולם</span>
            <Button onClick={save} disabled={saving || summary.students === 0}>{saving ? 'שומר…' : '💾 שמור תשלום'}</Button>
          </div>
        </SectionCard>
      ) : runId ? (
        <SectionCard><EmptyState icon="📭" text="אין זכאויות בהפקה הזו" /></SectionCard>
      ) : null}
    </div>
  );
}
