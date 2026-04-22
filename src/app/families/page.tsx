'use client';

import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { SearchInput } from '@/components/ui/SearchInput';
import { useSupabase } from '@/hooks/useSupabase';
import { Family, Student } from '@/lib/types';
import Link from 'next/link';

type ActiveFilter = 'active' | 'inactive' | 'all';

export default function FamiliesPage() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [studentsByFamily, setStudentsByFamily] = useState<Record<string, Student[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active');
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

  const filteredFamilies = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return families.filter((f) => {
      // Active filter
      if (activeFilter !== 'all') {
        const kids = studentsByFamily[f.id] || [];
        const hasActive = kids.some((k) => k.status === 'active' || k.status === 'chizuk');
        if (activeFilter === 'active' && !hasActive) return false;
        if (activeFilter === 'inactive' && hasActive) return false;
      }

      // Search filter
      if (query) {
        const matches =
          f.family_name?.toLowerCase().includes(query) ||
          f.father_name?.toLowerCase().includes(query) ||
          f.mother_name?.toLowerCase().includes(query) ||
          f.father_id_number?.includes(query) ||
          f.city?.toLowerCase().includes(query);
        if (!matches) return false;
      }

      return true;
    });
  }, [families, studentsByFamily, searchQuery, activeFilter]);

  // Counts for the filter buttons
  const activeCount = useMemo(
    () =>
      families.filter((f) => {
        const kids = studentsByFamily[f.id] || [];
        return kids.some((k) => k.status === 'active' || k.status === 'chizuk');
      }).length,
    [families, studentsByFamily]
  );
  const inactiveCount = families.length - activeCount;

  return (
    <>
      <Header title="משפחות" subtitle="ניהול משפחות ואחים" />

      <div className="p-4 md:p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          <SearchInput
            placeholder="חיפוש לפי שם משפחה, שם הורה, תז אב או עיר..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="active">פעילות ({activeCount.toLocaleString('he-IL')})</option>
            <option value="inactive">לא פעילות ({inactiveCount.toLocaleString('he-IL')})</option>
            <option value="all">הכל ({families.length.toLocaleString('he-IL')})</option>
          </select>
        </div>

        <div className="mb-4 text-sm text-gray-600">
          {filteredFamilies.length} משפחות
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredFamilies.map((family) => {
            const kids = studentsByFamily[family.id] || [];
            const activeKids = kids.filter((k) => k.status === 'active' || k.status === 'chizuk');
            return (
              <div
                key={family.id}
                className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-lg font-bold text-gray-900">
                    {family.family_name || 'ללא שם'}
                  </h3>
                  {kids.length > 0 && (
                    <div className="flex flex-col items-end gap-1">
                      <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">
                        {kids.length} {kids.length === 1 ? 'תלמיד' : 'תלמידים'}
                      </span>
                      {activeKids.length > 0 && activeKids.length !== kids.length && (
                        <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">
                          {activeKids.length} פעילים
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1 text-sm mb-3">
                  {family.father_name && (
                    <div className="flex gap-2">
                      <span className="text-gray-500">אב:</span>
                      <span className="font-medium">{family.father_name}</span>
                      {family.father_phone && (
                        <span className="text-gray-400 text-xs">({family.father_phone})</span>
                      )}
                    </div>
                  )}
                  {family.mother_name && (
                    <div className="flex gap-2">
                      <span className="text-gray-500">אם:</span>
                      <span className="font-medium">{family.mother_name}</span>
                      {family.mother_phone && (
                        <span className="text-gray-400 text-xs">({family.mother_phone})</span>
                      )}
                    </div>
                  )}
                  {family.city && (
                    <div className="flex gap-2">
                      <span className="text-gray-500">עיר:</span>
                      <span>{family.city}</span>
                    </div>
                  )}
                </div>

                {kids.length > 0 ? (
                  <div className="border-t border-gray-100 pt-3">
                    <p className="text-xs text-gray-500 mb-2">תלמידים במשפחה:</p>
                    <div className="flex flex-wrap gap-1">
                      {kids.map((kid) => {
                        const isInactive = kid.status !== 'active' && kid.status !== 'chizuk';
                        return (
                          <Link
                            key={kid.id}
                            href={`/students/${kid.id}`}
                            className={`inline-block text-xs px-2 py-1 rounded-full transition-colors ${
                              isInactive
                                ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                : 'bg-green-50 text-green-700 hover:bg-green-100'
                            }`}
                            title={isInactive ? 'לא פעיל' : 'פעיל'}
                          >
                            {kid.first_name} {kid.last_name}
                            {kid.shiur && ` - ${kid.shiur}`}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="border-t border-gray-100 pt-3">
                    <p className="text-xs text-gray-400">אין תלמידים משויכים</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {filteredFamilies.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">אין משפחות להצגה</p>
          </div>
        )}
      </div>
    </>
  );
}
