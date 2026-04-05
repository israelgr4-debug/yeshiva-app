'use client';

import { Student } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useState } from 'react';

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
  { value: 'בחורים א', label: 'בחורים א' },
  { value: 'בחורים ב', label: 'בחורים ב' },
  { value: 'בחורים ג', label: 'בחורים ג' },
  { value: 'משכילים א', label: 'משכילים א' },
  { value: 'משכילים ב', label: 'משכילים ב' },
];

export function StudentForm({ student, onSubmit, isLoading }: StudentFormProps) {
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
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
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
      </div>

      <div className="grid grid-cols-2 gap-4">
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

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="שיעור"
          name="shiur"
          options={shiurOptions}
          value={formData.shiur}
          onChange={handleChange}
        />
        <Input
          label="שנה מקבילה"
          name="equivalent_year"
          value={formData.equivalent_year}
          onChange={handleChange}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
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

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">כתובת</h3>
        <Input
          label="רחוב"
          name="address"
          value={formData.address}
          onChange={handleChange}
        />
        <div className="grid grid-cols-2 gap-4">
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

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">נתוני הורים</h3>
        <div className="grid grid-cols-2 gap-4">
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
      </div>

      <div className="grid grid-cols-2 gap-4">
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

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">הערות</label>
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          rows={4}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex gap-4">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'שומר...' : student ? 'עדכן' : 'צור'}
        </Button>
      </div>
    </form>
  );
}
