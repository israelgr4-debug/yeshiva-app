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
        const allStudents = await fetchData<Student>('students', { family_id: student.family_id });
        setSiblings(allStudents.filter((s) => s.id !== student.id));
      }
    }
    loadRelations();
  }, [student, fetchData]);

  const DetailRow = ({ label, value }: { label: string; value: string }) => (
    <div>
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="font-semibold text-sm">{value || '-'}</p>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-4">
          {/* Photo */}
          <div className="flex-shrink-0">
            {student.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={student.photo_url}
                alt={`${student.first_name} ${student.last_name}`}
                className="w-24 h-32 md:w-28 md:h-36 object-cover rounded-lg border-2 border-gray-200 shadow-sm"
              />
            ) : (
              <div className="w-24 h-32 md:w-28 md:h-36 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <svg className="w-8 h-8 mx-auto mb-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs">אין תמונה</p>
                </div>
              </div>
            )}
          </div>

          {/* Name + status */}
          <div className="flex-1 min-w-0 flex justify-between items-start">
            <div>
              <h3 className="text-xl font-bold text-gray-900">
                {student.first_name} {student.last_name}
              </h3>
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                {student.institution_name && (
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      student.institution_name === 'ישיבה'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-green-50 text-green-700'
                    }`}
                  >
                    {student.institution_name}
                  </span>
                )}
                {student.shiur && (
                  <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-medium">
                    {student.shiur}
                  </span>
                )}
                {machzor && (
                  <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-xs font-medium">
                    {machzor.name}
                  </span>
                )}
              </div>
            </div>
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
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {/* פרטי התלמיד */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-1">
              פרטי התלמיד
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <DetailRow label="תעודת זהות" value={student.id_number} />
              <DetailRow label="טלפון" value={student.phone} />
              <DetailRow label="דוא״ל" value={student.email} />
              <DetailRow label="שיעור" value={student.shiur} />
            </div>
          </div>

          {/* פרטי הורים */}
          {family && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-1">
                פרטי הורים
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <DetailRow label="שם האב" value={family.father_name} />
                <DetailRow label="טלפון אב" value={family.father_phone} />
                <DetailRow label="שם האם" value={family.mother_name} />
                <DetailRow label="טלפון אם" value={family.mother_phone} />
                <DetailRow label="כתובת" value={family.address} />
                <DetailRow label="עיר" value={family.city} />
              </div>
            </div>
          )}

          {/* אחים */}
          {siblings.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-1">
                אחים בישיבה ({siblings.length})
              </h4>
              <div className="flex flex-wrap gap-1">
                {siblings.map((sibling) => (
                  <Link
                    key={sibling.id}
                    href={`/students/${sibling.id}`}
                    className="inline-block text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full hover:bg-blue-100 transition-colors"
                  >
                    {sibling.first_name} {sibling.last_name} - {sibling.shiur}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
