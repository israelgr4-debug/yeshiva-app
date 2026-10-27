'use client';

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useScholarships } from '@/hooks/useScholarships';
import { ScholarshipBatch, ScholarshipEntry, ScholarshipType } from '@/lib/types';
import {
  ScholarshipTabProps, SectionCard, EmptyState, ils, dmy, todayIso,
  StudentLite, fetchStudentsLite, compareStudents, shiurLabel, ShiurPicker, matchesShiurSelection, matchesSearch,
} from './shared';

// ===================================================================================
// "הזנה ידנית": list of batches + a keyboard-first amount grid for one batch.
// The grid keeps typed amounts in a ref (not React state) and uses uncontrolled,
// memoized rows, so typing never re-renders the ~1000-row table.
// ===================================================================================

export function ManualEntryTab(props: ScholarshipTabProps) {
  const { params } = props;
  if (params.batch) return <BatchGrid key={params.batch + (params.title || '')} {...props} />;
  return <BatchList {...props} />;
}

// ---------------------------------- batch list ----------------------------------

function BatchList({ perms, nav }: ScholarshipTabProps) {
  const sch = useScholarships();
  const [types, setTypes] = useState<ScholarshipType[]>([]);
  const [batches, setBatches] = useState<ScholarshipBatch[]>([]);
  const [stats, setStats] = useState<Record<string, { students: number; total: number; paid: number }>>({});
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [form, setForm] = useState<{ type_id: string; title: string; date: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [t, b] = await Promise.all([sch.listTypes(true), sch.listBatches()]);
        setTypes(t);
        setBatches(b);
        setStats(await sch.batchStats(b.map((x) => x.id)));
      } catch (e: any) { alert('שגיאה בטעינה: ' + e.message); }
      setLoading(false);
    })();
  }, [sch]);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const manualTypes = types.filter((t) => t.is_active && t.source === 'manual');
  const shown = typeFilter ? batches.filter((b) => b.type_id === typeFilter) : batches;

  const openNew = () => {
    if (!form?.type_id || !form.title.trim() || !form.date) { alert('יש לבחור רכיב, כותרת ותאריך'); return; }
    nav('manual', { batch: 'new', type: form.type_id, title: form.title.trim(), date: form.date });
  };

  const input = 'px-2 py-1.5 border border-slate-300 rounded-lg text-sm';

  return (
    <SectionCard
      title="חיובים תקופתיים"
      actions={perms.canWrite && !form ? (
        <Button size="sm" onClick={() => {
          const t = manualTypes[0];
          setForm({ type_id: t?.id || '', title: t ? `${t.name} ` : '', date: todayIso() });
        }}>➕ חיוב תקופתי חדש</Button>
      ) : undefined}
    >
      {form && (
        <div className="mb-4 p-3 rounded-xl bg-orange-50/60 border border-orange-200 flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600 flex flex-col">רכיב
            <select className={input} value={form.type_id} onChange={(e) => {
              const t = typeById.get(e.target.value);
              setForm({ ...form, type_id: e.target.value, title: t ? `${t.name} ` : form.title });
            }}>
              {manualTypes.length === 0 && <option value="">אין רכיב ידני פעיל</option>}
              {manualTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600 flex flex-col flex-1 min-w-[180px]">כותרת
            <input autoFocus className={input} value={form.title} placeholder='למשל "סיכומים חשוון"'
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') openNew(); }} />
          </label>
          <label className="text-xs text-slate-600 flex flex-col">תאריך החיוב
            <input type="date" className={input} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </label>
          <Button size="sm" variant="secondary" onClick={() => setForm(null)}>ביטול</Button>
          <Button size="sm" onClick={openNew}>פתח טבלת הזנה ←</Button>
          <p className="w-full text-[11px] text-slate-500">החיוב נוצר בפועל רק בלחיצה על &quot;שמור&quot; בטבלה. רכיבי ימות נוצרים מלשונית &quot;יבוא ימות&quot;.</p>
        </div>
      )}

      {types.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {[{ id: '', name: 'הכל' }, ...types].map((t) => (
            <button key={t.id} type="button" onClick={() => setTypeFilter(t.id)}
              className={`px-3 py-1 rounded-full text-sm border ${typeFilter === t.id ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white border-transparent' : 'bg-white border-slate-200 text-slate-600'}`}>
              {t.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-400">טוען…</div>
      ) : shown.length === 0 ? (
        <EmptyState icon="🎁" text="אין עדיין חיובים תקופתיים" hint={perms.canWrite ? 'לחץ "חיוב תקופתי חדש" כדי להתחיל' : undefined} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <th className="text-start px-3 py-2">כותרת</th>
                <th className="text-start px-3 py-2">רכיב</th>
                <th className="text-start px-3 py-2">תאריך</th>
                <th className="text-start px-3 py-2">תלמידים</th>
                <th className="text-start px-3 py-2">סה״כ</th>
                <th className="text-start px-3 py-2">שולם</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((b) => {
                const st = stats[b.id] || { students: 0, total: 0, paid: 0 };
                return (
                  <tr key={b.id} onClick={() => nav('manual', { batch: b.id })} className="border-b border-slate-50 hover:bg-blue-50/40 cursor-pointer">
                    <td className="px-3 py-2 font-medium text-blue-700">
                      {b.title}
                      {b.source === 'yemot' && <span className="ms-2 text-[11px] text-slate-500">📞 {dmy(b.date_from)}–{dmy(b.date_to)}</span>}
                    </td>
                    <td className="px-3 py-2">{typeById.get(b.type_id)?.name || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{dmy(b.entry_date)}</td>
                    <td className="px-3 py-2 tabular-nums">{st.students}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{ils(st.total)}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {st.paid > 0 ? <span className={st.paid >= st.total ? 'text-emerald-700' : 'text-amber-700'}>{ils(st.paid)}</span> : <span className="text-slate-400">—</span>}
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

// ---------------------------------- the grid ----------------------------------

const draftKey = (batchId: string, p: Record<string, string>) =>
  batchId === 'new' ? `sch-draft:new:${p.type}:${p.title}:${p.date}` : `sch-draft:${batchId}`;

function readDraft(key: string): { amounts: Record<string, string>; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeDraft(key: string, amounts: Record<string, string>) {
  try { localStorage.setItem(key, JSON.stringify({ amounts, savedAt: new Date().toISOString() })); } catch { /* ignore */ }
}
function clearDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

const cleanAmount = (v: string) => {
  let s = v.replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
  return s;
};
const num = (v: string | undefined) => {
  const n = Number(v);
  return v && Number.isFinite(n) && n > 0 ? n : 0;
};

interface RowProps {
  s: StudentLite;
  initial: string;
  locked: { amount: number; paidAt: string } | null;
  readOnly: boolean;
  register: (id: string, el: HTMLInputElement | null) => void;
  onValue: (id: string, v: string) => void;
  onKey: (id: string, e: React.KeyboardEvent<HTMLInputElement>) => void;
}

const GridRow = memo(function GridRow({ s, initial, locked, readOnly, register, onValue, onKey }: RowProps) {
  return (
    <tr className={`border-b border-slate-50 focus-within:bg-orange-50 focus-within:ring-1 focus-within:ring-orange-300 ${locked ? 'bg-emerald-50/50' : ''}`}>
      <td className="px-3 py-1">
        {s.last_name}
        {s.status !== 'active' && <span className="ms-1 text-[10px] text-slate-400">(לא פעיל)</span>}
      </td>
      <td className="px-3 py-1">{s.first_name}</td>
      <td className="px-3 py-1 text-slate-500">{shiurLabel(s)}</td>
      <td className="px-3 py-1 tabular-nums text-slate-500" dir="ltr">{s.id_number || s.passport_number || ''}</td>
      <td className="px-2 py-0.5 w-36">
        {locked ? (
          <span className="block px-2 py-1 text-emerald-800 font-semibold tabular-nums" title={`שולם ${dmy(locked.paidAt)} — נעול`}>
            🔒 {ils(locked.amount)} <span className="text-[10px] font-normal">שולם {dmy(locked.paidAt)}</span>
          </span>
        ) : (
          <input
            ref={(el) => register(s.id, el)}
            defaultValue={initial}
            readOnly={readOnly}
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            className="w-full px-2 py-1 border border-slate-200 rounded-md text-sm tabular-nums text-end focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
            onFocus={(e) => {
              e.currentTarget.select();
              e.currentTarget.closest('tr')?.scrollIntoView({ block: 'nearest' });
            }}
            onChange={(e) => {
              const c = cleanAmount(e.currentTarget.value);
              if (c !== e.currentTarget.value) e.currentTarget.value = c;
              onValue(s.id, c);
            }}
            onKeyDown={(e) => onKey(s.id, e)}
          />
        )}
      </td>
    </tr>
  );
});

/** Sticky footer that re-renders on its own (subscribes to the grid's change signal). */
function GridSummary({ subscribe, compute }: { subscribe: (fn: () => void) => () => void; compute: () => { count: number; total: number } }) {
  const [sum, setSum] = useState(compute);
  useEffect(() => subscribe(() => setSum(compute())), [subscribe, compute]);
  return (
    <span className="text-sm">
      <b className="tabular-nums">{sum.count}</b> תלמידים עם סכום · סה״כ <b className="tabular-nums text-orange-700">{ils(sum.total)}</b>
    </span>
  );
}

function BatchGrid({ perms, nav, params }: ScholarshipTabProps) {
  const sch = useScholarships();
  const isNew = params.batch === 'new';
  const dKey = draftKey(params.batch, params);
  const readOnly = !perms.canWrite;

  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<ScholarshipType | null>(null);
  const [batch, setBatch] = useState<ScholarshipBatch | null>(null);
  const [title, setTitle] = useState(params.title || '');
  const [date, setDate] = useState(params.date || todayIso());
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [entries, setEntries] = useState<Map<string, ScholarshipEntry>>(new Map());
  const [paidAt, setPaidAt] = useState<Map<string, string>>(new Map());
  const [shiurSel, setShiurSel] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [fillValue, setFillValue] = useState('');
  const [version, setVersion] = useState(0);          // bump → rows remount with current ref values
  const [draftInfo, setDraftInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amountsRef = useRef<Record<string, string>>({});
  const serverRef = useRef<Record<string, string>>({});
  const inputsRef = useRef<Map<string, HTMLInputElement>>(new Map());
  const listenersRef = useRef<Set<() => void>>(new Set());
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback(() => { listenersRef.current.forEach((fn) => fn()); }, []);
  const subscribe = useCallback((fn: () => void) => { listenersRef.current.add(fn); return () => { listenersRef.current.delete(fn); }; }, []);
  const compute = useCallback(() => {
    let count = 0, total = 0;
    for (const v of Object.values(amountsRef.current)) { const n = num(v); if (n > 0) { count++; total += n; } }
    return { count, total };
  }, []);

  // ---------- load ----------
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const types = await sch.listTypes(true);
      let b: ScholarshipBatch | null = null;
      let ents: ScholarshipEntry[] = [];
      if (!isNew) {
        b = await sch.getBatch(params.batch);
        if (!b) { alert('החיוב לא נמצא'); nav('manual'); return; }
        ents = await sch.getBatchEntries(b.id);
        setTitle(b.title);
        setDate(b.entry_date);
      }
      setBatch(b);
      setType(types.find((t) => t.id === (b?.type_id || params.type)) || null);

      const active = await fetchStudentsLite({ activeOnly: true });
      const have = new Set(active.map((s) => s.id));
      const missing = ents.map((e) => e.student_id).filter((id) => !have.has(id));
      const extra = missing.length ? await fetchStudentsLite({ ids: missing }) : [];
      setStudents([...active, ...extra].sort(compareStudents));

      const emap = new Map(ents.map((e) => [e.student_id, e]));
      setEntries(emap);
      const payIds = Array.from(new Set(ents.map((e) => e.payment_id).filter(Boolean))) as string[];
      if (payIds.length) {
        const pays = await sch.fetchPayments({ ids: payIds });
        setPaidAt(new Map(pays.map((p) => [p.id, p.paid_at])));
      }

      const server: Record<string, string> = {};
      for (const e of ents) server[e.student_id] = String(Number(e.amount));
      serverRef.current = server;
      const draft = readDraft(dKey);
      if (draft && !readOnly) {
        amountsRef.current = { ...server, ...draft.amounts };
        setDraftInfo(draft.savedAt);
      } else {
        amountsRef.current = { ...server };
      }
      setVersion((v) => v + 1);
    } catch (e: any) { alert('שגיאה בטעינה: ' + e.message); }
    setLoading(false);
  }, [sch, isNew, params.batch, params.type, dKey, nav, readOnly]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(
    () => students.filter((s) => matchesShiurSelection(s, shiurSel) && matchesSearch(s, search)),
    [students, shiurSel, search]
  );
  const rowIndex = useMemo(() => new Map(rows.map((s, i) => [s.id, i])), [rows]);

  const lockedFor = useCallback((sid: string) => {
    const e = entries.get(sid);
    return e?.payment_id ? { amount: Number(e.amount), paidAt: paidAt.get(e.payment_id) || '' } : null;
  }, [entries, paidAt]);

  // focus the first editable cell once loaded (not on filter changes — the user may be typing in the search box)
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useEffect(() => {
    if (loading || readOnly) return;
    const first = rowsRef.current.find((s) => inputsRef.current.get(s.id));
    if (first) inputsRef.current.get(first.id)?.focus();
  }, [loading, version, readOnly]);

  // ---------- typing ----------
  const register = useCallback((id: string, el: HTMLInputElement | null) => {
    if (el) inputsRef.current.set(id, el); else inputsRef.current.delete(id);
  }, []);

  const scheduleDraft = useCallback(() => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      const diff: Record<string, string> = {};
      for (const [k, v] of Object.entries(amountsRef.current)) if ((serverRef.current[k] || '') !== (v || '')) diff[k] = v;
      if (Object.keys(diff).length) writeDraft(dKey, diff); else clearDraft(dKey);
    }, 400);
  }, [dKey]);

  const onValue = useCallback((id: string, v: string) => {
    amountsRef.current[id] = v;
    scheduleDraft();
    notify();
  }, [scheduleDraft, notify]);

  const move = useCallback((id: string, dir: 1 | -1) => {
    let i = rowIndex.get(id);
    if (i === undefined) return;
    for (i += dir; i >= 0 && i < rows.length; i += dir) {
      const el = inputsRef.current.get(rows[i].id);
      if (el) { el.focus(); return; }
    }
  }, [rowIndex, rows]);

  const onKey = useCallback((id: string, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); move(id, 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(id, -1); }
    else if (e.key === 'Escape' || e.key === 'Delete') {
      e.preventDefault();
      e.currentTarget.value = '';
      onValue(id, '');
    }
  }, [move, onValue]);

  // ---------- tools ----------
  const setMany = (ids: string[], value: (sid: string) => string | null) => {
    for (const sid of ids) {
      if (lockedFor(sid)) continue;
      const v = value(sid);
      if (v === null) continue;
      amountsRef.current[sid] = v;
      const el = inputsRef.current.get(sid);
      if (el) el.value = v;
    }
    scheduleDraft();
    notify();
  };
  const fillAll = () => {
    const v = cleanAmount(fillValue);
    if (!num(v)) { alert('הזן סכום למילוי'); return; }
    if (!confirm(`למלא ${ils(num(v))} לכל ${rows.length} התלמידים המסוננים? (סכומים קיימים יוחלפו)`)) return;
    setMany(rows.map((s) => s.id), () => v);
  };
  const fillDefault = () => {
    const d = type?.default_amount;
    if (!d) { alert('לרכיב אין סכום ברירת מחדל (מוגדר בלשונית "סוגי מלגות")'); return; }
    setMany(rows.map((s) => s.id), (sid) => (num(amountsRef.current[sid]) ? null : String(d)));
  };
  const clearAll = () => {
    if (!confirm(`לנקות את הסכומים של ${rows.length} התלמידים המסוננים?`)) return;
    setMany(rows.map((s) => s.id), () => '');
  };
  const discardDraft = () => {
    if (!confirm('לבטל את הטיוטה ולחזור לנתונים השמורים?')) return;
    clearDraft(dKey);
    amountsRef.current = { ...serverRef.current };
    setDraftInfo(null);
    setVersion((v) => v + 1);
    notify();
  };

  // ---------- save / delete ----------
  const save = async () => {
    if (!title.trim() || !date) { alert('חסרים כותרת או תאריך'); return; }
    const amounts: Record<string, number | null> = {};
    for (const [sid, v] of Object.entries(amountsRef.current)) amounts[sid] = num(v) || null;
    const { count, total } = compute();
    if (isNew && count === 0) { alert('לא הוזנו סכומים'); return; }
    setSaving(true);
    try {
      let batchId = batch?.id;
      if (!batchId) {
        const b = await sch.createBatch({ type_id: params.type, title, entry_date: date, source: 'manual' });
        batchId = b.id;
      } else if (title !== batch!.title || date !== batch!.entry_date) {
        await sch.updateBatch(batchId, { title, entry_date: date });
      }
      const r = await sch.saveBatchAmounts(batchId, amounts);
      clearDraft(dKey);
      setDraftInfo(null);
      alert(`✓ נשמר: ${count} תלמידים · ${ils(total)}\nנוספו/עודכנו ${r.upserted} · נמחקו ${r.deleted}` +
        (r.skippedPaid ? `\n${r.skippedPaid} זכאויות ששולמו לא שונו (נעולות)` : ''));
      if (isNew) nav('manual', { batch: batchId });
      else await load();
    } catch (e: any) { alert('שגיאה בשמירה: ' + e.message); }
    setSaving(false);
  };

  const removeBatch = async () => {
    if (!batch) return;
    if (!confirm(`למחוק את החיוב "${batch.title}" וכל הזכאויות שבו?\n(אם יש זכאויות ששולמו — המחיקה תיחסם)`)) return;
    try {
      await sch.deleteBatch(batch.id);
      clearDraft(dKey);
      nav('manual');
    } catch (e: any) { alert(e.message); }
  };

  if (loading) return <SectionCard><div className="py-10 text-center text-slate-400">טוען תלמידים…</div></SectionCard>;

  const input = 'px-2 py-1.5 border border-slate-300 rounded-lg text-sm';
  return (
    <SectionCard
      title={<>{isNew ? 'חיוב חדש' : 'עריכת חיוב'} — {type?.name || ''}{batch?.source === 'yemot' && <span className="text-xs text-slate-500 ms-2">📞 ימות {dmy(batch.date_from)}–{dmy(batch.date_to)}</span>}</>}
      actions={<>
        <Button size="sm" variant="secondary" onClick={() => nav('manual')}>← לרשימת החיובים</Button>
        {perms.canAdmin && batch && <Button size="sm" variant="danger" onClick={removeBatch}>🗑️ מחק חיוב</Button>}
      </>}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600 flex flex-col flex-1 min-w-[200px]">כותרת
            <input className={input} value={title} readOnly={readOnly} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="text-xs text-slate-600 flex flex-col">תאריך החיוב
            <input type="date" className={input} value={date} readOnly={readOnly} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        {draftInfo && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2">
            <span>📝 שוחזרה טיוטה שלא נשמרה (מ-{new Date(draftInfo).toLocaleString('he-IL')}). לחץ &quot;שמור&quot; כדי לשמור אותה.</span>
            <button type="button" onClick={discardDraft} className="text-xs text-red-700 hover:underline">בטל טיוטה</button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <ShiurPicker selected={shiurSel} onChange={setShiurSel} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש שם / ת״ז…" className={`${input} w-48`} />
        </div>

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">כלים ({rows.length} מסוננים):</span>
            <input value={fillValue} onChange={(e) => setFillValue(cleanAmount(e.target.value))} placeholder="סכום" inputMode="numeric" dir="ltr" className={`${input} w-24`} />
            <Button size="sm" variant="secondary" onClick={fillAll}>מלא לכל המסוננים</Button>
            <Button size="sm" variant="secondary" onClick={fillDefault} title="ממלא רק תאים ריקים">
              מלא ברירת מחדל{type?.default_amount ? ` (${ils(type.default_amount)})` : ''}
            </Button>
            <Button size="sm" variant="ghost" onClick={clearAll}>נקה הכל</Button>
          </div>
        )}

        <div className="border border-slate-200 rounded-xl overflow-auto max-h-[65vh]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 z-10">
              <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="text-start px-3 py-2">שם משפחה</th>
                <th className="text-start px-3 py-2">שם פרטי</th>
                <th className="text-start px-3 py-2">שיעור</th>
                <th className="text-start px-3 py-2">ת״ז</th>
                <th className="text-end px-3 py-2">סכום ₪</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <GridRow
                  key={`${s.id}:${version}`}
                  s={s}
                  initial={amountsRef.current[s.id] || ''}
                  locked={lockedFor(s.id)}
                  readOnly={readOnly}
                  register={register}
                  onValue={onValue}
                  onKey={onKey}
                />
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <EmptyState icon="🔍" text="אין תלמידים בסינון הזה" />}
        </div>

        <div className="sticky bottom-0 z-20 -mx-4 -mb-4 px-4 py-3 bg-white/95 backdrop-blur border-t border-slate-200 rounded-b-2xl flex flex-wrap items-center justify-between gap-2">
          <GridSummary subscribe={subscribe} compute={compute} />
          <span className="text-[11px] text-slate-400 hidden md:inline">Enter / ↓ הבא · ↑ הקודם · Esc / Delete מנקה · תא ריק = אין זכאות</span>
          {!readOnly && <Button onClick={save} disabled={saving}>{saving ? 'שומר…' : '💾 שמור'}</Button>}
        </div>
      </div>
    </SectionCard>
  );
}
