'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { StudentTable } from '@/components/students/StudentTable';
import { useStudents } from '@/hooks/useStudents';
import { useSupabase } from '@/hooks/useSupabase';
import { Student, Family, Machzor } from '@/lib/types';
import { SHIURIM } from '@/lib/shiurim';
import Link from 'next/link';

const shiurOptions = [
  { value: '', label: 'כל השיעורים' },
  ...SHIURIM.map((s) => ({ value: s.name, label: s.name })),
];

const statusOptions = [
  { value: '', label: 'כל הסטטוסים' },
  { value: 'active', label: 'פעיל' },
  { value: 'chizuk', label: 'חיזוק' },
  { value: 'inactive', label: 'לא פעיל' },
  { value: 'graduated', label: 'סיים' },
];

const institutionOptions = [
  { value: '', label: 'כל המוסדות' },
  { value: 'ישיבה', label: 'ישיבה' },
  { value: 'כולל', label: 'כולל' },
  { value: "כולל של ר' יצחק פינקל", label: "כולל ר' יצחק פינקל" },
];

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [families, setFamilies] = useState<Record<string, Family>>({});
  const [machzorot, setMachzorot] = useState<Record<string, Machzor>>({});
  const [siblingCounts, setSiblingCounts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShiur, setSelectedShiur] = useState('');
  const [selectedInstitution, setSelectedInstitution] = useState('');
  // Default to 'active' - show only active students by default
  const [selectedStatus, setSelectedStatus] = useState('active');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const { getStudents, loading } = useStudents();
  const { fetchData } = useSupabase();

  // Load students, families, machzorot in parallel
  useEffect(() => {
    async function loadAll() {
      const [studentsData, familiesData, machzorData] = await Promise.all([
        getStudents(),
        fetchData<Family>('families'),
        fetchData<Machzor>('machzorot'),
      ]);
      setStudents(studentsData);
      setFilteredStudents(studentsData);

      const famMap: Record<string, Family> = {};
      for (const f of familiesData) famMap[f.id] = f;
      setFamilies(famMap);

      const machMap: Record<string, Machzor> = {};
      for (const m of machzorData) machMap[m.id] = m;
      setMachzorot(machMap);

      // Compute sibling counts - ONLY active students
      const counts: Record<string, number> = {};
      for (const s of studentsData) {
        if (s.family_id && s.status === 'active') {
          counts[s.family_id] = (counts[s.family_id] || 0) + 1;
        }
      }
      setSiblingCounts(counts);
    }
    loadAll();
  }, [getStudents, fetchData]);

  useEffect(() => {
    let filtered = students;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          (s.first_name || '').toLowerCase().includes(query) ||
          (s.last_name || '').toLowerCase().includes(query) ||
          (s.id_number || '').includes(query)
      );
    }

    if (selectedShiur) {
      filtered = filtered.filter((s) => s.shiur === selectedShiur);
    }

    if (selectedStatus) {
      filtered = filtered.filter((s) => s.status === selectedStatus);
    }

    if (selectedInstitution) {
      filtered = filtered.filter((s) => s.institution_name === selectedInstitution);
    }

    setFilteredStudents(filtered);
    setCurrentPage(1);
  }, [searchQuery, selectedShiur, selectedStatus, selectedInstitution, students]);

  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);

  // Helpful: short page jump to avoid 100+ page buttons
  const pageWindow = (() => {
    const windowSize = 7;
    const half = Math.floor(windowSize / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + windowSize - 1);
    if (end - start < windowSize - 1) start = Math.max(1, end - windowSize + 1);
    return { start, end };
  })();

  return (
    <>
      <Header title="תלמידים" subtitle="ניהול רשימת התלמידים" />

      <div className="p-4 md:p-8">
        {/* Filters and Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          <SearchInput
            placeholder="חיפוש לפי שם או תעודת זהות..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Select
            options={institutionOptions}
            value={selectedInstitution}
            onChange={(e) => setSelectedInstitution(e.target.value)}
          />
          <Select
            options={shiurOptions}
            value={selectedShiur}
            onChange={(e) => setSelectedShiur(e.target.value)}
          />
          <Select
            options={statusOptions}
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          />
          <div className="flex gap-2">
            <Link href="/students/new" className="flex-1">
              <Button className="w-full">הוסף תלמיד</Button>
            </Link>
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-4 text-sm text-gray-600">
          {filteredStudents.length} תלמידים
          {totalPages > 1 && (
            <span className="ms-2 text-gray-400">
              (עמוד {currentPage} מתוך {totalPages})
            </span>
          )}
        </div>

        {/* Student Table */}
        <StudentTable
          students={paginatedStudents}
          families={families}
          machzorot={machzorot}
          siblingCounts={siblingCounts}
          isLoading={loading}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-6 flex-wrap">
            <Button
              variant="secondary"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              size="sm"
            >
              ראשון
            </Button>
            <Button
              variant="secondary"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              size="sm"
            >
              הקודם
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: pageWindow.end - pageWindow.start + 1 }).map((_, i) => {
                const pageNum = pageWindow.start + i;
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            <Button
              variant="secondary"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              size="sm"
            >
              הבא
            </Button>
            <Button
              variant="secondary"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              size="sm"
            >
              אחרון
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
