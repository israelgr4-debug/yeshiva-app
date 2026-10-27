'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useScholarships } from '@/hooks/useScholarships';
import { ScholarshipBatch, ScholarshipRunFilters, ScholarshipType } from '@/lib/types';
import { buildScholarshipReport, exportScholarshipReportXlsx, ScholarshipReport } from '@/lib/scholarship-report';
import {
  ScholarshipTabProps, SectionCard, EmptyState, ils, dmy, todayIso,
  StudentLite, fetchStudentsLite, ShiurPicker, matchesShiurSelection,
} from './shared';

const monthStart = () => todayIso().slice(0, 8) + '01';

export function ReportTab({ perms, nav }: ScholarshipTabProps) {
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
  const [report, setReport] = useState<ScholarshipReport | null>(null);
  const [entryIds, setEntryIds] = useState<string[]>([]);
  const [filtersUsed, setFiltersUsed] = useState<ScholarshipRunFilters | null>(null);
  const [title, setTitle] = useState('');
  const [rangeLabel, setRangeLabel] = useState('');
  const [savedRun, setSavedRun] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [t, b] = await Promise.all([sch.listTypes(true), sch.listBatches({ limit: 200 })]);
        setTypes(t);
        setBatches(b);
        setSelTypes(new Set(t.filter((x) => x.is_active).map((x) => x.id)));
      } catch (e: any) { alert('שגיאה בטעינה: ' + e.message); }
    })();
    fetchStudentsLite({ activeOnly: false }).then((s) => {
      setInstitutions(Array.from(new Set(s.map((x) => x.institution_name).filter(Boolean) as string[])).sort());
    }).catch(() => {});
  }, [sch]);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
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
      const rep = buildScholarshipReport(kept, keep, types);

      let range = '';
      if (mode === 'types') range = `${dmy(from)} – ${dmy(to)}`;
      else if (kept.length) {
        const ds = kept.map((e) => e.entry_date).sort();
        range = ds[0] === ds[ds.length - 1] ? dmy(ds[0]) : `${dmy(ds[0])} – ${dmy(ds[ds.length - 1])}`;
      }
      const names = mode === 'types'
        ? [...selTypes].map((id) => typeById.get(id)?.name).filter(Boolean).join(' + ')
        : batches.filter((b) => selBatches.has(b.id)).map((b) => b.title).join(' + ');

      setReport(rep);
      setEntryIds(kept.map((e) => e.id));
      setFiltersUsed(filters);
      setRangeLabel(range);
      setTitle(`מלגות ${names}${range ? ` · ${range}` : ''}`);
    } catch (e: any) { alert('שגיאה: ' + e.message); }
    setBusy(false);
  };

  const printAndSave = async () => {
    if (!report || !filtersUsed) return;
    try {
      const run = await sch.createRun(title, filtersUsed, entryIds);
      setSavedRun(run.id);
    } catch (e: any) {
      if (!confirm('שמירת ההפקה נכשלה (' + e.message + ').\nלהדפיס בכל זאת?')) return;
    }
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
            <Button onClick={printAndSave} disabled={report.studentCount === 0}>🖨️ הדפס ושמור הפקה</Button>
            <Button variant="secondary" onClick={() => exportScholarshipReportXlsx(report, title, `${title.replace(/[\\/:*?"<>|]/g, '-')}.xlsx`)} disabled={report.studentCount === 0}>📥 ייצוא לאקסל</Button>
            {savedRun && perms.canWrite && (
              <Button variant="ghost" onClick={() => nav('payment', { run: savedRun })}>✅ לסימון תשלום של ההפקה ←</Button>
            )}
            <span className="text-xs text-slate-500">{report.studentCount} תלמידים · {ils(report.total)} · {landscape ? 'A4 לרוחב' : 'A4 לאורך'}</span>
          </div>

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
              <th className={th}>תלמידים</th>
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
                <th className={th}>ת״ז</th>
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
                  <td className={`${td} text-center tabular-nums`}>{r.student.id_number || r.student.passport_number || ''}</td>
                  {cols.map((c) => <td key={c.id} className={`${td} text-center tabular-nums`}>{r.cells[c.id] ? ils(r.cells[c.id].amount) : ''}</td>)}
                  <td className={`${td} text-center tabular-nums font-semibold`}>{ils(r.total)}</td>
                  <td className={td}></td>
                </tr>
              ))}
              <tr className="font-bold bg-slate-50">
                <td className={td} colSpan={3}>סה״כ {g.name} ({g.rows.length})</td>
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
