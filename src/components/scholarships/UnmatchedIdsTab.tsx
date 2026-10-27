'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { fetchAll } from '@/lib/supabase-paginate';
import { useScholarships } from '@/hooks/useScholarships';
import { stripIdLeadingZeros } from '@/lib/israeli-validators';
import { normalizePhone, israelDate } from '@/lib/yemot-parse';
import { updateCalls, createAlias, listAliases, deleteAlias, israelTime } from '@/lib/yemot-import';
import { ScholarshipBatch, ScholarshipIdAlias, ScholarshipYemotCall } from '@/lib/types';
import {
  ScholarshipTabProps, SectionCard, EmptyState, ils, dmy,
  StudentLite, fetchStudentsLite, shiurLabel, StudentSearchBox,
} from './shared';

// "ת"ז לא מזוהות": every ימות call whose ת"ז the system doesn't know, grouped by ת"ז.
// Suggestions (phone match / one-digit typo / name), manual assign (always = alias, or
// just these calls), ignore (excluded, undoable), and the alias list.
// Also embedded inside the import preview (restricted to that preview's calls).

const IGNORE_NOTE = 'התעלמות — ת"ז לא מזוהה';

interface Group {
  key: string;
  rawId: string | null;
  calls: ScholarshipYemotCall[];
  phones: string[];
  names: string[];
  last: string | null;
  total: number;
}

interface Suggestion { student: StudentLite; why: string }

function oneDigitTypo(a: string, b: string): boolean {
  if (a.length !== b.length || a === b) return false;
  const diff: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { diff.push(i); if (diff.length > 2) return false; }
  if (diff.length === 1) return true;
  return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
}

export function UnmatchedIdsTab({ perms, onCount, embedded }: ScholarshipTabProps & {
  onCount?: (n: number) => void;
  embedded?: { callIds: Set<string>; onChanged: () => void };
}) {
  const sch = useScholarships();
  const [calls, setCalls] = useState<ScholarshipYemotCall[]>([]);
  const [ignored, setIgnored] = useState<ScholarshipYemotCall[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [familyPhones, setFamilyPhones] = useState<Map<string, string[]>>(new Map());
  const [aliases, setAliases] = useState<ScholarshipIdAlias[]>([]);
  const [batches, setBatches] = useState<ScholarshipBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Record<string, StudentLite | null>>({});
  const [afterAssign, setAfterAssign] = useState<{ group: Group; student: StudentLite; batch: ScholarshipBatch } | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [un, ign, studs, fams, al, b] = await Promise.all([
        fetchAll<ScholarshipYemotCall>('scholarship_yemot_calls', '*', (q) => q.eq('status', 'unmatched')),
        embedded ? Promise.resolve([]) : fetchAll<ScholarshipYemotCall>('scholarship_yemot_calls', '*', (q) => q.eq('status', 'excluded').eq('notes', IGNORE_NOTE)),
        fetchStudentsLite(),
        fetchAll<{ id: string; father_phone: string | null; mother_phone: string | null; home_phone: string | null }>('families', 'id, father_phone, mother_phone, home_phone'),
        embedded ? Promise.resolve([]) : listAliases(),
        sch.listBatches(),
      ]);
      setCalls(embedded ? un.filter((c) => embedded.callIds.has(c.id)) : un);
      setIgnored(ign);
      setStudents(studs);
      setFamilyPhones(new Map(fams.map((f) => [f.id, [f.father_phone, f.mother_phone, f.home_phone].map(normalizePhone).filter(Boolean) as string[]])));
      setAliases(al);
      setBatches(b);
    } catch (e: any) { alert('שגיאה בטעינה: ' + e.message); }
    setLoading(false);
  }, [sch, embedded]);
  useEffect(() => { load(); }, [load]);

  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, Group>();
    for (const c of calls) {
      const key = c.raw_id_number ? `id:${c.raw_id_number}` : `name:${c.raw_name || ''}|${c.raw_shiur || ''}`;
      if (!m.has(key)) m.set(key, { key, rawId: c.raw_id_number, calls: [], phones: [], names: [], last: null, total: 0 });
      const g = m.get(key)!;
      g.calls.push(c);
      for (const p of [c.phone, c.phone2]) if (p && !g.phones.includes(p)) g.phones.push(p);
      if (c.raw_name && !g.names.includes(c.raw_name)) g.names.push(c.raw_name);
      if (c.call_at && (!g.last || c.call_at > g.last)) g.last = c.call_at;
      g.total += Number(c.amount) || 0;
    }
    return Array.from(m.values()).sort((a, b) => (b.last || '').localeCompare(a.last || ''));
  }, [calls]);

  useEffect(() => { if (!embedded && !loading) onCount?.(groups.length); }, [groups.length, embedded, loading, onCount]);

  // ---------- suggestion indexes ----------
  const byPhone = useMemo(() => {
    const m = new Map<string, StudentLite[]>();
    const add = (p: string | null | undefined, s: StudentLite) => { const n = normalizePhone(p); if (n) { if (!m.has(n)) m.set(n, []); if (!m.get(n)!.includes(s)) m.get(n)!.push(s); } };
    for (const s of students) {
      add(s.phone, s);
      for (const p of (s.family_id ? familyPhones.get(s.family_id) : null) || []) add(p, s);
    }
    return m;
  }, [students, familyPhones]);
  const activeIds = useMemo(() => students.filter((s) => s.status === 'active')
    .map((s) => ({ s, id: stripIdLeadingZeros(s.id_number) })).filter((x) => x.id), [students]);

  const suggestionsFor = (g: Group): Suggestion[] => {
    const out = new Map<string, Suggestion>();
    for (const p of g.phones) for (const s of byPhone.get(p) || []) if (!out.has(s.id)) out.set(s.id, { student: s, why: `טלפון ${p}` });
    if (g.rawId && g.rawId.length >= 6) {
      for (const { s, id } of activeIds) if (oneDigitTypo(g.rawId, id) && !out.has(s.id)) out.set(s.id, { student: s, why: `ת״ז ${id} (ספרה אחת)` });
    }
    for (const name of g.names) {
      const tokens = name.split(/\s+/).filter((t) => t.length > 1);
      if (tokens.length < 2) continue;
      for (const s of students) {
        const pool = `${s.last_name || ''} ${s.first_name || ''}`;
        if (s.status === 'active' && tokens.every((t) => pool.includes(t)) && !out.has(s.id)) out.set(s.id, { student: s, why: 'שם תואם' });
      }
    }
    return Array.from(out.values()).slice(0, 5);
  };

  // ---------- actions ----------
  const coveringBatch = (g: Group): ScholarshipBatch | null => {
    // rows imported for a specific batch (e.g. the one-time סיכומים Excel) carry batch_id
    const tagged = g.calls.find((c) => c.batch_id)?.batch_id;
    if (tagged) { const b = batches.find((x) => x.id === tagged); if (b) return b; }
    for (const b of batches) {
      if (b.source !== 'yemot' || !b.date_from || !b.date_to) continue;
      if (g.calls.some((c) => c.call_at && israelDate(c.call_at) >= b.date_from! && israelDate(c.call_at) <= b.date_to!)) return b;
    }
    return null;
  };

  const assign = async (g: Group, s: StudentLite, always: boolean) => {
    setBusy(true);
    try {
      if (always && g.rawId) await createAlias(g.rawId, s.id, `שויך ממסך ת"ז לא מזוהות (${g.names[0] || ''})`);
      await updateCalls(g.calls.map((c) => c.id), { student_id: s.id, status: 'pending' });
      const b = coveringBatch(g);
      if (b) setAfterAssign({ group: g, student: s, batch: b });
      await load();
      embedded?.onChanged();
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  const addToBatch = async () => {
    if (!afterAssign) return;
    const { group, student, batch } = afterAssign;
    setBusy(true);
    try {
      const inRange = batch.source === 'yemot'
        ? group.calls.filter((c) => c.call_at && israelDate(c.call_at) >= batch.date_from! && israelDate(c.call_at) <= batch.date_to!)
        : group.calls.filter((c) => c.batch_id === batch.id);
      const existing = (await sch.getBatchEntries(batch.id)).find((e) => e.student_id === student.id);
      const add = inRange.reduce((s, c) => s + (Number(c.amount) || 0), 0);
      if (existing && batch.source !== 'yemot' && !existing.payment_id) {
        if (confirm(`ל${student.first_name} ${student.last_name} כבר יש ${ils(existing.amount)} בחיוב "${batch.title}". להוסיף ${ils(add)}?`)) {
          await sch.updateEntry(existing.id, { amount: Math.round((Number(existing.amount) + add) * 100) / 100 });
          await updateCalls(inRange.map((c) => c.id), { status: 'included', batch_id: batch.id, entry_id: existing.id });
          alert('✓ עודכן');
        }
      } else if (existing) {
        alert(`ל${student.first_name} ${student.last_name} כבר יש זכאות של ${ils(existing.amount)} בחיוב "${batch.title}".\nהשיחות סומנו כממתינות — הכרע עליהן בלשונית "יבוא ימות" ← "המשך חיוב קיים" (שאלות לבירור).`);
      } else {
        const amount = inRange.reduce((s, c) => s + (Number(c.amount) || 0), 0);
        if (amount <= 0) { alert('סכום השיחות בטווח הוא 0 — לא נוספה זכאות'); }
        else {
          const entry = await sch.addEntry(batch.id, student.id, amount);
          await updateCalls(inRange.map((c) => c.id), { status: 'included', batch_id: batch.id, entry_id: entry.id });
          alert(`✓ נוספה זכאות ${ils(amount)} לחיוב "${batch.title}"`);
        }
      }
      setAfterAssign(null);
      embedded?.onChanged();
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  const ignore = async (g: Group) => {
    if (!confirm(`להתעלם מ-${g.calls.length} שיחות (${g.rawId || g.names[0] || '—'})?\nאפשר לבטל בהמשך.`)) return;
    try { await updateCalls(g.calls.map((c) => c.id), { status: 'excluded', notes: IGNORE_NOTE }); await load(); embedded?.onChanged(); }
    catch (e: any) { alert(e.message); }
  };
  const unignore = async (ids: string[]) => {
    try { await updateCalls(ids, { status: 'unmatched', notes: null }); await load(); } catch (e: any) { alert(e.message); }
  };
  const removeAlias = async (a: ScholarshipIdAlias) => {
    if (!confirm(`למחוק את השיוך של ת"ז ${a.raw_id_number}?\n(שיחות שכבר נכללו בחיוב לא ישתנו)`)) return;
    try { await deleteAlias(a.id); await load(); } catch (e: any) { alert(e.message); }
  };

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const ignoredGroups = useMemo(() => {
    const m = new Map<string, ScholarshipYemotCall[]>();
    for (const c of ignored) { const k = c.raw_id_number || c.raw_name || '—'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(c); }
    return Array.from(m.entries());
  }, [ignored]);

  if (loading) return <SectionCard><div className="py-8 text-center text-slate-400">טוען…</div></SectionCard>;

  const body = (
    <div className="space-y-3">
      {afterAssign && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-sm flex flex-wrap items-center gap-2">
          <span>✓ שויך ל{afterAssign.student.first_name} {afterAssign.student.last_name}. השיחה בטווח של החיוב &quot;{afterAssign.batch.title}&quot;.</span>
          <Button size="sm" onClick={addToBatch} disabled={busy}>הוסף לחיוב {afterAssign.batch.title}</Button>
          <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setAfterAssign(null)}>לא עכשיו</button>
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState icon="✅" text="אין ת״ז לא מזוהות" />
      ) : groups.map((g) => {
        const sugg = suggestionsFor(g);
        const chosen = picked[g.key];
        return (
          <div key={g.key} className="border border-slate-200 rounded-xl p-3">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
              <span className="font-bold tabular-nums" dir="ltr">{g.rawId || 'ללא ת״ז'}</span>
              {g.names.length > 0 && <span>{g.names.join(' / ')}{g.calls[0]?.raw_shiur ? ` · שיעור ${g.calls[0].raw_shiur}` : ''}</span>}
              <span className="text-slate-500">{g.calls.length} שיחות</span>
              {g.phones.length > 0 && <span className="text-slate-500 tabular-nums" dir="ltr">{g.phones.join(', ')}</span>}
              {g.last && <span className="text-slate-500">אחרונה {dmy(israelDate(g.last))} {israelTime(g.last)}</span>}
              <span className="font-semibold text-orange-700">{ils(g.total)}</span>
            </div>
            {perms.canWrite && (
              <div className="mt-2 space-y-2">
                {sugg.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-500">הצעות:</span>
                    {sugg.map((sg) => (
                      <span key={sg.student.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200">
                        <b>{sg.student.last_name} {sg.student.first_name}</b> · {shiurLabel(sg.student)} <span className="text-slate-500">({sg.why})</span>
                        <button type="button" disabled={busy} className="text-emerald-800 font-semibold hover:underline ms-1"
                          onClick={() => assign(g, sg.student, !!g.rawId)}>שייך</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-72"><StudentSearchBox students={students} onPick={(s) => setPicked({ ...picked, [g.key]: s })} /></div>
                  {chosen && (
                    <>
                      <span className="text-sm">← <b>{chosen.last_name} {chosen.first_name}</b> ({shiurLabel(chosen)})</span>
                      {g.rawId && <Button size="sm" onClick={() => assign(g, chosen, true)} disabled={busy}>שייך תמיד</Button>}
                      <Button size="sm" variant="secondary" onClick={() => assign(g, chosen, false)} disabled={busy}>שייך את השיחות האלה בלבד</Button>
                    </>
                  )}
                  <div className="flex-1" />
                  <button type="button" className="text-xs text-slate-500 hover:text-red-600 hover:underline" onClick={() => ignore(g)}>התעלם</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  if (embedded) return body;

  return (
    <div className="space-y-4">
      <SectionCard title={`ת״ז לא מזוהות (${groups.length})`}>{body}</SectionCard>

      <SectionCard title={`שיוכים קבועים (${aliases.length})`} accent="from-blue-500 to-indigo-600">
        {aliases.length === 0 ? <p className="text-sm text-slate-400">אין שיוכים</p> : (
          <table className="w-full text-sm">
            <tbody>
              {aliases.map((a) => {
                const s = studentById.get(a.student_id);
                return (
                  <tr key={a.id} className="border-b border-slate-50">
                    <td className="px-2 py-1 tabular-nums" dir="ltr">{a.raw_id_number}</td>
                    <td className="px-2 py-1">→ {s ? `${s.last_name} ${s.first_name} · ${shiurLabel(s)}` : '—'}</td>
                    <td className="px-2 py-1 text-xs text-slate-500">{a.notes}</td>
                    <td className="px-2 py-1 text-end">{perms.canWrite && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => removeAlias(a)}>מחק שיוך</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </SectionCard>

      {ignoredGroups.length > 0 && (
        <SectionCard title={`בהתעלמות (${ignoredGroups.length})`} accent="from-slate-400 to-slate-600"
          actions={<button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => setShowIgnored(!showIgnored)}>{showIgnored ? 'הסתר' : 'הצג'}</button>}>
          {showIgnored ? ignoredGroups.map(([k, cs]) => (
            <div key={k} className="flex items-center gap-3 text-sm py-1 border-b border-slate-50">
              <span className="tabular-nums" dir="ltr">{k}</span>
              <span className="text-slate-500">{cs.length} שיחות · {ils(cs.reduce((s, c) => s + (Number(c.amount) || 0), 0))}</span>
              {perms.canWrite && <button type="button" className="text-xs text-blue-600 hover:underline" onClick={() => unignore(cs.map((c) => c.id))}>בטל התעלמות</button>}
            </div>
          )) : <p className="text-xs text-slate-400">{ignored.length} שיחות</p>}
        </SectionCard>
      )}
    </div>
  );
}

export { IGNORE_NOTE };
