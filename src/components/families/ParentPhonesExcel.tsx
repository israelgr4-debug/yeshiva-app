'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { Family, Student } from '@/lib/types';

// Fix parent phones through Excel: download the (filtered) families with father / mother /
// home phones, fix them in Excel — or just mark "החלף" to swap father ↔ mother — upload it
// back, review every change, apply. Matching is by the hidden family id column.
// Blank cell = leave as is; "-" = clear the phone.

const ID_COL = 'מזהה (לא לשנות)';
const COLS = {
  family: 'שם משפחה',
  kids: 'ילדים',
  fatherName: 'שם האב',
  father: 'טלפון אב',
  motherName: 'שם האם',
  mother: 'טלפון אם',
  home: 'טלפון בית',
  swap: 'החלף אב↔אם (סמן X)',
} as const;

type Field = 'father_phone' | 'mother_phone' | 'home_phone';
const FIELD_LABEL: Record<Field, string> = { father_phone: 'טלפון אב', mother_phone: 'טלפון אם', home_phone: 'טלפון בית' };

interface Change { family: Family; swapped: boolean; fields: { field: Field; before: string; after: string }[] }

const digits = (v: any) => String(v ?? '').replace(/\D/g, '');
/** Excel turns 0501234567 into 501234567 — put the leading 0 back. */
function cellPhone(v: any): string {
  if (v === null || v === undefined) return '';
  let s = String(v).trim();
  if (typeof v === 'number' || /^\d+$/.test(s)) {
    s = String(s).replace(/\.0+$/, '');
    if ((s.length === 8 || s.length === 9) && !s.startsWith('0')) s = '0' + s;
  }
  return s;
}

export function ParentPhonesExcel({ families, studentsByFamily, onClose, onApplied }: {
  families: Family[];
  studentsByFamily: Record<string, Student[]>;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const byId = useMemo(() => new Map(families.map((f) => [f.id, f])), [families]);

  // ---------- export ----------
  const exportXlsx = async () => {
    const XLSX = await import('xlsx');
    const kidsLabel = (f: Family) => (studentsByFamily[f.id] || [])
      .filter((s) => s.status === 'active' || s.status === 'chizuk')
      .map((s) => `${s.first_name || ''}${s.shiur ? ` (${s.shiur.replace('שיעור ', '')})` : ''}`).join(', ');
    const header = [COLS.family, COLS.kids, COLS.fatherName, COLS.father, COLS.motherName, COLS.mother, COLS.home, COLS.swap, ID_COL];
    const rows = [...families]
      .sort((a, b) => (a.family_name || '').localeCompare(b.family_name || '', 'he'))
      .map((f) => [f.family_name || '', kidsLabel(f), f.father_name || '', f.father_phone || '', f.mother_name || '', f.mother_phone || '', f.home_phone || '', '', f.id]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    // phones as TEXT so Excel keeps the leading 0
    for (let r = 1; r <= rows.length; r++) {
      for (const c of [3, 5, 6]) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) { ws[ref].t = 's'; ws[ref].z = '@'; }
      }
    }
    ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 18 }, { wch: 38, hidden: true }];
    const wb = XLSX.utils.book_new();
    (wb as any).Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, 'טלפוני הורים');
    XLSX.writeFile(wb, `טלפוני הורים - ${families.length} משפחות.xlsx`);
  };

  // ---------- import ----------
  const importXlsx = async (file: File | null) => {
    if (!file) return;
    setDone(null);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '', raw: true });
      if (!data.length || !(ID_COL in data[0])) throw new Error(`הקובץ חייב לכלול את העמודה "${ID_COL}" — השתמש בקובץ שהורדת מכאן`);

      const out: Change[] = [];
      const miss: string[] = [];
      for (const row of data) {
        const id = String(row[ID_COL] || '').trim();
        if (!id) continue;
        const f = byId.get(id);
        if (!f) { miss.push(row[COLS.family] || id); continue; }
        let father = cellPhone(row[COLS.father]);
        let mother = cellPhone(row[COLS.mother]);
        const home = cellPhone(row[COLS.home]);
        const swap = String(row[COLS.swap] || '').trim() !== '';
        if (swap) [father, mother] = [mother, father];
        const next: Record<Field, string> = {
          // blank = leave as is (but after a swap the blank side really is blank); "-" = clear
          father_phone: father === '-' ? '' : father || (swap ? '' : f.father_phone || ''),
          mother_phone: mother === '-' ? '' : mother || (swap ? '' : f.mother_phone || ''),
          home_phone: home === '-' ? '' : home || f.home_phone || '',
        };
        const fields = (Object.keys(next) as Field[])
          .filter((k) => digits(next[k]) !== digits((f as any)[k]))
          .map((k) => ({ field: k, before: (f as any)[k] || '', after: next[k] }));
        if (fields.length) out.push({ family: f, swapped: swap, fields });
      }
      setChanges(out);
      setSkipped(miss);
      setSelected(new Set(out.map((c) => c.family.id)));
    } catch (e: any) {
      alert('שגיאה בקריאת הקובץ: ' + (e?.message || e));
    }
  };

  const apply = async () => {
    if (!changes) return;
    const list = changes.filter((c) => selected.has(c.family.id));
    if (!list.length) return;
    if (!confirm(`לעדכן טלפונים ב-${list.length} משפחות?`)) return;
    setBusy(true);
    let ok = 0;
    const errors: string[] = [];
    for (let i = 0; i < list.length; i += 10) {
      await Promise.all(list.slice(i, i + 10).map(async (c) => {
        const patch: Record<string, string | null> = {};
        for (const fl of c.fields) patch[fl.field] = fl.after.trim() || null;
        const { error } = await supabase.from('families').update(patch).eq('id', c.family.id);
        if (error) errors.push(`${c.family.family_name}: ${error.message}`); else ok++;
      }));
    }
    setBusy(false);
    setDone(`✓ עודכנו ${ok} משפחות${errors.length ? ` · ${errors.length} נכשלו` : ''}`);
    if (errors.length) alert(errors.slice(0, 10).join('\n'));
    setChanges(null);
    onApplied();
  };

  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center pt-16 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-lg">📞 תיקון טלפוני הורים באקסל</h3>
          <button type="button" className="text-slate-400 hover:text-slate-700" onClick={onClose}>✕</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <ol className="text-sm text-slate-700 space-y-1 list-decimal ps-5">
            <li>מורידים את הקובץ ({families.length} משפחות, לפי הסינון במסך).</li>
            <li>
              מתקנים באקסל: משנים טלפון בתא, <b>או</b> כותבים X בעמודה ״החלף אב↔אם״ כדי להחליף ביניהם.
              תא ריק = בלי שינוי, מקף (-) = מחיקת הטלפון.
            </li>
            <li>מעלים את הקובץ חזרה, בודקים את השינויים ומאשרים.</li>
          </ol>

          <div className="flex flex-wrap gap-2">
            <Button onClick={exportXlsx}>📥 הורד אקסל</Button>
            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 hover:bg-slate-50 cursor-pointer">
              📤 העלה קובץ מתוקן
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { importXlsx(e.target.files?.[0] || null); e.target.value = ''; }} />
            </label>
          </div>

          {done && <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{done}</div>}

          {changes && (
            changes.length === 0 ? (
              <div className="text-sm text-slate-600 bg-slate-50 rounded-lg px-3 py-3">לא נמצאו שינויים בקובץ.</div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span><b>{changes.length}</b> משפחות עם שינוי · נבחרו <b>{selected.size}</b>
                    {changes.some((c) => c.swapped) && <> · {changes.filter((c) => c.swapped).length} החלפות אב↔אם</>}</span>
                  <span className="flex gap-3 text-xs">
                    <button type="button" className="text-blue-600 hover:underline" onClick={() => setSelected(new Set(changes.map((c) => c.family.id)))}>בחר הכל</button>
                    <button type="button" className="text-slate-500 hover:underline" onClick={() => setSelected(new Set())}>נקה</button>
                  </span>
                </div>
                <div className="border border-slate-200 rounded-xl overflow-auto max-h-[45vh]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="text-xs text-slate-500">
                        <th className="w-8"></th>
                        <th className="text-start px-2 py-2">משפחה</th>
                        <th className="text-start px-2 py-2">שדה</th>
                        <th className="text-start px-2 py-2">לפני</th>
                        <th className="text-start px-2 py-2">אחרי</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((c) => c.fields.map((fl, i) => (
                        <tr key={c.family.id + fl.field} className={`border-t border-slate-100 ${selected.has(c.family.id) ? '' : 'opacity-40'}`}>
                          {i === 0 && (
                            <td rowSpan={c.fields.length} className="px-2 align-top pt-2">
                              <input type="checkbox" checked={selected.has(c.family.id)} onChange={() => toggle(c.family.id)} />
                            </td>
                          )}
                          {i === 0 && (
                            <td rowSpan={c.fields.length} className="px-2 py-1.5 align-top">
                              <b>{c.family.family_name}</b>
                              {c.swapped && <span className="ms-1 text-[11px] px-1.5 rounded bg-violet-100 text-violet-800">החלפה</span>}
                              <div className="text-[11px] text-slate-500">{[c.family.father_name, c.family.mother_name].filter(Boolean).join(' · ')}</div>
                            </td>
                          )}
                          <td className="px-2 py-1.5">{FIELD_LABEL[fl.field]}</td>
                          <td className="px-2 py-1.5 tabular-nums text-slate-500 line-through" dir="ltr">{fl.before || '—'}</td>
                          <td className="px-2 py-1.5 tabular-nums font-semibold text-emerald-800" dir="ltr">{fl.after || '(ריק)'}</td>
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>
                {skipped.length > 0 && <p className="text-xs text-amber-700">⚠️ {skipped.length} שורות לא נמצאו במערכת (דולגו): {skipped.slice(0, 5).join(', ')}{skipped.length > 5 ? '…' : ''}</p>}
                <div className="flex justify-end">
                  <Button onClick={apply} disabled={busy || selected.size === 0}>{busy ? 'מעדכן…' : `✅ עדכן ${selected.size} משפחות`}</Button>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
