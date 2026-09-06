'use client';

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Student, Machzor } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';

interface Props {
  students: Student[];
  machzorot: Record<string, Machzor>;
  onClose: () => void;
  onUpdated: () => void;
}

// Normalize Hebrew for matching: strip niqqud + geresh/gershayim, collapse whitespace.
const norm = (s: any) => String(s ?? '')
  .replace(/[֑-ׇ]/g, '')
  .replace(/["'`׳״]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const shiurKey = (s: any) => norm(s).replace(/^שיעור\s*/, '');
const machzorKey = (s: any) => norm(s).replace(/^מחזור\s*/, '');
// File phones dropped the leading 0 (9 digits) — restore it.
function normPhone(v: any): string {
  const d = String(v ?? '').replace(/\D/g, '');
  if (!d) return '';
  return d.length === 9 ? '0' + d : d;
}

type Status = 'update' | 'same' | 'nophone' | 'ambiguous' | 'notfound';
interface Row {
  fileLast: string; fileFirst: string; fileShiur: string; fileMachzor: string; phone: string;
  status: Status;
  student?: Student;
  oldPhone?: string;
  note?: string;
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  update:    { label: '✅ יעודכן',        cls: 'bg-emerald-100 text-emerald-800' },
  same:      { label: '➖ ללא שינוי',      cls: 'bg-slate-100 text-slate-500' },
  nophone:   { label: '⬜ אין טלפון בקובץ', cls: 'bg-slate-100 text-slate-400' },
  ambiguous: { label: '⚠️ כמה התאמות',     cls: 'bg-amber-100 text-amber-800' },
  notfound:  { label: '❌ לא נמצא',        cls: 'bg-red-100 text-red-800' },
};

export function StudentPhoneImport({ students, machzorot, onClose, onUpdated }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | 'all'>('all');

  // Index students by normalized "last|first".
  const index = useMemo(() => {
    const m = new Map<string, Student[]>();
    for (const s of students) {
      const k = `${norm(s.last_name)}|${norm(s.first_name)}`;
      (m.get(k) || m.set(k, []).get(k)!)!.push(s);
    }
    return m;
  }, [students]);

  const onFile = async (file: File) => {
    setDone(null); setRows([]); setFileName(file.name);
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: false }) as any[][];
    const H = (aoa[0] || []).map((h) => norm(h));
    const ci = (needle: string) => H.findIndex((h) => h.includes(needle));
    const iMach = ci('מחזור'), iShiur = ci('שיעור'), iLast = ci('משפחה'), iFirst = ci('פרטי'), iPhone = ci('פלא') >= 0 ? ci('פלא') : ci('טלפון');

    const out: Row[] = [];
    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r]; if (!row) continue;
      const fileLast = norm(row[iLast]), fileFirst = norm(row[iFirst]);
      if (!fileLast && !fileFirst) continue;
      const fileShiur = norm(row[iShiur]), fileMachzor = norm(row[iMach]);
      const phone = normPhone(row[iPhone]);
      const base: Row = { fileLast, fileFirst, fileShiur, fileMachzor, phone, status: 'notfound' };

      if (!phone) { out.push({ ...base, status: 'nophone' }); continue; }

      const machName = (s: Student) => (s.machzor_id ? machzorot[s.machzor_id]?.name : '') || '';
      const byName = index.get(`${fileLast}|${fileFirst}`) || [];
      if (byName.length === 0) { out.push({ ...base, status: 'notfound' }); continue; }

      // Narrow duplicates by shiur, then by machzor (only used to break ties, so a
      // different machzor spelling never causes a false miss).
      let narrowed = byName;
      if (narrowed.length > 1 && fileShiur) {
        const f = narrowed.filter((s) => shiurKey(s.shiur) === shiurKey(fileShiur));
        if (f.length) narrowed = f;
      }
      if (narrowed.length > 1 && fileMachzor) {
        const f = narrowed.filter((s) => machzorKey(machName(s)) === machzorKey(fileMachzor));
        if (f.length) narrowed = f;
      }

      if (narrowed.length > 1) {
        out.push({ ...base, status: 'ambiguous', note: `${narrowed.length} תלמידים בשם זה — לא עודכן ליתר ביטחון` });
        continue;
      }
      const s = narrowed[0];
      // Safety: a single name-match whose SHIUR differs from the file is suspicious.
      if (fileShiur && shiurKey(s.shiur) !== shiurKey(fileShiur)) {
        out.push({ ...base, student: s, oldPhone: s.phone || '', status: 'notfound', note: `בקובץ שיעור ${fileShiur} אך במערכת ${shiurKey(s.shiur) || '—'} — בדוק ידנית` });
        continue;
      }
      const oldPhone = s.phone || '';
      out.push({ ...base, student: s, oldPhone, status: normPhone(oldPhone) === phone ? 'same' : 'update' });
    }
    setRows(out);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { update: 0, same: 0, nophone: 0, ambiguous: 0, notfound: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const shown = useMemo(() => (filter === 'all' ? rows : rows.filter((r) => r.status === filter)), [rows, filter]);
  const toUpdate = useMemo(() => rows.filter((r) => r.status === 'update'), [rows]);

  const apply = async () => {
    if (toUpdate.length === 0) return;
    if (!confirm(`לעדכן טלפון ל-${toUpdate.length} תלמידים? (רק התאמות ודאיות של שם+שיעור+מחזור)`)) return;
    setBusy(true); setDone(null);
    try {
      let ok = 0;
      for (let i = 0; i < toUpdate.length; i += 25) {
        const chunk = toUpdate.slice(i, i + 25);
        await Promise.all(chunk.map(async (r) => {
          const { error } = await supabase.from('students').update({ phone: r.phone }).eq('id', r.student!.id);
          if (!error) ok++;
        }));
      }
      setDone(`✓ עודכנו ${ok} טלפונים.`);
      onUpdated();
    } catch (e: any) {
      setDone('שגיאה: ' + (e?.message || e));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 pt-[6vh]">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 max-h-[88vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">📞 עדכון טלפוני תלמידים מאקסל</h2>
            <p className="text-sm text-slate-500 mt-1">התאמה לפי שם משפחה + פרטי + שיעור + מחזור. מתעדכן רק מה שוודאי.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="inline-flex items-center gap-2 cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            📥 בחר קובץ אקסל
            <input type="file" accept=".xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ''; }} />
          </label>
          {fileName && <span className="text-sm text-slate-500">{fileName}</span>}
        </div>

        {rows.length > 0 && (
          <>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2 mb-4 text-center text-sm">
              {(['update', 'same', 'ambiguous', 'notfound', 'nophone'] as Status[]).map((k) => (
                <button key={k} onClick={() => setFilter((f) => (f === k ? 'all' : k))}
                  className={`rounded-xl py-2 border ${filter === k ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-200'} ${STATUS_META[k].cls}`}>
                  <div className="text-lg font-bold">{counts[k]}</div>
                  <div className="text-[11px]">{STATUS_META[k].label}</div>
                </button>
              ))}
            </div>

            {(counts.ambiguous > 0 || counts.notfound > 0) && (
              <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-amber-800">
                ⚠️ {counts.ambiguous + counts.notfound} שורות לא יעודכנו אוטומטית (לא נמצאו / כמה התאמות / שיעור-מחזור לא תואם).
                סנן אותן למעלה כדי לבדוק ולעדכן ידנית.
              </div>
            )}

            <div className="border border-slate-200 rounded-xl max-h-80 overflow-y-auto mb-4">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-xs text-slate-500">
                    <th className="text-start px-3 py-2">תלמיד</th>
                    <th className="text-start px-3 py-2">שיעור/מחזור</th>
                    <th className="text-start px-3 py-2">טלפון</th>
                    <th className="text-start px-3 py-2">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, 400).map((r, i) => (
                    <tr key={i} className="border-t border-slate-50">
                      <td className="px-3 py-1.5">{r.fileLast} {r.fileFirst}</td>
                      <td className="px-3 py-1.5 text-slate-500 text-xs">{r.fileShiur} · {r.fileMachzor}</td>
                      <td className="px-3 py-1.5" dir="ltr">
                        {r.status === 'update'
                          ? <span><span className="text-slate-400 line-through">{r.oldPhone || '—'}</span> → <b className="text-emerald-700">{r.phone}</b></span>
                          : <span className="text-slate-500">{r.phone || '—'}</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_META[r.status].cls}`} title={r.note || ''}>{STATUS_META[r.status].label}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {done && <div className="text-sm bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">{done}</div>}

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={onClose} disabled={busy}>סגור</Button>
              <Button onClick={apply} disabled={busy || toUpdate.length === 0}>
                {busy ? 'מעדכן…' : `✅ עדכן ${toUpdate.length} טלפונים`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
