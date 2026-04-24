'use client';

import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { StudentTable, SortKey, SortDir } from '@/components/students/StudentTable';
import { useStudents } from '@/hooks/useStudents';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/hooks/useAuth';
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

const pageSizeOptions = [
  { value: '50', label: '50 בעמוד' },
  { value: '100', label: '100 בעמוד' },
  { value: '250', label: '250 בעמוד' },
  { value: 'all', label: 'הצג הכל' },
];

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [families, setFamilies] = useState<Record<string, Family>>({});
  const [machzorot, setMachzorot] = useState<Record<string, Machzor>>({});
  const [siblingCounts, setSiblingCounts] = useState<Record<string, number>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShiur, setSelectedShiur] = useState('');
  const [selectedInstitution, setSelectedInstitution] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('active');
  const [onlyChinuch, setOnlyChinuch] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>('last_name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const [pageSize, setPageSize] = useState<number | 'all'>(50);
  const [currentPage, setCurrentPage] = useState(1);

  const { getStudents, loading } = useStudents();
  const { fetchData } = useSupabase();
  const { permissions } = useAuth();

  useEffect(() => {
    async function loadAll() {
      const [studentsData, familiesData, machzorData] = await Promise.all([
        getStudents(),
        fetchData<Family>('families'),
        fetchData<Machzor>('machzorot'),
      ]);
      setStudents(studentsData);

      const famMap: Record<string, Family> = {};
      for (const f of familiesData) famMap[f.id] = f;
      setFamilies(famMap);

      const machMap: Record<string, Machzor> = {};
      for (const m of machzorData) machMap[m.id] = m;
      setMachzorot(machMap);

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

  const filteredStudents = useMemo(() => {
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
    if (selectedShiur) filtered = filtered.filter((s) => s.shiur === selectedShiur);
    if (selectedStatus) filtered = filtered.filter((s) => s.status === selectedStatus);
    if (selectedInstitution) filtered = filtered.filter((s) => s.institution_name === selectedInstitution);
    if (onlyChinuch) filtered = filtered.filter((s) => s.is_chinuch);
    return filtered;
  }, [students, searchQuery, selectedShiur, selectedStatus, selectedInstitution, onlyChinuch]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedShiur, selectedStatus, selectedInstitution, onlyChinuch, pageSize]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const activeCount = useMemo(
    () => filteredStudents.filter((s) => s.status === 'active').length,
    [filteredStudents]
  );

  const paginatedStudents =
    pageSize === 'all'
      ? filteredStudents
      : filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const totalPages =
    pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filteredStudents.length / pageSize));

  const pageWindow = (() => {
    const windowSize = 7;
    const half = Math.floor(windowSize / 2);
    let start = Math.max(1, currentPage - half);
    let end = Math.min(totalPages, start + windowSize - 1);
    if (end - start < windowSize - 1) start = Math.max(1, end - windowSize + 1);
    return { start, end };
  })();

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedShiur('');
    setSelectedInstitution('');
    setSelectedStatus('active');
    setOnlyChinuch(false);
  };

  const hasActiveFilters =
    searchQuery || selectedShiur || selectedInstitution || selectedStatus !== 'active' || onlyChinuch;

  return (
    <>
      <Header
        title="תלמידים"
        subtitle="ניהול רשומות תלמידים"
        action={
          permissions.canWrite ? (
            <Link href="/students/new">
              <Button size="sm">＋ תלמיד חדש</Button>
            </Link>
          ) : undefined
        }
      />

      <div className="p-4 md:p-8 space-y-4 animate-fadeIn">
        {/* Filter card */}
        <div className="bg-white rounded-2xl border border-slate-200 elevation-1 p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span className="w-1 h-4 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full" />
              סינון וחיפוש
            </h3>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                ✕ נקה סינון
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            <FilterField label="חיפוש">
              <SearchInput
                placeholder="שם או ת״ז..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </FilterField>
            <FilterField label="מוסד">
              <Select
                options={institutionOptions}
                value={selectedInstitution}
                onChange={(e) => setSelectedInstitution(e.target.value)}
              />
            </FilterField>
            <FilterField label="שיעור">
              <Select
                options={shiurOptions}
                value={selectedShiur}
                onChange={(e) => setSelectedShiur(e.target.value)}
              />
            </FilterField>
            <FilterField label="סטטוס">
              <Select
                options={statusOptions}
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              />
            </FilterField>
            <FilterField label="תצוגה">
              <div className="flex items-center gap-2">
                <Select
                  options={pageSizeOptions}
                  value={String(pageSize)}
                  onChange={(e) =>
                    setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))
                  }
                />
              </div>
            </FilterField>
          </div>
          {/* Chinuch toggle chip */}
          <div className="mt-3 flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-xs cursor-pointer group">
              <input
                type="checkbox"
                checked={onlyChinuch}
                onChange={(e) => setOnlyChinuch(e.target.checked)}
                className="rounded accent-purple-600"
              />
              <span className="text-slate-600 group-hover:text-slate-900 transition-colors">
                📘 רק מסומני חינוך
              </span>
            </label>
          </div>
        </div>

        {/* Result summary strip */}
        <div className="flex items-center justify-between text-sm">
          <div className="text-slate-600">
            <span className="font-bold text-slate-900 text-base">
              {filteredStudents.length.toLocaleString('he-IL')}
            </span>{' '}
            תלמידים
            <span className="text-slate-400 mx-2">·</span>
            <span className="text-emerald-700 font-semibold">
              {activeCount.toLocaleString('he-IL')} פעילים
            </span>
            {totalPages > 1 && (
              <span className="text-slate-400 mx-2 hidden md:inline">
                · עמוד {currentPage} מתוך {totalPages}
              </span>
            )}
          </div>
        </div>

        {/* Table */}
        <StudentTable
          students={paginatedStudents}
          families={families}
          machzorot={machzorot}
          siblingCounts={siblingCounts}
          isLoading={loading}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={handleSort}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-1 mt-2 flex-wrap">
            <Button
              variant="secondary"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              size="sm"
            >
              «
            </Button>
            <Button
              variant="secondary"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              size="sm"
            >
              ‹ הקודם
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
              הבא ›
            </Button>
            <Button
              variant="secondary"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              size="sm"
            >
              »
            </Button>
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
