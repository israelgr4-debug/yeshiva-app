'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAttendance } from '@/hooks/useAttendance';
import { Button } from '@/components/ui/Button';
import { AuditGroup, DatStored, EligibleRow, DAT_MAX_AGE_DAYS, buildReadiness, compareAudit, datAgeDays, normPhone, sectionOf } from '@/lib/attendance';
import { SectionCard, EmptyState, dmy } from '@/components/scholarships/shared';

// "מוכנות": is the yeshiva ready for a surprise audit — how old the Ministry of Religion file
// is, who is on the eligible list, and what should be fixed today (each row opens the
// student card). The four number cards open the list behind the number (everyone / בחורים /
// אברכים / not in the system) — searchable, printable, Excel.

type ListKind = 'all' | AuditGroup;
const LIST_TITLE: Record<ListKind, string> = { all: 'כל הזכאים', yeshiva: 'בחורים', kollel: 'אברכים', unknown: 'זכאים שלא נמצאו במערכת' };
const STATUS_HE: Record<string, string> = { inactive: 'לא פעיל', graduated: 'בוגר', chizuk: 'חיזוק' };

interface ListRow { key: string; studentId: string | null; grp: AuditGroup; shiur: string | null; last_name: string; first_name: string; room: string; phone: string; idNumber: string; status: string }

function listRows(rows: EligibleRow[], kind: ListKind): ListRow[] {
  return rows.filter((e) => kind === 'all' || e.grp === kind).map((e, i) => ({
    key: e.student?.id || `d${i}`,
    studentId: e.student?.id || null,
    grp: e.grp,
    shiur: e.grp === 'yeshiva' ? (e.student?.shiur || null) : null,
    last_name: (e.student?.last_name || e.dat.lastName || '').trim(),
    first_name: (e.student?.first_name || e.dat.firstName || '').trim(),
    room: e.grp === 'yeshiva' && e.student?.room_number ? String(e.student.room_number) : '',
    phone: e.student?.phone ? normPhone(e.student.phone) : '',
    idNumber: e.dat.idNumber || e.student?.id_number || '',
    status: e.student && e.student.status !== 'active' ? (STATUS_HE[e.student.status] || e.student.status) : '',
  })).sort(compareAudit);
}

function EligibleList({ rows, kind, onClose }: { rows: EligibleRow[]; kind: ListKind; onClose: () => void }) {
  const [q, setQ] = useState('');
  const all = useMemo(() => listRows(rows, kind), [rows, kind]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return t.length ? all.filter((r) => t.every((x) => `${r.last_name} ${r.first_name} ${r.idNumber} ${r.phone} ${r.room} ${sectionOf(r)}`.toLowerCase().includes(x))) : all;
  }, [all, q]);

  const exportXlsx = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    (wb as any).Workbook = { Views: [{ RTL: true }] };
    const ws = XLSX.utils.aoa_to_sheet([['#', 'שם משפחה', 'שם פרטי', 'ת"ז', 'שיעור', 'חדר', 'נייד', 'הערה'],
      ...list.map((r, i) => [i + 1, r.last_name, r.first_name, r.idNumber, sectionOf(r), r.room, r.phone, r.status])]);
    ws['!cols'] = [5, 16, 14, 12, 12, 7, 13, 12].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, LIST_TITLE[kind].slice(0, 30));
    XLSX.writeFile(wb, `${LIST_TITLE[kind]} - ביקורת נוכחות.xlsx`);
  };

  const td = 'border border-slate-200 px-2 py-1';
  const css = `@page { size: A4 portrait; margin: 10mm; } @media print { .elig-list { font-size: 11px; border: none !important; padding: 0 !important; } .elig-list tr { break-inside: avoid; } .elig-list .scroll { max-height: none !important; overflow: visible !important; } }`;
  return (
    <div className="elig-list print-area bg-white rounded-2xl border border-indigo-200 elevation-1 p-4" dir="rtl">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3 className="font-bold text-slate-800 text-lg" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>{LIST_TITLE[kind]} · {list.length}{list.length !== all.length ? ` מתוך ${all.length}` : ''}</h3>
        <div className="flex-1" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש שם / ת״ז / חדר…" className="no-print px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-52" />
        <Button size="sm" variant="secondary" className="no-print" onClick={() => window.print()}>🖨️ הדפס</Button>
        <Button size="sm" variant="secondary" className="no-print" onClick={exportXlsx}>📥 אקסל</Button>
        <button type="button" className="no-print text-sm text-slate-500 hover:underline" onClick={onClose}>סגור ✕</button>
      </div>
      {list.length === 0 ? <div className="py-8 text-center text-slate-400">אין שורות</div> : (
        <div className="scroll max-h-[65vh] overflow-y-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0">
              <tr className="bg-slate-100 text-xs">
                <th className={`${td} w-8`}>#</th><th className={`${td} text-start`}>שם</th><th className={`${td} text-start`}>שיעור</th><th className={`${td} text-start`}>חדר</th>
                <th className={`${td} text-start`}>נייד</th><th className={`${td} text-start`}>ת״ז</th><th className={`${td} text-start`}>הערה</th><th className={`${td} no-print`} />
              </tr>
            </thead>
            <tbody>
              {list.map((r, i) => (
                <tr key={r.key} className="hover:bg-blue-50/40">
                  <td className={`${td} text-center text-slate-500 tabular-nums`}>{i + 1}</td>
                  <td className={`${td} font-medium`}>{`${r.last_name} ${r.first_name}`.trim()}</td>
                  <td className={td}>{sectionOf(r)}</td>
                  <td className={`${td} tabular-nums`}>{r.room}</td>
                  <td className={`${td} tabular-nums`} dir="ltr">{r.phone}</td>
                  <td className={`${td} tabular-nums`} dir="ltr">{r.idNumber}</td>
                  <td className={`${td} text-xs text-red-700`}>{r.status}</td>
                  <td className={`${td} no-print whitespace-nowrap`}>{r.studentId && <Link href={`/students/${r.studentId}`} className="text-xs font-semibold text-blue-700 hover:underline">לכרטיס ←</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DatBanner({ dat }: { dat: DatStored | null }) {
  const age = datAgeDays(dat);
  if (!dat) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl px-4 py-3 text-sm">
        ⛔ <b>לא הועלה קובץ דתות.</b> בלי הקובץ אין רשימת זכאים, ואי אפשר לפתוח ביקורת.{' '}
        <Link href="/actions" className="font-semibold underline">להעלאה: פעולות ← השוואה למשרדים</Link>
      </div>
    );
  }
  const old = age !== null && age > DAT_MAX_AGE_DAYS;
  return (
    <div className={`rounded-xl px-4 py-3 text-sm border ${old ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
      {old ? '⚠️' : '✓'} קובץ הדתות: <b>{dat.fileName}</b> · הועלה {dmy(dat.uploadedAt)}{age !== null ? ` (לפני ${age} ימים)` : ''}.
      {old && <> <b>הקובץ ישן מ-{DAT_MAX_AGE_DAYS} יום</b> — רשימת הזכאים אולי השתנתה.{' '}
        <Link href="/actions" className="font-semibold underline">להעלאת קובץ עדכני</Link></>}
    </div>
  );
}

export function ReadinessTab() {
  const att = useAttendance();
  const [data, setData] = useState<{ dat: DatStored | null; rows: EligibleRow[]; excluded: EligibleRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [listOf, setListOf] = useState<ListKind | null>(null);

  useEffect(() => { att.loadEligible().then(setData).catch((e) => setError(e.message)); }, [att]);
  const sections = useMemo(() => (data ? buildReadiness(data.rows) : []), [data]);

  if (error) return <SectionCard><EmptyState icon="⚠️" text={error} /></SectionCard>;
  if (!data) return <SectionCard><div className="py-10 text-center text-slate-400">טוען…</div></SectionCard>;

  const count = (g: string) => data.rows.filter((r) => r.grp === g).length;
  const urgent = sections.filter((s) => s.tone === 'red').reduce((a, s) => a + s.items.length, 0);
  const tone = { red: 'border-red-200 bg-red-50/60 text-red-900', amber: 'border-amber-200 bg-amber-50/60 text-amber-900', blue: 'border-blue-200 bg-blue-50/60 text-blue-900' };

  return (
    <div className="space-y-4">
      <div className="no-print space-y-4">
        <DatBanner dat={data.dat} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([['all', 'זכאים בביקורת', data.rows.length], ['yeshiva', 'בחורים', count('yeshiva')], ['kollel', 'אברכים', count('kollel')], ['unknown', 'לא נמצאו במערכת', count('unknown')]] as [ListKind, string, number][]).map(([k, l, v]) => (
            <button key={k} type="button" onClick={() => setListOf(listOf === k ? null : k)} title="לחיצה מציגה את הרשימה"
              className={`text-start rounded-2xl border elevation-1 px-4 py-3 transition-all hover:border-indigo-300 ${listOf === k ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-200' : 'bg-white border-slate-200/70'}`}>
              <div className="text-xs text-slate-500 flex items-center justify-between"><span>{l}</span><span className="text-indigo-600">{listOf === k ? 'סגור ▲' : 'לרשימה ▼'}</span></div>
              <div className="text-2xl font-bold tabular-nums">{v}</div>
            </button>
          ))}
        </div>
        {data.excluded.length > 0 && (
          <p className="text-xs text-slate-500">לא נספרים: {data.excluded.length} זכאים מהכולל של ר׳ יצחק פינקל (לא פעיל).</p>
        )}
      </div>

      {listOf && <EligibleList key={listOf} rows={data.rows} kind={listOf} onClose={() => setListOf(null)} />}

      <div className="no-print">
      <SectionCard title={urgent ? `מה לתקן לפני ביקורת · ${urgent} דחופים` : 'מה לתקן לפני ביקורת'}>
        {data.rows.length === 0 ? <EmptyState icon="📄" text="אין רשימת זכאים" hint="יש להעלות קובץ דתות" /> : (
          <div className="space-y-2">
            {sections.map((s) => (
              <div key={s.key} className={`rounded-xl border ${s.items.length ? tone[s.tone] : 'border-slate-200 bg-white text-slate-500'}`}>
                <button type="button" className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-start" onClick={() => setOpen(open === s.key ? null : s.key)} disabled={!s.items.length}>
                  <span>
                    <span className="font-semibold">{s.items.length ? '' : '✓ '}{s.title}</span>
                    <span className="block text-xs opacity-80">{s.hint}</span>
                  </span>
                  <span className="text-xl font-bold tabular-nums">{s.items.length}</span>
                </button>
                {open === s.key && s.items.length > 0 && (
                  <div className="bg-white rounded-b-xl border-t border-slate-200 max-h-80 overflow-y-auto divide-y divide-slate-100 text-slate-800">
                    {s.items.map((it, i) => (
                      <div key={it.key + i} className="flex items-center gap-3 px-4 py-1.5 text-sm">
                        <span className="flex-1 truncate font-medium">{it.name}</span>
                        <span className="w-24 text-xs text-slate-500 truncate">{it.shiur}</span>
                        <span className="w-24 text-xs text-slate-500 tabular-nums" dir="ltr">{it.idNumber}</span>
                        <span className="w-28 text-xs text-slate-600 truncate">{it.extra || ''}</span>
                        {it.studentId
                          ? <Link href={`/students/${it.studentId}`} className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap">לכרטיס ←</Link>
                          : <span className="w-12" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      </div>
    </div>
  );
}
