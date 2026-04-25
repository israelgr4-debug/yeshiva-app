'use client';

import { Person } from '@/hooks/useDirectory';

interface Props {
  person: Person;
  onClick: () => void;
}

const AVATAR_TINTS = [
  'from-sky-500 to-cyan-600',
  'from-violet-500 to-purple-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-indigo-500 to-blue-600',
  'from-lime-500 to-emerald-600',
];
function tintForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

export function PersonResultRow({ person, onClick }: Props) {
  const initial = (person.lastName || person.firstName || '?')[0] || '?';
  const tint = tintForName(person.fullName || '');

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-start px-3 md:px-4 py-3 hover:bg-blue-50/40 transition-colors flex items-start gap-3"
    >
      {/* Avatar */}
      <div className="shrink-0 relative">
        {person.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={person.photoUrl}
            alt={person.fullName}
            className="w-11 h-11 md:w-12 md:h-12 rounded-xl object-cover ring-2 ring-white shadow-sm"
          />
        ) : (
          <div
            className={`w-11 h-11 md:w-12 md:h-12 rounded-xl bg-gradient-to-br ${tint} text-white font-bold text-base md:text-lg flex items-center justify-center shadow-sm`}
          >
            {initial}
          </div>
        )}
        {person.warnings.length > 0 && (
          <span
            className="absolute -top-1 -end-1 w-4 h-4 rounded-full bg-amber-400 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white"
            title={person.warnings.join('\n')}
          >
            !
          </span>
        )}
      </div>

      {/* Main */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3 className="font-bold text-slate-900 text-sm md:text-base truncate">
            {person.lastName} {person.firstName}
          </h3>
          {person.idNumber && (
            <span className="text-[10px] text-slate-400 font-mono tabular-nums">
              {person.idNumber}
            </span>
          )}
        </div>

        {/* Roles */}
        <div className="flex flex-wrap gap-1 mt-1.5">
          {person.roles.slice(0, 5).map((r, i) => (
            <span
              key={i}
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ${r.tone}`}
            >
              {r.label}
            </span>
          ))}
          {person.roles.length > 5 && (
            <span className="inline-flex items-center px-1.5 text-[11px] text-slate-400">
              +{person.roles.length - 5}
            </span>
          )}
        </div>

        {/* Location */}
        {(person.city || person.neighborhood) && (
          <p className="text-[11px] text-slate-500 mt-1 truncate">
            📍 {[person.neighborhood, person.city].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {/* Phones - tap to call */}
      {person.phones.length > 0 && (
        <div className="hidden sm:flex flex-col gap-0.5 items-end shrink-0">
          {person.phones.slice(0, 2).map((ph, i) => (
            <a
              key={i}
              href={`tel:${ph.value}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-medium text-blue-700 hover:text-blue-900 tabular-nums hover:underline"
            >
              {ph.value}
            </a>
          ))}
        </div>
      )}

      {/* Mobile - call icon */}
      {person.phones.length > 0 && (
        <a
          href={`tel:${person.phones[0].value}`}
          onClick={(e) => e.stopPropagation()}
          className="sm:hidden shrink-0 w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center text-lg ring-1 ring-emerald-200 hover:bg-emerald-100"
          aria-label="התקשר"
        >
          📞
        </a>
      )}
    </button>
  );
}
