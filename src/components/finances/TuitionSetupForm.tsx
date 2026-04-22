'use client';

import { useState, useEffect } from 'react';
import { Family, Student } from '@/lib/types';
import { useSupabase } from '@/hooks/useSupabase';
import { useTuitionPayments } from '@/hooks/useTuitionPayments';
import { Button } from '@/components/ui/Button';

interface TuitionSetupFormProps {
  onSuccess?: () => void;
}

export function TuitionSetupForm({ onSuccess }: TuitionSetupFormProps) {
  const { fetchData } = useSupabase();
  const { createTuitionCharge } = useTuitionPayments();

  const [families, setFamilies] = useState<Family[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState('');
  const [familyStudents, setFamilyStudents] = useState<Student[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentAmounts, setStudentAmounts] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<'standing_order' | 'check' | 'credit' | 'office' | 'exempt'>('standing_order');
  const [scheduledDay, setScheduledDay] = useState<number>(20);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // Load families
  useEffect(() => {
    async function loadFamilies() {
      const data = await fetchData<Family>('families');
      setFamilies(data);
    }
    loadFamilies();
  }, [fetchData]);

  // Load students when family changes
  useEffect(() => {
    async function loadStudents() {
      if (!selectedFamilyId) {
        setFamilyStudents([]);
        return;
      }
      const data = await fetchData<Student>('students', { family_id: selectedFamilyId });
      setFamilyStudents(data);
      setSelectedStudentIds([]);
      setStudentAmounts({});
    }
    loadStudents();
  }, [selectedFamilyId, fetchData]);

  const handleStudentToggle = (studentId: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
    // Initialize amount for new student
    if (!selectedStudentIds.includes(studentId)) {
      setStudentAmounts((prev) => ({ ...prev, [studentId]: 0 }));
    }
  };

  const handleAmountChange = (studentId: string, amount: number) => {
    setStudentAmounts((prev) => ({ ...prev, [studentId]: amount }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFamilyId) {
      alert('בחר משפחה');
      return;
    }

    if (selectedStudentIds.length === 0) {
      alert('בחר לפחות תלמיד אחד');
      return;
    }

    const selectedStudents = familyStudents.filter((s) => selectedStudentIds.includes(s.id));
    const hasZeroAmount = selectedStudents.some((s) => !studentAmounts[s.id] || studentAmounts[s.id] === 0);

    if (hasZeroAmount) {
      alert('הזן סכום חיובי לכל תלמיד');
      return;
    }

    if (paymentMethod === 'standing_order' && (!scheduledDay || scheduledDay < 1 || scheduledDay > 31)) {
      alert('בחר יום חוקי (1-31)');
      return;
    }

    setLoading(true);

    try {
      // We need to reconstruct the call to match the hook signature
      // The hook expects individual parameters, but we've restructured it
      // Let's call it directly with the right structure

      const result = await createTuitionCharge(
        selectedFamilyId,
        selectedStudents,
        paymentMethod,
        paymentMethod === 'standing_order' ? scheduledDay : undefined,
        notes,
        studentAmounts
      );

      if (result) {
        alert('שכר לימוד נוסף בהצלחה!');
        // Reset form
        setSelectedFamilyId('');
        setFamilyStudents([]);
        setSelectedStudentIds([]);
        setStudentAmounts({});
        setPaymentMethod('standing_order');
        setScheduledDay(15);
        setNotes('');

        onSuccess?.();
      } else {
        alert('שגיאה בהוספת שכר לימוד');
      }
    } catch (error) {
      console.error('Error creating tuition charge:', error);
      alert('שגיאה: ' + (error instanceof Error ? error.message : 'בעיה כללית'));
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = selectedStudentIds.reduce((sum, id) => sum + (studentAmounts[id] || 0), 0);

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">הוסף שכר לימוד</h3>

      {/* Family selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">משפחה</label>
        <select
          value={selectedFamilyId}
          onChange={(e) => setSelectedFamilyId(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">בחר משפחה</option>
          {families.map((f) => (
            <option key={f.id} value={f.id}>
              {f.family_name} - {f.father_name}
            </option>
          ))}
        </select>
      </div>

      {/* Students list */}
      {familyStudents.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">תלמידים וסכומים</label>
          <div className="space-y-3">
            {familyStudents.map((student) => (
              <div
                key={student.id}
                className="flex items-center gap-4 p-3 border border-gray-100 rounded-lg"
              >
                <input
                  type="checkbox"
                  id={`student-${student.id}`}
                  checked={selectedStudentIds.includes(student.id)}
                  onChange={() => handleStudentToggle(student.id)}
                  className="w-4 h-4"
                />
                <label htmlFor={`student-${student.id}`} className="flex-1 cursor-pointer">
                  <span className="font-medium">
                    {student.first_name} {student.last_name}
                  </span>
                  <span className="text-gray-500 text-sm ms-2">({student.shiur})</span>
                </label>
                {selectedStudentIds.includes(student.id) && (
                  <input
                    type="number"
                    placeholder="סכום"
                    value={studentAmounts[student.id] || ''}
                    onChange={(e) => handleAmountChange(student.id, parseFloat(e.target.value) || 0)}
                    className="w-32 px-3 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    step="10"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment method */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">שיטת תשלום</label>
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as any)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="standing_order">הוראת קבע</option>
          <option value="check">צ"ק</option>
          <option value="credit">אשראי (נדרים פלוס)</option>
          <option value="office">במשרד</option>
          <option value="exempt">פטור</option>
        </select>
      </div>

      {/* Scheduled day (only for standing order) */}
      {paymentMethod === 'standing_order' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">יום בחודש לתשלום</label>
          <input
            type="number"
            min="1"
            max="31"
            value={scheduledDay}
            onChange={(e) => setScheduledDay(parseInt(e.target.value))}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">הערות</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="הערות אופציונליות"
        />
      </div>

      {/* Summary */}
      {totalAmount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            סה"כ סכום חודשי: <span className="font-bold text-lg">₪{totalAmount.toLocaleString('he-IL')}</span>
          </p>
          <p className="text-xs text-blue-600 mt-1">
            {selectedStudentIds.length} תלמידים
          </p>
        </div>
      )}

      {/* Submit button */}
      <Button type="submit" disabled={loading} size="lg" className="w-full">
        {loading ? 'משמר...' : 'הוסף שכר לימוד'}
      </Button>
    </form>
  );
}
