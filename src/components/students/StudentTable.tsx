'use client';

import { Student, Machzor, Family } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table';
import { getStatusLabel } from '@/lib/utils';
import Link from 'next/link';

interface StudentTableProps {
  students: Student[];
  machzorot?: Record<string, Machzor>;
  families?: Record<string, Family>;
  siblingCounts?: Record<string, number>;
  isLoading?: boolean;
}

export function StudentTable({
  students,
  machzorot = {},
  families = {},
  siblingCounts = {},
  isLoading,
}: StudentTableProps) {

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
          <TableCell isHeader>שם משפחה</TableCell>
          <TableCell isHeader>שם פרטי</TableCell>
          <TableCell isHeader>תעודת זהות</TableCell>
          <TableCell isHeader>שיעור</TableCell>
          <TableCell isHeader>מחזור</TableCell>
          <TableCell isHeader>כתובת</TableCell>
          <TableCell isHeader>סטטוס</TableCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {students.map((student) => {
          const family = student.family_id ? families[student.family_id] : undefined;
          const siblingsInFamily = student.family_id ? siblingCounts[student.family_id] || 0 : 0;
          const addressText = family ? [family.address, family.city].filter(Boolean).join(', ') : '';

          return (
            <TableRow key={student.id} isClickable>
              <TableCell>
                <Link href={`/students/${student.id}`} className="text-blue-600 hover:underline font-medium">
                  {student.last_name}
                </Link>
                {siblingsInFamily > 1 && (
                  <span
                    className="ms-2 inline-flex items-center bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded text-xs font-medium"
                    title={`${siblingsInFamily} אחים במשפחה`}
                  >
                    👥 {siblingsInFamily}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <Link href={`/students/${student.id}`} className="text-blue-600 hover:underline">
                  {student.first_name}
                </Link>
              </TableCell>
              <TableCell className="text-sm text-gray-600">{student.id_number}</TableCell>
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
              <TableCell className="text-sm text-gray-600" title={addressText}>
                {addressText || <span className="text-gray-400">-</span>}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    student.status === 'active'
                      ? 'success'
                      : student.status === 'chizuk'
                      ? 'primary'
                      : student.status === 'inactive'
                      ? 'warning'
                      : 'gray'
                  }
                >
                  {getStatusLabel(student.status)}
                </Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
