'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAttendance } from '@/hooks/useAttendance';
import { AttendanceAudit, AuditStudent, CALL_LABEL, KIND_LABEL, auditStats, compareAudit, fullName, hm, isOutOfTown, leadersLine, sectionOf } from '@/lib/attendance';
import { SectionCard, EmptyState, dmy } from '@/components/scholarships/shared';

// "היסטוריה": every audit with its result; open one to see who was present / missing and
// why, print or export it.

export function HistoryTab({ canAdmin }: { canAdmin: boolean }) {
  const att = useAttendance();
  const [audits, setAudits] = useState<AttendanceAudit[] | null>(null);
  const [counts, setCounts] = useState<Record<string, { total: number; present: number }>>({});
  const [sel, setSel] = useState<AttendanceAudit | null>(null);
  const [rows, setRows] = useState<AuditStudent[] | null>(null);
  const [show, setShow] = useState<'missing' | 'present' | 'all' | 'out'>('missing');
  const [squad, setSquad] = useState('');   // '' = every group, '-' = in no group

  const load = useCallback(async () => {
    try {
      const l = await att.listAudits();
      setAudits(l);
      setCounts(await att.auditCounts(l.slice(0, 30).map((a) => a.id)));
    } catch (e: any) { alert(e.message); setAudits([]); }
  }, [att]);
  useEffect(() => { load(); }, [load]);

  const openAudit = async (a: AttendanceAudit) => {
    setSel(a); setRows(null); setSquad('');
    try { setRows((await att.auditStudents(a.id)).sort(compareAudit)); } catch (e: any) { alert(e.message); }
  };

  const remove = async (a: AttendanceAudit) => {
    if (!confirm(`למחוק לצמיתות את "${a.title}" מ-${dmy(a.opened_at)} עם כל הסימונים שלה?`)) return;
    try { await att.deleteAudit(a.id); setSel(null); await load(); } catch (e: any) { alert(e.message); }
  };

  const inSquad = useCallback((r: AuditStudent) => !squad || (squad === '-' ? !r.squad : r.squad === squad), [squad]);
  const shown = useMemo(() => (rows || []).filter((r) => inSquad(r) && (show === 'out' ? !r.present && isOutOfTown(r) : show === 'all' || (show === 'present') === r.present)), [rows, show, inSquad]);
  const stats = rows && sel ? auditStats(rows, sel.target_pct) : null;
  // groups of this audit, with how each one did
  const squadRows = useMemo(() => {
    if (!rows || !rows.some((r) => r.squad)) return [];
    const names = Array.from(new Set([...(sel?.squads || []).map((q) => q.name), ...rows.map((r) => r.squad || '')]));
    return names.map((name) => {
      const l = rows.filter((r) => (r.squad || '') === name);
      return { key: name || '-', name: name || 'בלי קבוצה', leaders: leadersLine((sel?.squads || []).find((q) => q.name === name)?.leaders || []), total: l.length, present: l.filter((r) => r.present).length };
    }).filter((x) => x.total > 0);
  }, [rows, sel]);
  const hasSquads = squadRows.length > 0;

  const exportXlsx = async () => {
    if (!rows || !sel) return;
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    (wb as any).Workbook = { Views: [{ RTL: true }] };
    const head = ['קוד', 'שם משפחה', 'שם פרטי', 'ת"ז', 'שיעור', 'חדר', 'נייד', 'נוכח', 'שעה', 'סומן דרך', 'מצב שיחה', 'הערה', 'קבוצה'];
    const data = rows.map((r) => [r.code, r.last_name || '', r.first_name || '', r.id_number || '', sectionOf(r), r.room || '', r.phone || '',
      r.present ? 'נוכח' : 'חסר', hm(r.present_at), r.marked_via === 'phone' ? 'טלפון' : r.marked_via ? 'מסך' : '', CALL_LABEL[r.call_status], r.call_note || '', r.squad || '']);
    const ws = XLSX.utils.aoa_to_sheet([[`${sel.title} · ${dmy(sel.opened_at)} · ${stats?.present}/${stats?.total} (${stats?.pct}%)`], [], head, ...data]);
    ws['!cols'] = head.map((_, i) => ({ wch: i === 1 || i === 2 ? 16 : 11 }));
    XLSX.utils.book_append_sheet(wb, ws, 'ביקורת');
    if (hasSquads) {
      const ws2 = XLSX.utils.aoa_to_sheet([['קבוצה', 'אחראים', 'סה"כ', 'נוכחים', 'חסרים', '%'],
        ...squadRows.map((q) => [q.name, q.leaders, q.total, q.present, q.total - q.present, q.total ? Math.floor((q.present / q.total) * 1000) / 10 : 0])]);
      ws2['!cols'] = [18, 40, 8, 8, 8, 8].map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws2, 'לפי קבוצה');
    }
    XLSX.writeFile(wb, `${sel.title}.xlsx`.replace(/[\\/:*?"<>|]/g, '-'));
  };

  if (!audits) return <SectionCard><div className="py-10 text-center text-slate-400">טוען…</div></SectionCard>;

  if (sel) {
    const td = 'border border-slate-200 px-2 py-1';
    const chip = (on: boolean) => `px-3 py-1 rounded-full text-sm border ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-300 text-slate-700'}`;
    return (
      <div className="space-y-4">
        <div className="no-print flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setSel(null)}>→ לכל הביקורות</Button>
          <button type="button" className={chip(show === 'missing')} onClick={() => setShow('missing')}>חסרים{stats ? ` (${stats.missing})` : ''}</button>
          <button type="button" className={chip(show === 'present')} onClick={() => setShow('present')}>נוכחים{stats ? ` (${stats.present})` : ''}</button>
          <button type="button" className={chip(show === 'out')} onClick={() => setShow('out')}>🧳 מחוץ לעיר{rows ? ` (${rows.filter((r) => !r.present && isOutOfTown(r)).length})` : ''}</button>
          <button type="button" className={chip(show === 'all')} onClick={() => setShow('all')}>הכל</button>
          {hasSquads && (
            <select value={squad} onChange={(e) => setSquad(e.target.value)} className="px-2 py-1 border border-slate-300 rounded-lg text-sm">
              <option value="">כל הקבוצות</option>
              {squadRows.map((q) => <option key={q.key} value={q.key}>{q.name} — חסרו {q.total - q.present} מתוך {q.total}</option>)}
            </select>
          )}
          <div className="flex-1" />
          <Button size="sm" variant="secondary" onClick={() => window.print()} disabled={!rows}>🖨️ הדפס</Button>
          <Button size="sm" variant="secondary" onClick={exportXlsx} disabled={!rows}>📥 אקסל</Button>
          {canAdmin && sel.status === 'closed' && <Button size="sm" variant="danger" onClick={() => remove(sel)}>🗑️ מחק</Button>}
        </div>
        <div className="print-area bg-white rounded-2xl border border-slate-200 p-5" dir="rtl">
          <h2 className="text-xl font-bold text-center" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>{sel.title}</h2>
          <p className="text-center text-sm text-slate-600 mb-3">
            {KIND_LABEL[sel.kind]} · {dmy(sel.opened_at)} · {hm(sel.opened_at)}{sel.closed_at ? `–${hm(sel.closed_at)}` : ' · עדיין פתוחה'}
            {stats && <> · <b>{stats.present} מתוך {stats.total} ({stats.pct}%)</b> · יעד {Number(sel.target_pct)}% — {stats.reached ? 'עברנו' : `חסרו ${stats.needed}`}</>}
          </p>
          {squad && (() => { const q = squadRows.find((x) => x.key === squad); return q ? <p className="text-center text-sm mb-3"><b>{q.name}</b> · נכחו {q.present} מתוך {q.total}{q.leaders ? ` · אחראים: ${q.leaders}` : ''}</p> : null; })()}
          {!rows ? <div className="py-8 text-center text-slate-400">טוען…</div> : shown.length === 0 ? <EmptyState icon="📭" text="אין שורות" /> : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100 text-xs">
                  <th className={`${td} text-start`}>שם</th><th className={`${td} text-start`}>שיעור</th><th className={`${td} text-start`}>חדר</th>
                  <th className={`${td} text-start`}>נייד</th><th className={`${td} text-start`}>מצב</th><th className={`${td} text-start`}>הערה</th>
                  {hasSquads && !squad && <th className={`${td} text-start`}>קבוצה</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className={`${td} font-medium`}>{fullName(r)}{r.prev_missing ? ' *' : ''}</td>
                    <td className={td}>{sectionOf(r)}</td>
                    <td className={`${td} tabular-nums`}>{r.room || ''}</td>
                    <td className={`${td} tabular-nums`} dir="ltr">{r.phone || ''}</td>
                    <td className={td}>{r.present ? <span className="text-emerald-700">נוכח {hm(r.present_at)}{r.marked_via === 'phone' ? ' 📞' : ''}</span> : <span className="text-red-700">חסר{r.call_status !== 'none' ? ` · ${CALL_LABEL[r.call_status]}` : ''}</span>}</td>
                    <td className={td}>{r.call_note || ''}</td>
                    {hasSquads && !squad && <td className={td}>{r.squad || ''}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {shown.some((r) => r.prev_missing) && <p className="text-xs text-slate-500 mt-1">* חסר גם בביקורת הקודמת</p>}
        </div>
      </div>
    );
  }

  return (
    <SectionCard title="היסטוריית ביקורות" accent="from-indigo-500 to-blue-600">
      {audits.length === 0 ? <EmptyState icon="🛡️" text="עדיין לא נערכה ביקורת" hint="כדאי להתחיל מביקורת תרגול" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <th className="text-start px-3 py-2">ביקורת</th><th className="text-start px-3 py-2">סוג</th><th className="text-start px-3 py-2">תאריך</th>
                <th className="text-start px-3 py-2">נוכחות</th><th className="text-start px-3 py-2">יעד</th><th className="text-start px-3 py-2">תוצאה</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a) => {
                const c = counts[a.id];
                const pct = c && c.total ? Math.floor((c.present / c.total) * 1000) / 10 : null;
                const ok = pct !== null && c.present >= Math.ceil((Number(a.target_pct) / 100) * c.total - 1e-9);
                return (
                  <tr key={a.id} onClick={() => openAudit(a)} className="border-b border-slate-50 hover:bg-blue-50/40 cursor-pointer">
                    <td className="px-3 py-2 font-medium text-blue-700">{a.title}</td>
                    <td className="px-3 py-2">{KIND_LABEL[a.kind]}</td>
                    <td className="px-3 py-2 tabular-nums">{dmy(a.opened_at)} {hm(a.opened_at)}</td>
                    <td className="px-3 py-2 tabular-nums">{c ? `${c.present} / ${c.total}${pct !== null ? ` · ${pct}%` : ''}` : '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{Number(a.target_pct)}%</td>
                    <td className="px-3 py-2">
                      {a.status === 'open' ? <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">פתוחה</span>
                        : pct === null ? '—' : ok ? <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800">✓ עברנו</span>
                          : <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">לא הגענו ליעד</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
