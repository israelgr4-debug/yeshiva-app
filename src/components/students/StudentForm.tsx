'use client';

import { Student, Machzor, Family } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/hooks/useSupabase';

interface StudentFormProps {
  student?: Student;
  onSubmit: (data: any) => Promise<void>;
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

export function StudentForm({ student, onSubmit, isLoading }: StudentFormProps) {
  const [machzorot, setMachzorot] = useState<Machzor[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const { fetchData } = useSupabase();

  const [formData, setFormData] = useState({
    first_name: student?.first_name || '',
    last_name: student?.last_name || '',
    id_number: student?.id_number || '',
    date_of_birth: student?.date_of_birth || '',
    shiur: student?.shiur || '',
    equivalent_year: student?.equivalent_year || '',
    phone: student?.phone || '',
    email: student?.email || '',
    address: student?.address || '',
    city: student?.city || '',
    postal_code: student?.postal_code || '',
    father_name: student?.father_name || '',
    mother_name: student?.mother_name || '',
    status: student?.status || 'active',
    notes: student?.notes || '',
    machzor_id: student?.machzor_id || '',
    family_id: student?.family_id || '',
  });

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      ...formData,
      machzor_id: formData.machzor_id || null,
      family_id: formData.family_id || null,
    };
    await onSubmit(submitData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* פרטים אישיים */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">פרטים אישיים</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="שם פרטי"
            name="first_name"
            value={formData.first_name}
            onChange={handleChange}
            required
          />
          <Input
            label="שם משפחה"
            name="last_name"
            value={formData.last_name}
            onChange={handleChange}
            required
          />
          <Input
            label="מספר תעודת זהות"
            name="id_number"
            value={formData.id_number}
            onChange={handleChange}
            required
          />
          <Input
            label="תאריך לידה"
            name="date_of_birth"
            type="date"
            value={formData.date_of_birth}
            onChange={handleChange}
          />
        </div>
      </div>

      {/* שיעור ומחזור */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">שיעור ומחזור</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            label="שיעור"
            name="shiur"
            options={shiurOptions}
            value={formData.shiur}
            onChange={handleChange}
          />
          <Select
            label="מחזור"
            name="machzor_id"
            options={machzorOptions}
            value={formData.machzor_id}
            onChange={handleChange}
          />
          <Input
            label="שנה מקבילה"
            name="equivalent_year"
            value={formData.equivalent_year}
            onChange={handleChange}
          />
        </div>
      </div>

      {/* פרטי קשר */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">פרטי קשר</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="טלפון"
            name="phone"
            type="tel"
            value={formData.phone}
            onChange={handleChange}
          />
          <Input
            label="דוא״ל"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
          />
        </div>
      </div>

      {/* כתובת */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">כתובת</h3>
        <div className="space-y-4">
          <Input
            label="רחוב"
            name="address"
            value={formData.address}
            onChange={handleChange}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="עיר"
              name="city"
              value={formData.city}
              onChange={handleChange}
            />
            <Input
              label="קוד דואר"
              name="postal_code"
              value={formData.postal_code}
              onChange={handleChange}
            />
          </div>
        </div>
      </div>

      {/* משפחה */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">נתוני משפחה</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="שם האב"
            name="father_name"
            value={formData.father_name}
            onChange={handleChange}
          />
          <Input
            label="שם האם"
            name="mother_name"
            value={formData.mother_name}
            onChange={handleChange}
          />
        </div>
        <div className="mt-4">
          <Select
            label="שיוך למשפחה (לגביה מאוחדת של אחים)"
            name="family_id"
            options={familyOptions}
            value={formData.family_id}
            onChange={handleChange}
          />
          <p className="text-xs text-gray-500 mt-1">אם יש אחים בישיבה, שייך אותם לאותה משפחה לצורך גביה מאוחדת</p>
        </div>
      </div>

      {/* סטטוס והערות */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">סטטוס</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="סטטוס"
            name="status"
            options={statusOptions}
            value={formData.status}
            onChange={handleChange}
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
            value={formData.notes}
            onChange={handleChange}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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
