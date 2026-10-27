'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { fetchAll } from '@/lib/supabase-paginate';
import { israelDate, normalizePhone } from '@/lib/yemot-parse';
import { israelTime, loadIdIndex, resolveStudent } from '@/lib/yemot-import';
import { YemotRecording } from '@/lib/yemot-recordings';
import { ScholarshipTabProps, SectionCard, EmptyState, dmy, todayIso, StudentLite, fetchStudentsLite, shiurLabel, matchesSearch } from './shared';
import { RecordingPlayer, fetchRecordings } from './RecordingPlayer';

// "🎙️ הקלטות": recordings students left on the ימות line, matched to a student by
//   1. the call (record number in the file name = scholarship_yemot_calls.record_number)
//   2. the ת"ז typed (students / aliases, leading zeros ignored)
//   3. the calling phone (student phone, father / mother / home phone)

type Via = 'call' | 'id' | 'phone' | null;
interface Row { rec: YemotRecording; student: StudentLite | null; via: Via }

const VIA_LABEL: Record<string, string> = { call: 'לפי השיחה', id: 'לפי ת״ז', phone: 'לפי טלפון' };
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

export function RecordingsTab({ perms }: ScholarshipTabProps) {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyUnmatched, setOnlyUnmatched] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [recs, students, idx, fams] = await Promise.all([
        fetchRecordings(from, to),
        fetchStudentsLite(),
        loadIdIndex(),
        fetchAll<{ id: string; father_phone: string | null; mother_phone: string | null; home_phone: string | null }>('families', 'id, father_phone, mother_phone, home_phone'),
      ]);
      const byId = new Map(students.map((s) => [s.id, s]));
      // calls by record number (ext + record) → student
      const records = Array.from(new Set(recs.map((r) => r.record).filter((x): x is number => x !== null)));
      const callStudent = new Map<string, string>();
      for (let i = 0; i < records.length; i += 150) {
        const part = records.slice(i, i + 150);
        const calls = await fetchAll<{ record_number: number; extension: string | null; student_id: string | null }>(
          'scholarship_yemot_calls', 'id, record_number, extension, student_id', (q) => q.in('record_number', part).not('student_id', 'is', null));
        for (const c of calls) if (c.student_id) callStudent.set(`${c.extension || ''}:${c.record_number}`, c.student_id);
      }
      // phone → student (only when exactly one student matches)
      const famPhones = new Map(fams.map((f) => [f.id, [f.father_phone, f.mother_phone, f.home_phone].map(normalizePhone).filter(Boolean) as string[]]));
      const byPhone = new Map<string, Set<string>>();
      const addPhone = (p: string | null | undefined, sid: string) => { const n = normalizePhone(p); if (n) { if (!byPhone.has(n)) byPhone.set(n, new Set()); byPhone.get(n)!.add(sid); } };
      for (const s of students) {
        if (s.status !== 'active') continue;
        addPhone(s.phone, s.id);
        for (const p of (s.family_id ? famPhones.get(s.family_id) : null) || []) addPhone(p, s.id);
      }

      setRows(recs.map((rec) => {
        const viaCall = rec.record !== null ? callStudent.get(`${rec.folder || ''}:${rec.record}`) : undefined;
        if (viaCall && byId.get(viaCall)) return { rec, student: byId.get(viaCall)!, via: 'call' as Via };
        const viaId = resolveStudent(rec.enterId, idx);
        if (viaId && byId.get(viaId)) return { rec, student: byId.get(viaId)!, via: 'id' as Via };
        const ph = rec.phone ? byPhone.get(rec.phone) : undefined;
        if (ph && ph.size === 1) { const sid = [...ph][0]; return { rec, student: byId.get(sid) || null, via: 'phone' as Via }; }
        return { rec, student: null, via: null };
      }));
    } catch (e: any) { setError(e.message); setRows(null); }
    setLoading(false);
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (rows || []).filter((r) => {
    if (onlyUnmatched && r.student) return false;
    const q = search.trim();
    if (!q) return true;
    if (r.student && matchesSearch(r.student, q)) return true;
    return [r.rec.phone, r.rec.enterId].some((v) => v && v.includes(q.replace(/\D/g, '') || '§'));
  }), [rows, onlyUnmatched, search]);

  const unmatched = (rows || []).filter((r) => !r.student).length;

  if (!perms.canReport) return <SectionCard><EmptyState icon="🔒" text="אין הרשאה להאזנה להקלטות" /></SectionCard>;

  const input = 'px-2 py-1.5 border border-slate-300 rounded-lg text-sm';
  return (
    <SectionCard title="🎙️ הקלטות מהקו" accent="from-indigo-500 to-violet-600">
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-600 flex flex-col">מתאריך
            <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="text-xs text-slate-600 flex flex-col">עד תאריך
            <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש שם / ת״ז / טלפון…" className={`${input} w-56`} />
          <label className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={onlyUnmatched} onChange={(e) => setOnlyUnmatched(e.target.checked)} /> רק לא משויכות {rows ? `(${unmatched})` : ''}
          </label>
          <Button size="sm" variant="secondary" onClick={load} disabled={loading}>🔄 רענן</Button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-slate-400">טוען הקלטות מימות…</div>
        ) : error ? (
          <div className="text-sm text-red-700">❌ {error}</div>
        ) : shown.length === 0 ? (
          <EmptyState icon="🎙️" text="אין הקלטות בטווח הזה" hint="נסה להרחיב את טווח התאריכים" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                  <th className="text-start px-3 py-2">תאריך</th>
                  <th className="text-start px-3 py-2">תלמיד</th>
                  <th className="text-start px-3 py-2">ת״ז שהוקשה</th>
                  <th className="text-start px-3 py-2">טלפון</th>
                  <th className="text-start px-3 py-2">משך</th>
                  <th className="text-start px-3 py-2">השמעה</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.rec.what} className="border-b border-slate-50 hover:bg-blue-50/40 align-middle">
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{r.rec.callAt ? `${dmy(israelDate(r.rec.callAt))} ${israelTime(r.rec.callAt)}` : '—'}</td>
                    <td className="px-3 py-2">
                      {r.student ? (
                        <>
                          <Link href={`/students/${r.student.id}`} className="text-blue-700 hover:underline font-medium">{r.student.last_name} {r.student.first_name}</Link>
                          <span className="text-xs text-slate-500"> · {shiurLabel(r.student)}</span>
                          <div className="text-[11px] text-slate-400">{VIA_LABEL[r.via || '']}</div>
                        </>
                      ) : <span className="text-amber-700 text-xs font-medium">לא משויך</span>}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-slate-600" dir="ltr">{r.rec.enterId || '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-600" dir="ltr">{r.rec.phone || '—'}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-500">{Math.round(r.rec.duration)} שנ׳</td>
                    <td className="px-3 py-2"><RecordingPlayer what={r.rec.what} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-400">ההקלטות נשארות בימות המשיח ומושמעות ישירות משם. השיוך: לפי השיחה (מספר הרשומה), אחר כך לפי הת״ז שהוקשה, ואם אין, לפי הטלפון שחייג (רק כשהוא שייך לתלמיד אחד).</p>
      </div>
    </SectionCard>
  );
}
