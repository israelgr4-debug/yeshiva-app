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

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant={
        status === 'active'
          ? 'success'
          : status === 'chizuk'
          ? 'primary'
          : status === 'inactive'
          ? 'warning'
          : 'gray'
      }
    >
      {getStatusLabel(status)}
    </Badge>
  );
}

function InstitutionBadge({ name }: { name?: string | null }) {
  if (!name) return <span className="text-gray-400 text-xs">-</span>;
  const isYeshiva = name === 'ישיבה';
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${
        isYeshiva ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
      }`}
    >
      {name}
    </span>
  );
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
    <>
      {/* Desktop table - hidden on mobile */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableCell isHeader>שם משפחה</TableCell>
              <TableCell isHeader>שם פרטי</TableCell>
              <TableCell isHeader>תעודת זהות</TableCell>
              <TableCell isHeader>מוסד</TableCell>
              <TableCell isHeader>שיעור</TableCell>
              <TableCell isHeader>מחזור</TableCell>
              <TableCell isHeader>כתובת</TableCell>
              <TableCell isHeader>סטטוס</TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student) => {
              const family = student.family_id ? families[student.family_id] : undefined;
              const siblings = student.family_id ? siblingCounts[student.family_id] || 0 : 0;
              const addressText = family ? [family.address, family.city].filter(Boolean).join(', ') : '';

              return (
                <TableRow key={student.id} isClickable>
                  <TableCell>
                    <Link href={`/students/${student.id}`} className="text-blue-600 hover:underline font-medium">
                      {student.last_name}
                    </Link>
                    {siblings > 1 && (
                      <span
                        className="ms-2 inline-flex items-center bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded text-xs font-medium"
                        title={`${siblings} אחים פעילים במשפחה`}
                      >
                        👥 {siblings}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`/students/${student.id}`} className="text-blue-600 hover:underline">
                      {student.first_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{student.id_number}</TableCell>
                  <TableCell><InstitutionBadge name={student.institution_name} /></TableCell>
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
                  <TableCell><StatusBadge status={student.status} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile card list - visible only on mobile */}
      <div className="md:hidden space-y-3">
        {students.map((student) => {
          const family = student.family_id ? families[student.family_id] : undefined;
          const siblings = student.family_id ? siblingCounts[student.family_id] || 0 : 0;
          const addressText = family ? [family.address, family.city].filter(Boolean).join(', ') : '';
          const machzor = student.machzor_id ? machzorot[student.machzor_id] : null;

          return (
            <Link
              key={student.id}
              href={`/students/${student.id}`}
              className="block bg-white border border-gray-200 rounded-lg p-4 active:bg-gray-50"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900">
                    {student.last_name} {student.first_name}
                  </h3>
                  <p className="text-xs text-gray-500">ת"ז: {student.id_number}</p>
                </div>
                <StatusBadge status={student.status} />
              </div>

              <div className="flex flex-wrap gap-1.5 mb-2">
                <InstitutionBadge name={student.institution_name} />
                {student.shiur && (
                  <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs">
                    {student.shiur}
                  </span>
                )}
                {machzor && (
                  <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-xs">
                    {machzor.name}
                  </span>
                )}
                {siblings > 1 && (
                  <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded text-xs">
                    👥 {siblings} אחים
                  </span>
                )}
              </div>

              {addressText && (
                <p className="text-xs text-gray-600 truncate">📍 {addressText}</p>
              )}
            </Link>
          );
        })}
      </div>
    </>
  );
}
