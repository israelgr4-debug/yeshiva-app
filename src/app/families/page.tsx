'use client';

import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { useSupabase } from '@/hooks/useSupabase';
import { Family, Student } from '@/lib/types';
import Link from 'next/link';

type ActiveFilter = 'active' | 'inactive' | 'all';

export default function FamiliesPage() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [studentsByFamily, setStudentsByFamily] = useState<Record<string, Student[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active');
  const [cityFilter, setCityFilter] = useState('');
  const { fetchData } = useSupabase();

  useEffect(() => {
    async function loadData() {
      const allFamilies = await fetchData<Family>('families');
      setFamilies(allFamilies);

      const allStudents = await fetchData<Student>('students');
      const grouped: Record<string, Student[]> = {};
      allStudents.forEach((s) => {
        if (s.family_id) {
          if (!grouped[s.family_id]) grouped[s.family_id] = [];
          grouped[s.family_id].push(s);
        }
      });
      setStudentsByFamily(grouped);
    }
    loadData();
  }, [fetchData]);

  // Distinct cities for filter
  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const f of families) {
      if (f.city) set.add(f.city.trim());
    }
    return [
      { value: '', label: 'כל הערים' },
      ...Array.from(set)
        .sort((a, b) => a.localeCompare(b, 'he'))
        .map((c) => ({ value: c, label: c })),
    ];
  }, [families]);

  const filteredFamilies = useMemo(() => {
    return families.filter((f) => {
      if (activeFilter !== 'all') {
        const kids = studentsByFamily[f.id] || [];
        const hasActive = kids.some((k) => k.status === 'active' || k.status === 'chizuk');
        if (activeFilter === 'active' && !hasActive) return false;
        if (activeFilter === 'inactive' && hasActive) return false;
      }
      if (cityFilter && f.city !== cityFilter) return false;

      if (searchQuery.trim()) {
        const digits = (v: string) => v.replace(/\D/g, '');
        const tokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const kids = studentsByFamily[f.id] || [];
        const textPool = [
          f.family_name,
          f.father_name,
          f.mother_name,
          f.father_id_number,
          f.mother_id_number,
          f.father_phone,
          f.mother_phone,
          f.home_phone,
          f.city,
          f.address,
          ...kids.flatMap((k) => [k.first_name, k.last_name, k.id_number, k.phone]),
        ]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase())
          .join(' ');
        const digitPool = [
          f.father_id_number,
          f.mother_id_number,
          f.father_phone,
          f.mother_phone,
          f.home_phone,
          ...kids.flatMap((k) => [k.id_number, k.phone]),
        ]
          .filter(Boolean)
          .map((v) => digits(String(v)))
          .join(' ');
        return tokens.every((tok) =>
          /^\d/.test(tok) ? digitPool.includes(digits(tok)) || textPool.includes(tok) : textPool.includes(tok)
        );
      }
      return true;
    });
  }, [families, studentsByFamily, searchQuery, activeFilter, cityFilter]);

  const activeCount = useMemo(
    () =>
      families.filter((f) => {
        const kids = studentsByFamily[f.id] || [];
        return kids.some((k) => k.status === 'active' || k.status === 'chizuk');
      }).length,
    [families, studentsByFamily]
  );
  const inactiveCount = families.length - activeCount;

  const statusFilterOptions = [
    { value: 'active', label: `פעילות (${activeCount.toLocaleString('he-IL')})` },
    { value: 'inactive', label: `לא פעילות (${inactiveCount.toLocaleString('he-IL')})` },
    { value: 'all', label: `הכל (${families.length.toLocaleString('he-IL')})` },
  ];

  const clearFilters = () => {
    setSearchQuery('');
    setActiveFilter('active');
    setCityFilter('');
  };
  const hasActive = searchQuery || activeFilter !== 'active' || cityFilter;

  return (
    <>
      <Header title="משפחות" subtitle="ניהול משפחות ואחים" />

      <div className="p-4 md:p-8 space-y-4 animate-fadeIn">
        {/* Filters */}
        <div className="bg-white rounded-2xl border border-slate-200 elevation-1 p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className="w-1 h-4 bg-gradient-to-b from-violet-500 to-purple-600 rounded-full" />
              סינון וחיפוש
            </h3>
            {hasActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                ✕ נקה סינון
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <FilterField label="חיפוש">
              <SearchInput
                placeholder="שם משפחה / הורה / ת״ז / טלפון / עיר / תלמיד..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </FilterField>
            <FilterField label="סטטוס">
              <Select
                options={statusFilterOptions}
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
              />
            </FilterField>
            <FilterField label="עיר">
              <Select
                options={cityOptions}
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
              />
            </FilterField>
          </div>
        </div>

        {/* Summary */}
        <div className="text-sm text-slate-600">
          <span className="font-bold text-slate-900 text-base">
            {filteredFamilies.length.toLocaleString('he-IL')}
          </span>{' '}
          משפחות
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4">
          {filteredFamilies.map((family) => {
            const kids = studentsByFamily[family.id] || [];
            const activeKids = kids.filter((k) => k.status === 'active' || k.status === 'chizuk');
            const initials = (family.family_name || '—')[0] || '—';
            return (
              <div
                key={family.id}
                className="group bg-white rounded-2xl border border-slate-200 elevation-1 hover:elevation-3 hover:-translate-y-0.5 transition-all duration-150 overflow-hidden"
              >
                {/* Header strip */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-gradient-to-l from-slate-50 to-white">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center text-lg font-bold shadow-md shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/families/${family.id}`}
                      className="block font-bold text-slate-900 hover:text-blue-700 truncate text-base"
                      style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
                    >
                      {family.family_name || 'ללא שם'}
                    </Link>
                    {family.city && (
                      <p className="text-[11px] text-slate-500 truncate">📍 {family.city}</p>
                    )}
                  </div>
                  {kids.length > 0 && (
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className="inline-flex items-center bg-blue-50 text-blue-700 ring-1 ring-blue-100 px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums">
                        {kids.length}
                      </span>
                      {activeKids.length > 0 && activeKids.length !== kids.length && (
                        <span className="inline-flex items-center bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 px-1.5 py-0 rounded-full text-[10px] font-semibold tabular-nums">
                          {activeKids.length} פעילים
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Body - parents */}
                <div className="px-4 py-3 space-y-1.5 text-sm">
                  {family.father_name && (
                    <ParentRow label="אב" name={family.father_name} phone={family.father_phone} />
                  )}
                  {family.mother_name && (
                    <ParentRow label="אם" name={family.mother_name} phone={family.mother_phone} />
                  )}
                  {!family.father_name && !family.mother_name && (
                    <p className="text-xs text-slate-400 italic">אין פרטי הורים</p>
                  )}
                </div>

                {/* Students */}
                <div className="px-4 pb-3 pt-1 border-t border-slate-100 bg-slate-50/40">
                  {kids.length > 0 ? (
                    <div className="flex flex-wrap gap-1 pt-2">
                      {kids.map((kid) => {
                        const isActive = kid.status === 'active' || kid.status === 'chizuk';
                        return (
                          <Link
                            key={kid.id}
                            href={`/students/${kid.id}`}
                            className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-md transition-colors ring-1 ${
                              isActive
                                ? 'bg-white text-slate-700 ring-slate-200 hover:ring-blue-300 hover:text-blue-700'
                                : 'bg-slate-100 text-slate-500 ring-slate-200 hover:text-slate-700'
                            }`}
                            title={isActive ? 'פעיל' : 'לא פעיל'}
                          >
                            {kid.first_name} {kid.last_name}
                            {kid.shiur && <span className="text-slate-400 ms-1">· {kid.shiur}</span>}
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic pt-2">אין תלמידים משויכים</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredFamilies.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <p className="text-5xl mb-3 opacity-40">🔍</p>
            <p className="text-slate-500 text-base font-medium">לא נמצאו משפחות</p>
            <p className="text-slate-400 text-sm mt-1">נסה לשנות את הסינון</p>
          </div>
        )}
      </div>
    </>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function ParentRow({ label, name, phone }: { label: string; name: string; phone?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 w-6">{label}</span>
      <span className="font-medium text-slate-800 flex-1 min-w-0 truncate">{name}</span>
      {phone && (
        <a
          href={`tel:${phone}`}
          className="text-[11px] font-medium text-slate-500 hover:text-blue-700 tabular-nums"
          onClick={(e) => e.stopPropagation()}
        >
          {phone}
        </a>
      )}
    </div>
  );
}
