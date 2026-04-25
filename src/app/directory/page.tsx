'use client';

import { useMemo, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { useDirectory, searchPersons, Person } from '@/hooks/useDirectory';
import { PersonResultRow } from '@/components/directory/PersonResultRow';
import { PersonProfileDrawer } from '@/components/directory/PersonProfileDrawer';

export default function DirectoryPage() {
  const { persons, loading, error, reload } = useDirectory();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Person | null>(null);

  const results = useMemo(() => searchPersons(persons, query), [persons, query]);

  const stats = useMemo(() => {
    let students = 0, graduates = 0, parents = 0, candidates = 0;
    for (const p of persons) {
      if (p.studentRefs.length) students++;
      if (p.graduateRefs.length) graduates++;
      if (p.familyRefs.length) parents++;
      if (p.registrationRefs.length) candidates++;
    }
    return { total: persons.length, students, graduates, parents, candidates };
  }, [persons]);

  return (
    <>
      <Header
        title="📒 אלפון מהיר"
        subtitle={`${stats.total.toLocaleString('he-IL')} אנשים במערכת`}
        action={
          <Button size="sm" variant="secondary" onClick={() => reload(true)} disabled={loading}>
            🔄 רענן
          </Button>
        }
      />

      <div className="p-4 md:p-8 space-y-4 animate-fadeIn">
        {/* Sticky search */}
        <div className="sticky top-[68px] md:top-[76px] z-20 -mx-4 md:-mx-8 px-4 md:px-8 py-3 bg-slate-50/80 backdrop-blur-md border-b border-slate-200">
          <div className="relative max-w-3xl">
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש: שם, ת״ז, טלפון, עיר, שם הורה / אשה..."
              className="w-full px-4 py-3 pe-12 bg-white border border-slate-200 rounded-2xl text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition-all"
            />
            <span className="absolute end-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl pointer-events-none">
              🔍
            </span>
          </div>
          {!query && (
            <p className="text-xs text-slate-500 mt-2 max-w-3xl">
              💡 חיפוש חכם: כתוב חלק משם פרטי, משפחה, טלפון או ת"ז. מספר טלפון יכול להיות עם או בלי מקפים.
            </p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-sm">
            שגיאה: {error}
          </div>
        )}

        {loading && persons.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 text-sm mt-3">טוען את האלפון...</p>
          </div>
        ) : (
          <>
            {/* Quick stats when no query */}
            {!query && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                <StatChip label="תלמידים" value={stats.students} tint="from-sky-500 to-cyan-600" />
                <StatChip label="בוגרים" value={stats.graduates} tint="from-indigo-500 to-blue-600" />
                <StatChip label="הורים" value={stats.parents} tint="from-violet-500 to-purple-600" />
                <StatChip label="מועמדים" value={stats.candidates} tint="from-emerald-500 to-teal-600" />
              </div>
            )}

            <div className="text-sm text-slate-600">
              <span className="font-bold text-slate-900 text-base">
                {results.length.toLocaleString('he-IL')}
              </span>{' '}
              {query ? 'תוצאות' : 'אנשים (200 ראשונים - חפש כדי לסנן)'}
            </div>

            {results.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                <p className="text-5xl mb-3 opacity-40">🔍</p>
                <p className="text-slate-500 text-base font-medium">לא נמצאו תוצאות</p>
                <p className="text-slate-400 text-sm mt-1">נסה לקצר את החיפוש או לחפש לפי טלפון</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 elevation-1 divide-y divide-slate-100 overflow-hidden">
                {results.map((p) => (
                  <PersonResultRow key={p.id} person={p} onClick={() => setSelected(p)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {selected && (
        <PersonProfileDrawer person={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function StatChip({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 elevation-1">
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${tint} text-white flex items-center justify-center text-sm font-bold shadow-sm mb-2`}>
        {label[0]}
      </div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 tabular-nums">{value.toLocaleString('he-IL')}</p>
    </div>
  );
}
