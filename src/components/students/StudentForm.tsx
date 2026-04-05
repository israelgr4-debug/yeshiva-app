'use client';

import { Student, Machzor, Family } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { supabase } from '@/lib/supabase';

interface StudentFormProps {
  student?: Student;
  initialFamily?: Family | null;
  onSubmit: (data: { student: any; family: any }) => Promise<void>;
  isLoading?: boolean;
}

const statusOptions = [
  { value: 'active', label: 'פעיל' },
  { value: 'inactive', label: 'לא פעיל' },
  { value: 'graduated', label: 'סיים' },
];

const shiurOptions = [
  { value: 'שיעור א׳', label: 'שיעור א׳' },
  { value: 'שיעור ב׳', label: 'שיעור ב׳' },
  { value: 'שיעור ג׳', label: 'שיעור ג׳' },
  { value: 'שיעור ד׳', label: 'שיעור ד׳' },
  { value: 'משכילים א׳', label: 'משכילים א׳' },
  { value: 'משכילים ב׳', label: 'משכילים ב׳' },
];

export function StudentForm({ student, initialFamily, onSubmit, isLoading }: StudentFormProps) {
  const [machzorot, setMachzorot] = useState<Machzor[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const { fetchData } = useSupabase();

  // Student fields
  const [studentData, setStudentData] = useState({
    first_name: student?.first_name || '',
    last_name: student?.last_name || '',
    id_number: student?.id_number || '',
    date_of_birth: student?.date_of_birth || '',
    shiur: student?.shiur || '',
    equivalent_year: student?.equivalent_year || '',
    phone: student?.phone || '',
    email: student?.email || '',
    status: student?.status || 'active',
    notes: student?.notes || '',
    machzor_id: student?.machzor_id || '',
    family_id: student?.family_id || '',
  });

  // Family / parent fields
  const [familyData, setFamilyData] = useState({
    father_name: initialFamily?.father_name || '',
    father_id_number: initialFamily?.father_id_number || '',
    father_phone: initialFamily?.father_phone || '',
    father_occupation: initialFamily?.father_occupation || '',
    mother_name: initialFamily?.mother_name || '',
    mother_id_number: initialFamily?.mother_id_number || '',
    mother_phone: initialFamily?.mother_phone || '',
    mother_occupation: initialFamily?.mother_occupation || '',
    address: initialFamily?.address || '',
    city: initialFamily?.city || '',
    home_phone: initialFamily?.home_phone || '',
    bank_name: initialFamily?.bank_name || '',
    bank_branch: initialFamily?.bank_branch || '',
    bank_account: initialFamily?.bank_account || '',
    billing_notes: initialFamily?.billing_notes || '',
  });

  // Family matching state
  const [matchedFamily, setMatchedFamily] = useState<Family | null>(null);
  const [matchedSiblingCount, setMatchedSiblingCount] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [linkedFamilyId, setLinkedFamilyId] = useState<string>(student?.family_id || '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function loadOptions() {
      const machzorotData = await fetchData<Machzor>('machzorot');
      const familiesData = await fetchData<Family>('families');
      setMachzorot(machzorotData);
      setFamilies(familiesData);
    }
    loadOptions();
  }, [fetchData]);

  const machzorOptions = machzorot.map((m) => ({
    value: m.id,
    label: m.name,
  }));

  const familyOptions = families.map((f) => ({
    value: f.id,
    label: `${f.family_name} - ${f.father_name || ''}`,
  }));

  // Search for existing family by father_id_number
  const searchFamilyByFatherId = useCallback(async (fatherIdNumber: string) => {
    if (!fatherIdNumber || fatherIdNumber.length < 5) {
      setMatchedFamily(null);
      setMatchedSiblingCount(0);
      return;
    }
    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from('families')
        .select('*')
        .eq('father_id_number', fatherIdNumber);

      if (error) throw error;

      if (data && data.length > 0) {
        const found = data[0] as Family;
        // Don't suggest if it's the same family already linked
        if (found.id === linkedFamilyId) {
          setMatchedFamily(null);
          setMatchedSiblingCount(0);
        } else {
          setMatchedFamily(found);
          // Count siblings
          const { data: siblings } = await supabase
            .from('students')
            .select('id')
            .eq('family_id', found.id);
          setMatchedSiblingCount(siblings?.length || 0);
        }
      } else {
        setMatchedFamily(null);
        setMatchedSiblingCount(0);
      }
    } catch {
      setMatchedFamily(null);
      setMatchedSiblingCount(0);
    } finally {
      setIsSearching(false);
    }
  }, [linkedFamilyId]);

  const handleStudentChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setStudentData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFamilyChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFamilyData((prev) => ({ ...prev, [name]: value }));

    // Debounce search on father_id_number
    if (name === 'father_id_number') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        searchFamilyByFatherId(value);
      }, 500);
    }
  };

  // Link to matched family
  const handleLinkFamily = () => {
    if (!matchedFamily) return;
    setLinkedFamilyId(matchedFamily.id);
    setStudentData((prev) => ({ ...prev, family_id: matchedFamily.id }));
    // Fill parent fields from matched family
    setFamilyData({
      father_name: matchedFamily.father_name || '',
      father_id_number: matchedFamily.father_id_number || '',
      father_phone: matchedFamily.father_phone || '',
      father_occupation: matchedFamily.father_occupation || '',
      mother_name: matchedFamily.mother_name || '',
      mother_id_number: matchedFamily.mother_id_number || '',
      mother_phone: matchedFamily.mother_phone || '',
      mother_occupation: matchedFamily.mother_occupation || '',
      address: matchedFamily.address || '',
      city: matchedFamily.city || '',
      home_phone: matchedFamily.home_phone || '',
      bank_name: matchedFamily.bank_name || '',
      bank_branch: matchedFamily.bank_branch || '',
      bank_account: matchedFamily.bank_account || '',
      billing_notes: matchedFamily.billing_notes || '',
    });
    setMatchedFamily(null);
    setMatchedSiblingCount(0);
  };

  // Unlink family
  const handleUnlinkFamily = () => {
    setLinkedFamilyId('');
    setStudentData((prev) => ({ ...prev, family_id: '' }));
  };

  // Manual family dropdown change
  const handleManualFamilyLink = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const familyId = e.target.value;
    if (familyId) {
      const selected = families.find((f) => f.id === familyId);
      if (selected) {
        setLinkedFamilyId(selected.id);
        setStudentData((prev) => ({ ...prev, family_id: selected.id }));
        setFamilyData({
          father_name: selected.father_name || '',
          father_id_number: selected.father_id_number || '',
          father_phone: selected.father_phone || '',
          father_occupation: selected.father_occupation || '',
          mother_name: selected.mother_name || '',
          mother_id_number: selected.mother_id_number || '',
          mother_phone: selected.mother_phone || '',
          mother_occupation: selected.mother_occupation || '',
          address: selected.address || '',
          city: selected.city || '',
          home_phone: selected.home_phone || '',
          bank_name: selected.bank_name || '',
          bank_branch: selected.bank_branch || '',
          bank_account: selected.bank_account || '',
          billing_notes: selected.billing_notes || '',
        });
      }
    } else {
      handleUnlinkFamily();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitStudentData = {
      ...studentData,
      machzor_id: studentData.machzor_id || null,
      family_id: linkedFamilyId || null,
    };
    await onSubmit({ student: submitStudentData, family: familyData });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" dir="rtl">
      {/* === סקציה 1: פרטי התלמיד === */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 border-b border-gray-100 pb-2">
          פרטי התלמיד
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="שם משפחה"
            name="last_name"
            value={studentData.last_name}
            onChange={handleStudentChange}
            required
          />
          <Input
            label="שם פרטי"
            name="first_name"
            value={studentData.first_name}
            onChange={handleStudentChange}
            required
          />
          <Input
            label="תז או דרכון"
            name="id_number"
            value={studentData.id_number}
            onChange={handleStudentChange}
            required
          />
          <Input
            label="טלפון"
            name="phone"
            type="tel"
            value={studentData.phone}
            onChange={handleStudentChange}
          />
          <Input
            label="דוא״ל"
            name="email"
            type="email"
            value={studentData.email}
            onChange={handleStudentChange}
          />
          <Input
            label="תאריך לידה"
            name="date_of_birth"
            type="date"
            value={studentData.date_of_birth}
            onChange={handleStudentChange}
          />
        </div>

        {/* שיעור ומחזור */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
          <Select
            label="שיעור"
            name="shiur"
            options={shiurOptions}
            value={studentData.shiur}
            onChange={handleStudentChange}
          />
          <Select
            label="מחזור"
            name="machzor_id"
            options={machzorOptions}
            value={studentData.machzor_id}
            onChange={handleStudentChange}
          />
          <Input
            label="שנה מקבילה"
            name="equivalent_year"
            value={studentData.equivalent_year}
            onChange={handleStudentChange}
          />
        </div>

        {/* סטטוס */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
          <Select
            label="סטטוס"
            name="status"
            options={statusOptions}
            value={studentData.status}
            onChange={handleStudentChange}
          />
          <Input
            label="תאריך קבלה"
            name="admission_date"
            type="date"
            value={student?.admission_date || ''}
            disabled
          />
        </div>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">הערות</label>
          <textarea
            name="notes"
            value={studentData.notes}
            onChange={handleStudentChange}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* === סקציה 2: פרטי הורים === */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
          <h3 className="text-lg font-semibold text-gray-900">פרטי הורים</h3>
          {linkedFamilyId && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-green-700 bg-green-50 px-3 py-1 rounded-full">
                משויך למשפחה
              </span>
              <button
                type="button"
                onClick={handleUnlinkFamily}
                className="text-xs text-red-600 hover:text-red-800 underline"
              >
                בטל שיוך
              </button>
            </div>
          )}
        </div>

        {/* Family match banner */}
        {matchedFamily && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-center justify-between">
            <div>
              <p className="text-blue-800 font-medium">
                נמצאה משפחה קיימת: משפחת {matchedFamily.family_name}
                {matchedSiblingCount > 0 && (
                  <span className="text-blue-600"> - {matchedSiblingCount} אחים בישיבה</span>
                )}
              </p>
            </div>
            <Button type="button" onClick={handleLinkFamily} className="whitespace-nowrap">
              שייך למשפחה
            </Button>
          </div>
        )}

        {isSearching && (
          <div className="text-sm text-gray-500 mb-3">מחפש משפחה...</div>
        )}

        {/* פרטי אב */}
        <h4 className="text-sm font-semibold text-gray-600 mb-3 mt-2">פרטי האב</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="שם האב"
            name="father_name"
            value={familyData.father_name}
            onChange={handleFamilyChange}
          />
          <Input
            label="תז אב"
            name="father_id_number"
            value={familyData.father_id_number}
            onChange={handleFamilyChange}
            placeholder="הקלד תז אב לחיפוש אחים"
          />
          <Input
            label="טלפון אב"
            name="father_phone"
            type="tel"
            value={familyData.father_phone}
            onChange={handleFamilyChange}
          />
          <Input
            label="עיסוק אב"
            name="father_occupation"
            value={familyData.father_occupation}
            onChange={handleFamilyChange}
          />
        </div>

        {/* פרטי אם */}
        <h4 className="text-sm font-semibold text-gray-600 mb-3 mt-6">פרטי האם</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="שם האם"
            name="mother_name"
            value={familyData.mother_name}
            onChange={handleFamilyChange}
          />
          <Input
            label="תז אם"
            name="mother_id_number"
            value={familyData.mother_id_number}
            onChange={handleFamilyChange}
          />
          <Input
            label="טלפון אם"
            name="mother_phone"
            type="tel"
            value={familyData.mother_phone}
            onChange={handleFamilyChange}
          />
          <Input
            label="עיסוק אם"
            name="mother_occupation"
            value={familyData.mother_occupation}
            onChange={handleFamilyChange}
          />
        </div>

        {/* כתובת */}
        <h4 className="text-sm font-semibold text-gray-600 mb-3 mt-6">כתובת ופרטי קשר</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="כתובת"
            name="address"
            value={familyData.address}
            onChange={handleFamilyChange}
          />
          <Input
            label="עיר"
            name="city"
            value={familyData.city}
            onChange={handleFamilyChange}
          />
          <Input
            label="טלפון בבית"
            name="home_phone"
            type="tel"
            value={familyData.home_phone}
            onChange={handleFamilyChange}
          />
        </div>

        {/* בנק */}
        <h4 className="text-sm font-semibold text-gray-600 mb-3 mt-6">פרטי בנק</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Input
            label="שם בנק"
            name="bank_name"
            value={familyData.bank_name}
            onChange={handleFamilyChange}
          />
          <Input
            label="סניף"
            name="bank_branch"
            value={familyData.bank_branch}
            onChange={handleFamilyChange}
          />
          <Input
            label="מספר חשבון"
            name="bank_account"
            value={familyData.bank_account}
            onChange={handleFamilyChange}
          />
        </div>

        {/* הערות גביה */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">הערות לגביה</label>
          <textarea
            name="billing_notes"
            value={familyData.billing_notes}
            onChange={handleFamilyChange}
            rows={2}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* שיוך ידני למשפחה */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <Select
            label="שיוך ידני למשפחה"
            name="manual_family_id"
            options={familyOptions}
            value={linkedFamilyId}
            onChange={handleManualFamilyLink}
          />
          <p className="text-xs text-gray-500 mt-1">
            אם יש אחים בישיבה, ניתן לשייך ידנית לאותה משפחה
          </p>
        </div>
      </div>

      <div className="flex gap-4">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'שומר...' : student ? 'עדכן' : 'צור תלמיד'}
        </Button>
      </div>
    </form>
  );
}
