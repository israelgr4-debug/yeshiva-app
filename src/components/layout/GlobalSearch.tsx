'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

interface StudentHit { id: string; first_name: string; last_name: string; shiur: string | null; id_number: string | null; phone: string | null; }
interface FamilyHit { id: string; family_name: string | null; father_name: string | null; mother_name: string | null; bank_number: any; bank_branch: any; bank_account: any; }

// Global quick search — name / ת"ז / phone / bank account — from anywhere.
// Open with ⌘K / Ctrl+K or the floating 🔍 button. Enter/click navigates.
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [students, setStudents] = useState<StudentHit[]>([]);
  const [families, setFamilies] = useState<FamilyHit[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setOpen((v) => !v); }
      if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true); // triggered by the sidebar search button
    window.addEventListener('keydown', onKey);
    window.addEventListener('global-search:open', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('global-search:open', onOpen); };
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); else { setQ(''); setStudents([]); setFamilies([]); } }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) { setStudents([]); setFamilies([]); setLoading(false); return; }
    setLoading(true);
    const like = `%${term.replace(/[%,()]/g, '')}%`;
    const t = setTimeout(async () => {
      const [s, f] = await Promise.all([
        supabase.from('students')
          .select('id, first_name, last_name, shiur, id_number, phone')
          .or(`first_name.ilike.${like},last_name.ilike.${like},id_number.ilike.${like},passport_number.ilike.${like},phone.ilike.${like}`)
          .limit(12),
        supabase.from('families')
          .select('id, family_name, father_name, mother_name, bank_number, bank_branch, bank_account')
          .or(`bank_account.ilike.${like},family_name.ilike.${like},father_name.ilike.${like},mother_name.ilike.${like},father_phone.ilike.${like},mother_phone.ilike.${like},father_id_number.ilike.${like}`)
          .limit(12),
      ]);
      setStudents((s.data as StudentHit[]) || []);
      setFamilies((f.data as FamilyHit[]) || []);
      setLoading(false);
    }, 220);
    return () => clearTimeout(t);
  }, [q, open]);

  const go = (href: string) => { setOpen(false); router.push(href); };
  const total = students.length + families.length;

  return (
    <>
      {/* Floating trigger (always visible) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="חיפוש מהיר (Ctrl+K)"
        className="no-print lg:hidden fixed bottom-5 start-5 z-40 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg px-4 py-3"
      >
        🔍 <span className="hidden sm:inline text-sm font-medium">חיפוש מהיר</span>
      </button>

      {!open ? null : (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 pt-[10vh]" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <span className="text-slate-400">🔍</span>
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="שם / ת״ז / טלפון / מספר חשבון בנק…"
                className="flex-1 outline-none text-base"
              />
              <kbd className="text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">ESC</kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {q.trim().length < 2 ? (
                <div className="p-6 text-center text-sm text-slate-400">הקלד לפחות 2 תווים — מחפש בתלמידים ובמשפחות (כולל מספר חשבון בנק)</div>
              ) : loading ? (
                <div className="p-6 text-center text-sm text-slate-400">מחפש…</div>
              ) : total === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">לא נמצאו תוצאות</div>
              ) : (
                <>
                  {students.length > 0 && (
                    <div>
                      <div className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-400">תלמידים</div>
                      {students.map((s) => (
                        <button key={s.id} onClick={() => go(`/students/${s.id}`)}
                          className="w-full text-start px-4 py-2 hover:bg-blue-50 flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-800">{s.last_name} {s.first_name}</span>
                          <span className="text-xs text-slate-400" dir="ltr">
                            {(s.shiur || '').replace('שיעור ', '')}{s.id_number ? ` · ${s.id_number}` : ''}{s.phone ? ` · ${s.phone}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {families.length > 0 && (
                    <div>
                      <div className="px-4 pt-3 pb-1 text-xs font-semibold text-slate-400">משפחות</div>
                      {families.map((f) => (
                        <button key={f.id} onClick={() => go(`/families/${f.id}`)}
                          className="w-full text-start px-4 py-2 hover:bg-blue-50 flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-800">{f.family_name} {f.father_name || ''}</span>
                          <span className="text-xs text-slate-400" dir="ltr">
                            {f.bank_account ? `חשבון ${f.bank_number || ''}-${f.bank_branch || ''}-${f.bank_account}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400">
              מחפש: שם תלמיד/הורה · ת״ז · טלפון · מספר חשבון בנק · שם משפחה
            </div>
          </div>
        </div>
      )}
    </>
  );
}
