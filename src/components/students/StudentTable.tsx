'use client';

import { Student, Machzor, Family } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table';
import { getStatusLabel } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import Link from 'next/link';

interface StudentTableProps {
  students: Student[];
  onEdit?: (student: Student) => void;
  onDelete?: (id: string) => void;
  isLoading?: boolean;
}

export function StudentTable({ students, onEdit, onDelete, isLoading }: StudentTableProps) {
  const [machzorot, setMachzorot] = useState<Record<string, Machzor>>({});
  const [families, setFamilies] = useState<Record<string, Family>>({});
  const [siblingCounts, setSiblingCounts] = useState<Record<string, number>>({});
  const { fetchData } = useSupabase();

  useEffect(() => {
    async function loadMachzorot() {
      const data = await fetchData<Machzor>('machzorot');
      const map: Record<string, Machzor> = {};
      data.forEach((m) => { map[m.id] = m; });
      setMachzorot(map);
    }
    loadMachzorot();
  }, [fetchData]);

  useEffect(() => {
    async function loadFamilies() {
      // Get unique family IDs from students
      const familyIds = [...new Set(students.filter(s => s.family_id).map(s => s.family_id!))];
      if (familyIds.length === 0) return;

      const familyMap: Record<string, Family> = {};
      for (const fid of familyIds) {
        const data = await fetchData<Family>('families', { id: fid });
        if (data.length > 0) familyMap[fid] = data[0];
      }
      setFamilies(familyMap);

      // Count siblings per family from all students in the system
      const counts: Record<string, number> = {};
      for (const fid of familyIds) {
        const allInFamily = await fetchData<Student>('students', { family_id: fid });
        counts[fid] = allInFamily.length;
      }
      setSiblingCounts(counts);
    }
    loadFamilies();
  }, [students, fetchData]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-200 rounded animate-pulse"></div>
        ))}
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">אין תלמידים להצגה</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableCell isHeader>שם מלא</TableCell>
          <TableCell isHeader>תעודת זהות</TableCell>
          <TableCell isHeader>שיעור</TableCell>
          <TableCell isHeader>מחזור</TableCell>
          <TableCell isHeader>משפחה</TableCell>
          <TableCell isHeader>סטטוס</TableCell>
          <TableCell isHeader>פעולות</TableCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((student) => (
          <TableRow key={student.id} isClickable>
            <TableCell>
              <Link href={`/students/${student.id}`} className="text-blue-600 hover:underline">
                {student.first_name} {student.last_name}
              </Link>
            </TableCell>
            <TableCell>{student.id_number}</TableCell>
            <TableCell>{student.shiur}</TableCell>
            <TableCell>
              {student.machzor_id && machzorot[student.machzor_id] ? (
                <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-xs font-medium">
                  {machzorot[student.machzor_id].name}
                </span>
              ) : (
                '-'
              )}
            </TableCell>
            <TableCell>
              {student.family_id && families[student.family_id] ? (
                <div className="flex items-center gap-1">
                  <span className="text-sm">{families[student.family_id].family_name}</span>
                  {siblingCounts[student.family_id] && siblingCounts[student.family_id] > 1 && (
                    <span className="bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded text-xs font-medium" title={`${siblingCounts[student.family_id]} אחים במשפחה`}>
                      👥 {siblingCounts[student.family_id]}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-gray-400 text-xs">לא משויך</span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={student.status === 'active' ? 'success' : student.status === 'chizuk' ? 'primary' : student.status === 'inactive' ? 'warning' : 'gray'}>
                {getStatusLabel(student.status)}
              </Badge>
            </TableCell>
            <TableCell>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => onEdit?.(student)}>
                  עריכה
                </Button>
                <Button size="sm" variant="danger" onClick={() => onDelete?.(student.id)}>
                  מחיקה
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
