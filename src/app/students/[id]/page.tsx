'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { StudentForm } from '@/components/students/StudentForm';
import { StudentCard } from '@/components/students/StudentCard';
import { EducationHistory } from '@/components/students/EducationHistory';
import { StudentDonationsTab } from '@/components/students/StudentDonationsTab';
import { useStudents } from '@/hooks/useStudents';
import { useSupabase } from '@/hooks/useSupabase';
import { useTuitionLifecycle, LeaveStatus } from '@/hooks/useTuitionLifecycle';
import { useAuth } from '@/hooks/useAuth';
import { ConfirmDelete } from '@/components/ui/ConfirmDelete';
import { Student, Machzor, Family } from '@/lib/types';
import Link from 'next/link';

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [student, setStudent] = useState<Student | null>(null);
  const [machzor, setMachzor] = useState<Machzor | null>(null);
  const [family, setFamily] = useState<Family | null>(null);
  const [siblings, setSiblings] = useState<Student[]>([]);
  const [activeTab, setActiveTab] = useState('details');
  const [isEditing, setIsEditing] = useState(id === 'new');

  const { getStudentById, createStudent, updateStudent, deleteStudent, loading } = useStudents();
  const { fetchData, insertData, updateData } = useSupabase();
  const { stopChargesForStudent } = useTuitionLifecycle();
  const { permissions } = useAuth();

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
    if (data?.family_id) {
      const families = await fetchData<Family>('families', { id: data.family_id });
      if (families.length > 0) setFamily(families[0]);
      const allStudents = await fetchData<Student>('students', { family_id: data.family_id });
      setSiblings(allStudents.filter((s) => s.id !== data.id));
    } else {
      setFamily(null);
      setSiblings([]);
    }
  }

  async function handleSubmit(formPayload: { student: any; family: any }) {
    try {
      const { student: studentFormData, family: familyFormData } = formPayload;
      let familyId = studentFormData.family_id;

      // If we have a linked family, update it
      if (familyId) {
        await updateData<Family>('families', familyId, {
          father_name: familyFormData.father_name,
          father_id_number: familyFormData.father_id_number,
          father_phone: familyFormData.father_phone,
          father_occupation: familyFormData.father_occupation,
          mother_name: familyFormData.mother_name,
          mother_id_number: familyFormData.mother_id_number,
          mother_phone: familyFormData.mother_phone,
          mother_occupation: familyFormData.mother_occupation,
          address: familyFormData.address,
          city: familyFormData.city,
          home_phone: familyFormData.home_phone,
          bank_name: familyFormData.bank_name,
          bank_branch: familyFormData.bank_branch,
          bank_account: familyFormData.bank_account,
          billing_notes: familyFormData.billing_notes,
        } as Partial<Family>);
      } else {
        // No family linked - first check if family with same father_id_number exists
        const hasParentData = familyFormData.father_name || familyFormData.mother_name || familyFormData.father_id_number;
        if (hasParentData) {
          let existingFamily = null;

          // Search for existing family by father_id_number
          if (familyFormData.father_id_number) {
            const existing = await fetchData<Family>('families', { father_id_number: familyFormData.father_id_number });
            if (existing.length > 0) {
              existingFamily = existing[0];
            }
          }

          if (existingFamily) {
            // Link to existing family and update its details
            familyId = existingFamily.id;
            await updateData<Family>('families', familyId, {
              father_name: familyFormData.father_name || existingFamily.father_name,
              father_id_number: familyFormData.father_id_number,
              father_phone: familyFormData.father_phone || existingFamily.father_phone,
              father_occupation: familyFormData.father_occupation || existingFamily.father_occupation,
              mother_name: familyFormData.mother_name || existingFamily.mother_name,
              mother_id_number: familyFormData.mother_id_number || existingFamily.mother_id_number,
              mother_phone: familyFormData.mother_phone || existingFamily.mother_phone,
              mother_occupation: familyFormData.mother_occupation || existingFamily.mother_occupation,
              address: familyFormData.address || existingFamily.address,
              city: familyFormData.city || existingFamily.city,
              home_phone: familyFormData.home_phone || existingFamily.home_phone,
              bank_name: familyFormData.bank_name || existingFamily.bank_name,
              bank_branch: familyFormData.bank_branch || existingFamily.bank_branch,
              bank_account: familyFormData.bank_account || existingFamily.bank_account,
              billing_notes: familyFormData.billing_notes || existingFamily.billing_notes,
            } as Partial<Family>);
          } else {
            // No existing family found - create a new one
            const newFamily = await insertData<any>('families', {
              family_name: studentFormData.last_name,
              father_name: familyFormData.father_name,
              father_id_number: familyFormData.father_id_number,
              father_phone: familyFormData.father_phone,
              father_occupation: familyFormData.father_occupation,
              mother_name: familyFormData.mother_name,
              mother_id_number: familyFormData.mother_id_number,
              mother_phone: familyFormData.mother_phone,
              mother_occupation: familyFormData.mother_occupation,
              address: familyFormData.address,
              city: familyFormData.city,
              home_phone: familyFormData.home_phone,
              bank_name: familyFormData.bank_name,
              bank_branch: familyFormData.bank_branch,
              bank_account: familyFormData.bank_account,
              billing_notes: familyFormData.billing_notes,
            });
            if (newFamily?.id) {
              familyId = newFamily.id;
            }
          }
        }
      }

      // Save student - convert empty strings to null for DB
      const finalStudentData: Record<string, any> = {
        first_name: studentFormData.first_name || null,
        last_name: studentFormData.last_name || null,
        id_number: studentFormData.id_number || null,
        date_of_birth: studentFormData.date_of_birth || null,
        shiur: studentFormData.shiur || null,
        equivalent_year: studentFormData.equivalent_year || null,
        phone: studentFormData.phone || null,
        email: studentFormData.email || null,
        status: studentFormData.status || 'active',
        notes: studentFormData.notes || null,
        machzor_id: studentFormData.machzor_id || null,
        family_id: familyId || null,
        photo_url: studentFormData.photo_url || null,
      };

      if (id === 'new') {
        const newStudent = await createStudent(finalStudentData as any);
        if (newStudent) {
          router.push(`/students/${newStudent.id}`);
        }
      } else {
        // Detect status change to non-active → stop tuition charges
        const prevStatus = student?.status;
        const newStatus = finalStudentData.status as string | undefined;
        const becameNonActive =
          prevStatus === 'active' &&
          newStatus !== 'active' &&
          newStatus !== undefined &&
          ['inactive', 'graduated', 'chizuk'].includes(newStatus);

        const updated = await updateStudent(id, finalStudentData);
        if (updated) {
          setStudent(updated);
          setIsEditing(false);

          // Auto-stop charges if student became non-active
          if (becameNonActive) {
            const stopRes = await stopChargesForStudent(id, newStatus as LeaveStatus);
            if (stopRes.cancelledCharges > 0 || stopRes.modifiedCharges > 0) {
              alert(
                `הגביה עודכנה בהתאם לשינוי הסטטוס:\n` +
                  `• בוטלו: ${stopRes.cancelledCharges} גביות\n` +
                  `• עודכנו: ${stopRes.modifiedCharges} גביות` +
                  (stopRes.errors.length > 0 ? `\n\nשגיאות: ${stopRes.errors.join('; ')}` : '')
              );
            }
          }

          loadStudent();
        }
      }
    } catch (error: any) {
      console.error('Failed to save student:', error);
      alert('שגיאה בשמירת התלמיד: ' + (error?.message || JSON.stringify(error)));
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
    { key: 'details', label: 'פרטי תלמיד' },
    { key: 'family', label: 'פרטי הורים' },
    { key: 'education', label: 'היסטוריה לימודית' },
    { key: 'donations', label: 'תרומות' },
    { key: 'dormitory', label: 'פנימיה' },
  ];

  const DetailRow = ({ label, value }: { label: string; value: string | undefined | null }) => (
    <div>
      <p className="text-gray-500 text-sm">{label}</p>
      <p className="font-semibold">{value || '-'}</p>
    </div>
  );

  return (
    <>
      <Header
        title={student ? `${student.first_name} ${student.last_name}` : 'תלמיד חדש'}
        subtitle={
          student
            ? `${student.shiur || ''}${machzor ? ` - ${machzor.name}` : ''}`
            : 'הוסף תלמיד חדש'
        }
      />

      <div className="p-4 md:p-8">
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
                      <DetailRow label="שם משפחה" value={student.last_name} />
                      <DetailRow label="שם פרטי" value={student.first_name} />
                      <DetailRow label="תז או דרכון" value={student.id_number} />
                      <DetailRow label="טלפון" value={student.phone} />
                      <DetailRow label="דוא״ל" value={student.email} />
                      <DetailRow label="שיעור" value={student.shiur} />
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
                      <DetailRow label="שנה מקבילה" value={student.equivalent_year} />
                    </div>
                  )}

                  {activeTab === 'family' && (
                    <div className="space-y-6">
                      {family ? (
                        <>
                          {/* פרטי אב */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-1">
                              פרטי האב
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <DetailRow label="שם האב" value={family.father_name} />
                              <DetailRow label="תז אב" value={family.father_id_number} />
                              <DetailRow label="טלפון אב" value={family.father_phone} />
                              <DetailRow label="עיסוק אב" value={family.father_occupation} />
                            </div>
                          </div>
                          {/* פרטי אם */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-1">
                              פרטי האם
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <DetailRow label="שם האם" value={family.mother_name} />
                              <DetailRow label="תז אם" value={family.mother_id_number} />
                              <DetailRow label="טלפון אם" value={family.mother_phone} />
                              <DetailRow label="עיסוק אם" value={family.mother_occupation} />
                            </div>
                          </div>
                          {/* כתובת */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-1">
                              כתובת ופרטי קשר
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <DetailRow label="כתובת" value={family.address} />
                              <DetailRow label="עיר" value={family.city} />
                              <DetailRow label="טלפון בבית" value={family.home_phone} />
                            </div>
                          </div>
                          {/* בנק */}
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-1">
                              פרטי בנק
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <DetailRow label="שם בנק" value={family.bank_name} />
                              <DetailRow label="סניף" value={family.bank_branch} />
                              <DetailRow label="מספר חשבון" value={family.bank_account} />
                            </div>
                          </div>
                          {/* הערות גביה */}
                          {family.billing_notes && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-1">
                                הערות לגביה
                              </h4>
                              <p className="text-sm text-gray-700">{family.billing_notes}</p>
                            </div>
                          )}
                          {/* אחים */}
                          {siblings.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-3 border-b border-gray-100 pb-1">
                                אחים בישיבה ({siblings.length})
                              </h4>
                              <div className="flex flex-wrap gap-2">
                                {siblings.map((sibling) => (
                                  <Link
                                    key={sibling.id}
                                    href={`/students/${sibling.id}`}
                                    className="inline-block text-sm bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors"
                                  >
                                    {sibling.first_name} {sibling.last_name} - {sibling.shiur}
                                  </Link>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-gray-500 text-center py-8">
                          לא משויך למשפחה. לחץ על עריכה כדי להוסיף פרטי הורים.
                        </p>
                      )}
                    </div>
                  )}

                  {activeTab === 'education' && (
                    <EducationHistory studentId={student.id} />
                  )}

                  {activeTab === 'donations' && (
                    <StudentDonationsTab studentId={student.id} />
                  )}

                  {activeTab === 'dormitory' && (
                    <p className="text-gray-500 text-center py-8">
                      התלמיד לא הוקצה לחדר עדיין
                    </p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="mt-6 flex gap-4 flex-wrap">
                  {permissions.canWrite && (
                    <Button onClick={() => setIsEditing(true)}>עריכה</Button>
                  )}
                  <Link href="/students">
                    <Button variant="secondary">חזור</Button>
                  </Link>
                  {permissions.canDelete && student && (
                    <ConfirmDelete
                      trigger={(open) => (
                        <Button variant="danger" onClick={open}>
                          מחק תלמיד
                        </Button>
                      )}
                      itemDescription={`התלמיד ${student.first_name} ${student.last_name} (ת.ז. ${student.id_number || '-'})`}
                      consequences="פעולה זו תמחק גם את כל ההיסטוריה הלימודית, תקופות הכניסה/יציאה, והיסטוריית התשלומים של התלמיד."
                      onConfirm={async () => {
                        const ok = await deleteStudent(id);
                        if (ok) router.push('/students');
                        else alert('שגיאה במחיקה');
                      }}
                    />
                  )}
                </div>
              </>
            ) : (
              <>
                <StudentForm
                  student={student || undefined}
                  initialFamily={family}
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
