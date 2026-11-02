'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useScholarships } from '@/hooks/useScholarships';
import { ScholarshipBatch, ScholarshipEntry, ScholarshipRunFilters, ScholarshipType } from '@/lib/types';
import { buildScholarshipReport, exportScholarshipReportXlsx, ScholarshipReport, ReportRow } from '@/lib/scholarship-report';
import {
  ScholarshipTabProps, SectionCard, EmptyState, ils, dmy, todayIso,
  StudentLite, fetchStudentsLite, ShiurPicker, matchesShiurSelection,
} from './shared';

const monthStart = () => todayIso().slice(0, 8) + '01';

export function ReportTab({ perms, nav, params }: ScholarshipTabProps) {
  const sch = useScholarships();
  const [types, setTypes] = useState<ScholarshipType[]>([]);
  const [batches, setBatches] = useState<ScholarshipBatch[]>([]);
  const [mode, setMode] = useState<'types' | 'batches'>('types');
  const [selTypes, setSelTypes] = useState<Set<string>>(new Set());
  const [selBatches, setSelBatches] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayIso());
  const [onlyUnpaid, setOnlyUnpaid] = useState(true);
  const [shiurSel, setShiurSel] = useState<Set<string>>(new Set());
  const [instSel, setInstSel] = useState<Set<string>>(new Set());
  const [institutions, setInstitutions] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  // everything the filters found; the printed report = pool minus the deferred students
  const [pool, setPool] = useState<{ entries: ScholarshipEntry[]; students: Map<string, StudentLite> } | null>(null);
  const [deferred, setDeferred] = useState<Set<string>>(new Set());   // student ids left out of this run
  const [filtersUsed, setFiltersUsed] = useState<ScholarshipRunFilters | null>(null);
  const [title, setTitle] = useState('');
  const [rangeLabel, setRangeLabel] = useState('');
  const [savedRun, setSavedRun] = useState<string | null>(null);
  const savingRun = useRef(false);   // guards a quick double click
  const [autoGen, setAutoGen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [t, b] = await Promise.all([sch.listTypes(true), sch.listBatches({ limit: 200 })]);
        setTypes(t);
        setBatches(b);
        if (params.type && t.some((x) => x.id === params.type)) {
          setSelTypes(new Set([params.type]));
          if (params.all) setFrom('2000-01-01');
          setAutoGen(true);
        } else {
          // one-time payments have their own tab — not part of the regular default selection
          setSelTypes(new Set(t.filter((x) => x.is_active && x.kind !== 'one_time').map((x) => x.id)));
        }
      } catch (e: any) { alert('שגיאה בטעינה: ' + e.message); }
    })();
    fetchStudentsLite({ activeOnly: false }).then((s) => {
      setInstitutions(Array.from(new Set(s.map((x) => x.institution_name).filter(Boolean) as string[])).sort());
    }).catch(() => {});
  }, [sch]); // eslint-disable-line react-hooks/exhaustive-deps

  // arrived from "הפק לתשלום" (one-time tab): generate right away with the preset filters
  useEffect(() => {
    if (!autoGen || !types.length || !perms.canReport) return;
    setAutoGen(false);
    generate();
  }, [autoGen, types]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const fullReport = useMemo(() => (pool ? buildScholarshipReport(pool.entries, pool.students, types) : null), [pool, types]);
  const runEntries = useMemo(() => (pool ? pool.entries.filter((e) => !deferred.has(e.student_id)) : []), [pool, deferred]);
  const report = useMemo(() => (pool ? buildScholarshipReport(runEntries, pool.students, types) : null), [pool, runEntries, types]);
  const entryIds = useMemo(() => runEntries.map((e) => e.id), [runEntries]);
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v); else n.add(v);
    setter(n);
  };

  if (!perms.canReport) {
    return <SectionCard><EmptyState icon="🔒" text="אין הרשאה להפקת דוחות" /></SectionCard>;
  }

  const generate = async () => {
    if (mode === 'types') {
      if (selTypes.size === 0) { alert('בחר לפחות רכיב אחד'); return; }
      if (!from || !to) { alert('בבחירה לפי רכיב חובה לבחור טווח תאריכים'); return; }
    } else if (selBatches.size === 0) { alert('בחר לפחות חיוב תקופתי אחד'); return; }

    setBusy(true);
    setSavedRun(null);
    try {
      const filters: ScholarshipRunFilters = mode === 'types'
        ? { type_ids: [...selTypes], date_from: from, date_to: to, only_unpaid: onlyUnpaid }
        : { batch_ids: [...selBatches], only_unpaid: onlyUnpaid };
      if (shiurSel.size) filters.shiurim = [...shiurSel];
      if (instSel.size) filters.institutions = [...instSel];

      const entries = await sch.fetchEntries({
        typeIds: filters.type_ids, batchIds: filters.batch_ids,
        dateFrom: filters.date_from, dateTo: filters.date_to, onlyUnpaid,
      });
      const studs = await fetchStudentsLite({ ids: Array.from(new Set(entries.map((e) => e.student_id))) });
      const keep = new Map<string, StudentLite>();
      for (const s of studs) {
        if (!matchesShiurSelection(s, shiurSel)) continue;
        if (instSel.size && !(s.institution_name && instSel.has(s.institution_name))) continue;
        keep.set(s.id, s);
      }
      const kept = entries.filter((e) => keep.has(e.student_id));

      let range = '';
      if (mode === 'types' && from !== '2000-01-01') range = `${dmy(from)} – ${dmy(to)}`;
      else if (kept.length) {
        const ds = kept.map((e) => e.entry_date).sort();
        range = ds[0] === ds[ds.length - 1] ? dmy(ds[0]) : `${dmy(ds[0])} – ${dmy(ds[ds.length - 1])}`;
      }
      const names = mode === 'types'
        ? [...selTypes].map((id) => typeById.get(id)?.name).filter(Boolean).join(' + ')
        : batches.filter((b) => selBatches.has(b.id)).map((b) => b.title).join(' + ');

      setPool({ entries: kept, students: keep });
      setDeferred(new Set());
      setFiltersUsed(filters);
      setRangeLabel(range);
      setTitle(`מלגות ${names}${range ? ` · ${range}` : ''}`);
    } catch (e: any) { alert('שגיאה: ' + e.message); }
    setBusy(false);
  };

  const printAndSave = async () => {
    if (!report || !filtersUsed) return;
    if (savingRun.current) return;
    // printing the same report again (even after deferring / deleting) updates the saved
    // run instead of saving another one
    if (savedRun) {
      savingRun.current = true;
      try { await sch.updateRun(savedRun, title, entryIds); } catch (e: any) { alert('עדכון ההפקה נכשל: ' + e.message); }
      savingRun.current = false;
      setTimeout(() => window.print(), 50);
      return;
    }
    savingRun.current = true;
    try {
      const run = await sch.createRun(title, filtersUsed, entryIds);
      setSavedRun(run.id);
    } catch (e: any) {
      savingRun.current = false;
      if (!confirm('שמירת ההפקה נכשלה (' + e.message + ').\nלהדפיס בכל זאת?')) return;
    }
    savingRun.current = false;
    setTimeout(() => window.print(), 50);
  };

  const landscape = (report?.columns.length || 0) > 3;
  const chip = (on: boolean) => `px-3 py-1 rounded-full text-sm border ${on ? 'bg-orange-600 text-white border-orange-600' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`;
  const input = 'px-2 py-1.5 border border-slate-300 rounded-lg text-sm';

  return (
    <div className="space-y-4">
      <SectionCard title="דוח מלגות להדפסה" className="no-print">
        <div className="space-y-3">
          <div className="flex gap-2">
            <button type="button" className={chip(mode === 'types')} onClick={() => setMode('types')}>לפי רכיבים + טווח תאריכים</button>
            <button type="button" className={chip(mode === 'batches')} onClick={() => setMode('batches')}>לפי חיובים תקופתיים</button>
          </div>

          {mode === 'types' ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-wrap gap-1.5">
                {types.map((t) => (
                  <button key={t.id} type="button" className={chip(selTypes.has(t.id))} onClick={() => toggle(selTypes, setSelTypes, t.id)}>
                    {t.name}{!t.is_active && ' (מושבת)'}
                  </button>
                ))}
              </div>
              <label className="text-xs text-slate-600 flex flex-col">מתאריך
                <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="text-xs text-slate-600 flex flex-col">עד תאריך
                <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {batches.length === 0 && <div className="p-3 text-sm text-slate-400">אין חיובים</div>}
              {batches.map((b) => (
                <label key={b.id} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selBatches.has(b.id)} onChange={() => toggle(selBatches, setSelBatches, b.id)} />
                  <span className="font-medium">{b.title}</span>
                  <span className="text-xs text-slate-500">{typeById.get(b.type_id)?.name} · {dmy(b.entry_date)}</span>
                </label>
              ))}
            </div>
          )}

          <ShiurPicker selected={shiurSel} onChange={setShiurSel} />
          {institutions.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500 me-1">מוסד:</span>
              {institutions.map((i) => (
                <button key={i} type="button" className={chip(instSel.has(i))} onClick={() => toggle(instSel, setInstSel, i)}>{i}</button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyUnpaid} onChange={(e) => setOnlyUnpaid(e.target.checked)} /> רק לא שולם
            </label>
            <Button onClick={generate} disabled={busy}>{busy ? 'מפיק…' : '📄 הפק דוח'}</Button>
          </div>
        </div>
      </SectionCard>

      {report && (
        <>
          <div className="no-print flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-slate-200/70 elevation-1 p-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${input} flex-1 min-w-[240px]`} />
            <Button onClick={printAndSave} disabled={report.studentCount === 0}>{savedRun ? '🖨️ הדפס שוב' : '🖨️ הדפס ושמור הפקה'}</Button>
            <Button variant="secondary" onClick={() => exportScholarshipReportXlsx(report, title, `${title.replace(/[\\/:*?"<>|]/g, '-')}.xlsx`)} disabled={report.studentCount === 0}>📥 ייצוא לאקסל</Button>
            {savedRun && perms.canWrite && (
              <Button variant="ghost" onClick={() => nav('payment', { run: savedRun })}>✅ לסימון תשלום של ההפקה ←</Button>
            )}
            <span className="text-xs text-slate-500"><b className="text-slate-800">{report.studentCount} צ׳קים להדפסה</b> · {ils(report.total)} · {landscape ? 'A4 לרוחב' : 'A4 לאורך'}</span>
          </div>

          {fullReport && pool && fullReport.studentCount > 0 && (
            <ReviewPanel full={fullReport} deferred={deferred} setDeferred={setDeferred}
              canDelete={perms.canWrite}
              onDeleteEntries={async (ids) => {
                const n = await sch.deleteEntries(ids);
                const gone = new Set(ids);
                // paid ones were skipped by the server — drop only what was really unpaid
                setPool((p) => p && { ...p, entries: p.entries.filter((e) => !(gone.has(e.id) && !e.payment_id)) });
                return n;
              }} />
          )}

          {report.studentCount === 0 ? (
            <SectionCard><EmptyState icon="📭" text="אין זכאויות שמתאימות לסינון" /></SectionCard>
          ) : (
            <ScholarshipReportView report={report} title={title} rangeLabel={rangeLabel} landscape={landscape} />
          )}
        </>
      )}
    </div>
  );
}

// "סיכום לפני הפקה": every student the filters found, with an amount filter (inside / outside
// a range). Checked = goes into this run (check to print). Deferred = left out of this run
// only — the entitlement stays an open debt and comes back in the next report. Delete =
// removes the (unpaid) entitlements themselves.
function ReviewPanel({ full, deferred, setDeferred, canDelete, onDeleteEntries }: {
  full: ScholarshipReport;
  deferred: Set<string>;
  setDeferred: React.Dispatch<React.SetStateAction<Set<string>>>;
  canDelete: boolean;
  onDeleteEntries: (entryIds: string[]) => Promise<number>;
}) {
  const [open, setOpen] = useState(true);
  const [amtMin, setAmtMin] = useState('');
  const [amtMax, setAmtMax] = useState('');
  const [outside, setOutside] = useState(false);
  const [view, setView] = useState<'all' | 'in' | 'out'>('all');
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => full.groups.flatMap((g) => g.rows.map((r) => ({ row: r, group: g.name }))), [full]);
  const lo = amtMin.trim() === '' ? null : Number(amtMin);
  const hi = amtMax.trim() === '' ? null : Number(amtMax);
  const filtering = lo !== null || hi !== null;
  const inAmt = (v: number) => {
    if (!filtering) return true;
    const inside = (lo === null || v >= lo) && (hi === null || v <= hi);
    return outside ? !inside : inside;
  };
  const shown = rows.filter(({ row }) => inAmt(row.total)
    && (view === 'all' || (view === 'in') === !deferred.has(row.student.id)));
  const shownIds = shown.map(({ row }) => row.student.id);
  const shownTotal = shown.reduce((s, { row }) => s + row.total, 0);
  const deferredTotal = rows.filter(({ row }) => deferred.has(row.student.id)).reduce((s, { row }) => s + row.total, 0);

  const setMany = (ids: string[], defer: boolean) => setDeferred((p) => {
    const n = new Set(p);
    for (const id of ids) { if (defer) n.add(id); else n.delete(id); }
    return n;
  });
  const unpaidOf = (r: ReportRow) => Object.values(r.cells).flatMap((c) => c.entries).filter((e) => !e.payment_id).map((e) => e.id);
  const del = async (rs: ReportRow[]) => {
    const ids = rs.flatMap(unpaidOf);
    if (!ids.length) { alert('אין זכאויות פתוחות למחיקה (זכאות ששולמה לא נמחקת)'); return; }
    const sum = rs.reduce((s, r) => s + Object.values(r.cells).flatMap((c) => c.entries).filter((e) => !e.payment_id)
      .reduce((a, e) => a + Number(e.amount), 0), 0);
    const who = rs.length === 1 ? `של ${rs[0].student.last_name} ${rs[0].student.first_name}` : `של ${rs.length} תלמידים`;
    if (!confirm(`למחוק לצמיתות את הזכאויות ${who} (${ids.length} זכאויות · ${ils(sum)})?\nהן יימחקו מהחיובים עצמם — לא רק מהדוח. לדחייה להפקה הבאה השתמש ב"דחה".`)) return;
    setBusy(true);
    try {
      const n = await onDeleteEntries(ids);
      if (n < ids.length) alert(`נמחקו ${n} מתוך ${ids.length} זכאויות`);
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  const act = 'text-xs px-1.5 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-50';
  const chip = (on: boolean) => `px-2.5 py-0.5 rounded-full text-xs border ${on ? 'bg-orange-600 text-white border-orange-600' : 'bg-white border-slate-300 text-slate-700'}`;
  const numIn = 'w-20 px-2 py-1 border border-slate-300 rounded-lg text-sm';

  return (
    <SectionCard className="no-print" title={`סיכום לפני הפקה · ${full.studentCount - deferred.size} בהפקה${deferred.size ? ` · ${deferred.size} נדחו (${ils(deferredTotal)})` : ''}`}
      actions={<button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setOpen(!open)}>{open ? 'הסתר' : 'הצג'}</button>}>
      {open && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            <span className="text-slate-600">💰 סכום לתלמיד:</span>
            <span className="text-xs text-slate-500">מ-</span>
            <input value={amtMin} inputMode="decimal" dir="ltr" placeholder="₪" className={numIn} onChange={(e) => setAmtMin(e.target.value.replace(/[^\d.]/g, ''))} />
            <span className="text-xs text-slate-500">עד</span>
            <input value={amtMax} inputMode="decimal" dir="ltr" placeholder="₪" className={numIn} onChange={(e) => setAmtMax(e.target.value.replace(/[^\d.]/g, ''))} />
            <button type="button" className={chip(!outside)} onClick={() => setOutside(false)}>בתוך הטווח</button>
            <button type="button" className={chip(outside)} onClick={() => setOutside(true)} title="מתחת ל'מ-' או מעל ל'עד'">מחוץ לטווח</button>
            {filtering && <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => { setAmtMin(''); setAmtMax(''); }}>נקה</button>}
            <span className="mx-1 text-slate-300">|</span>
            <button type="button" className={chip(view === 'all')} onClick={() => setView('all')}>הכל</button>
            <button type="button" className={chip(view === 'in')} onClick={() => setView('in')}>✅ בהפקה</button>
            <button type="button" className={chip(view === 'out')} onClick={() => setView('out')}>⏸️ נדחו</button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">מוצגים <b>{shown.length}</b> · {ils(shownTotal)}</span>
            <div className="flex-1" />
            {shown.length > 0 && <>
              <button type="button" className={act} onClick={() => setMany(shownIds, false)}>☑️ כלול הכל בהפקה</button>
              <button type="button" className={act} onClick={() => setMany(shownIds, true)}>⏸️ דחה הכל ({shown.length})</button>
              {canDelete && <button type="button" className={`${act} text-red-700`} disabled={busy} onClick={() => del(shown.map((x) => x.row))}>🗑️ מחק זכאויות ({shown.length})</button>}
            </>}
          </div>

          {shown.length === 0 ? <EmptyState icon="📭" text="אין תלמידים בסינון" /> : (
            <div className="max-h-[420px] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {shown.map(({ row, group }) => {
                const out = deferred.has(row.student.id);
                return (
                  <div key={row.student.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1 text-sm ${out ? 'bg-slate-50 text-slate-400' : ''}`}>
                    <input type="checkbox" title="בהפקה / להעברה לתשלום" checked={!out} onChange={() => setMany([row.student.id], !out)} />
                    <span className="w-48 truncate"><b>{row.student.last_name}</b> {row.student.first_name}</span>
                    <span className="w-20 text-xs text-slate-500 truncate">{group}</span>
                    <span className="text-xs text-slate-500 flex-1 min-w-[140px] truncate">
                      {full.columns.filter((c) => row.cells[c.id]).map((c) => `${c.name} ${ils(row.cells[c.id].amount)}`).join(' · ')}
                    </span>
                    <span className="tabular-nums font-semibold w-20 text-end">{ils(row.total)}</span>
                    {out
                      ? <button type="button" className={act} onClick={() => setMany([row.student.id], false)}>↩️ החזר</button>
                      : <button type="button" className={act} onClick={() => setMany([row.student.id], true)}>⏸️ דחה</button>}
                    {canDelete && <button type="button" className={act} disabled={busy} onClick={() => del([row])}>🗑️</button>}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[11px] text-slate-500">מסומן = נכנס להפקה ולדוח המודפס. &quot;דחה&quot; = לא בהפקה הזו בלבד — הזכאות נשארת פתוחה ותופיע בדוח הבא. &quot;מחק&quot; = מוחק את הזכאות עצמה מהחיוב.</p>
        </div>
      )}
    </SectionCard>
  );
}

export function ScholarshipReportView({ report, title, rangeLabel, landscape }: {
  report: ScholarshipReport; title: string; rangeLabel: string; landscape: boolean;
}) {
  const cols = report.columns;
  const css = `
    @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }
    @media print {
      .sch-report { font-size: 11px; }
      .sch-report .sch-sheet { box-shadow: none !important; border: none !important; padding: 0 !important; margin: 0 !important; }
      .sch-report .sch-break { break-before: page; page-break-before: always; }
      .sch-report tr { break-inside: avoid; }
      .sch-report thead { display: table-header-group; }
    }`;
  const th = 'border border-slate-400 px-2 py-1 bg-slate-100 font-bold';
  const td = 'border border-slate-300 px-2 py-1';
  return (
    <div className="sch-report print-area space-y-4" dir="rtl">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {/* page 1: summary shiur × type */}
      <div className="sch-sheet bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-center" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>{title}</h2>
        {rangeLabel && <p className="text-center text-sm text-slate-600 mb-4">תקופה: {rangeLabel}</p>}
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className={`${th} text-start`}>שיעור</th>
              <th className={th}>צ׳קים</th>
              {cols.map((c) => <th key={c.id} className={th}>{c.name}</th>)}
              <th className={th}>סה״כ</th>
            </tr>
          </thead>
          <tbody>
            {report.groups.map((g) => (
              <tr key={g.name}>
                <td className={`${td} font-medium`}>{g.name}</td>
                <td className={`${td} text-center tabular-nums`}>{g.rows.length}</td>
                {cols.map((c) => <td key={c.id} className={`${td} text-center tabular-nums`}>{g.totals[c.id] ? ils(g.totals[c.id]) : ''}</td>)}
                <td className={`${td} text-center tabular-nums font-semibold`}>{ils(g.total)}</td>
              </tr>
            ))}
            <tr className="font-bold bg-slate-50">
              <td className={td}>סה״כ</td>
              <td className={`${td} text-center tabular-nums`}>{report.studentCount}</td>
              {cols.map((c) => <td key={c.id} className={`${td} text-center tabular-nums`}>{ils(report.totals[c.id] || 0)}</td>)}
              <td className={`${td} text-center tabular-nums`}>{ils(report.total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-4 text-center text-base font-bold">סה״כ צ׳קים להדפסה: <span className="tabular-nums">{report.studentCount}</span> · סה״כ לתשלום: <span className="tabular-nums">{ils(report.total)}</span></p>
      </div>

      {/* one page per shiur */}
      {report.groups.map((g) => (
        <div key={g.name} className="sch-sheet sch-break bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-lg font-bold" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>{g.name}</h3>
            <span className="text-sm text-slate-600">{title.replace(/ · .*$/, '')}{rangeLabel ? ` · ${rangeLabel}` : ''}</span>
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className={`${th} text-start`}>שם משפחה</th>
                <th className={`${th} text-start`}>שם פרטי</th>
                {cols.map((c) => <th key={c.id} className={th}>{c.name}</th>)}
                <th className={th}>סה״כ</th>
                <th className={`${th} w-32`}>חתימה</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.student.id}>
                  <td className={td}>{r.student.last_name}</td>
                  <td className={td}>{r.student.first_name}</td>
                  {cols.map((c) => <td key={c.id} className={`${td} text-center tabular-nums`}>{r.cells[c.id] ? ils(r.cells[c.id].amount) : ''}</td>)}
                  <td className={`${td} text-center tabular-nums font-semibold`}>{ils(r.total)}</td>
                  <td className={td}></td>
                </tr>
              ))}
              <tr className="font-bold bg-slate-50">
                <td className={td} colSpan={2}>סה״כ {g.name} · {g.rows.length} צ׳קים</td>
                {cols.map((c) => <td key={c.id} className={`${td} text-center tabular-nums`}>{g.totals[c.id] ? ils(g.totals[c.id]) : ''}</td>)}
                <td className={`${td} text-center tabular-nums`}>{ils(g.total)}</td>
                <td className={td}></td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
