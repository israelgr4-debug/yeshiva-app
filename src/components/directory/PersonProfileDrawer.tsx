'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Person } from '@/hooks/useDirectory';

interface Props {
  person: Person;
  onClose: () => void;
}

const AVATAR_TINTS = [
  'from-sky-500 to-cyan-600', 'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600', 'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600', 'from-indigo-500 to-blue-600', 'from-lime-500 to-emerald-600',
];
function tintForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

export function PersonProfileDrawer({ person, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const initial = (person.lastName || person.firstName || '?')[0] || '?';
  const tint = tintForName(person.fullName || '');

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full sm:max-w-2xl sm:mx-4 sm:rounded-2xl shadow-2xl max-h-[100vh] sm:max-h-[90vh] overflow-y-auto animate-scaleIn">
        {/* Sticky header with photo */}
        <div className={`sticky top-0 z-10 bg-gradient-to-l ${tint} text-white px-5 py-4`}>
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              {person.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={person.photoUrl}
                  alt={person.fullName}
                  className="w-20 h-24 sm:w-24 sm:h-28 object-cover rounded-xl ring-4 ring-white/30 shadow-lg"
                />
              ) : (
                <div className="w-20 h-24 sm:w-24 sm:h-28 rounded-xl bg-white/20 text-white font-bold text-4xl flex items-center justify-center ring-4 ring-white/30">
                  {initial}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2
                className="text-xl sm:text-2xl font-bold leading-tight"
                style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
              >
                {person.lastName} {person.firstName}
              </h2>
              {person.idNumber && (
                <p className="text-xs text-white/80 mt-1 font-mono tabular-nums">
                  ת״ז {person.idNumber}
                </p>
              )}
              {(person.city || person.neighborhood) && (
                <p className="text-sm text-white/90 mt-1.5">
                  📍 {[person.neighborhood, person.city].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="flex flex-wrap gap-1 mt-2">
                {person.roles.map((r, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white/20 text-white ring-1 ring-white/30"
                  >
                    {r.label}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-white/80 hover:text-white hover:bg-white/10 w-9 h-9 rounded-lg flex items-center justify-center text-2xl"
              aria-label="סגור"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {person.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-amber-800 mb-1">⚠️ אזהרות</p>
              <ul className="text-xs text-amber-900 space-y-0.5">
                {person.warnings.map((w, i) => <li key={i}>· {w}</li>)}
              </ul>
            </div>
          )}

          {/* Phones */}
          {person.phones.length > 0 && (
            <Section title="טלפונים">
              <div className="space-y-2">
                {person.phones.map((ph, i) => (
                  <a
                    key={i}
                    href={`tel:${ph.value}`}
                    className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  >
                    <span className="text-sm text-emerald-900">{ph.label}</span>
                    <span className="text-base font-bold text-emerald-800 tabular-nums">{ph.value}</span>
                  </a>
                ))}
              </div>
            </Section>
          )}

          {/* Email */}
          {person.email && (
            <Section title="דוא״ל">
              <a
                href={`mailto:${person.email}`}
                className="block p-3 bg-blue-50 rounded-xl border border-blue-200 hover:bg-blue-100 text-sm text-blue-800"
              >
                {person.email}
              </a>
            </Section>
          )}

          {/* Open in pages */}
          <Section title="פתח כרטיס מלא">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {person.studentRefs.map((s) => (
                <Link
                  key={s.id}
                  href={`/students/${s.id}`}
                  className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-white flex items-center justify-center">👤</span>
                  <span className="text-sm font-semibold text-slate-800">כרטיס תלמיד {s.shiur ? `· ${s.shiur}` : ''}</span>
                </Link>
              ))}
              {person.graduateRefs.map((g) => (
                <Link
                  key={g.id}
                  href={`/graduates`}
                  className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center">🎓</span>
                  <span className="text-sm font-semibold text-slate-800">כרטיס בוגר {g.marital ? `· ${g.marital}` : ''}</span>
                </Link>
              ))}
              {person.familyRefs.map((f) => (
                <Link
                  key={f.id + f.relation}
                  href={`/families/${f.id}`}
                  className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center">👨‍👩‍👦</span>
                  <span className="text-sm font-semibold text-slate-800 flex-1 min-w-0 truncate">
                    כרטיס משפחה
                    {f.childrenNames.length > 0 && (
                      <span className="block text-[11px] text-slate-500 truncate">
                        ילדים: {f.childrenNames.join(', ')}
                      </span>
                    )}
                  </span>
                </Link>
              ))}
              {person.registrationRefs.map((r) => (
                <Link
                  key={r.id}
                  href={`/registration`}
                  className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white flex items-center justify-center">📝</span>
                  <span className="text-sm font-semibold text-slate-800">רישום ({r.status})</span>
                </Link>
              ))}
              {person.inLawRefs.map((l, i) => (
                <Link
                  key={i + l.graduateId}
                  href={`/graduates`}
                  className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center">💍</span>
                  <span className="text-sm font-semibold text-slate-800 truncate">
                    {l.relation === 'father-in-law' ? 'חמיו' : 'חמותו'} של {l.graduateName}
                  </span>
                </Link>
              ))}
            </div>
          </Section>

          {person.educationHistory.length > 0 && (
            <Section title="לימודים קודמים">
              <ul className="text-sm text-slate-700 space-y-1">
                {person.educationHistory.map((e) => (
                  <li key={e.id} className="bg-slate-50 rounded-lg px-3 py-2">
                    <span className="text-xs text-slate-500 me-1">
                      {e.institution_type === 'elementary' ? 'ת"ת' : e.institution_type === 'yeshiva_ketana' ? 'ישיבה קטנה' : 'אחר'}:
                    </span>
                    {e.institution_name}
                    {e.city && <span className="text-slate-500 text-xs"> · {e.city}</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  );
}
