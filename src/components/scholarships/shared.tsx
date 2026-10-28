'use client';

// Shared bits for the מלגות tabs: permissions, navigation between tabs, formatting.

import React from 'react';
import { SHIURIM } from '@/lib/shiurim';
import { fetchAll } from '@/lib/supabase-paginate';

export type ScholarshipTabId = 'overview' | 'yemot' | 'unmatched' | 'recordings' | 'manual' | 'onetime' | 'report' | 'payment' | 'types';

export interface ScholarshipPerms {
  canWrite: boolean;   // import / entry / mark payment — admin + secretary
  canReport: boolean;  // report & print — admin + secretary + manager
  canAdmin: boolean;   // delete batch / cancel payment / edit types — admin
}

/** Navigate to another tab, optionally with params (e.g. { batch: id } to open a batch). */
export type ScholarshipNav = (tab: ScholarshipTabId, params?: Record<string, string>) => void;

export interface ScholarshipTabProps {
  perms: ScholarshipPerms;
  nav: ScholarshipNav;
  params: Record<string, string>;
}

export const ils = (n: number) => '₪' + (Number(n) || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });
export const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function SectionCard({ title, accent = 'from-orange-500 to-red-600', actions, children, className = '' }: {
  title?: React.ReactNode; accent?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200/70 elevation-1 ${className}`}>
      {(title || actions) && (
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          {title && (
            <div className="flex items-center gap-2">
              <span className={`w-1 h-4 bg-gradient-to-b ${accent} rounded-full`} />
              <h3 className="font-bold text-slate-800" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>{title}</h3>
            </div>
          )}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, text, hint }: { icon: string; text: string; hint?: string }) {
  return (
    <div className="py-10 text-center">
      <div className="text-5xl mb-2">{icon}</div>
      <div className="text-slate-500 font-medium">{text}</div>
      {hint && <div className="text-slate-400 text-sm mt-1">{hint}</div>}
    </div>
  );
}

export function ComingSoon({ stage }: { stage: string }) {
  return <EmptyState icon="🚧" text="בבנייה" hint={`ייבנה ב${stage}`} />;
}

// ---------------- students + shiur picker ----------------


export interface StudentLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  shiur: string | null;
  id_number: string | null;
  passport_number: string | null;
  institution_name: string | null;
  status: string;
  phone?: string | null;
  family_id?: string | null;
}

export const STUDENT_LITE_COLS = 'id, first_name, last_name, shiur, id_number, passport_number, institution_name, status, phone, family_id';

export async function fetchStudentsLite(opts: { activeOnly?: boolean; ids?: string[] } = {}): Promise<StudentLite[]> {
  if (opts.ids) {
    const out: StudentLite[] = [];
    for (let i = 0; i < opts.ids.length; i += 150) {
      const part = opts.ids.slice(i, i + 150);
      out.push(...await fetchAll<StudentLite>('students', STUDENT_LITE_COLS, (q) => q.in('id', part)));
    }
    return out;
  }
  return fetchAll<StudentLite>('students', STUDENT_LITE_COLS, (q) => (opts.activeOnly ? q.eq('status', 'active') : q));
}

const SHIUR_RANK = new Map(SHIURIM.map((s, i) => [s.name, i]));
export const KOLLEL = '__kollel';
export const isKollel = (s: { institution_name: string | null }) => !!s.institution_name && s.institution_name.includes('כולל');

/** Sort key: shiur order (כולל / unknown last), then last name, first name (א-ב). */
export function compareStudents(a: StudentLite, b: StudentLite): number {
  const ra = isKollel(a) ? 900 : (SHIUR_RANK.get(a.shiur || '') ?? 800);
  const rb = isKollel(b) ? 900 : (SHIUR_RANK.get(b.shiur || '') ?? 800);
  if (ra !== rb) return ra - rb;
  return (a.last_name || '').localeCompare(b.last_name || '', 'he') || (a.first_name || '').localeCompare(b.first_name || '', 'he');
}

export const shiurLabel = (s: StudentLite) => (isKollel(s) ? (s.institution_name || 'כולל') : (s.shiur || '—'));

/** Group key used in reports: shiur, or the כולל institution. */
export const shiurGroup = (s: StudentLite) => (isKollel(s) ? 'כולל' : (s.shiur || 'ללא שיעור'));

/** Empty selection = everyone. KOLLEL matches students of a כולל institution. */
export function matchesShiurSelection(s: StudentLite, selected: Set<string>): boolean {
  if (selected.size === 0) return true;
  if (selected.has(KOLLEL) && isKollel(s)) return true;
  return !isKollel(s) && !!s.shiur && selected.has(s.shiur);
}

export function ShiurPicker({ selected, onChange }: { selected: Set<string>; onChange: (s: Set<string>) => void }) {
  const options = [...SHIURIM.map((s) => ({ value: s.name, label: s.shortName === 'קיבוץ' ? 'קיבוץ' : s.shortName })), { value: KOLLEL, label: 'כולל' }];
  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(next);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-slate-500 me-1">שיעורים:</span>
      {options.map((o) => {
        const on = selected.has(o.value);
        return (
          <button key={o.value} type="button" onClick={() => toggle(o.value)}
            className={`px-2.5 py-1 rounded-lg text-sm font-medium border ${on ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}>
            {o.label}
          </button>
        );
      })}
      {selected.size > 0 && <button type="button" onClick={() => onChange(new Set())} className="text-xs text-red-600 hover:underline ms-1">נקה (הכל)</button>}
    </div>
  );
}

/** Name / ID search (any order, all tokens must match). */
export function matchesSearch(s: StudentLite, q: string): boolean {
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const pool = `${s.first_name || ''} ${s.last_name || ''} ${s.id_number || ''} ${s.passport_number || ''}`.toLowerCase();
  return tokens.every((t) => pool.includes(t));
}

/** Keyboard-first student search: type name / ת"ז, ↑↓ to move, Enter to pick. */
export function StudentSearchBox({ students, onPick, autoFocus, placeholder = 'חיפוש תלמיד לפי שם / ת״ז…', inputRef }: {
  students: StudentLite[];
  onPick: (s: StudentLite) => void;
  autoFocus?: boolean;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [q, setQ] = React.useState('');
  const [hi, setHi] = React.useState(0);
  const results = React.useMemo(() => {
    if (q.trim().length < 2) return [];
    return students.filter((s) => matchesSearch(s, q)).sort(compareStudents).slice(0, 8);
  }, [q, students]);
  const pick = (s: StudentLite) => { onPick(s); setQ(''); setHi(0); };
  return (
    <div className="relative">
      <input
        ref={inputRef as any}
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => { setQ(e.target.value); setHi(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter' && results[hi]) { e.preventDefault(); pick(results[hi]); }
          else if (e.key === 'Escape') setQ('');
        }}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
      />
      {results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {results.map((s, i) => (
            <button key={s.id} type="button" onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              className={`w-full text-start px-3 py-1.5 text-sm flex justify-between gap-2 ${i === hi ? 'bg-orange-50' : 'hover:bg-slate-50'}`}>
              <span><b>{s.last_name}</b> {s.first_name} <span className="text-xs text-slate-500">· {shiurLabel(s)}{s.status !== 'active' ? ' · לא פעיל' : ''}</span></span>
              <span className="text-xs text-slate-400 tabular-nums" dir="ltr">{s.id_number || s.passport_number || ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
