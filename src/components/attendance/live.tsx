'use client';

// Live screens of an open ביקורת נוכחות — shared by the logged-in page (/attendance) and the
// public team link (/g/audit/<token>). Everything reads one polled state from
// /api/attendance/team/<token> (no ID numbers in it) and writes through it.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TeamAudit, TeamStudent, CallStatus, AuditGroup, CALL_LABEL, GROUP_LABEL, KIND_LABEL,
  auditStats, compareAudit, fullName, hm, sectionOf,
} from '@/lib/attendance';

export interface LiveState { audit: TeamAudit; students: TeamStudent[]; now: string }
export type LiveAct = (action: 'present' | 'undo' | 'call', id: string, extra?: { status?: CallStatus; note?: string | null }) => Promise<void>;

const POLL_MS = 3000;

/** Polls the team endpoint; `closed` flips when the audit was closed (or the code is wrong → error). */
export function useAuditLive(token: string | null, code: string | null, actor: string) {
  const [state, setState] = useState<LiveState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<string | null>(null);   // title of the closed audit
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const busy = useRef(false);
  const url = token ? `/api/attendance/team/${token}` : null;

  const load = useCallback(async () => {
    if (!url || !code || busy.current) return;
    busy.current = true;
    try {
      const r = await fetch(url, { headers: { 'x-audit-code': code }, cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (r.status === 410) { setClosed(j.title || 'הביקורת'); setState(null); }
      else if (!r.ok || !j.ok) setError(j.error || `שגיאה ${r.status}`);
      else { setState({ audit: j.audit, students: j.students, now: j.now }); setError(null); setClosed(null); setUpdatedAt(Date.now()); }
    } catch { setError('אין חיבור — מנסה שוב'); }
    busy.current = false;
  }, [url, code]);

  useEffect(() => {
    if (!url || !code) return;
    setState(null); setError(null); setClosed(null);
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [url, code, load]);

  // the open screens drive the automatic robot (the server throttles and de-duplicates)
  const robotAuto = !!state?.audit.robot_auto;
  useEffect(() => {
    if (!url || !code || !robotAuto) return;
    const tick = () => { if (!document.hidden) fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-audit-code': code }, body: JSON.stringify({ action: 'tick' }) }).catch(() => {}); };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [url, code, robotAuto]);

  const act: LiveAct = useCallback(async (action, id, extra) => {
    if (!url || !code) return;
    // optimistic — the next poll confirms
    setState((s) => s && {
      ...s, students: s.students.map((x) => x.id !== id ? x
        : action === 'call' ? { ...x, call_status: extra?.status || 'none', call_note: extra?.note ?? null, call_at: new Date().toISOString() }
        : { ...x, present: action === 'present', present_at: action === 'present' ? new Date().toISOString() : null, marked_via: 'screen' }),
    });
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-audit-code': code }, body: JSON.stringify({ action, id, actor, ...extra }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) setError(j.error || 'השמירה נכשלה');
    } catch { setError('השמירה נכשלה — אין חיבור'); }
    load();
  }, [url, code, actor, load]);

  return { state, error, closed, updatedAt, act, reload: load };
}

// ---------------------------------------------------------------- central board

export function BigBoard({ state, updatedAt }: { state: LiveState; updatedAt: number }) {
  const { audit, students } = state;
  const st = auditStats(students, audit.target_pct);
  const sections = useMemo(() => {
    const m = new Map<string, { name: string; grp: AuditGroup; shiur: string | null; total: number; present: number }>();
    for (const s of [...students].sort(compareAudit)) {
      const k = sectionOf(s);
      if (!m.has(k)) m.set(k, { name: k, grp: s.grp, shiur: s.shiur, total: 0, present: 0 });
      const x = m.get(k)!;
      x.total++; if (s.present) x.present++;
    }
    return Array.from(m.values());
  }, [students]);
  const recent = useMemo(() => students.filter((s) => s.present && s.present_at)
    .sort((a, b) => (b.present_at || '').localeCompare(a.present_at || '')).slice(0, 8), [students]);
  const stale = updatedAt && Date.now() - updatedAt > 15000;
  const target = Number(audit.target_pct);

  return (
    <div className="space-y-4">
      <div className={`rounded-3xl border p-6 md:p-8 text-center ${st.reached ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
        <div className="text-sm text-slate-500">{KIND_LABEL[audit.kind]} · {audit.title} · נפתחה {hm(audit.opened_at)}{stale ? ' · ⚠️ לא מתעדכן' : ''}</div>
        <div className={`font-bold tabular-nums leading-none mt-2 ${st.reached ? 'text-emerald-700' : 'text-slate-900'}`} style={{ fontSize: 'clamp(72px, 16vw, 190px)' }}>
          {st.pct}%
        </div>
        <div className="text-2xl md:text-3xl text-slate-700 mt-2 tabular-nums">נוכחים <b>{st.present}</b> מתוך <b>{st.total}</b></div>
        <div className={`mt-3 text-2xl md:text-4xl font-bold ${st.reached ? 'text-emerald-700' : 'text-red-600'}`}>
          {st.reached ? `✓ עברנו את היעד (${target}%)` : `חסרים עוד ${st.needed} ליעד ${target}%`}
        </div>
        <div className="relative h-4 rounded-full bg-slate-100 mt-5 overflow-hidden max-w-3xl mx-auto">
          <div className={`absolute inset-y-0 start-0 rounded-full ${st.reached ? 'bg-emerald-500' : 'bg-orange-500'}`} style={{ width: `${Math.min(100, st.pct)}%` }} />
          <div className="absolute inset-y-0 w-0.5 bg-slate-800" style={{ insetInlineStart: `${target}%` }} title={`יעד ${target}%`} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/70 p-4">
          <h3 className="font-bold text-slate-800 mb-2" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>חסרים לפי שיעור</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {sections.map((s) => {
              const miss = s.total - s.present;
              return (
                <div key={s.name} className="flex items-center gap-2 text-sm">
                  <span className="w-24 truncate font-medium">{s.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${s.total ? (s.present / s.total) * 100 : 0}%` }} />
                  </div>
                  <span className={`w-24 text-end tabular-nums ${miss ? 'text-red-600 font-semibold' : 'text-emerald-700'}`}>{miss ? `חסרים ${miss}` : '✓ כולם'}</span>
                  <span className="w-12 text-end text-xs text-slate-400 tabular-nums">{s.present}/{s.total}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/70 p-4">
          <h3 className="font-bold text-slate-800 mb-2" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>סומנו לאחרונה</h3>
          {recent.length === 0 ? <div className="text-sm text-slate-400">עדיין לא סומן אף אחד</div> : (
            <div className="space-y-1 text-sm">
              {recent.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{fullName(s)} <span className="text-xs text-slate-400">{sectionOf(s)}</span></span>
                  <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap">{s.marked_via === 'phone' ? '📞' : '🖥️'} {hm(s.present_at)}</span>
                </div>
              ))}
            </div>
          )}
          {audit.robot_auto && (
            <div className="mt-3 pt-2 border-t border-slate-100 text-xs text-slate-500">
              🤖 רובוט אוטומטי כל {audit.robot_interval_min} דק׳ · {audit.robot_runs} סבבים{audit.robot_last_run_at ? ` · אחרון ${hm(audit.robot_last_run_at)}` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- missing lists

const CALL_TONE: Record<CallStatus, string> = {
  none: 'bg-white text-slate-600 border-slate-300',
  coming: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  no_answer: 'bg-amber-100 text-amber-800 border-amber-300',
  cant: 'bg-red-100 text-red-800 border-red-300',
};

function matches(s: TeamStudent, q: string) {
  const t = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!t.length) return true;
  const pool = `${s.last_name || ''} ${s.first_name || ''} ${s.code} ${s.phone || ''} ${s.room || ''}`.toLowerCase();
  return t.every((x) => pool.includes(x));
}

/** "טלפנים": everyone still missing, with a phone and what the last call gave. */
export function CallersList({ state, act, canAct }: { state: LiveState; act: LiveAct; canAct: boolean }) {
  const [grp, setGrp] = useState<'kollel' | 'yeshiva' | 'all'>('kollel');
  const [q, setQ] = useState('');
  const [hideHandled, setHideHandled] = useState(false);
  const missing = useMemo(() => state.students.filter((s) => !s.present), [state.students]);
  const list = useMemo(() => missing
    .filter((s) => (grp === 'all' ? true : grp === 'kollel' ? s.grp !== 'yeshiva' : s.grp === 'yeshiva') && matches(s, q)
      && (!hideHandled || s.call_status === 'none' || s.call_status === 'no_answer'))
    .sort((a, b) => Number(b.prev_missing) - Number(a.prev_missing)
      || Number(a.call_status !== 'none') - Number(b.call_status !== 'none') || compareAudit(a, b)), [missing, grp, q, hideHandled]);
  const count = (g: 'kollel' | 'yeshiva') => missing.filter((s) => (g === 'kollel' ? s.grp !== 'yeshiva' : s.grp === 'yeshiva')).length;
  const chip = (on: boolean) => `px-3 py-1 rounded-full text-sm border ${on ? 'bg-orange-600 text-white border-orange-600' : 'bg-white border-slate-300 text-slate-700'}`;
  const setCall = (s: TeamStudent, status: CallStatus) => {
    const next = s.call_status === status ? 'none' : status;
    let note: string | null = null;
    if (next === 'cant') { note = prompt(`למה ${fullName(s)} לא יכול להגיע?`, s.call_note || '') ?? null; if (note === null) return; }
    act('call', s.id, { status: next, note });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={chip(grp === 'kollel')} onClick={() => setGrp('kollel')}>אברכים ({count('kollel')})</button>
        <button type="button" className={chip(grp === 'yeshiva')} onClick={() => setGrp('yeshiva')}>בחורים ({count('yeshiva')})</button>
        <button type="button" className={chip(grp === 'all')} onClick={() => setGrp('all')}>כל החסרים ({missing.length})</button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש שם / טלפון…" className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm flex-1 min-w-[160px]" />
        <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={hideHandled} onChange={(e) => setHideHandled(e.target.checked)} /> רק מי שעוד צריך להתקשר</label>
      </div>
      {list.length === 0 ? <div className="py-10 text-center text-slate-400">אין חסרים ברשימה הזו 🎉</div> : (
        <div className="divide-y divide-slate-100">
          {list.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <div className="w-52 min-w-0">
                <div className="font-semibold truncate">{fullName(s)} {s.prev_missing && <span className="px-1.5 rounded text-[11px] bg-red-100 text-red-800">חסר בקודמת</span>}</div>
                <div className="text-xs text-slate-500">{sectionOf(s)}{s.room ? ` · חדר ${s.room}` : ''}</div>
              </div>
              {s.phone
                ? <a href={`tel:${s.phone}`} dir="ltr" className="w-28 tabular-nums font-semibold text-blue-700 hover:underline">{s.phone}</a>
                : <span className="w-28 text-xs text-slate-400">אין נייד</span>}
              <div className="flex gap-1">
                {(['coming', 'no_answer', 'cant'] as CallStatus[]).map((c) => (
                  <button key={c} type="button" disabled={!canAct} onClick={() => setCall(s, c)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border disabled:opacity-60 ${s.call_status === c ? CALL_TONE[c] : CALL_TONE.none}`}>{CALL_LABEL[c]}</button>
                ))}
              </div>
              <div className="flex-1 min-w-[80px] text-xs text-slate-500 truncate">
                {s.call_status !== 'none' && <>{hm(s.call_at)}{s.call_note ? ` · ${s.call_note}` : ''}</>}
              </div>
              {canAct && <button type="button" className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => act('present', s.id)}>✓ הגיע</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** "סיירים": missing בחורים by dorm room (then the ones without a room, by shiur). */
export function PatrolList({ state, act, canAct }: { state: LiveState; act: LiveAct; canAct: boolean }) {
  const groups = useMemo(() => patrolGroups(state.students), [state.students]);
  if (!groups.length) return <div className="bg-white rounded-2xl border border-slate-200/70 py-10 text-center text-slate-400">אין בחורים חסרים 🎉</div>;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {groups.map((g) => (
        <div key={g.key} className="bg-white rounded-2xl border border-slate-200/70 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="font-bold text-slate-800">{g.title}</h4>
            <span className="px-2 rounded-full text-xs font-bold bg-red-100 text-red-700 tabular-nums">{g.items.length}</span>
          </div>
          <div className="space-y-1">
            {g.items.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{fullName(s)} <span className="text-xs text-slate-400">{s.shiur || ''}</span>
                  {s.call_status !== 'none' && <span className={`ms-1 px-1.5 rounded text-[11px] border ${CALL_TONE[s.call_status]}`}>{CALL_LABEL[s.call_status]}</span>}</span>
                {canAct && <button type="button" className="text-xs text-emerald-700 font-semibold hover:underline whitespace-nowrap" onClick={() => act('present', s.id)}>✓ הגיע</button>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function patrolGroups(students: TeamStudent[]): { key: string; title: string; items: TeamStudent[] }[] {
  const miss = students.filter((s) => !s.present && s.grp === 'yeshiva');
  const rooms = new Map<string, TeamStudent[]>();
  const noRoom = new Map<string, TeamStudent[]>();
  for (const s of miss) {
    const m = s.room ? rooms : noRoom;
    const k = s.room || s.shiur || 'ללא שיעור';
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(s);
  }
  const byName = (a: TeamStudent, b: TeamStudent) => fullName(a).localeCompare(fullName(b), 'he');
  return [
    ...Array.from(rooms.entries()).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, items]) => ({ key: 'r' + k, title: `חדר ${k}`, items: items.sort(byName) })),
    ...Array.from(noRoom.entries()).map(([k, items]) => ({ key: 'n' + k, title: `בלי חדר · ${k}`, items: items.sort(byName) })),
  ];
}

/** "סימון": everyone, searchable — a screen fallback for the kosher-phone marking. */
export function MarkPanel({ state, act, canAct }: { state: LiveState; act: LiveAct; canAct: boolean }) {
  const [q, setQ] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const list = useMemo(() => state.students.filter((s) => matches(s, q) && (!onlyMissing || !s.present || !!q.trim())).sort(compareAudit).slice(0, 200), [state.students, q, onlyMissing]);
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם או קוד…" className="px-3 py-2 border border-slate-300 rounded-lg text-base flex-1 min-w-[200px]" />
        <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> רק חסרים</label>
      </div>
      <div className="divide-y divide-slate-100 max-h-[65vh] overflow-y-auto">
        {list.map((s) => (
          <div key={s.id} className={`flex items-center gap-3 py-1.5 text-sm ${s.present ? 'text-slate-400' : ''}`}>
            <span className="w-12 tabular-nums font-mono text-slate-500">{s.code}</span>
            <span className="flex-1 truncate"><b>{fullName(s)}</b> <span className="text-xs text-slate-400">{sectionOf(s)}</span></span>
            {s.present
              ? <><span className="text-xs text-emerald-700">✓ {hm(s.present_at)}</span>{canAct && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => { if (confirm(`לבטל את הסימון של ${fullName(s)}?`)) act('undo', s.id); }}>בטל</button>}</>
              : canAct && <button type="button" className="px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => act('present', s.id)}>✓ נוכח</button>}
          </div>
        ))}
        {list.length === 0 && <div className="py-8 text-center text-slate-400">לא נמצא</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- printed sheets

export type SheetKind = 'codes' | 'callers' | 'patrol' | 'missing';
export const SHEET_LABEL: Record<SheetKind, string> = { codes: 'דף קודים למסמנים', callers: 'חסרים לטלפנים (אברכים)', patrol: 'חסרים לסיירים (לפי חדר)', missing: 'כל החסרים' };

/** Rendered only for print (the caller wraps it in `hidden print:block`). */
export function AuditSheet({ state, kind }: { state: LiveState; kind: SheetKind }) {
  const { audit, students } = state;
  const now = hm(new Date().toISOString());
  const css = `@page { size: A4 portrait; margin: 9mm; }
    @media print { .att-sheet { font-size: 11px; color: #000; } .att-sheet .sec { break-inside: avoid; } .att-sheet tr { break-inside: avoid; } }`;
  const head = (title: string, sub: string) => (
    <div className="flex items-baseline justify-between border-b-2 border-black pb-1 mb-2">
      <h2 className="text-lg font-bold">{title} · {audit.title}</h2>
      <span className="text-sm">{sub}</span>
    </div>
  );
  const td = 'border border-slate-400 px-1.5 py-0.5';

  if (kind === 'codes') {
    const secs = new Map<string, TeamStudent[]>();
    for (const s of [...students].sort(compareAudit)) { const k = sectionOf(s); if (!secs.has(k)) secs.set(k, []); secs.get(k)!.push(s); }
    return (
      <div className="att-sheet print-area" dir="rtl">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        {head('דף קודים', `${students.length} זכאים`)}
        <p className="text-sm mb-2">מתקשרים לקו, מקישים <b>קוד + #</b> · ביטול: <b>* קוד #</b> · חמשת האחרונים: <b>0 #</b> · אפשר להקיש גם ת״ז מלאה</p>
        <div style={{ columnCount: 3, columnGap: '6mm' }}>
          {Array.from(secs.entries()).map(([name, list]) => (
            <div key={name} className="sec mb-2">
              <div className="font-bold bg-slate-200 px-1.5 py-0.5 border border-slate-400">{name} ({list.length})</div>
              {list.map((s) => (
                <div key={s.id} className="flex justify-between gap-2 border-x border-b border-slate-400 px-1.5 py-0.5">
                  <span className="truncate">{fullName(s)}</span>
                  <b className="tabular-nums font-mono">{s.code}</b>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (kind === 'patrol') {
    const groups = patrolGroups(students);
    return (
      <div className="att-sheet print-area" dir="rtl">
        <style dangerouslySetInnerHTML={{ __html: css }} />
        {head('חסרים לפי חדר', `מעודכן ${now} · ${groups.reduce((a, g) => a + g.items.length, 0)} בחורים`)}
        <div style={{ columnCount: 3, columnGap: '6mm' }}>
          {groups.map((g) => (
            <div key={g.key} className="sec mb-2">
              <div className="font-bold bg-slate-200 px-1.5 py-0.5 border border-slate-400">{g.title} ({g.items.length})</div>
              {g.items.map((s) => (
                <div key={s.id} className="flex justify-between gap-2 border-x border-b border-slate-400 px-1.5 py-0.5">
                  <span className="truncate">☐ {fullName(s)}</span>
                  <span className="text-[10px] whitespace-nowrap">{s.shiur || ''}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const list = students.filter((s) => !s.present && (kind === 'missing' || s.grp !== 'yeshiva')).sort(compareAudit);
  return (
    <div className="att-sheet print-area" dir="rtl">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {head(kind === 'callers' ? 'חסרים לטלפנים' : 'כל החסרים', `מעודכן ${now} · ${list.length} חסרים`)}
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-slate-200">
            <th className={`${td} w-6`}>#</th><th className={`${td} text-start`}>שם</th><th className={`${td} text-start`}>שיעור</th>
            <th className={`${td} text-start`}>נייד</th><th className={`${td} text-start`}>מצב</th><th className={`${td} w-1/4 text-start`}>הערה</th>
          </tr>
        </thead>
        <tbody>
          {list.map((s, i) => (
            <tr key={s.id}>
              <td className={`${td} text-center`}>{i + 1}</td>
              <td className={`${td} font-semibold`}>{fullName(s)}{s.prev_missing ? ' *' : ''}</td>
              <td className={td}>{sectionOf(s)}{s.room ? ` · ${s.room}` : ''}</td>
              <td className={`${td} tabular-nums`} dir="ltr">{s.phone || ''}</td>
              <td className={td}>{CALL_LABEL[s.call_status]}</td>
              <td className={td}>{s.call_note || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.some((s) => s.prev_missing) && <p className="text-xs mt-1">* חסר גם בביקורת הקודמת</p>}
    </div>
  );
}

/** Buttons + the print-only sheet. */
export function PrintButtons({ state, kinds = ['codes', 'callers', 'patrol', 'missing'] }: { state: LiveState; kinds?: SheetKind[] }) {
  const [kind, setKind] = useState<SheetKind | null>(null);
  useEffect(() => {
    if (!kind) return;
    const t = setTimeout(() => window.print(), 80);
    const done = () => setKind(null);
    window.addEventListener('afterprint', done);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', done); };
  }, [kind]);
  return (
    <>
      <div className="flex flex-wrap gap-1.5 no-print">
        {kinds.map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">🖨️ {SHEET_LABEL[k]}</button>
        ))}
      </div>
      {kind && <div className="hidden print:block"><AuditSheet state={state} kind={kind} /></div>}
    </>
  );
}

export const groupLabel = GROUP_LABEL;
