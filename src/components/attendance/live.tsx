'use client';

// Live screens of an open ביקורת נוכחות — shared by the logged-in page (/attendance) and the
// public team link (/g/audit/<token>). Everything reads one polled state from
// /api/attendance/team/<token> (no ID numbers in it) and writes through it.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  TeamAudit, TeamStudent, CallStatus, AuditGroup, SquadInfo, CALL_LABEL, GROUP_LABEL, KIND_LABEL, OUT_OF_TOWN,
  auditStats, compareAudit, fullName, hm, isOutOfTown, leadersLine, sectionOf,
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

// ---------------------------------------------------------------- groups (mig 062)

/** Value of the group picker for the people who are in no group. */
export const NO_SQUAD = '__none__';
const squadsOf = (state: LiveState): SquadInfo[] => state.audit.squads || [];
const inSquad = (s: TeamStudent, squad: string) => (squad === NO_SQUAD ? !s.squad : s.squad === squad);

/** The same state with only one group's people ('' = everyone). */
export function filterSquad(state: LiveState, squad: string): LiveState {
  return squad ? { ...state, students: state.students.filter((s) => inSquad(s, squad)) } : state;
}

/** "הקבוצה שלי": narrows the callers / patrol lists (and their sheets) to one group. Hidden when the audit has no groups. */
export function SquadPicker({ state, value, onChange }: { state: LiveState; value: string; onChange: (v: string) => void }) {
  const squads = squadsOf(state);
  // the remembered group is gone (renamed / the audit was updated) → back to everyone
  const gone = !!value && value !== NO_SQUAD && !squads.some((q) => q.name === value);
  useEffect(() => { if (gone) onChange(''); }, [gone]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!squads.length) return null;
  const cnt = (q: string) => { const l = state.students.filter((s) => inSquad(s, q)); return { total: l.length, missing: l.filter((s) => !s.present).length }; };
  const none = cnt(NO_SQUAD);
  const cur = squads.find((q) => q.name === value);
  return (
    <div className="no-print flex flex-wrap items-center gap-2 text-sm bg-white border border-slate-200 rounded-xl px-3 py-2">
      <span className="font-semibold text-slate-700">👥 קבוצה:</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-medium">
        <option value="">כל הקבוצות</option>
        {squads.map((q) => { const c = cnt(q.name); return <option key={q.name} value={q.name}>{q.name} — חסרים {c.missing} מתוך {c.total}</option>; })}
        {none.total > 0 && <option value={NO_SQUAD}>בלי קבוצה — חסרים {none.missing} מתוך {none.total}</option>}
      </select>
      {cur && <span className="text-slate-600">אחראים: {cur.leaders.length ? cur.leaders.map((l, i) => (
        <span key={i}>{i ? ' · ' : ''}<b>{l.name}</b>{l.phone ? <> <a href={`tel:${l.phone}`} dir="ltr" className="text-blue-700 hover:underline tabular-nums">{l.phone}</a></> : ''}</span>
      )) : 'לא סומנו'}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- answers: who said what, and when

type AnswerKind = 'coming' | 'no_answer' | 'out' | 'cant';
type AnswerOrNone = AnswerKind | 'none';
const ANSWER_KINDS: AnswerOrNone[] = ['coming', 'cant', 'out', 'no_answer', 'none'];
const ANSWER_META: Record<AnswerOrNone, { label: string; one: string; icon: string; card: string; chip: string; bar: string }> = {
  coming: { label: 'בדרך', one: 'בדרך', icon: '🚶', card: 'bg-emerald-50 border-emerald-200 text-emerald-800', chip: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-300' },
  cant: { label: 'לא יכולים', one: 'לא יכול', icon: '✋', card: 'bg-red-50 border-red-200 text-red-800', chip: 'bg-red-100 text-red-800', bar: 'bg-red-400' },
  out: { label: 'מחוץ לעיר', one: 'מחוץ לעיר', icon: '🧳', card: 'bg-purple-50 border-purple-200 text-purple-800', chip: 'bg-purple-100 text-purple-800', bar: 'bg-purple-400' },
  no_answer: { label: 'לא עונים', one: 'לא עונה', icon: '📵', card: 'bg-amber-50 border-amber-200 text-amber-800', chip: 'bg-amber-100 text-amber-800', bar: 'bg-amber-400' },
  none: { label: 'עוד לא ידוע', one: '', icon: '❔', card: 'bg-slate-50 border-slate-200 text-slate-700', chip: 'bg-slate-100 text-slate-700', bar: 'bg-slate-300' },
};
const answerKind = (s: TeamStudent): AnswerOrNone =>
  (s.call_status === 'none' ? 'none' : s.call_status === 'cant' ? (isOutOfTown(s) ? 'out' : 'cant') : s.call_status);

/** When someone who said "בדרך בעוד X דקות" is due (0 = he gave no minutes). */
function etaOf(s: TeamStudent): number {
  if (s.call_status !== 'coming' || !s.call_at) return 0;
  const m = (s.call_note || '').match(/(\d+)\s*דק/);
  return m ? new Date(s.call_at).getTime() + Number(m[1]) * 60000 : 0;
}
const hmMs = (ms: number) => hm(new Date(ms).toISOString());

/** "נרשם ב-14:32 · בעוד 10 דקות · צפוי עד 14:42" — the hour the answer was given, always. */
export function AnswerLine({ s, now }: { s: TeamStudent; now: number }) {
  if (s.call_status === 'none' || !s.call_at) return null;
  const eta = etaOf(s);
  const late = !!eta && !s.present && now > eta;
  return (
    <span>
      נרשם ב־<b className="tabular-nums">{hm(s.call_at)}</b>
      {s.call_note ? ` · ${s.call_note}` : ''}
      {eta ? <span className={late ? 'text-red-600 font-semibold' : ''}> · {late ? '⚠️ היה אמור להגיע עד' : 'צפוי עד'} <b className="tabular-nums">{hmMs(eta)}</b></span> : null}
    </span>
  );
}

/** Answers and arrivals along the audit's hours. */
function Timeline({ state }: { state: LiveState }) {
  const data = useMemo(() => {
    const start = new Date(state.audit.opened_at).getTime();
    const end = Math.max(new Date(state.now).getTime() || Date.now(), start + 60000);
    const span = (end - start) / 60000;
    const step = [5, 10, 15, 30, 60, 120, 240].find((x) => span / x <= 18) || 480;
    const n = Math.max(1, Math.ceil(span / step));
    const buckets = Array.from({ length: n }, (_, i) => ({ at: start + i * step * 60000, present: 0, coming: 0, cant: 0, out: 0, no_answer: 0 }));
    const at = (iso: string) => buckets[Math.min(n - 1, Math.max(0, Math.floor((new Date(iso).getTime() - start) / (step * 60000))))];
    for (const s of state.students) {
      if (s.present && s.present_at) at(s.present_at).present++;
      const k = answerKind(s);
      if (k !== 'none' && s.call_at) at(s.call_at)[k]++;
    }
    const total = (b: typeof buckets[number]) => b.present + b.coming + b.cant + b.out + b.no_answer;
    return { buckets, step, total, max: Math.max(1, ...buckets.map(total)), any: buckets.some((b) => total(b) > 0) };
  }, [state.audit.opened_at, state.now, state.students]);
  const SERIES: { key: 'present' | AnswerKind; label: string; bar: string }[] = [
    { key: 'present', label: 'הגיעו', bar: 'bg-emerald-600' },
    ...(['coming', 'cant', 'out', 'no_answer'] as AnswerKind[]).map((k) => ({ key: k, label: ANSWER_META[k].one, bar: ANSWER_META[k].bar })),
  ];
  const every = Math.ceil(data.buckets.length / 6);
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <h3 className="font-bold text-slate-800" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>לפי שעות</h3>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
          {SERIES.map((x) => <span key={x.key} className="inline-flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm ${x.bar}`} />{x.label}</span>)}
        </div>
      </div>
      {!data.any ? <div className="text-sm text-slate-400">עדיין אין תשובות או סימונים</div> : (
        <>
          <div className="flex items-end gap-1 h-32">
            {data.buckets.map((b) => {
              const t = data.total(b);
              return (
                <div key={b.at} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center"
                  title={`${hmMs(b.at)} — ${SERIES.filter((x) => b[x.key]).map((x) => `${x.label} ${b[x.key]}`).join(' · ') || 'אין'}`}>
                  {t > 0 && <div className="text-[11px] tabular-nums text-slate-600 leading-none mb-0.5">{t}</div>}
                  <div className="w-full max-w-[36px] rounded-t overflow-hidden flex flex-col-reverse" style={{ height: `${(t / data.max) * 85}%` }}>
                    {SERIES.map((x) => (b[x.key] ? <div key={x.key} className={x.bar} style={{ flexGrow: b[x.key], flexBasis: 0 }} /> : null))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex gap-1 border-t border-slate-200 pt-1">
            {data.buckets.map((b, i) => <div key={b.at} className="flex-1 min-w-0 text-center text-[10px] tabular-nums text-slate-500 whitespace-nowrap overflow-visible">{i % every === 0 ? hmMs(b.at) : ''}</div>)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">כל עמודה = {data.step} דקות, לפי השעה שבה נרשמה התשובה האחרונה של כל אחד / שבה סומן נוכח.</div>
        </>
      )}
    </div>
  );
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
  const squadRows = useMemo(() => {
    const rows = (audit.squads || []).map((q) => ({ name: q.name, leaders: q.leaders.map((l) => l.name).join(' · '), total: 0, present: 0 }));
    const at = new Map(rows.map((r) => [r.name, r]));
    const none = { name: 'בלי קבוצה', leaders: '', total: 0, present: 0 };
    for (const s of students) { const r = (s.squad && at.get(s.squad)) || none; r.total++; if (s.present) r.present++; }
    return rows.length ? [...rows.filter((r) => r.total), ...(none.total ? [none] : [])] : [];
  }, [audit.squads, students]);
  const stale = updatedAt && Date.now() - updatedAt > 15000;
  const target = Number(audit.target_pct);
  const now = new Date(state.now).getTime() || Date.now();
  // the missing, by what is known about each — every number is a card that opens its list
  const [open, setOpen] = useState<AnswerOrNone | null>(null);
  const byKind = useMemo(() => {
    const m: Record<AnswerOrNone, TeamStudent[]> = { coming: [], cant: [], out: [], no_answer: [], none: [] };
    for (const s of students) if (!s.present) m[answerKind(s)].push(s);
    for (const k of ANSWER_KINDS) m[k].sort(k === 'none' ? compareAudit : (a, b) => (b.call_at || '').localeCompare(a.call_at || ''));
    return m;
  }, [students]);
  // the latest answers (also of people who arrived since)
  const answers = useMemo(() => students.filter((s) => s.call_status !== 'none' && s.call_at)
    .sort((a, b) => (b.call_at || '').localeCompare(a.call_at || '')).slice(0, 12), [students]);

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
        {st.missing > 0 && (
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-2 text-start">
            {ANSWER_KINDS.map((k) => {
              const m = ANSWER_META[k];
              return (
                <button key={k} type="button" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}
                  className={`rounded-2xl border px-3 py-2 text-start transition last:col-span-2 sm:last:col-span-1 ${m.card} ${open === k ? 'ring-2 ring-offset-1 ring-slate-500' : 'hover:brightness-95'}`}>
                  <div className="text-3xl font-bold tabular-nums leading-none">{byKind[k].length}</div>
                  <div className="text-sm font-semibold mt-1">{m.icon} {m.label}</div>
                  <div className="text-[11px] opacity-70">{open === k ? 'סגור ▲' : 'לחיצה — הרשימה ▼'}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {open && st.missing > 0 && (
        <div className="bg-white rounded-2xl border border-slate-300 p-4">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="font-bold text-slate-800" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>{ANSWER_META[open].icon} {ANSWER_META[open].label} ({byKind[open].length})</h3>
            <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={() => setOpen(null)}>✕ סגור</button>
          </div>
          {byKind[open].length === 0 ? <div className="text-sm text-slate-400 py-3">אין אף אחד ברשימה הזו</div> : (
            <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
              {byKind[open].map((s) => (
                <div key={s.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                  <span className="font-semibold">{fullName(s)}</span>
                  <span className="text-xs text-slate-400">{sectionOf(s)}{s.squad ? ` · ${s.squad}` : ''}</span>
                  {s.phone ? <a href={`tel:${s.phone}`} dir="ltr" className="tabular-nums text-blue-700 hover:underline">{s.phone}</a> : <span className="text-xs text-slate-400">אין נייד</span>}
                  {open !== 'none' && <span className="basis-full sm:basis-auto sm:ms-auto text-xs text-slate-600"><AnswerLine s={s} now={now} /></span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200/70 p-4">
        <h3 className="font-bold text-slate-800 mb-2" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>תשובות אחרונות — מי ענה ומה אמר</h3>
        {answers.length === 0 ? <div className="text-sm text-slate-400">עדיין לא התקבלה אף תשובה</div> : (
          <div className="divide-y divide-slate-100">
            {answers.map((s) => {
              const k = answerKind(s);
              const eta = etaOf(s);
              const late = !!eta && !s.present && now > eta;
              return (
                <div key={s.id} className="py-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <b className="tabular-nums w-12">{hm(s.call_at)}</b>
                  <span className="font-semibold">{fullName(s)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ANSWER_META[k].chip}`}>{ANSWER_META[k].one}</span>
                  {s.call_note && <span className="text-xs text-slate-600">{s.call_note}</span>}
                  {eta > 0 && !s.present && <span className={`text-xs ${late ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>{late ? '⚠️ היה אמור להגיע עד' : 'צפוי עד'} <b className="tabular-nums">{hmMs(eta)}</b></span>}
                  {s.present && <span className="text-xs text-emerald-700 font-semibold">✓ הגיע {hm(s.present_at)}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Timeline state={state} />

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

      {squadRows.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/70 p-4">
          <h3 className="font-bold text-slate-800 mb-2" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>חסרים לפי קבוצה</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-2">
            {squadRows.map((r) => {
              const miss = r.total - r.present;
              return (
                <div key={r.name} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 truncate font-medium">{r.name}</span>
                    <span className={`tabular-nums ${miss ? 'text-red-600 font-semibold' : 'text-emerald-700'}`}>{miss ? `חסרים ${miss}` : '✓ כולם'}</span>
                    <span className="w-12 text-end text-xs text-slate-400 tabular-nums">{r.present}/{r.total}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-0.5">
                    <div className={`h-full rounded-full ${miss ? 'bg-orange-500' : 'bg-emerald-500'}`} style={{ width: `${r.total ? (r.present / r.total) * 100 : 0}%` }} />
                  </div>
                  {r.leaders && <div className="text-xs text-slate-500 truncate">אחראים: {r.leaders}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
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
export function CallersList({ state, act, canAct, wholeList = false }: { state: LiveState; act: LiveAct; canAct: boolean; /** the list is one group — start on "all the missing" */ wholeList?: boolean }) {
  const [grp, setGrp] = useState<'kollel' | 'yeshiva' | 'all' | 'out'>(wholeList ? 'all' : 'kollel');
  const [q, setQ] = useState('');
  const [hideHandled, setHideHandled] = useState(false);
  const missing = useMemo(() => state.students.filter((s) => !s.present), [state.students]);
  const list = useMemo(() => missing
    .filter((s) => (grp === 'out' ? isOutOfTown(s) : grp === 'all' ? true : grp === 'kollel' ? s.grp !== 'yeshiva' : s.grp === 'yeshiva') && matches(s, q)
      && (grp === 'out' || !hideHandled || s.call_status === 'none' || s.call_status === 'no_answer'))
    .sort((a, b) => Number(b.prev_missing) - Number(a.prev_missing)
      || Number(a.call_status !== 'none') - Number(b.call_status !== 'none') || compareAudit(a, b)), [missing, grp, q, hideHandled]);
  const count = (g: 'kollel' | 'yeshiva') => missing.filter((s) => (g === 'kollel' ? s.grp !== 'yeshiva' : s.grp === 'yeshiva')).length;
  const chip = (on: boolean) => `px-3 py-1 rounded-full text-sm border ${on ? 'bg-orange-600 text-white border-orange-600' : 'bg-white border-slate-300 text-slate-700'}`;
  const outCount = missing.filter(isOutOfTown).length;
  // the four answers a call can give; "מחוץ לעיר" is a "לא יכול" with a fixed reason
  type Answer = 'coming' | 'no_answer' | 'out' | 'cant';
  const ANSWERS: { id: Answer; label: string; tone: string }[] = [
    { id: 'coming', label: CALL_LABEL.coming, tone: CALL_TONE.coming }, { id: 'no_answer', label: CALL_LABEL.no_answer, tone: CALL_TONE.no_answer },
    { id: 'out', label: OUT_OF_TOWN, tone: 'bg-purple-100 text-purple-800 border-purple-300' }, { id: 'cant', label: CALL_LABEL.cant, tone: CALL_TONE.cant },
  ];
  const answerOf = (s: TeamStudent): Answer | null => (s.call_status === 'none' ? null : s.call_status === 'cant' ? (isOutOfTown(s) ? 'out' : 'cant') : s.call_status);
  const setCall = (s: TeamStudent, a: Answer) => {
    if (answerOf(s) === a) { act('call', s.id, { status: 'none', note: null }); return; }
    if (a === 'out') { act('call', s.id, { status: 'cant', note: OUT_OF_TOWN }); return; }
    if (a === 'cant') {
      const why = prompt(`למה ${fullName(s)} לא יכול להגיע?`, '');
      if (why === null) return;
      act('call', s.id, { status: 'cant', note: why.trim() ? `אחר: ${why.trim()}` : 'אחר' });
      return;
    }
    act('call', s.id, { status: a, note: null });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={chip(grp === 'kollel')} onClick={() => setGrp('kollel')}>אברכים ({count('kollel')})</button>
        <button type="button" className={chip(grp === 'yeshiva')} onClick={() => setGrp('yeshiva')}>בחורים ({count('yeshiva')})</button>
        <button type="button" className={chip(grp === 'all')} onClick={() => setGrp('all')}>כל החסרים ({missing.length})</button>
        <button type="button" className={chip(grp === 'out')} onClick={() => setGrp('out')}>🧳 מחוץ לעיר ({outCount})</button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש שם / טלפון…" className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm flex-1 min-w-[160px]" />
        <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={hideHandled} onChange={(e) => setHideHandled(e.target.checked)} /> רק מי שעוד צריך להתקשר</label>
      </div>
      {list.length === 0 ? <div className="py-10 text-center text-slate-400">אין חסרים ברשימה הזו 🎉</div> : (
        <div className="divide-y divide-slate-100">
          {list.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
              <div className="w-52 min-w-0">
                <div className="font-semibold truncate">{fullName(s)} {s.prev_missing && <span className="px-1.5 rounded text-[11px] bg-red-100 text-red-800">חסר בקודמת</span>}</div>
                <div className="text-xs text-slate-500">{sectionOf(s)}{s.room ? ` · חדר ${s.room}` : ''}{s.squad && !wholeList ? ` · ${s.squad}` : ''}</div>
              </div>
              {s.phone
                ? <a href={`tel:${s.phone}`} dir="ltr" className="w-28 tabular-nums font-semibold text-blue-700 hover:underline">{s.phone}</a>
                : <span className="w-28 text-xs text-slate-400">אין נייד</span>}
              <div className="flex gap-1">
                {ANSWERS.map((a) => (
                  <button key={a.id} type="button" disabled={!canAct} onClick={() => setCall(s, a.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border disabled:opacity-60 ${answerOf(s) === a.id ? a.tone : CALL_TONE.none}`}>{a.label}</button>
                ))}
              </div>
              <div className="flex-1 min-w-[80px] basis-full sm:basis-0 text-xs text-slate-600">
                <AnswerLine s={s} now={new Date(state.now).getTime() || Date.now()} />
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

export type SheetKind = 'codes' | 'callers' | 'patrol' | 'missing' | 'out' | 'squads';
export const SHEET_LABEL: Record<SheetKind, string> = { codes: 'דף קודים למסמנים', callers: 'חסרים לטלפנים (אברכים)', patrol: 'חסרים לסיירים (לפי חדר)', missing: 'כל החסרים', out: 'מחוץ לעיר', squads: 'חסרים לפי קבוצה (דף לכל אחראים)' };

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
        <p className="text-sm mb-2">מתקשרים לקו, מקישים <b>קוד + #</b> · ביטול: <b>* קוד #</b> · חמשת האחרונים: <b>0 #</b> · אפשר להקיש גם ת״ז מלאה · אם נשמע תפריט אישי (&quot;שלום…&quot;) מקישים <b>9</b></p>
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

  if (kind === 'squads') {
    // a page per group, for its two responsible people: who is still missing right now
    const names = [...(audit.squads || []).map((q) => q.name), ''];
    const pages = names.map((name) => ({
      name: name || 'בלי קבוצה', leaders: (audit.squads || []).find((q) => q.name === name)?.leaders || [],
      total: students.filter((s) => (s.squad || '') === name).length,
      list: students.filter((s) => !s.present && (s.squad || '') === name).sort(compareAudit),
    })).filter((p) => p.total > 0);
    return (
      <div className="att-sheet print-area" dir="rtl">
        <style dangerouslySetInnerHTML={{ __html: css + ' @media print { .att-sheet .pg { break-after: page; } .att-sheet .pg:last-child { break-after: auto; } }' }} />
        {pages.map((p) => (
          <div key={p.name} className="pg">
            {head(`חסרים · ${p.name}`, `מעודכן ${now} · חסרים ${p.list.length} מתוך ${p.total}`)}
            {p.leaders.length > 0 && <p className="text-sm mb-2"><b>אחראים:</b> {leadersLine(p.leaders)}</p>}
            {p.list.length === 0 ? <p className="text-base font-bold">✓ כל הקבוצה נוכחת</p> : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-200">
                    <th className={`${td} w-6`}>#</th><th className={`${td} text-start`}>שם</th><th className={`${td} text-start`}>שיעור</th><th className={`${td} w-10`}>חדר</th>
                    <th className={`${td} text-start`}>נייד</th><th className={`${td} text-start`}>מצב</th><th className={`${td} w-1/4 text-start`}>הערה</th>
                  </tr>
                </thead>
                <tbody>
                  {p.list.map((s, i) => (
                    <tr key={s.id}>
                      <td className={`${td} text-center`}>{i + 1}</td>
                      <td className={`${td} font-semibold`}>{fullName(s)}{s.prev_missing ? ' *' : ''}</td>
                      <td className={td}>{sectionOf(s)}</td>
                      <td className={`${td} text-center tabular-nums`}>{s.room || ''}</td>
                      <td className={`${td} tabular-nums`} dir="ltr">{s.phone || ''}</td>
                      <td className={td}>{CALL_LABEL[s.call_status]}</td>
                      <td className={td}>{s.call_note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    );
  }

  const list = students.filter((s) => !s.present && (kind === 'out' ? isOutOfTown(s) : kind === 'missing' || s.grp !== 'yeshiva')).sort(compareAudit);
  return (
    <div className="att-sheet print-area" dir="rtl">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {head(kind === 'callers' ? 'חסרים לטלפנים' : kind === 'out' ? 'מחוץ לעיר' : 'כל החסרים', `מעודכן ${now} · ${list.length} ${kind === 'out' ? 'תלמידים' : 'חסרים'}`)}
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

/** Buttons + the print-only sheet. `full` = the unfiltered state, for the codes sheet (a marker needs everyone). */
export function PrintButtons({ state, full, kinds: wanted = ['codes', 'callers', 'patrol', 'missing', 'out', 'squads'] }: { state: LiveState; full?: LiveState; kinds?: SheetKind[] }) {
  const [kind, setKind] = useState<SheetKind | null>(null);
  const kinds = wanted.filter((k) => k !== 'squads' || squadsOf(state).length > 0);
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
      {kind && <div className="hidden print:block"><AuditSheet state={kind === 'codes' ? (full || state) : state} kind={kind} /></div>}
    </>
  );
}

export const groupLabel = GROUP_LABEL;
