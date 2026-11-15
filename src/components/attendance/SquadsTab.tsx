'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAttendance, SquadsData } from '@/hooks/useAttendance';
import {
  AttendanceAudit, AUTO_SQUAD_LABEL, AutoSquadMode, SQUAD_LEADERS, Squad, SquadLeader, SquadPerson,
  autoSquads, freeSquadName, fullName, isValidPhone, normPhone, sectionOf, squadPeople,
} from '@/lib/attendance';
import { SectionCard, EmptyState } from '@/components/scholarships/shared';

// "קבוצות": the eligible list divided into standing groups, each with two responsible people
// (its callers and patrol during an audit). Tick people → send them to a group, or let the
// automatic division do it; mark the responsible with ☆; print a sheet per group.
// An audit freezes the division when it opens (see useAttendance.openAudit).

type Show = 'free' | 'all' | string;   // string = squad id
type PrintWhat = { kind: 'all' } | { kind: 'one'; id: string } | { kind: 'summary' } | null;

export function SquadsTab({ canWrite }: { canWrite: boolean }) {
  const att = useAttendance();
  const [people, setPeople] = useState<SquadPerson[] | null>(null);
  const [unknown, setUnknown] = useState(0);
  const [data, setData] = useState<SquadsData | null>(null);
  const [openAudit, setOpenAudit] = useState<AttendanceAudit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [show, setShow] = useState<Show>('free');
  const [section, setSection] = useState('');
  const [q, setQ] = useState('');
  const [autoOpen, setAutoOpen] = useState(false);
  const [print, setPrint] = useState<PrintWhat>(null);

  const reload = useCallback(async () => {
    try { setData(await att.loadSquads()); } catch (e: any) { setError(e.message); }
  }, [att]);

  useEffect(() => {
    att.loadEligible().then((d) => { setPeople(squadPeople(d.rows)); setUnknown(d.rows.filter((r) => !r.student).length); }).catch((e) => setError(e.message));
    att.getOpenAudit().then(setOpenAudit).catch(() => {});
    reload();
  }, [att, reload]);

  useEffect(() => {
    if (!print) return;
    const t = setTimeout(() => window.print(), 80);
    const done = () => setPrint(null);
    window.addEventListener('afterprint', done);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [print]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); await reload(); } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  const byId = useMemo(() => new Map((people || []).map((p) => [p.id, p])), [people]);
  const squads = data?.squads || [];
  const memberOf = data?.memberOf || {};
  const squadName = useMemo(() => new Map(squads.map((s) => [s.id, s.name])), [squads]);
  const membersOf = useMemo(() => {
    const m = new Map<string, SquadPerson[]>();
    for (const p of people || []) { const sq = memberOf[p.id]; if (sq) { if (!m.has(sq)) m.set(sq, []); m.get(sq)!.push(p); } }
    return m;
  }, [people, memberOf]);
  const free = useMemo(() => (people || []).filter((p) => !memberOf[p.id]), [people, memberOf]);
  const stale = useMemo(() => Object.keys(memberOf).filter((id) => people && !byId.has(id)), [memberOf, people, byId]);
  const sections = useMemo(() => Array.from(new Set((people || []).map(sectionOf))), [people]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (people || []).filter((p) => (show === 'all' ? true : show === 'free' ? !memberOf[p.id] : memberOf[p.id] === show)
      && (!section || sectionOf(p) === section)
      && (!t.length || t.every((x) => `${fullName(p)} ${p.room || ''} ${p.phone || ''}`.toLowerCase().includes(x))));
  }, [people, memberOf, show, section, q]);

  if (error) return <SectionCard><EmptyState icon="⚠️" text={error} /></SectionCard>;
  if (!people || !data) return <SectionCard><div className="py-10 text-center text-slate-400">טוען…</div></SectionCard>;
  if (!data.ready) {
    return <SectionCard><EmptyState icon="🛠️" text="צריך להריץ את מיגרציה 062" hint="supabase/migrations/062_attendance_squads.sql — ב-Supabase SQL Editor, ואז לרענן את הדף" /></SectionCard>;
  }

  const selIds = Array.from(sel).filter((id) => byId.has(id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShown = list.length > 0 && list.every((p) => sel.has(p.id));
  const toggleAll = () => setSel((s) => { const n = new Set(s); list.forEach((p) => (allShown ? n.delete(p.id) : n.add(p.id))); return n; });

  const moveTo = (squadId: string | null) => run(async () => { await att.assignSquad(selIds, squadId); setSel(new Set()); });
  const newSquad = (withSelected: boolean) => {
    const name = prompt('שם הקבוצה החדשה:', freeSquadName(`קבוצה ${squads.length + 1}`, squads.map((s) => s.name)));
    if (!name || !name.trim()) return;
    run(async () => {
      const sq = await att.createSquad(name, squads.reduce((a, s) => Math.max(a, s.sort_order), 0) + 1);
      if (withSelected && selIds.length) { await att.assignSquad(selIds, sq.id); setSel(new Set()); }
    });
  };
  const rename = (s: Squad, name: string) => { if (name.trim() && name.trim() !== s.name) run(() => att.updateSquad(s.id, { name: name.trim() })); };
  const remove = (s: Squad) => {
    const n = membersOf.get(s.id)?.length || 0;
    if (!confirm(`למחוק את הקבוצה "${s.name}"?${n ? `\n${n} התלמידים שבה יחזרו ל"לא משובצים".` : ''}`)) return;
    run(() => att.deleteSquad(s.id));
  };
  const setLeaders = (s: Squad, leaders: SquadLeader[]) => run(() => att.updateSquad(s.id, { leaders }));
  const toggleLeader = (s: Squad, p: SquadPerson) => {
    if (s.leaders.some((l) => l.student_id === p.id)) { setLeaders(s, s.leaders.filter((l) => l.student_id !== p.id)); return; }
    if (s.leaders.length >= SQUAD_LEADERS) { alert(`לקבוצה כבר יש ${SQUAD_LEADERS} אחראים. יש להסיר אחד קודם.`); return; }
    setLeaders(s, [...s.leaders, { student_id: p.id, name: fullName(p), phone: p.phone }]);
  };
  const addOutsideLeader = (s: Squad) => {
    if (s.leaders.length >= SQUAD_LEADERS) { alert(`לקבוצה כבר יש ${SQUAD_LEADERS} אחראים.`); return; }
    const name = prompt('שם האחראי (מי שאינו ברשימת הקבוצה — איש צוות, אברך…):', '');
    if (!name || !name.trim()) return;
    const phone = prompt(`נייד של ${name.trim()}:`, '') || '';
    setLeaders(s, [...s.leaders, { student_id: null, name: name.trim(), phone: normPhone(phone) || null }]);
  };
  const syncOpen = () => {
    if (!openAudit || !confirm(`לעדכן את "${openAudit.title}" (פתוחה עכשיו) לפי החלוקה הנוכחית?`)) return;
    run(() => att.syncAuditSquads(openAudit.id));
  };

  const exportXlsx = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    (wb as any).Workbook = { Views: [{ RTL: true }] };
    const rows: (string | number)[][] = [['קבוצה', 'שם משפחה', 'שם פרטי', 'שיעור', 'חדר', 'נייד', 'אחראי']];
    for (const s of squads) for (const p of membersOf.get(s.id) || []) {
      rows.push([s.name, p.last_name || '', p.first_name || '', sectionOf(p), p.room || '', p.phone || '', s.leaders.some((l) => l.student_id === p.id) ? 'אחראי' : '']);
    }
    for (const p of free) rows.push(['לא משובץ', p.last_name || '', p.first_name || '', sectionOf(p), p.room || '', p.phone || '', '']);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [18, 16, 14, 12, 7, 13, 8].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, 'חלוקה');
    const sum: (string | number)[][] = [['קבוצה', 'תלמידים', 'אחראי 1', 'נייד', 'אחראי 2', 'נייד']];
    for (const s of squads) sum.push([s.name, membersOf.get(s.id)?.length || 0, s.leaders[0]?.name || '', s.leaders[0]?.phone || '', s.leaders[1]?.name || '', s.leaders[1]?.phone || '']);
    const ws2 = XLSX.utils.aoa_to_sheet(sum);
    ws2['!cols'] = [18, 9, 18, 13, 18, 13].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws2, 'קבוצות ואחראים');
    XLSX.writeFile(wb, 'קבוצות ביקורת נוכחות.xlsx');
  };

  const noLeaders = squads.filter((s) => (membersOf.get(s.id)?.length || 0) > 0 && s.leaders.length < SQUAD_LEADERS).length;
  const chip = (on: boolean) => `px-3 py-1 rounded-full text-sm border ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-300 text-slate-700'}`;
  const input = 'px-2 py-1.5 border border-slate-300 rounded-lg text-sm';

  return (
    <>
      <div className="no-print space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([['זכאים לחלוקה', people.length, ''], ['משובצים בקבוצות', people.length - free.length, ''],
            ['עוד לא משובצים', free.length, free.length ? 'text-red-600' : 'text-emerald-700'],
            ['קבוצות בלי 2 אחראים', noLeaders, noLeaders ? 'text-amber-700' : 'text-emerald-700']] as [string, number, string][]).map(([l, v, c]) => (
            <div key={l} className="bg-white rounded-2xl border border-slate-200/70 elevation-1 px-4 py-3">
              <div className="text-xs text-slate-500">{l}</div>
              <div className={`text-2xl font-bold tabular-nums ${c}`}>{v}</div>
            </div>
          ))}
        </div>

        {openAudit && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-2.5 text-sm flex flex-wrap items-center gap-2">
            ⚠️ הביקורת <b>{openAudit.title}</b> פתוחה, והיא עובדת לפי החלוקה כפי שהייתה כשנפתחה.
            {canWrite && <Button size="sm" variant="secondary" onClick={syncOpen} disabled={busy}>עדכן אותה לפי החלוקה הנוכחית</Button>}
          </div>
        )}
        {unknown > 0 && <p className="text-xs text-slate-500">{unknown} זכאים שלא נמצאו במערכת (לשונית מוכנות) לא מופיעים כאן — אי אפשר לשבץ אותם עד שיתוקנו.</p>}
        {stale.length > 0 && (
          <p className="text-xs text-slate-500">
            {stale.length} משובצים כבר אינם ברשימת הזכאים.{' '}
            {canWrite && <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => run(() => att.assignSquad(stale, null))}>הסר אותם מהקבוצות</button>}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {canWrite && <Button size="sm" onClick={() => setAutoOpen((v) => !v)}>⚡ חלוקה אוטומטית</Button>}
          {canWrite && <Button size="sm" variant="secondary" onClick={() => newSquad(false)} disabled={busy}>＋ קבוצה חדשה</Button>}
          <div className="flex-1" />
          <Button size="sm" variant="secondary" onClick={() => setPrint({ kind: 'all' })} disabled={!squads.length}>🖨️ דפים לאחראים</Button>
          <Button size="sm" variant="secondary" onClick={() => setPrint({ kind: 'summary' })} disabled={!squads.length}>🖨️ סיכום קבוצות</Button>
          <Button size="sm" variant="secondary" onClick={exportXlsx} disabled={!squads.length}>📥 אקסל</Button>
        </div>

        {autoOpen && canWrite && (
          <AutoPanel people={people} free={free} hasSquads={squads.length > 0} busy={busy}
            onApply={(groups, replace) => run(async () => { await att.applyAutoSquads(groups, replace); setAutoOpen(false); setSel(new Set()); })}
            onClose={() => setAutoOpen(false)} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
          {/* ---- people ---- */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/70 elevation-1 p-3 space-y-2 lg:sticky lg:top-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className={chip(show === 'free')} onClick={() => setShow('free')}>לא משובצים ({free.length})</button>
              <button type="button" className={chip(show === 'all')} onClick={() => setShow('all')}>כולם ({people.length})</button>
              <select className={`${input} py-1`} value={show !== 'free' && show !== 'all' ? show : ''} onChange={(e) => setShow(e.target.value || 'free')}>
                <option value="">קבוצה…</option>
                {squads.map((s) => <option key={s.id} value={s.id}>{s.name} ({membersOf.get(s.id)?.length || 0})</option>)}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <select className={`${input} py-1`} value={section} onChange={(e) => setSection(e.target.value)}>
                <option value="">כל השיעורים</option>
                {sections.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input className={`${input} py-1 flex-1 min-w-[120px]`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש שם / חדר…" />
            </div>

            {canWrite && (
              <div className={`rounded-xl border px-2.5 py-2 text-sm flex flex-wrap items-center gap-1.5 ${selIds.length ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                <label className="flex items-center gap-1.5 font-medium"><input type="checkbox" checked={allShown} onChange={toggleAll} disabled={!list.length} /> {selIds.length ? `נבחרו ${selIds.length}` : 'סמן את כל הרשימה'}</label>
                {selIds.length > 0 && (
                  <>
                    <select className={`${input} py-1`} value="" disabled={busy} onChange={(e) => { if (e.target.value) moveTo(e.target.value); }}>
                      <option value="">העבר לקבוצה…</option>
                      {squads.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button type="button" className="text-blue-700 font-semibold hover:underline" onClick={() => newSquad(true)}>＋ קבוצה חדשה מהם</button>
                    <button type="button" className="text-slate-600 hover:underline" onClick={() => moveTo(null)}>הוצא מקבוצה</button>
                    <button type="button" className="text-slate-500 hover:underline" onClick={() => setSel(new Set())}>נקה</button>
                  </>
                )}
              </div>
            )}

            <div className="max-h-[62vh] overflow-y-auto divide-y divide-slate-100">
              {list.length === 0 ? <div className="py-8 text-center text-slate-400 text-sm">{show === 'free' && !q && !section ? 'כולם משובצים 🎉' : 'אין תלמידים ברשימה הזו'}</div> : list.map((p) => (
                <label key={p.id} className={`flex items-center gap-2 px-1 py-1.5 text-sm cursor-pointer ${sel.has(p.id) ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                  {canWrite && <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />}
                  <span className="flex-1 min-w-0 truncate"><b className="font-semibold">{fullName(p)}</b> <span className="text-xs text-slate-500">{sectionOf(p)}{p.room ? ` · חדר ${p.room}` : ''}</span></span>
                  {memberOf[p.id] && show !== memberOf[p.id] && <span className="px-1.5 rounded text-[11px] bg-slate-100 text-slate-600 whitespace-nowrap">{squadName.get(memberOf[p.id])}</span>}
                </label>
              ))}
            </div>
          </div>

          {/* ---- groups ---- */}
          <div className="lg:col-span-3 space-y-3">
            {squads.length === 0 ? (
              <SectionCard><EmptyState icon="👥" text="עדיין אין קבוצות" hint='אפשר להתחיל מ"חלוקה אוטומטית" ולתקן ביד, או לסמן תלמידים ברשימה וליצור מהם קבוצה' /></SectionCard>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {squads.map((s) => (
                  <SquadCard key={s.id} squad={s} members={membersOf.get(s.id) || []} canWrite={canWrite} busy={busy} selCount={selIds.length}
                    onRename={(n) => rename(s, n)} onDelete={() => remove(s)} onAddSelected={() => moveTo(s.id)}
                    onToggleLeader={(p) => toggleLeader(s, p)} onRemoveLeader={(i) => setLeaders(s, s.leaders.filter((_, j) => j !== i))}
                    onOutsideLeader={() => addOutsideLeader(s)} onRemoveMember={(p) => run(() => att.assignSquad([p.id], null))}
                    onPrint={() => setPrint({ kind: 'one', id: s.id })} onShow={() => setShow(s.id)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* outside the no-print box: printed only */}
      {print && (
        <div className="hidden print:block">
          <SquadSheets squads={print.kind === 'one' ? squads.filter((s) => s.id === print.id) : squads} membersOf={membersOf} summary={print.kind === 'summary'} freeCount={free.length} />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- one group

function SquadCard({ squad, members, canWrite, busy, selCount, onRename, onDelete, onAddSelected, onToggleLeader, onRemoveLeader, onOutsideLeader, onRemoveMember, onPrint, onShow }: {
  squad: Squad; members: SquadPerson[]; canWrite: boolean; busy: boolean; selCount: number;
  onRename: (name: string) => void; onDelete: () => void; onAddSelected: () => void;
  onToggleLeader: (p: SquadPerson) => void; onRemoveLeader: (index: number) => void; onOutsideLeader: () => void;
  onRemoveMember: (p: SquadPerson) => void; onPrint: () => void; onShow: () => void;
}) {
  const [name, setName] = useState(squad.name);
  useEffect(() => setName(squad.name), [squad.name]);
  const isLeader = (p: SquadPerson) => squad.leaders.some((l) => l.student_id === p.id);
  const missing = SQUAD_LEADERS - squad.leaders.length;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 elevation-1 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => onRename(name)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          disabled={!canWrite} className="flex-1 min-w-0 font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none" />
        <button type="button" onClick={onShow} title="הצג ברשימה" className="px-2 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 tabular-nums">{members.length}</button>
        <button type="button" onClick={onPrint} title="דף לאחראים" className="text-slate-500 hover:text-slate-800">🖨️</button>
        {canWrite && <button type="button" onClick={onDelete} title="מחק קבוצה" className="text-slate-400 hover:text-red-600">🗑️</button>}
      </div>

      <div className={`rounded-xl px-2.5 py-1.5 text-sm ${missing > 0 ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-600">אחראים:</span>
          {squad.leaders.map((l, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-300 text-xs">
              ⭐ <b>{l.name}</b>
              {l.phone ? <span dir="ltr" className={`tabular-nums ${isValidPhone(l.phone) ? 'text-slate-600' : 'text-red-600'}`}>{l.phone}</span> : <span className="text-red-600">אין נייד</span>}
              {canWrite && <button type="button" onClick={() => onRemoveLeader(i)} className="text-slate-400 hover:text-red-600" title="הסר אחראי">×</button>}
            </span>
          ))}
          {missing > 0 && <span className="text-xs text-amber-800">{squad.leaders.length ? `חסר עוד ${missing}` : 'לא סומנו'} — לוחצים על ☆ ליד שם</span>}
          {canWrite && missing > 0 && <button type="button" onClick={onOutsideLeader} className="text-xs text-blue-700 font-semibold hover:underline">＋ אחראי שאינו ברשימה</button>}
        </div>
      </div>

      {canWrite && selCount > 0 && (
        <button type="button" disabled={busy} onClick={onAddSelected} className="w-full py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">⬅ הוסף לכאן את {selCount} הנבחרים</button>
      )}

      {members.length === 0 ? <div className="py-3 text-center text-xs text-slate-400">הקבוצה ריקה — מסמנים תלמידים ברשימה ומוסיפים לכאן</div> : (
        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
          {members.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1 text-sm">
              {canWrite
                ? <button type="button" onClick={() => onToggleLeader(p)} title={isLeader(p) ? 'בטל אחראי' : 'סמן כאחראי'} className={isLeader(p) ? '' : 'text-slate-300 hover:text-amber-500'}>{isLeader(p) ? '⭐' : '☆'}</button>
                : <span>{isLeader(p) ? '⭐' : ''}</span>}
              <span className="flex-1 min-w-0 truncate"><span className={isLeader(p) ? 'font-bold' : 'font-medium'}>{fullName(p)}</span> <span className="text-xs text-slate-500">{sectionOf(p)}{p.room ? ` · ${p.room}` : ''}</span></span>
              <span dir="ltr" className="text-xs text-slate-500 tabular-nums">{p.phone || ''}</span>
              {canWrite && <button type="button" onClick={() => onRemoveMember(p)} title="הוצא מהקבוצה" className="text-slate-300 hover:text-red-600">×</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- automatic division

function AutoPanel({ people, free, hasSquads, busy, onApply, onClose }: {
  people: SquadPerson[]; free: SquadPerson[]; hasSquads: boolean; busy: boolean;
  onApply: (groups: { name: string; ids: string[] }[], replace: boolean) => void; onClose: () => void;
}) {
  const [mode, setMode] = useState<AutoSquadMode>('shiur');
  const [size, setSize] = useState('15');
  const [replace, setReplace] = useState(!hasSquads);
  const groups = useMemo(() => autoSquads(replace ? people : free, mode, Number(size) || 15), [people, free, replace, mode, size]);
  const chip = (on: boolean) => `px-3 py-1.5 rounded-xl text-sm font-semibold border ${on ? 'bg-gradient-to-r from-indigo-500 to-blue-600 text-white border-transparent' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`;
  const hint: Record<AutoSquadMode, string> = {
    shiur: 'כל שיעור הוא קבוצה (שיעור גדול מתחלק לכמה), והאברכים בקבוצות משלהם.',
    room: 'חדרים סמוכים בפנימייה יחד, בלי לפצל חדר. מי שבלי חדר והאברכים — בקבוצות נפרדות.',
    list: 'הרשימה כמו שהיא ממוינת (שיעור ← שם), חתוכה לקבוצות שוות.',
  };
  const apply = () => {
    if (!groups.length) return;
    if (replace && hasSquads && !confirm('לחלק הכל מחדש?\nכל הקבוצות הקיימות והאחראים שסומנו בהן יימחקו.')) return;
    onApply(groups, replace);
  };

  return (
    <SectionCard title="חלוקה אוטומטית" accent="from-indigo-500 to-blue-600" actions={<button type="button" className="text-sm text-slate-500 hover:underline" onClick={onClose}>סגור</button>}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(AUTO_SQUAD_LABEL) as AutoSquadMode[]).map((m) => <button key={m} type="button" className={chip(mode === m)} onClick={() => setMode(m)}>{AUTO_SQUAD_LABEL[m]}</button>)}
          <label className="text-sm text-slate-700 flex items-center gap-1.5 ms-2">עד
            <input className="w-14 px-2 py-1 border border-slate-300 rounded-lg text-sm" dir="ltr" inputMode="numeric" value={size} onChange={(e) => setSize(e.target.value.replace(/\D/g, ''))} />
            בקבוצה</label>
        </div>
        <p className="text-xs text-slate-500">{hint[mode]}</p>
        {hasSquads && (
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-1.5"><input type="radio" checked={!replace} onChange={() => setReplace(false)} /> רק את מי שעוד לא משובץ ({free.length})</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={replace} onChange={() => setReplace(true)} /> לחלק הכל מחדש (מוחק את הקבוצות והאחראים הקיימים)</label>
          </div>
        )}
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
          {groups.length === 0 ? <span className="text-slate-500">אין את מי לחלק.</span> : (
            <>
              <b>ייווצרו {groups.length} קבוצות:</b>{' '}
              <span className="text-slate-700">{groups.map((g) => `${g.name} (${g.ids.length})`).join(' · ')}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={apply} disabled={busy || !groups.length}>{busy ? 'יוצר…' : 'צור את הקבוצות'}</Button>
          <span className="text-xs text-slate-500">אחרי היצירה אפשר להעביר תלמידים בין קבוצות, לשנות שמות ולסמן אחראים.</span>
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------- printed sheets

function SquadSheets({ squads, membersOf, summary, freeCount }: { squads: Squad[]; membersOf: Map<string, SquadPerson[]>; summary: boolean; freeCount: number }) {
  const css = `@page { size: A4 portrait; margin: 10mm; }
    @media print { .sq-sheet { font-size: 12px; color: #000; } .sq-sheet .page { break-after: page; } .sq-sheet .page:last-child { break-after: auto; } .sq-sheet tr { break-inside: avoid; } }`;
  const td = 'border border-slate-500 px-1.5 py-1';
  const today = new Date().toLocaleDateString('he-IL');

  if (summary) {
    return (
      <div className="sq-sheet print-area" dir="rtl">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        <div className="flex items-baseline justify-between border-b-2 border-black pb-1 mb-2">
          <h2 className="text-lg font-bold">ביקורת נוכחות — קבוצות ואחראים</h2>
          <span className="text-sm">{today} · {squads.length} קבוצות</span>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-200">
              <th className={`${td} w-6`}>#</th><th className={`${td} text-start`}>קבוצה</th><th className={`${td} w-14`}>תלמידים</th>
              <th className={`${td} text-start`}>אחראי 1</th><th className={`${td} text-start`}>נייד</th><th className={`${td} text-start`}>אחראי 2</th><th className={`${td} text-start`}>נייד</th>
            </tr>
          </thead>
          <tbody>
            {squads.map((s, i) => (
              <tr key={s.id}>
                <td className={`${td} text-center`}>{i + 1}</td>
                <td className={`${td} font-semibold`}>{s.name}</td>
                <td className={`${td} text-center tabular-nums`}>{membersOf.get(s.id)?.length || 0}</td>
                <td className={td}>{s.leaders[0]?.name || ''}</td><td className={`${td} tabular-nums`} dir="ltr">{s.leaders[0]?.phone || ''}</td>
                <td className={td}>{s.leaders[1]?.name || ''}</td><td className={`${td} tabular-nums`} dir="ltr">{s.leaders[1]?.phone || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {freeCount > 0 && <p className="text-sm mt-2">שימו לב: {freeCount} זכאים עדיין לא משובצים באף קבוצה.</p>}
      </div>
    );
  }

  return (
    <div className="sq-sheet print-area" dir="rtl">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {squads.map((s) => {
        const members = membersOf.get(s.id) || [];
        return (
          <div key={s.id} className="page">
            <div className="flex items-baseline justify-between border-b-2 border-black pb-1 mb-2">
              <h2 className="text-xl font-bold">ביקורת נוכחות · {s.name}</h2>
              <span className="text-sm">{members.length} תלמידים · {today}</span>
            </div>
            <div className="border border-slate-500 px-2 py-1.5 mb-2">
              <b>אחראים: </b>
              {s.leaders.length ? s.leaders.map((l, i) => <span key={i}>{i ? ' · ' : ''}{l.name}{l.phone ? <> <span dir="ltr">{l.phone}</span></> : ''}</span>) : '____________________   ____________________'}
            </div>
            <p className="mb-2">בזמן ביקורת האחראים מוודאים ש<b>כל</b> חברי הקבוצה עוברים אצל המבקרים: מתקשרים למי שחסר ומחפשים אותו, ומעדכנים בקישור הצוות מה יצא — בדרך / לא עונה / מחוץ לעיר / לא יכול.</p>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-200">
                  <th className={`${td} w-6`}>#</th><th className={`${td} text-start`}>שם</th><th className={`${td} text-start`}>שיעור</th><th className={`${td} w-10`}>חדר</th>
                  <th className={`${td} text-start`}>נייד</th><th className={`${td} w-12`}>הגיע</th><th className={`${td} w-1/4 text-start`}>הערות</th>
                </tr>
              </thead>
              <tbody>
                {members.map((p, i) => (
                  <tr key={p.id}>
                    <td className={`${td} text-center`}>{i + 1}</td>
                    <td className={`${td} font-semibold`}>{fullName(p)}{s.leaders.some((l) => l.student_id === p.id) ? ' ⭐' : ''}</td>
                    <td className={td}>{sectionOf(p)}</td>
                    <td className={`${td} text-center tabular-nums`}>{p.room || ''}</td>
                    <td className={`${td} tabular-nums`} dir="ltr">{p.phone || ''}</td>
                    <td className={`${td} text-center`}>☐</td>
                    <td className={td}></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
