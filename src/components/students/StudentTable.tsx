'use client';

import { Student } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table';
import { getStatusLabel } from '@/lib/utils';
import Link from 'next/link';

interface StudentTableProps {
  students: Student[];
  onEdit?: (student: Student) => void;
  onDelete?: (id: string) => void;
  isLoading?: boolean;
}

export function StudentTable({ students, onEdit, onDelete, isLoading }: StudentTableProps) {
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
          <TableCell isHeader>מקבילה</TableCell>
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
            <TableCell>{student.equivalent_year}</TableCell>
            <TableCell>
              <Badge variant={student.status === 'active' ? 'success' : student.status === 'inactive' ? 'warning' : 'gray'}>
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
