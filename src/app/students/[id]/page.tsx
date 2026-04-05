'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { StudentForm } from '@/components/students/StudentForm';
import { StudentCard } from '@/components/students/StudentCard';
import { EducationHistory } from '@/components/students/EducationHistory';
import { useStudents } from '@/hooks/useStudents';
import { useSupabase } from '@/hooks/useSupabase';
import { Student, Machzor } from '@/lib/types';
import Link from 'next/link';

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [student, setStudent] = useState<Student | null>(null);
  const [machzor, setMachzor] = useState<Machzor | null>(null);
  const [activeTab, setActiveTab] = useState('details');
  const [isEditing, setIsEditing] = useState(id === 'new');

  const { getStudentById, createStudent, updateStudent, loading } = useStudents();
  const { fetchData } = useSupabase();

  useEffect(() => {
    if (id !== 'new') {
      loadStudent();
    }
  }, [id]);

  async function loadStudent() {
    if (id === 'new') return;
    const data = await getStudentById(id);
    setStudent(data);
    if (data?.machzor_id) {
      const machzorot = await fetchData<Machzor>('machzorot', { id: data.machzor_id });
      if (machzorot.length > 0) setMachzor(machzorot[0]);
    }
  }

  async function handleSubmit(formData: any) {
    try {
      if (id === 'new') {
        const newStudent = await createStudent(formData);
        if (newStudent) {
          router.push(`/students/${newStudent.id}`);
        }
      } else {
        const updated = await updateStudent(id, formData);
        if (updated) {
          setStudent(updated);
          setIsEditing(false);
          loadStudent();
        }
      }
    } catch (error) {
      console.error('Failed to save student:', error);
    }
  }

  if (loading && id !== 'new') {
    return (
      <>
        <Header title="טוען..." />
        <div className="p-8 text-center">
          <p className="text-gray-600">טוען נתונים...</p>
        </div>
      </>
    );
  }

  const tabs = [
    { key: 'details', label: 'פרטים אישיים' },
    { key: 'addresses', label: 'כתובות' },
    { key: 'education', label: 'היסטוריה לימודית' },
    { key: 'donations', label: 'תרומות' },
    { key: 'dormitory', label: 'פנימיה' },
  ];

  return (
    <>
      <Header
        title={student ? `${student.first_name} ${student.last_name}` : 'תלמיד חדש'}
        subtitle={
          student
            ? `${student.shiur || ''}${machzor ? ` • ${machzor.name}` : ''}`
            : 'הוסף תלמיד חדש'
        }
      />

      <div className="p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Student Card */}
          {student && !isEditing && (
            <div className="col-span-1">
              <StudentCard student={student} />
            </div>
          )}

          {/* Main Content */}
          <div className={isEditing || !student ? 'col-span-1 lg:col-span-3' : 'col-span-1 lg:col-span-2'}>
            {!isEditing && student ? (
              <>
                {/* Tabs */}
                <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`px-4 py-2 font-medium transition-colors ${
                        activeTab === tab.key
                          ? 'text-blue-600 border-b-2 border-blue-600'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                <div className="bg-white rounded-lg p-6 border border-gray-200">
                  {activeTab === 'details' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <p className="text-gray-500 text-sm">שם פרטי</p>
                        <p className="font-semibold">{student.first_name}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-sm">שם משפחה</p>
                        <p className="font-semibold">{student.last_name}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-sm">תעודת זהות</p>
                        <p className="font-semibold">{student.id_number}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-sm">טלפון</p>
                        <p className="font-semibold">{student.phone || '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-sm">דוא״ל</p>
                        <p className="font-semibold text-sm break-all">{student.email || '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-sm">שיעור</p>
                        <p className="font-semibold">{student.shiur || '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-sm">מחזור</p>
                        <p className="font-semibold">
                          {machzor ? (
                            <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-sm">
                              {machzor.name}
                            </span>
                          ) : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-sm">שנה מקבילה</p>
                        <p className="font-semibold">{student.equivalent_year || '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-sm">שם האב</p>
                        <p className="font-semibold">{student.father_name || '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-sm">שם האם</p>
                        <p className="font-semibold">{student.mother_name || '-'}</p>
                      </div>
                    </div>
                  )}

                  {activeTab === 'addresses' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                        <p className="text-gray-500 text-sm">רחוב</p>
                        <p className="font-semibold">{student.address || '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-sm">עיר</p>
                        <p className="font-semibold">{student.city || '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-sm">קוד דואר</p>
                        <p className="font-semibold">{student.postal_code || '-'}</p>
                      </div>
                    </div>
                  )}

                  {activeTab === 'education' && (
                    <EducationHistory studentId={student.id} />
                  )}

                  {activeTab === 'donations' && (
                    <p className="text-gray-500 text-center py-8">אין תרומות רשומות</p>
                  )}

                  {activeTab === 'dormitory' && (
                    <p className="text-gray-500 text-center py-8">
                      התלמיד לא הוקצה לחדר עדיין
                    </p>
                  )}
                </div>

                {/* Edit Button */}
                <div className="mt-6 flex gap-4">
                  <Button onClick={() => setIsEditing(true)}>עריכה</Button>
                  <Link href="/students">
                    <Button variant="secondary">חזור</Button>
                  </Link>
                </div>
              </>
            ) : (
              <>
                <StudentForm
                  student={student || undefined}
                  onSubmit={handleSubmit}
                  isLoading={loading}
                />
                {student && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIsEditing(false);
                      loadStudent();
                    }}
                    className="mt-4"
                  >
                    ביטול
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
