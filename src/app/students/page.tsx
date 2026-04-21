'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { StudentTable } from '@/components/students/StudentTable';
import { useStudents } from '@/hooks/useStudents';
import { Student } from '@/lib/types';
import Link from 'next/link';

const shiurOptions = [
  { value: '', label: 'כל השיעורים' },
  { value: 'בחורים א', label: 'בחורים א' },
  { value: 'בחורים ב', label: 'בחורים ב' },
  { value: 'בחורים ג', label: 'בחורים ג' },
  { value: 'משכילים א', label: 'משכילים א' },
  { value: 'משכילים ב', label: 'משכילים ב' },
];

const statusOptions = [
  { value: '', label: 'כל הסטטוסים' },
  { value: 'active', label: 'פעיל' },
  { value: 'chizuk', label: 'חיזוק' },
  { value: 'inactive', label: 'לא פעיל' },
  { value: 'graduated', label: 'סיים' },
];

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShiur, setSelectedShiur] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { getStudents, deleteStudent, loading } = useStudents();

  useEffect(() => {
    async function loadStudents() {
      const data = await getStudents();
      setStudents(data);
      setFilteredStudents(data);
    }
    loadStudents();
  }, [getStudents]);

  useEffect(() => {
    let filtered = students;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.first_name.toLowerCase().includes(query) ||
          s.last_name.toLowerCase().includes(query) ||
          s.id_number.includes(query)
      );
    }

    if (selectedShiur) {
      filtered = filtered.filter((s) => s.shiur === selectedShiur);
    }

    if (selectedStatus) {
      filtered = filtered.filter((s) => s.status === selectedStatus);
    }

    setFilteredStudents(filtered);
    setCurrentPage(1);
  }, [searchQuery, selectedShiur, selectedStatus, students]);

  const handleDelete = async (id: string) => {
    if (confirm('האם אתה בטוח שברצונך למחוק את התלמיד?')) {
      const success = await deleteStudent(id);
      if (success) {
        setStudents((prev) => prev.filter((s) => s.id !== id));
      }
    }
  };

  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);

  return (
    <>
      <Header title="תלמידים" subtitle="ניהול רשימת התלמידים" />

      <div className="p-8">
        {/* Filters and Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <SearchInput
            placeholder="חיפוש לפי שם או תעודת זהות..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
        </div>

        {/* Student Table */}
        <StudentTable
          students={paginatedStudents}
          onDelete={handleDelete}
          isLoading={loading}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            <Button
              variant="secondary"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              הקודם
            </Button>
            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }).map((_, i) => (
                <Button
                  key={i + 1}
                  variant={currentPage === i + 1 ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => setCurrentPage(i + 1)}
                >
                  {i + 1}
                </Button>
              ))}
            </div>
            <Button
              variant="secondary"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              הבא
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
