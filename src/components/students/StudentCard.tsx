'use client';

import { Student, Machzor, Family } from '@/lib/types';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { getStatusLabel } from '@/lib/utils';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import Link from 'next/link';

interface StudentCardProps {
  student: Student;
}

export function StudentCard({ student }: StudentCardProps) {
  const [machzor, setMachzor] = useState<Machzor | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [siblings, setSiblings] = useState<Student[]>([]);
  const { fetchData } = useSupabase();

  useEffect(() => {
    async function loadRelations() {
      if (student.machzor_id) {
        const machzorot = await fetchData<Machzor>('machzorot', { id: student.machzor_id });
        if (machzorot.length > 0) setMachzor(machzorot[0]);
      }
      if (student.family_id) {
        const families = await fetchData<Family>('families', { id: student.family_id });
        if (families.length > 0) setFamily(families[0]);
        // מצא אחים באותה משפחה
        const allStudents = await fetchData<Student>('students', { family_id: student.family_id });
        setSiblings(allStudents.filter((s) => s.id !== student.id));
      }
    }
    loadRelations();
  }, [student, fetchData]);

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {student.first_name} {student.last_name}
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              {student.shiur}
              {machzor && <span className="text-blue-600 font-medium"> • {machzor.name}</span>}
            </p>
          </div>
          <Badge
            variant={
              student.status === 'active'
                ? 'success'
                : student.status === 'inactive'
                  ? 'warning'
                  : 'gray'
            }
          >
            {getStatusLabel(student.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* פרטים בסיסיים */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">תעודת זהות</p>
              <p className="font-semibold">{student.id_number}</p>
            </div>
            <div>
              <p className="text-gray-500">טלפון</p>
              <p className="font-semibold">{student.phone || '-'}</p>
            </div>
            <div>
              <p className="text-gray-500">דוא״ל</p>
              <p className="font-semibold text-xs break-all">{student.email || '-'}</p>
            </div>
            <div>
              <p className="text-gray-500">עיר</p>
              <p className="font-semibold">{student.city || '-'}</p>
            </div>
          </div>

          {/* משפחה ואחים */}
          {family && (
            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">👨‍👩‍👦 משפחה</h4>
              <p className="text-sm text-gray-600">משפחת {family.family_name}</p>
              {siblings.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500 mb-1">אחים בישיבה ({siblings.length}):</p>
                  <div className="flex flex-wrap gap-1">
                    {siblings.map((sibling) => (
                      <Link
                        key={sibling.id}
                        href={`/students/${sibling.id}`}
                        className="inline-block text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full hover:bg-blue-100 transition-colors"
                      >
                        {sibling.first_name} {sibling.last_name} • {sibling.shiur}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* מחזור */}
          {machzor && (
            <div className="border-t border-gray-100 pt-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">🎓 מחזור</h4>
              <div className="flex items-center gap-2">
                <span className="bg-purple-50 text-purple-700 px-3 py-1 rounded-full text-sm font-medium">
                  {machzor.name}
                </span>
                <span className="text-xs text-gray-500">משנת {machzor.start_year}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
