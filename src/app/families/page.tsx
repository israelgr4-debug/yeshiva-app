'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { SearchInput } from '@/components/ui/SearchInput';
import { useSupabase } from '@/hooks/useSupabase';
import { Family, Student } from '@/lib/types';
import Link from 'next/link';

export default function FamiliesPage() {
  const [families, setFamilies] = useState<Family[]>([]);
  const [studentsByFamily, setStudentsByFamily] = useState<Record<string, Student[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredFamilies, setFilteredFamilies] = useState<Family[]>([]);
  const { fetchData } = useSupabase();

  useEffect(() => {
    async function loadData() {
      const allFamilies = await fetchData<Family>('families');
      setFamilies(allFamilies);
      setFilteredFamilies(allFamilies);

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

  useEffect(() => {
    if (!searchQuery) {
      setFilteredFamilies(families);
      return;
    }
    const query = searchQuery.toLowerCase();
    setFilteredFamilies(
      families.filter(
        (f) =>
          f.family_name?.toLowerCase().includes(query) ||
          f.father_name?.toLowerCase().includes(query) ||
          f.mother_name?.toLowerCase().includes(query) ||
          f.father_id_number?.includes(query) ||
          f.city?.toLowerCase().includes(query)
      )
    );
  }, [searchQuery, families]);

  return (
    <>
      <Header title="משפחות" subtitle="ניהול משפחות ואחים" />

      <div className="p-8">
        <div className="mb-6 max-w-md">
          <SearchInput
            placeholder="חיפוש לפי שם משפחה, שם הורה, תז אב או עיר..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="mb-4 text-sm text-gray-600">
          {filteredFamilies.length} משפחות
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredFamilies.map((family) => {
            const kids = studentsByFamily[family.id] || [];
            return (
              <div
                key={family.id}
                className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-lg font-bold text-gray-900">
                    {family.family_name || 'ללא שם'}
                  </h3>
                  {kids.length > 0 && (
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">
                      {kids.length} {kids.length === 1 ? 'תלמיד' : 'תלמידים'}
                    </span>
                  )}
                </div>

                {/* Parents */}
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

                {/* Children */}
                {kids.length > 0 && (
                  <div className="border-t border-gray-100 pt-3">
                    <p className="text-xs text-gray-500 mb-2">תלמידים במשפחה:</p>
                    <div className="flex flex-wrap gap-1">
                      {kids.map((kid) => (
                        <Link
                          key={kid.id}
                          href={`/students/${kid.id}`}
                          className="inline-block text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full hover:bg-green-100 transition-colors"
                        >
                          {kid.first_name} {kid.last_name}
                          {kid.shiur && ` - ${kid.shiur}`}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {kids.length === 0 && (
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
