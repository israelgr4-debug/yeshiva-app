'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useScholarships, AnalysisEntry } from '@/hooks/useScholarships';
import { ScholarshipBatch, ScholarshipType } from '@/lib/types';
import { SHIURIM } from '@/lib/shiurim';
import {
  ScholarshipTabProps, SectionCard, EmptyState, ils, dmy, todayIso,
  StudentLite, fetchStudentsLite, ShiurPicker, matchesShiurSelection, shiurGroup, compareStudents, matchesSearch,
} from './shared';

// "דוחות": how much was charged / paid / is still open, broken down by type, shiur, month,
// batch or student — optionally as a cross table. Read only: nothing is saved, no run is
// created, no payment is touched. ("הפקה לתשלום" is the report that prints checks.)

type Basis = 'entry' | 'paid';
type RowDim = 'type' | 'shiur' | 'month' | 'batch' | 'student';
type ColDim = 'none' | 'type' | 'shiur' | 'month';
type Measure = 'charged' | 'paid' | 'open';
type StateFilter = 'all' | 'paid' | 'open';

const ROW_DIMS: { id: RowDim; label: string }[] = [
  { id: 'type', label: 'סוג מלגה' }, { id: 'shiur', label: 'שיעור' }, { id: 'month', label: 'חודש' },
  { id: 'batch', label: 'חיוב תקופתי' }, { id: 'student', label: 'תלמיד' },
];
const COL_DIMS: { id: ColDim; label: string }[] = [
  { id: 'none', label: 'ללא' }, { id: 'type', label: 'סוג מלגה' }, { id: 'shiur', label: 'שיעור' }, { id: 'month', label: 'חודש' },
];
const MEASURES: { id: Measure; label: string }[] = [{ id: 'charged', label: 'חויב' }, { id: 'paid', label: 'שולם' }, { id: 'open', label: 'פתוח' }];

const SHIUR_RANK = new Map<string, number>([...SHIURIM.map((s, i) => [s.name, i] as [string, number]), ['כולל', 900], ['ללא שיעור', 950]]);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthLabel = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(0, 4)}`;

function presets(): { label: string; from: string; to: string }[] {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  // school year: from 1 September
  const sy = m >= 8 ? y : y - 1;
  return [
    { label: 'החודש', from: iso(new Date(y, m, 1)), to: todayIso() },
    { label: 'חודש קודם', from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    { label: '3 חודשים', from: iso(new Date(y, m - 2, 1)), to: todayIso() },
    { label: 'שנת הלימודים', from: `${sy}-09-01`, to: todayIso() },
    { label: 'הכל', from: '', to: '' },
  ];
}

interface Stat { entries: number; students: Set<string>; charged: number; paid: number; open: number }
const newStat = (): Stat => ({ entries: 0, students: new Set(), charged: 0, paid: 0, open: 0 });
function add(s: Stat, e: AnalysisEntry) {
  s.entries++; s.students.add(e.student_id); s.charged += e.amount;
  if (e.state === 'paid') s.paid += e.amount; else s.open += e.amount;
}
interface DimVal { key: string; label: string; sub?: string; rank: number | string }

export function AnalysisTab({ perms }: ScholarshipTabProps) {
  const sch = useScholarships();
  const P = useMemo(presets, []);
  const [basis, setBasis] = useState<Basis>('entry');
  const [from, setFrom] = useState(P[3].from);
  const [to, setTo] = useState(P[3].to);
  const [types, setTypes] = useState<ScholarshipType[]>([]);
  const [batches, setBatches] = useState<Map<string, ScholarshipBatch>>(new Map());
  const [students, setStudents] = useState<Map<string, StudentLite>>(new Map());
  const [entries, setEntries] = useState<AnalysisEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selTypes, setSelTypes] = useState<Set<string>>(new Set());
  const [shiurSel, setShiurSel] = useState<Set<string>>(new Set());
  const [instSel, setInstSel] = useState<Set<string>>(new Set());
  const [stateF, setStateF] = useState<StateFilter>('all');
  const [rowDim, setRowDim] = useState<RowDim>('type');
  const [colDim, setColDim] = useState<ColDim>('none');
  const [measure, setMeasure] = useState<Measure>('charged');
  const [byAmount, setByAmount] = useState(false);
  const [q, setQ] = useState('');

  // reference data once
  useEffect(() => {
    (async () => {
      try {
        const [t, b, s] = await Promise.all([sch.listTypes(true), sch.listBatches(), fetchStudentsLite()]);
        setTypes(t);
        setBatches(new Map(b.map((x) => [x.id, x])));
        setStudents(new Map(s.map((x) => [x.id, x])));
      } catch (e: any) { setError(e.message); }
    })();
  }, [sch]);

  // entitlements for the period (re-fetched only when the period / date basis changes)
  const reqId = useRef(0);
  useEffect(() => {
    if (!perms.canReport) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    sch.fetchAnalysisEntries({ basis, from: from || null, to: to || null })
      .then((rows) => { if (id === reqId.current) { setEntries(rows); setLoading(false); } })
      .catch((e) => { if (id === reqId.current) { setError(e.message); setLoading(false); } });
  }, [sch, basis, from, to, perms.canReport]);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const institutions = useMemo(() => Array.from(new Set(Array.from(students.values()).map((s) => s.institution_name).filter(Boolean) as string[])).sort(), [students]);
  const eff: Measure = basis === 'paid' ? 'paid' : measure;

  // filters → the rows the report is built from; checks re-issued as a one-time item are left out
  // (the money is counted on the one-time item, so it is never counted twice)
  const { rows, transfer } = useMemo(() => {
    const out: AnalysisEntry[] = [];
    const tr = { n: 0, sum: 0 };
    for (const e of entries || []) {
      const s = students.get(e.student_id);
      if (!s) continue;
      if (selTypes.size && !selTypes.has(e.type_id)) continue;
      if (!matchesShiurSelection(s, shiurSel)) continue;
      if (instSel.size && !(s.institution_name && instSel.has(s.institution_name))) continue;
      if (e.state === 'transfer') { tr.n++; tr.sum += e.amount; continue; }
      if (basis === 'entry' && stateF !== 'all' && e.state !== stateF) continue;
      out.push(e);
    }
    return { rows: out, transfer: tr };
  }, [entries, students, selTypes, shiurSel, instSel, stateF, basis]);

  const dimOf = useMemo(() => (dim: RowDim | ColDim, e: AnalysisEntry): DimVal => {
    const s = students.get(e.student_id)!;
    switch (dim) {
      case 'type': { const t = typeById.get(e.type_id); return { key: e.type_id, label: t?.name || '—', rank: t?.sort_order ?? 999 }; }
      case 'shiur': { const g = shiurGroup(s); return { key: g, label: g, rank: SHIUR_RANK.get(g) ?? 800 }; }
      case 'month': { const d = (basis === 'paid' ? e.paid_at : e.entry_date) || e.entry_date; const ym = d.slice(0, 7); return { key: ym, label: monthLabel(ym), rank: ym }; }
      case 'batch': {
        const t = typeById.get(e.type_id);
        if (t?.kind === 'one_time') return { key: 'one_time', label: t.name, sub: 'כל הפריטים החד פעמיים', rank: '0000' };
        const b = batches.get(e.batch_id);
        return { key: e.batch_id, label: b?.title || '—', sub: `${t?.name || ''} · ${dmy(b?.entry_date)}`, rank: b?.entry_date || '' };
      }
      case 'student': return { key: s.id, label: `${s.last_name || ''} ${s.first_name || ''}`.trim(), sub: shiurGroup(s), rank: 0 };
      default: return { key: 'all', label: '', rank: 0 };
    }
  }, [students, typeById, batches, basis]);

  const pivot = useMemo(() => {
    const rowMap = new Map<string, { dim: DimVal; stat: Stat; cells: Map<string, Stat> }>();
    const colMap = new Map<string, { dim: DimVal; stat: Stat }>();
    const total = newStat();
    for (const e of rows) {
      const rd = dimOf(rowDim, e);
      let r = rowMap.get(rd.key);
      if (!r) { r = { dim: rd, stat: newStat(), cells: new Map() }; rowMap.set(rd.key, r); }
      add(r.stat, e);
      add(total, e);
      if (colDim !== 'none') {
        const cd = dimOf(colDim, e);
        let c = colMap.get(cd.key);
        if (!c) { c = { dim: cd, stat: newStat() }; colMap.set(cd.key, c); }
        add(c.stat, e);
        let cell = r.cells.get(cd.key);
        if (!cell) { cell = newStat(); r.cells.set(cd.key, cell); }
        add(cell, e);
      }
    }
    const cmp = (a: DimVal, b: DimVal) => (typeof a.rank === 'number' && typeof b.rank === 'number'
      ? a.rank - b.rank : String(a.rank).localeCompare(String(b.rank))) || a.label.localeCompare(b.label, 'he');
    let rowList = Array.from(rowMap.values());
    if (byAmount) rowList.sort((a, b) => b.stat[eff] - a.stat[eff]);
    else if (rowDim === 'student') rowList.sort((a, b) => compareStudents(students.get(a.dim.key)!, students.get(b.dim.key)!));
    else if (rowDim === 'batch') rowList.sort((a, b) => String(b.dim.rank).localeCompare(String(a.dim.rank)));
    else rowList.sort((a, b) => cmp(a.dim, b.dim));
    if (rowDim === 'student' && q.trim()) rowList = rowList.filter((r) => matchesSearch(students.get(r.dim.key)!, q));
    const colList = Array.from(colMap.values()).sort((a, b) => cmp(a.dim, b.dim));
    return { rowList, colList, total };
  }, [rows, rowDim, colDim, dimOf, byAmount, eff, students, q]);

  if (!perms.canReport) return <SectionCard><EmptyState icon="🔒" text="אין הרשאה לדוחות" /></SectionCard>;

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v); else n.add(v);
    setter(n);
  };
  const chip = (on: boolean) => `px-3 py-1 rounded-full text-sm border ${on ? 'bg-orange-600 text-white border-orange-600' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`;
  const input = 'px-2 py-1.5 border border-slate-300 rounded-lg text-sm';
  const lbl = 'text-xs text-slate-500 me-1 w-20 shrink-0';

  const period = !from && !to ? 'כל התקופה' : `${from ? dmy(from) : 'מההתחלה'} – ${to ? dmy(to) : 'היום'}`;
  const rowLabel = ROW_DIMS.find((d) => d.id === rowDim)!.label;
  const colLabel = COL_DIMS.find((d) => d.id === colDim)!.label;
  const measureLabel = MEASURES.find((m) => m.id === eff)!.label;
  const title = `מלגות לפי ${rowLabel}${colDim !== 'none' ? ` × ${colLabel}` : ''}`;
  const subtitle = [
    `${basis === 'paid' ? 'לפי תאריך תשלום' : 'לפי תאריך חיוב'}: ${period}`,
    selTypes.size ? [...selTypes].map((id) => typeById.get(id)?.name).join(' + ') : null,
    shiurSel.size ? `שיעורים: ${[...shiurSel].map((s) => (s === '__kollel' ? 'כולל' : s)).join(', ')}` : null,
    instSel.size ? [...instSel].join(', ') : null,
    basis === 'entry' && stateF !== 'all' ? (stateF === 'paid' ? 'שולם בלבד' : 'פתוח בלבד') : null,
  ].filter(Boolean).join(' · ');
  const { rowList, colList, total } = pivot;
  const cross = colDim !== 'none';
  const pctPaid = total.charged > 0 ? Math.round((total.paid / total.charged) * 100) : 0;

  const exportXlsx = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    (wb as any).Workbook = { Views: [{ RTL: true }] };
    const head: (string | number)[][] = [[title], [subtitle], []];
    let table: (string | number)[][];
    if (cross) {
      table = [[rowLabel, ...colList.map((c) => c.dim.label), `סה"כ ${measureLabel}`]];
      for (const r of rowList) table.push([r.dim.label, ...colList.map((c) => r.cells.get(c.dim.key)?.[eff] || 0), r.stat[eff]]);
      table.push(['סה"כ', ...colList.map((c) => c.stat[eff]), total[eff]]);
    } else if (basis === 'paid') {
      table = [[rowLabel, ...(rowDim === 'student' || rowDim === 'batch' ? ['פרטים'] : []), 'זכאויות', 'תלמידים', 'שולם']];
      for (const r of rowList) table.push([r.dim.label, ...(rowDim === 'student' || rowDim === 'batch' ? [r.dim.sub || ''] : []), r.stat.entries, r.stat.students.size, r.stat.paid]);
      table.push(['סה"כ', ...(rowDim === 'student' || rowDim === 'batch' ? [''] : []), total.entries, total.students.size, total.paid]);
    } else {
      table = [[rowLabel, ...(rowDim === 'student' || rowDim === 'batch' ? ['פרטים'] : []), 'זכאויות', 'תלמידים', 'חויב', 'שולם', 'פתוח']];
      for (const r of rowList) table.push([r.dim.label, ...(rowDim === 'student' || rowDim === 'batch' ? [r.dim.sub || ''] : []), r.stat.entries, r.stat.students.size, r.stat.charged, r.stat.paid, r.stat.open]);
      table.push(['סה"כ', ...(rowDim === 'student' || rowDim === 'batch' ? [''] : []), total.entries, total.students.size, total.charged, total.paid, total.open]);
    }
    const ws1 = XLSX.utils.aoa_to_sheet([...head, ...table]);
    ws1['!cols'] = table[0].map((_, i) => ({ wch: i === 0 ? 26 : 13 }));
    XLSX.utils.book_append_sheet(wb, ws1, 'פילוח');

    const detail: (string | number)[][] = [['שיעור', 'שם משפחה', 'שם פרטי', 'סוג מלגה', 'חיוב תקופתי', 'תאריך חיוב', 'סכום', 'מצב', 'תאריך תשלום']];
    const sorted = [...rows].sort((a, b) => compareStudents(students.get(a.student_id)!, students.get(b.student_id)!) || a.entry_date.localeCompare(b.entry_date));
    for (const e of sorted) {
      const s = students.get(e.student_id)!;
      detail.push([shiurGroup(s), s.last_name || '', s.first_name || '', typeById.get(e.type_id)?.name || '', batches.get(e.batch_id)?.title || '',
        dmy(e.entry_date), e.amount, e.state === 'paid' ? 'שולם' : 'פתוח', dmy(e.paid_at)]);
    }
    const ws2 = XLSX.utils.aoa_to_sheet(detail);
    ws2['!cols'] = detail[0].map((_, i) => ({ wch: i === 4 ? 24 : 13 }));
    XLSX.utils.book_append_sheet(wb, ws2, 'פירוט זכאויות');
    XLSX.writeFile(wb, `${title} ${period}.xlsx`.replace(/[\\/:*?"<>|]/g, '-'));
  };

  const th = 'border border-slate-300 px-2 py-1.5 bg-slate-100 font-bold text-xs';
  const td = 'border border-slate-200 px-2 py-1';
  const num = `${td} text-center tabular-nums`;
  const showSub = rowDim === 'student' || rowDim === 'batch';
  const css = `@page { size: A4 ${cross && colList.length > 5 ? 'landscape' : 'portrait'}; margin: 10mm; }
    @media print { .sch-analysis { font-size: 11px; } .sch-analysis .sch-sheet { box-shadow: none !important; border: none !important; padding: 0 !important; }
      .sch-analysis tr { break-inside: avoid; } .sch-analysis thead { display: table-header-group; } .sch-analysis .scroll { max-height: none !important; overflow: visible !important; } }`;

  return (
    <div className="space-y-4">
      <SectionCard title="📈 דוחות ופילוחים" className="no-print"
        actions={<span className="text-xs text-slate-500">לצפייה בלבד — לא יוצר הפקה ולא משנה תשלומים</span>}>
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={lbl}>תקופה:</span>
            <button type="button" className={chip(basis === 'entry')} onClick={() => setBasis('entry')} title="לפי התאריך שבו נרשמה הזכאות (תאריך החיוב)">לפי תאריך חיוב</button>
            <button type="button" className={chip(basis === 'paid')} onClick={() => setBasis('paid')} title="רק מה ששולם בפועל, לפי תאריך התשלום">לפי תאריך תשלום</button>
            <span className="mx-1 text-slate-300">|</span>
            <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-xs text-slate-500">עד</span>
            <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
            {P.map((p) => (
              <button key={p.label} type="button" onClick={() => { setFrom(p.from); setTo(p.to); }}
                className={`px-2 py-0.5 rounded-lg text-xs border ${from === p.from && to === p.to ? 'bg-slate-800 text-white border-slate-800' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>{p.label}</button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className={lbl}>סוג מלגה:</span>
            {types.map((t) => (
              <button key={t.id} type="button" className={chip(selTypes.has(t.id))} onClick={() => toggle(selTypes, setSelTypes, t.id)}>{t.name}</button>
            ))}
            {selTypes.size > 0 && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setSelTypes(new Set())}>נקה (הכל)</button>}
          </div>

          <ShiurPicker selected={shiurSel} onChange={setShiurSel} />

          {(institutions.length > 1 || basis === 'entry') && (
            <div className="flex flex-wrap items-center gap-1.5">
              {institutions.length > 1 && <>
                <span className={lbl}>מוסד:</span>
                {institutions.map((i) => <button key={i} type="button" className={chip(instSel.has(i))} onClick={() => toggle(instSel, setInstSel, i)}>{i}</button>)}
                <span className="mx-1 text-slate-300">|</span>
              </>}
              {basis === 'entry' && <>
                <span className="text-xs text-slate-500 me-1">מצב:</span>
                {([['all', 'הכל'], ['paid', 'שולם'], ['open', 'פתוח']] as [StateFilter, string][]).map(([v, l]) => (
                  <button key={v} type="button" className={chip(stateF === v)} onClick={() => setStateF(v)}>{l}</button>
                ))}
              </>}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
            <span className={lbl}>פילוח לפי:</span>
            {ROW_DIMS.map((d) => (
              <button key={d.id} type="button" className={chip(rowDim === d.id)} onClick={() => { setRowDim(d.id); if (colDim === d.id) setColDim('none'); }}>{d.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={lbl}>בחיתוך עם:</span>
            {COL_DIMS.filter((d) => d.id !== rowDim).map((d) => (
              <button key={d.id} type="button" className={chip(colDim === d.id)} onClick={() => setColDim(d.id)}>{d.label}</button>
            ))}
            {cross && basis === 'entry' && <>
              <span className="mx-1 text-slate-300">|</span>
              <span className="text-xs text-slate-500 me-1">מציג:</span>
              {MEASURES.map((m) => <button key={m.id} type="button" className={chip(measure === m.id)} onClick={() => setMeasure(m.id)}>{m.label}</button>)}
            </>}
            <span className="mx-1 text-slate-300">|</span>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={byAmount} onChange={(e) => setByAmount(e.target.checked)} /> מיון לפי סכום</label>
            {rowDim === 'student' && <input className={`${input} w-44`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש תלמיד…" />}
          </div>
        </div>
      </SectionCard>

      {error ? <SectionCard><EmptyState icon="⚠️" text={error} /></SectionCard>
        : loading || !entries ? <SectionCard><div className="py-10 text-center text-slate-400">טוען…</div></SectionCard>
        : (
          <>
            <div className="no-print grid grid-cols-2 lg:grid-cols-5 gap-3">
              {(basis === 'paid'
                ? [['שולם בתקופה', ils(total.paid), 'text-emerald-700'], ['תלמידים', String(total.students.size), ''], ['זכאויות', String(total.entries), '']]
                : [['חויב', ils(total.charged), ''], ['שולם', ils(total.paid), 'text-emerald-700'], ['פתוח', ils(total.open), 'text-orange-700'],
                  ['תלמידים', String(total.students.size), ''], ['שולם מתוך החיוב', `${pctPaid}%`, '']]
              ).map(([l, v, c]) => (
                <div key={l} className="bg-white rounded-2xl border border-slate-200/70 elevation-1 px-4 py-3">
                  <div className="text-xs text-slate-500">{l}</div>
                  <div className={`text-xl font-bold tabular-nums ${c}`}>{v}</div>
                </div>
              ))}
            </div>

            <div className="no-print flex flex-wrap items-center gap-2">
              <Button onClick={() => window.print()} disabled={rowList.length === 0}>🖨️ הדפס</Button>
              <Button variant="secondary" onClick={exportXlsx} disabled={rowList.length === 0}>📥 ייצוא לאקסל (כולל פירוט)</Button>
              {transfer.n > 0 && (
                <span className="text-xs text-slate-500">לא נספרו {transfer.n} זכאויות ({ils(transfer.sum)}) שהצ׳ק שלהן בוטל והוחלף — הסכום נספר ב&quot;חד פעמיים&quot;.</span>
              )}
              {(rowDim === 'shiur' || colDim === 'shiur') && <span className="text-xs text-slate-500">השיעור = השיעור הנוכחי של התלמיד.</span>}
            </div>

            {rowList.length === 0 ? <SectionCard><EmptyState icon="📭" text="אין זכאויות שמתאימות לסינון" hint="נסה להרחיב את התקופה או לנקות סינונים" /></SectionCard> : (
              <div className="sch-analysis print-area" dir="rtl">
                <style dangerouslySetInnerHTML={{ __html: css }} />
                <div className="sch-sheet bg-white rounded-2xl border border-slate-200 p-5">
                  <h2 className="text-xl font-bold text-center" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>{title}</h2>
                  <p className="text-center text-sm text-slate-600 mb-3">{subtitle}{cross ? ` · מציג: ${measureLabel}` : ''}</p>
                  <div className="scroll overflow-auto max-h-[70vh]">
                    <table className="w-full text-sm border-collapse">
                      <thead className="sticky top-0">
                        <tr>
                          <th className={`${th} text-start`}>{rowLabel}</th>
                          {cross ? <>
                            {colList.map((c) => <th key={c.dim.key} className={th}>{c.dim.label}</th>)}
                            <th className={th}>סה״כ</th>
                          </> : <>
                            <th className={th}>זכאויות</th>
                            {rowDim !== 'student' && <th className={th}>תלמידים</th>}
                            {basis === 'entry' && <th className={th}>חויב</th>}
                            <th className={th}>שולם</th>
                            {basis === 'entry' && <th className={th}>פתוח</th>}
                            <th className={`${th} w-28 no-print`}>{basis === 'entry' ? '% שולם' : 'חלק מהסה״כ'}</th>
                          </>}
                        </tr>
                      </thead>
                      <tbody>
                        {rowList.map((r) => {
                          const share = basis === 'entry'
                            ? (r.stat.charged > 0 ? r.stat.paid / r.stat.charged : 0)
                            : (total.paid > 0 ? r.stat.paid / total.paid : 0);
                          return (
                            <tr key={r.dim.key} className="hover:bg-blue-50/40">
                              <td className={`${td} font-medium`}>
                                {r.dim.label}
                                {showSub && r.dim.sub && <span className="text-[11px] text-slate-500 ms-2">{r.dim.sub}</span>}
                              </td>
                              {cross ? <>
                                {colList.map((c) => { const v = r.cells.get(c.dim.key)?.[eff] || 0; return <td key={c.dim.key} className={num}>{v ? ils(v) : ''}</td>; })}
                                <td className={`${num} font-semibold`}>{ils(r.stat[eff])}</td>
                              </> : <>
                                <td className={num}>{r.stat.entries}</td>
                                {rowDim !== 'student' && <td className={num}>{r.stat.students.size}</td>}
                                {basis === 'entry' && <td className={`${num} font-semibold`}>{ils(r.stat.charged)}</td>}
                                <td className={`${num} text-emerald-700`}>{r.stat.paid ? ils(r.stat.paid) : ''}</td>
                                {basis === 'entry' && <td className={`${num} text-orange-700`}>{r.stat.open ? ils(r.stat.open) : ''}</td>}
                                <td className={`${td} no-print`}>
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.round(share * 100)}%` }} /></div>
                                    <span className="text-[11px] text-slate-500 tabular-nums w-8 text-end">{Math.round(share * 100)}%</span>
                                  </div>
                                </td>
                              </>}
                            </tr>
                          );
                        })}
                        <tr className="font-bold bg-slate-50">
                          <td className={td}>סה״כ{rowDim === 'student' ? ` · ${rowList.length} תלמידים` : ''}</td>
                          {cross ? <>
                            {colList.map((c) => <td key={c.dim.key} className={num}>{ils(c.stat[eff])}</td>)}
                            <td className={num}>{ils(total[eff])}</td>
                          </> : <>
                            <td className={num}>{total.entries}</td>
                            {rowDim !== 'student' && <td className={num}>{total.students.size}</td>}
                            {basis === 'entry' && <td className={num}>{ils(total.charged)}</td>}
                            <td className={`${num} text-emerald-700`}>{ils(total.paid)}</td>
                            {basis === 'entry' && <td className={`${num} text-orange-700`}>{ils(total.open)}</td>}
                            <td className={`${td} no-print`}></td>
                          </>}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
    </div>
  );
}
