'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useScholarships } from '@/hooks/useScholarships';
import { supabase } from '@/lib/supabase';
import { ScholarshipBatch, ScholarshipType, ScholarshipYemotCall } from '@/lib/types';
import { readYemotFile, israelDate } from '@/lib/yemot-parse';
import {
  loadIdIndex, storeCalls, rematchUnmatched, fetchCallsForRange, addManualCall, updateCall, updateCalls, israelTime, REMOVED_NOTE,
} from '@/lib/yemot-import';
import {
  ScholarshipTabProps, SectionCard, EmptyState, ils, dmy, todayIso,
  StudentLite, fetchStudentsLite, compareStudents, shiurLabel, StudentSearchBox,
} from './shared';
import { UnmatchedIdsTab } from './UnmatchedIdsTab';
import { YemotLineCard } from './YemotLineCard';
import { RecordingPlayer, fetchRecordings } from './RecordingPlayer';

// "יבוא ימות": pick a ימות type + date range (new batch) or an existing ימות batch
// (continue), upload the xlsx (→ scholarship_yemot_calls), review the preview in
// categories, then create the batch. The API source (stage 8b) will feed the same table.

// The checkbox on a call = "להעברה לתשלום" (goes into the batch). Besides that a call can be
// deferred (status 'deferred' — waits for a later import, shown there whatever its date) or
// removed from the list (status 'excluded' + REMOVED_NOTE). Both are saved at once and undoable.
type Category = 'ready' | 'questions' | 'inactive' | 'unmatched' | 'already' | 'deferred' | 'removed';
const ACTIVE_CATS: Category[] = ['ready', 'questions', 'inactive'];

interface StudentCalls {
  student: StudentLite;
  calls: ScholarshipYemotCall[];
  existingAmount?: number;   // continue mode: entry already in the batch
}

const CAT_LABEL: Record<Category, string> = {
  ready: '✅ מוכנים', questions: '❓ שאלות לבירור', inactive: '💤 לא פעילים', unmatched: '🔍 לא מזוהים', already: '📦 כבר בחיוב אחר',
  deferred: '⏸️ נדחו', removed: '🗑️ הוסרו',
};

export function YemotImportTab(props: ScholarshipTabProps) {
  const { perms, nav } = props;
  const sch = useScholarships();
  const [types, setTypes] = useState<ScholarshipType[]>([]);
  const [batches, setBatches] = useState<ScholarshipBatch[]>([]);
  const [mode, setMode] = useState<'new' | 'continue'>('new');
  const [typeId, setTypeId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayIso());
  const [title, setTitle] = useState('');
  const [contBatchId, setContBatchId] = useState('');

  const [students, setStudents] = useState<StudentLite[]>([]);
  const [calls, setCalls] = useState<ScholarshipYemotCall[] | null>(null);
  const [existingEntries, setExistingEntries] = useState<Map<string, number>>(new Map());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [decided, setDecided] = useState<Set<string>>(new Set());
  // deferred calls brought back into THIS import (local until the batch is created)
  const [restored, setRestored] = useState<Set<string>>(new Set());
  const seenRef = useRef<Set<string>>(new Set());   // calls that already got their default checkbox
  const [amtMin, setAmtMin] = useState('');
  const [amtMax, setAmtMax] = useState('');
  const [amtOut, setAmtOut] = useState(false);   // match amounts OUTSIDE the range
  const [cat, setCat] = useState<Category>('ready');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // recordings in the preview range, by "ext:record" → ימות path (for the ▶️ buttons)
  const [recByCall, setRecByCall] = useState<Map<string, string>>(new Map());

  const yemotTypes = types.filter((t) => t.source === 'yemot' && t.is_active);
  const type = types.find((t) => t.id === typeId) || null;
  const contBatch = batches.find((b) => b.id === contBatchId) || null;
  const rangeFrom = mode === 'continue' ? contBatch?.date_from || '' : from;
  const rangeTo = mode === 'continue' ? contBatch?.date_to || '' : to;
  const extension = (mode === 'continue' ? types.find((t) => t.id === contBatch?.type_id) : type)?.yemot_extension || null;

  // ---------- init ----------
  useEffect(() => {
    (async () => {
      try {
        const [t, b, studs] = await Promise.all([sch.listTypes(true), sch.listBatches({ source: 'yemot' }), fetchStudentsLite()]);
        setTypes(t);
        setBatches(b);
        setStudents(studs);
        const first = t.find((x) => x.source === 'yemot' && x.is_active);
        if (first) setTypeId(first.id);
      } catch (e: any) { alert('שגיאה בטעינה: ' + e.message); }
    })();
  }, [sch]);

  // default range: day after the previous ימות batch of this type → today
  useEffect(() => {
    if (!typeId) return;
    const t = types.find((x) => x.id === typeId);
    sch.nextYemotStart(typeId).then((d) => setFrom(d || todayIso().slice(0, 8) + '01'));
    if (t) setTitle(`${t.name} `);
  }, [typeId, types, sch]);

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);

  // ---------- preview ----------
  const loadPreview = useCallback(async () => {
    if (!rangeFrom || !rangeTo) { alert('בחר טווח תאריכים'); return; }
    setBusy('preview');
    seenRef.current = new Set();
    setChecked(new Set());
    setDecided(new Set());
    setRestored(new Set());
    try {
      await rematchUnmatched(await loadIdIndex());
      const cs = await fetchCallsForRange(rangeFrom, rangeTo, extension);
      setCalls(cs);
      // recordings are optional — the preview works without them
      fetchRecordings(rangeFrom, rangeTo)
        .then((recs) => setRecByCall(new Map(recs.filter((r) => r.record !== null).map((r) => [`${r.folder || ''}:${r.record}`, r.what]))))
        .catch(() => setRecByCall(new Map()));
      if (mode === 'continue' && contBatch) {
        const ents = await sch.getBatchEntries(contBatch.id);
        setExistingEntries(new Map(ents.map((e) => [e.student_id, Number(e.amount)])));
      } else setExistingEntries(new Map());
    } catch (e: any) { alert('שגיאה: ' + e.message); }
    setBusy(null);
  }, [rangeFrom, rangeTo, extension, mode, contBatch, sch]);

  const onFile = async (f: File | null) => {
    if (!f) return;
    if (!rangeFrom || !rangeTo) { alert('בחר קודם רכיב וטווח תאריכים'); return; }
    setBusy('upload');
    setMsg(null);
    try {
      const parsed = await readYemotFile(f, extension);
      const r = await storeCalls(parsed, 'file', await loadIdIndex());
      setMsg(`📥 נקראו ${r.total} שורות מהקובץ · ${r.inserted} חדשות נשמרו (${r.total - r.inserted} כבר היו במערכת)`);
      await loadPreview();
    } catch (e: any) { alert('שגיאה בקריאת הקובץ: ' + e.message); }
    if (fileRef.current) fileRef.current.value = '';
    setBusy(null);
  };

  const pullApi = async () => {
    if (!rangeFrom || !rangeTo) { alert('בחר קודם רכיב וטווח תאריכים'); return; }
    setBusy('api');
    setMsg(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/scholarships/yemot-import', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: '{}',
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'שגיאה');
      setMsg(`📞 נמשכו ${j.relevant} שיחות מימות · ${j.inserted} חדשות נשמרו${j.unmatched ? ` (${j.unmatched} לא מזוהות)` : ''}`);
      await loadPreview();
    } catch (e: any) { alert('משיכה מימות נכשלה: ' + e.message); }
    setBusy(null);
  };

  // categorize
  const model = useMemo(() => {
    const out: Record<Category, StudentCalls[]> = { ready: [], questions: [], inactive: [], unmatched: [], already: [], deferred: [], removed: [] };
    const unmatchedIds = new Set<string>();
    if (!calls) return { out, unmatchedIds };
    const pendingByStudent = new Map<string, ScholarshipYemotCall[]>();
    const alreadyByStudent = new Map<string, ScholarshipYemotCall[]>();
    const deferredByStudent = new Map<string, ScholarshipYemotCall[]>();
    const removedByStudent = new Map<string, ScholarshipYemotCall[]>();
    for (const c of calls) {
      if (c.status === 'unmatched') { unmatchedIds.add(c.id); continue; }
      if (!c.student_id) continue;
      let m: Map<string, ScholarshipYemotCall[]>;
      if (c.status === 'excluded') {
        if (c.notes !== REMOVED_NOTE) continue;
        m = removedByStudent;
      } else if (c.status === 'included') m = alreadyByStudent;
      else if (c.status === 'deferred' && !restored.has(c.id)) m = deferredByStudent;
      else m = pendingByStudent;
      if (!m.has(c.student_id)) m.set(c.student_id, []);
      m.get(c.student_id)!.push(c);
    }
    for (const [k, m] of [['deferred', deferredByStudent], ['removed', removedByStudent]] as const) {
      for (const [sid, cs] of m) {
        const s = studentById.get(sid);
        if (!s) continue;
        cs.sort((a, b) => (a.call_at || '').localeCompare(b.call_at || ''));
        out[k].push({ student: s, calls: cs });
      }
    }
    for (const [sid, cs] of pendingByStudent) {
      const s = studentById.get(sid);
      if (!s) continue;
      cs.sort((a, b) => (a.call_at || '').localeCompare(b.call_at || ''));
      const existingAmount = existingEntries.get(sid);
      const item: StudentCalls = { student: s, calls: cs, existingAmount };
      if (s.status !== 'active') out.inactive.push(item);
      else if (cs.length > 1 || existingAmount !== undefined) out.questions.push(item);
      else out.ready.push(item);
    }
    for (const [sid, cs] of alreadyByStudent) {
      const s = studentById.get(sid);
      if (s) out.already.push({ student: s, calls: cs });
    }
    for (const k of Object.keys(out) as Category[]) out[k].sort((a, b) => compareStudents(a.student, b.student));
    return { out, unmatchedIds };
  }, [calls, studentById, existingEntries, restored]);

  // defaults: a ready row is checked when amount > 0 — only the first time it shows up, so
  // deferring / removing a row doesn't reset what was already marked
  useEffect(() => {
    const live = new Set<string>();
    for (const k of ACTIVE_CATS) for (const it of model.out[k]) for (const c of it.calls) live.add(c.id);
    const fresh = model.out.ready.flatMap((it) => it.calls)
      .filter((c) => !seenRef.current.has(c.id) && (Number(c.amount) || 0) > 0).map((c) => c.id);
    for (const id of live) seenRef.current.add(id);
    setChecked((p) => {
      const n = new Set([...p].filter((id) => live.has(id)));
      for (const id of fresh) n.add(id);
      return n;
    });
  }, [model]);

  // ---------- amount filter ----------
  const amtLo = amtMin.trim() === '' ? null : Number(amtMin);
  const amtHi = amtMax.trim() === '' ? null : Number(amtMax);
  const filtering = amtLo !== null || amtHi !== null;
  const inAmt = useCallback((c: ScholarshipYemotCall) => {
    if (amtLo === null && amtHi === null) return true;
    const a = Number(c.amount) || 0;
    const inside = (amtLo === null || a >= amtLo) && (amtHi === null || a <= amtHi);
    return amtOut ? !inside : inside;
  }, [amtLo, amtHi, amtOut]);
  const shown = (k: Category) => model.out[k].filter((it) => it.calls.some(inAmt));
  const targetIds = (k: Category) => shown(k).flatMap((it) => it.calls.filter(inAmt).map((c) => c.id));

  // ---------- defer / remove / restore (saved at once) ----------
  const patchLocal = (ids: string[], patch: Partial<ScholarshipYemotCall>) => {
    const s = new Set(ids);
    setCalls((p) => p && p.map((c) => (s.has(c.id) ? { ...c, ...patch } : c)));
  };
  const dropFromSelection = (ids: string[]) => {
    setChecked((p) => { const n = new Set(p); for (const id of ids) n.delete(id); return n; });
    setRestored((p) => { const n = new Set(p); for (const id of ids) n.delete(id); return n; });
  };
  const deferCalls = async (ids: string[]) => {
    if (!ids.length) return;
    if (ids.length > 1 && !confirm(`לדחות ${ids.length} שיחות? הן לא ייכנסו לחיוב הזה ויופיעו בלשונית "נדחו" ביבוא הבא.`)) return;
    try {
      await updateCalls(ids, { status: 'deferred', notes: null });
      patchLocal(ids, { status: 'deferred', notes: null });
      dropFromSelection(ids);
    } catch (e: any) { alert(e.message); }
  };
  const removeCalls = async (ids: string[]) => {
    if (!ids.length) return;
    if (ids.length > 1 && !confirm(`להסיר ${ids.length} שיחות מהרשימה? אפשר להחזיר אותן מלשונית "הוסרו".`)) return;
    try {
      await updateCalls(ids, { status: 'excluded', notes: REMOVED_NOTE, batch_id: null });
      patchLocal(ids, { status: 'excluded', notes: REMOVED_NOTE, batch_id: null });
      dropFromSelection(ids);
    } catch (e: any) { alert(e.message); }
  };
  const restoreDeferred = (ids: string[]) => setRestored((p) => { const n = new Set(p); for (const id of ids) n.add(id); return n; });
  const restoreRemoved = async (ids: string[]) => {
    if (!ids.length) return;
    try {
      await updateCalls(ids, { status: 'pending', notes: null });
      patchLocal(ids, { status: 'pending', notes: null });
    } catch (e: any) { alert(e.message); }
  };
  const markForPayment = (k: Category, on: boolean) => {
    const ids = targetIds(k);
    setChecked((p) => { const n = new Set(p); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; });
    if (k === 'questions') setDecided((p) => { const n = new Set(p); for (const it of shown(k)) n.add(it.student.id); return n; });
  };

  const embedded = useMemo(() => ({ callIds: model.unmatchedIds, onChanged: () => { loadPreview(); } }), [model.unmatchedIds, loadPreview]);

  const toggleCall = (sid: string, cid: string) => {
    setChecked((p) => { const n = new Set(p); if (n.has(cid)) n.delete(cid); else n.add(cid); return n; });
    setDecided((p) => new Set(p).add(sid));
  };
  const setStudentCalls = (it: StudentCalls, which: 'last' | 'all' | 'none') => {
    setChecked((p) => {
      const n = new Set(p);
      for (const c of it.calls) n.delete(c.id);
      if (which === 'all') for (const c of it.calls) n.add(c.id);
      if (which === 'last') n.add(it.calls[it.calls.length - 1].id);
      return n;
    });
    setDecided((p) => new Set(p).add(it.student.id));
  };

  const undecided = model.out.questions.filter((q) => !decided.has(q.student.id));
  const selectionTotals = useMemo(() => {
    let students = 0, total = 0;
    for (const k of ['ready', 'questions', 'inactive'] as Category[]) {
      for (const it of model.out[k]) {
        const sum = it.calls.filter((c) => checked.has(c.id)).reduce((s, c) => s + (Number(c.amount) || 0), 0);
        if (sum > 0) { students++; total += sum; }
      }
    }
    return { students, total };
  }, [model, checked]);

  // ---------- create / add ----------
  const overlap = useMemo(() => {
    if (mode !== 'new' || !typeId || !from || !to) return null;
    return batches.find((b) => b.type_id === typeId && b.date_from && b.date_to && b.date_from <= to && b.date_to >= from) || null;
  }, [mode, typeId, from, to, batches]);

  const commit = async (skipQuestions: boolean) => {
    if (!skipQuestions && undecided.length) { alert(`יש ${undecided.length} שאלות שלא הוכרעו`); return; }
    if (mode === 'new') {
      if (!typeId || !title.trim() || !from || !to) { alert('חסרים רכיב, כותרת או טווח'); return; }
      if (overlap) { alert(`הטווח חופף לחיוב "${overlap.title}" (${dmy(overlap.date_from)}–${dmy(overlap.date_to)})`); return; }
    }
    const groups = [...model.out.ready, ...model.out.inactive, ...model.out.questions.filter((q) => decided.has(q.student.id))];
    const amounts: Record<string, number> = {};
    for (const it of groups) {
      const sum = it.calls.filter((c) => checked.has(c.id)).reduce((s, c) => s + (Number(c.amount) || 0), 0);
      if (sum > 0) amounts[it.student.id] = Math.round(((it.existingAmount || 0) + sum) * 100) / 100;
    }
    if (!Object.keys(amounts).length) { alert('לא נבחרו שיחות עם סכום'); return; }
    if (!confirm(`${mode === 'new' ? `ליצור חיוב "${title}"` : `להוסיף לחיוב "${contBatch?.title}"`}?\n${Object.keys(amounts).length} תלמידים · ${ils(selectionTotals.total)}` +
      (skipQuestions && undecided.length ? `\n${undecided.length} שאלות יישארו ממתינות` : ''))) return;

    setBusy('commit');
    try {
      const batch = mode === 'new'
        ? await sch.createBatch({ type_id: typeId, title, entry_date: to, source: 'yemot', date_from: from, date_to: to })
        : contBatch!;
      const res = await sch.saveBatchAmounts(batch.id, amounts);
      const entries = await sch.getBatchEntries(batch.id);
      const entryOf = new Map(entries.map((e) => [e.student_id, e.id]));
      // included / excluded per call (undecided questions stay pending)
      const included: Record<string, string[]> = {};
      const excluded: string[] = [];
      for (const it of groups) {
        const eid = amounts[it.student.id] ? entryOf.get(it.student.id) : undefined;
        for (const c of it.calls) {
          if (eid && checked.has(c.id)) (included[eid] ||= []).push(c.id);
          else excluded.push(c.id);
        }
      }
      for (const [eid, ids] of Object.entries(included)) await updateCalls(ids, { status: 'included', batch_id: batch.id, entry_id: eid });
      if (excluded.length) await updateCalls(excluded, { status: 'excluded', batch_id: batch.id });
      alert(`✓ ${mode === 'new' ? 'נוצר חיוב' : 'עודכן החיוב'} "${batch.title}": ${res.upserted} זכאויות` + (res.skippedPaid ? ` · ${res.skippedPaid} ששולמו לא שונו` : ''));
      nav('manual', { batch: batch.id });
    } catch (e: any) { alert('שגיאה: ' + e.message); }
    setBusy(null);
  };

  // ---------- manual rows ----------
  const editManual = async (c: ScholarshipYemotCall) => {
    const v = prompt('סכום חדש:', String(c.amount ?? ''));
    if (v === null) return;
    const n = Number(v);
    if (!(n >= 0)) { alert('סכום לא תקין'); return; }
    try { await updateCall(c.id, { amount: n }); await loadPreview(); } catch (e: any) { alert(e.message); }
  };

  if (!perms.canWrite) return <SectionCard><EmptyState icon="🔒" text="יבוא ימות — למזכירות ולמנהל מערכת" /></SectionCard>;

  const input = 'px-2 py-1.5 border border-slate-300 rounded-lg text-sm';
  const chip = (on: boolean) => `px-3 py-1 rounded-full text-sm border ${on ? 'bg-orange-600 text-white border-orange-600' : 'bg-white border-slate-300 text-slate-700'}`;

  const act = 'text-xs px-1.5 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600';
  const callRow = (it: StudentCalls, c: ScholarshipYemotCall, opts: { checkbox: boolean; actions?: 'pending' | 'deferred' | 'removed'; dim?: boolean }) => (
    <div key={c.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm py-0.5 ${opts.dim ? 'opacity-40' : ''}`}>
      {opts.checkbox && <input type="checkbox" title="להעברה לתשלום" checked={checked.has(c.id)} onChange={() => toggleCall(it.student.id, c.id)} />}
      <span className="tabular-nums">{c.call_at ? `${dmy(israelDate(c.call_at))} ${israelTime(c.call_at)}` : 'ללא תאריך'}</span>
      {c.phone && <span className="tabular-nums text-slate-500" dir="ltr">{c.phone}</span>}
      <span className={`tabular-nums font-semibold ${(Number(c.amount) || 0) === 0 ? 'text-slate-400' : ''}`}>{ils(Number(c.amount) || 0)}</span>
      {c.record_number !== null && recByCall.get(`${c.extension || ''}:${c.record_number}`) && (
        <RecordingPlayer what={recByCall.get(`${c.extension || ''}:${c.record_number}`)!} compact />
      )}
      {c.source === 'manual' && (
        <span className="text-[11px] px-1.5 rounded bg-purple-100 text-purple-800">ידני{c.added_by ? ` · ${c.added_by}` : ''}
          {c.status !== 'included' && <button type="button" className="ms-1 hover:underline" onClick={() => editManual(c)}>✏️</button>}
        </span>
      )}
      {opts.actions === 'pending' && <>
        <button type="button" className={act} title="לא בחיוב הזה — יופיע ביבוא הבא" onClick={() => deferCalls([c.id])}>⏸️ דחה</button>
        <button type="button" className={act} title="הסר מהרשימה (ניתן להחזיר)" onClick={() => removeCalls([c.id])}>✕ הסר</button>
      </>}
      {opts.actions === 'deferred' && <>
        <button type="button" className={act} onClick={() => restoreDeferred([c.id])}>↩️ החזר לחיוב הזה</button>
        <button type="button" className={act} onClick={() => removeCalls([c.id])}>✕ הסר</button>
      </>}
      {opts.actions === 'removed' && (
        <button type="button" className={act} onClick={() => restoreRemoved([c.id])}>↩️ החזר לרשימה</button>
      )}
    </div>
  );

  const nameCell = (it: StudentCalls, extra?: string) => (
    <span><b>{it.student.last_name}</b> {it.student.first_name} <span className="text-xs text-slate-500">· {shiurLabel(it.student)}{extra ? ` · ${extra}` : ''}</span></span>
  );
  const bulkIds = targetIds(cat);

  return (
    <div className="space-y-4">
      <YemotLineCard canWrite={perms.canWrite} />
      <SectionCard title="יבוא שיחות מימות המשיח">
        <div className="space-y-3">
          <div className="flex gap-2">
            <button type="button" className={chip(mode === 'new')} onClick={() => { setMode('new'); setCalls(null); }}>חיוב חדש</button>
            <button type="button" className={chip(mode === 'continue')} onClick={() => { setMode('continue'); setCalls(null); }}>המשך חיוב קיים (שאלות / תוספות)</button>
          </div>

          {mode === 'new' ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-600 flex flex-col">רכיב
                <select className={input} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                  {yemotTypes.length === 0 && <option value="">אין רכיב מסוג ימות</option>}
                  {yemotTypes.map((t) => <option key={t.id} value={t.id}>{t.name} (שלוחה {t.yemot_extension || '—'})</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-600 flex flex-col">מתאריך *
                <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className="text-xs text-slate-600 flex flex-col">עד תאריך *
                <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
              <label className="text-xs text-slate-600 flex flex-col flex-1 min-w-[180px]">שם החיוב
                <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder='למשל "שבתות אלול"' />
              </label>
            </div>
          ) : (
            <label className="text-xs text-slate-600 flex flex-col max-w-md">חיוב ימות קיים
              <select className={input} value={contBatchId} onChange={(e) => { setContBatchId(e.target.value); setCalls(null); }}>
                <option value="">— בחר —</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.title} · {dmy(b.date_from)}–{dmy(b.date_to)}</option>)}
              </select>
            </label>
          )}
          {overlap && <div className="text-sm text-red-700">⛔ הטווח חופף לחיוב &quot;{overlap.title}&quot; ({dmy(overlap.date_from)}–{dmy(overlap.date_to)}). שנה טווח או בחר &quot;המשך חיוב קיים&quot;.</div>}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={pullApi} disabled={!!busy || !rangeFrom || !rangeTo}>📞 משוך מימות עכשיו</Button>
            <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : 'bg-white border border-slate-200 text-slate-800 hover:bg-slate-50'}`}>
              📂 העלה קובץ מימות (xlsx)
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || null)} />
            </label>
            <Button variant="secondary" onClick={loadPreview} disabled={!!busy || !rangeFrom || !rangeTo}>🔄 טען תצוגה מקדימה מהמערכת</Button>
            {calls && <Button variant="secondary" onClick={() => setManualOpen(true)}>➕ הוסף שורה ידנית</Button>}
            {busy && <span className="text-sm text-slate-500">⏳ {busy === 'upload' ? 'קורא ושומר…' : busy === 'api' ? 'מושך מימות…' : busy === 'commit' ? 'יוצר חיוב…' : 'טוען…'}</span>}
          </div>
          {msg && <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{msg}</div>}
          <p className="text-[11px] text-slate-500">רק שיחות שזמן השיחה שלהן בטווח נכנסות לתצוגה. העלאה חוזרת של אותו קובץ לא יוצרת כפילויות.</p>
        </div>
      </SectionCard>

      {calls && (
        <SectionCard title={`תצוגה מקדימה · ${dmy(rangeFrom)}–${dmy(rangeTo)}`}>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(Object.keys(CAT_LABEL) as Category[]).map((k) => {
              const n = k === 'unmatched' ? model.unmatchedIds.size : shown(k).length;
              if ((k === 'deferred' || k === 'removed') && n === 0 && model.out[k].length === 0 && cat !== k) return null;
              return (
                <button key={k} type="button" onClick={() => setCat(k)}
                  className={`px-3 py-1.5 rounded-xl text-sm border ${cat === k ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white border-transparent' : 'bg-white border-slate-200 text-slate-700'}`}>
                  {CAT_LABEL[k]} <b className="tabular-nums">{n}</b>
                  {k === 'questions' && undecided.length > 0 && <span className="ms-1 text-[11px]">({undecided.length} פתוחות)</span>}
                </button>
              );
            })}
          </div>

          {cat !== 'unmatched' && (
            <div className="flex flex-wrap items-center gap-2 mb-3 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <span className="text-slate-600">💰 סינון לפי סכום:</span>
              <span className="text-xs text-slate-500">מ-</span>
              <input value={amtMin} inputMode="decimal" dir="ltr" placeholder="₪" onChange={(e) => setAmtMin(e.target.value.replace(/[^\d.]/g, ''))}
                className="w-20 px-2 py-1 border border-slate-300 rounded-lg text-sm" />
              <span className="text-xs text-slate-500">עד</span>
              <input value={amtMax} inputMode="decimal" dir="ltr" placeholder="₪" onChange={(e) => setAmtMax(e.target.value.replace(/[^\d.]/g, ''))}
                className="w-20 px-2 py-1 border border-slate-300 rounded-lg text-sm" />
              <button type="button" className={chip(!amtOut)} onClick={() => setAmtOut(false)}>בתוך הטווח</button>
              <button type="button" className={chip(amtOut)} onClick={() => setAmtOut(true)} title="מתחת ל'מ-' או מעל ל'עד'">מחוץ לטווח</button>
              <button type="button" className={act} onClick={() => { setAmtMin('0'); setAmtMax('0'); setAmtOut(false); }}>₪0 בלבד</button>
              {filtering && <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => { setAmtMin(''); setAmtMax(''); }}>נקה סינון</button>}
              {filtering && <span className="text-xs text-slate-500">· {bulkIds.length} שיחות בסינון</span>}
              <div className="flex-1" />
              {ACTIVE_CATS.includes(cat) && bulkIds.length > 0 && <>
                <button type="button" className={act} onClick={() => markForPayment(cat, true)}>☑️ סמן הכל לתשלום</button>
                <button type="button" className={act} onClick={() => markForPayment(cat, false)}>⬜ בטל סימון</button>
                <button type="button" className={act} onClick={() => deferCalls(bulkIds)}>⏸️ דחה הכל ({bulkIds.length})</button>
                <button type="button" className={`${act} text-red-700`} onClick={() => removeCalls(bulkIds)}>✕ הסר הכל ({bulkIds.length})</button>
              </>}
              {cat === 'deferred' && bulkIds.length > 0 && (
                <button type="button" className={act} onClick={() => restoreDeferred(bulkIds)}>↩️ החזר הכל לחיוב הזה ({bulkIds.length})</button>
              )}
              {cat === 'removed' && bulkIds.length > 0 && (
                <button type="button" className={act} onClick={() => restoreRemoved(bulkIds)}>↩️ החזר הכל לרשימה ({bulkIds.length})</button>
              )}
            </div>
          )}

          {cat === 'ready' && (shown('ready').length === 0 ? <EmptyState icon="📭" text={filtering ? 'אין שיחות בסינון' : 'אין'} /> : (
            <div className="divide-y divide-slate-100">
              {shown('ready').map((it) => (
                <div key={it.student.id} className="flex flex-wrap items-center gap-x-4 py-1">
                  <span className="w-56 truncate">{nameCell(it)}</span>
                  {callRow(it, it.calls[0], { checkbox: true, actions: 'pending' })}
                </div>
              ))}
            </div>
          ))}

          {cat === 'questions' && (shown('questions').length === 0 ? <EmptyState icon="✅" text={filtering ? 'אין שיחות בסינון' : 'אין שאלות'} /> : (
            <div className="space-y-2">
              {shown('questions').map((it) => {
                const sum = it.calls.filter((c) => checked.has(c.id)).reduce((s, c) => s + (Number(c.amount) || 0), 0);
                const done = decided.has(it.student.id);
                return (
                  <div key={it.student.id} className={`border rounded-xl p-2 ${done ? 'border-emerald-200 bg-emerald-50/30' : 'border-amber-300 bg-amber-50/40'}`}>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span><b>{it.student.last_name}</b> {it.student.first_name} <span className="text-xs text-slate-500">· {shiurLabel(it.student)} · {it.calls.length} שיחות</span></span>
                      {it.existingAmount !== undefined && <span className="text-xs text-blue-700">כבר בחיוב: {ils(it.existingAmount)} (הנבחר יתווסף)</span>}
                      <span className="text-sm">זכאות: <b className="tabular-nums">{ils(sum)}</b></span>
                      <div className="flex-1" />
                      <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setStudentCalls(it, 'last')}>רק האחרונה</button>
                      <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setStudentCalls(it, 'all')}>הכל</button>
                      <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setStudentCalls(it, 'none')}>אף אחת</button>
                    </div>
                    <div className="ps-2">{it.calls.map((c) => callRow(it, c, { checkbox: true, actions: 'pending', dim: filtering && !inAmt(c) }))}</div>
                  </div>
                );
              })}
            </div>
          ))}

          {cat === 'inactive' && (shown('inactive').length === 0 ? <EmptyState icon="📭" text={filtering ? 'אין שיחות בסינון' : 'אין'} /> : (
            <div className="divide-y divide-slate-100">
              {shown('inactive').map((it) => (
                <div key={it.student.id} className="py-1">
                  {nameCell(it, `סטטוס ${it.student.status}`)}
                  <div className="ps-4">{it.calls.filter(inAmt).map((c) => callRow(it, c, { checkbox: true, actions: 'pending' }))}</div>
                </div>
              ))}
            </div>
          ))}

          {(cat === 'deferred' || cat === 'removed') && (shown(cat).length === 0
            ? <EmptyState icon="📭" text={filtering ? 'אין שיחות בסינון' : cat === 'deferred' ? 'אין שיחות שנדחו' : 'לא הוסרו שיחות'} />
            : (
              <div className="divide-y divide-slate-100">
                <p className="text-[11px] text-slate-500 pb-2">
                  {cat === 'deferred'
                    ? 'שיחות שנדחו לא נכנסות לחיוב ומופיעות כאן בכל יבוא (גם מחוץ לטווח התאריכים) עד שמחזירים אותן לחיוב.'
                    : 'שיחות שהוסרו מהרשימה בטווח הזה. אפשר להחזיר אותן לרשימה.'}
                </p>
                {shown(cat).map((it) => (
                  <div key={it.student.id} className="py-1">
                    {nameCell(it)}
                    <div className="ps-4">{it.calls.filter(inAmt).map((c) => callRow(it, c, { checkbox: false, actions: cat }))}</div>
                  </div>
                ))}
              </div>
            ))}

          {cat === 'unmatched' && (model.unmatchedIds.size === 0
            ? <EmptyState icon="✅" text="כל הת״ז זוהו" />
            : <UnmatchedIdsTab {...props} embedded={embedded} />)}

          {cat === 'already' && (shown('already').length === 0 ? <EmptyState icon="📭" text="אין" /> : (
            <div className="divide-y divide-slate-100 opacity-80">
              {shown('already').map((it) => (
                <div key={it.student.id} className="py-1">
                  {nameCell(it)}
                  <span className="text-xs text-slate-500 ms-2">{batches.find((b) => b.id === it.calls[0].batch_id)?.title || ''}</span>
                  <div className="ps-4">{it.calls.filter(inAmt).map((c) => callRow(it, c, { checkbox: false }))}</div>
                </div>
              ))}
            </div>
          ))}

          <div className="sticky bottom-0 z-20 -mx-4 -mb-4 mt-4 px-4 py-3 bg-white/95 backdrop-blur border-t border-slate-200 rounded-b-2xl flex flex-wrap items-center gap-2">
            <span className="text-sm">נבחרו <b>{selectionTotals.students}</b> תלמידים · <b className="text-orange-700">{ils(selectionTotals.total)}</b></span>
            <div className="flex-1" />
            {undecided.length > 0 && <span className="text-xs text-amber-700">{undecided.length} שאלות לא הוכרעו</span>}
            <Button onClick={() => commit(false)} disabled={!!busy || undecided.length > 0 || !!overlap || (mode === 'continue' && !contBatch)}>
              {mode === 'new' ? '✅ צור חיוב' : '✅ הוסף לחיוב'}
            </Button>
            {undecided.length > 0 && (
              <Button variant="secondary" onClick={() => commit(true)} disabled={!!busy || !!overlap || (mode === 'continue' && !contBatch)}>
                {mode === 'new' ? 'צור חיוב בלי השאלות' : 'הוסף בלי השאלות'}
              </Button>
            )}
          </div>
        </SectionCard>
      )}

      {manualOpen && (
        <ManualCallDialog students={students} extension={extension} rangeFrom={rangeFrom} rangeTo={rangeTo}
          onClose={() => { setManualOpen(false); loadPreview(); }} />
      )}
    </div>
  );
}

function ManualCallDialog({ students, extension, rangeFrom, rangeTo, onClose }: {
  students: StudentLite[]; extension: string | null; rangeFrom: string; rangeTo: string; onClose: () => void;
}) {
  const today = todayIso();
  const defaultDate = today >= rangeFrom && today <= rangeTo ? today : rangeTo;
  const [student, setStudent] = useState<StudentLite | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [added, setAdded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const active = useMemo(() => students.filter((s) => s.status === 'active'), [students]);

  const save = async () => {
    if (!student) { searchRef.current?.focus(); return; }
    const n = Number(amount);
    if (!(n > 0)) { amountRef.current?.focus(); return; }
    setBusy(true);
    try {
      await addManualCall({
        studentId: student.id, rawId: student.id_number || student.passport_number, name: `${student.last_name || ''} ${student.first_name || ''}`.trim(),
        shiur: shiurLabel(student), amount: n, date, extension,
      });
      setAdded((a) => [`${student.last_name} ${student.first_name} · ${ils(n)} · ${dmy(date)}`, ...a]);
      setStudent(null);
      setAmount('');
      setTimeout(() => searchRef.current?.focus(), 0);
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center pt-24 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-4 space-y-3" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">➕ הוספת שורה ידנית לרשימה הטלפונית</h3>
          <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>
        {student ? (
          <div className="flex items-center justify-between bg-orange-50 rounded-lg px-3 py-2 text-sm">
            <span><b>{student.last_name}</b> {student.first_name} · {shiurLabel(student)}</span>
            <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => { setStudent(null); setTimeout(() => searchRef.current?.focus(), 0); }}>החלף</button>
          </div>
        ) : (
          <StudentSearchBox students={active} autoFocus inputRef={searchRef}
            onPick={(s) => { setStudent(s); setTimeout(() => amountRef.current?.focus(), 0); }} />
        )}
        <div className="flex gap-2">
          <input ref={amountRef} value={amount} inputMode="numeric" dir="ltr" placeholder="סכום ₪"
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
            className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <Button onClick={save} disabled={busy}>שמור (Enter)</Button>
        </div>
        {added.length > 0 && (
          <div className="text-xs text-emerald-800 bg-emerald-50 rounded-lg p-2 max-h-32 overflow-y-auto">
            {added.map((a, i) => <div key={i}>✓ {a}</div>)}
          </div>
        )}
        <p className="text-[11px] text-slate-500">השורה נשמרת כ&quot;ידני&quot; ומתנהגת כמו שיחה: אם לתלמיד יש עוד שיחה בטווח — היא תעבור לשאלות לבירור.</p>
      </div>
    </div>
  );
}

