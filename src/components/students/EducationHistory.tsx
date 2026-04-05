'use client';

import { EducationHistory as EducationHistoryType } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/hooks/useSupabase';

interface EducationHistoryProps {
  studentId: string;
}

const institutionTypeOptions = [
  { value: 'elementary', label: 'יסודי (חדר / ת״ת)' },
  { value: 'yeshiva_ketana', label: 'ישיבה קטנה' },
  { value: 'other', label: 'אחר' },
];

const institutionTypeLabels: Record<string, string> = {
  elementary: 'יסודי',
  yeshiva_ketana: 'ישיבה קטנה',
  other: 'אחר',
};

export function EducationHistory({ studentId }: EducationHistoryProps) {
  const [history, setHistory] = useState<EducationHistoryType[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const { fetchData, insertData, deleteData } = useSupabase();

  const [formData, setFormData] = useState({
    institution_name: '',
    institution_type: 'elementary',
    city: '',
    start_year: '',
    end_year: '',
    class_completed: '',
    notes: '',
  });

  useEffect(() => {
    loadHistory();
  }, [studentId]);

  async function loadHistory() {
    setLoading(true);
    const data = await fetchData<EducationHistoryType>('education_history', { student_id: studentId });
    setHistory(data);
    setLoading(false);
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      student_id: studentId,
      institution_name: formData.institution_name,
      institution_type: formData.institution_type,
      city: formData.city,
      start_year: formData.start_year ? parseInt(formData.start_year) : null,
      end_year: formData.end_year ? parseInt(formData.end_year) : null,
      class_completed: formData.class_completed,
      notes: formData.notes,
    };
    await insertData('education_history', submitData);
    setFormData({
      institution_name: '',
      institution_type: 'elementary',
      city: '',
      start_year: '',
      end_year: '',
      class_completed: '',
      notes: '',
    });
    setShowForm(false);
    loadHistory();
  };

  const handleDelete = async (id: string) => {
    if (confirm('האם למחוק את הרשומה?')) {
      await deleteData('education_history', id);
      loadHistory();
    }
  };

  if (loading) {
    return <p className="text-gray-500 text-center py-4">טוען היסטוריה...</p>;
  }

  return (
    <div className="space-y-4">
      {/* רשימת היסטוריה */}
      {history.length === 0 && !showForm ? (
        <p className="text-gray-500 text-center py-6">אין היסטוריה לימודית רשומה</p>
      ) : (
        <div className="space-y-3">
          {history.map((item) => (
            <div
              key={item.id}
              className="bg-gray-50 rounded-lg p-4 border border-gray-200 flex justify-between items-start"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                    {institutionTypeLabels[item.institution_type] || item.institution_type}
                  </span>
                  {item.start_year && item.end_year && (
                    <span className="text-xs text-gray-500">
                      {item.start_year} - {item.end_year}
                    </span>
                  )}
                </div>
                <p className="font-semibold text-gray-900">{item.institution_name}</p>
                {item.city && <p className="text-sm text-gray-600">{item.city}</p>}
                {item.class_completed && (
                  <p className="text-sm text-gray-600">סיים כיתה: {item.class_completed}</p>
                )}
                {item.notes && <p className="text-xs text-gray-500 mt-1">{item.notes}</p>}
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(item.id)}
              >
                מחק
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* טופס הוספה */}
      {showForm ? (
        <form onSubmit={handleSubmit} className="bg-blue-50 rounded-lg p-4 border border-blue-200 space-y-3">
          <h4 className="font-semibold text-gray-900">הוספת מוסד לימודי</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="שם המוסד"
              name="institution_name"
              value={formData.institution_name}
              onChange={handleChange}
              required
            />
            <Select
              label="סוג מוסד"
              name="institution_type"
              options={institutionTypeOptions}
              value={formData.institution_type}
              onChange={handleChange}
            />
            <Input
              label="עיר"
              name="city"
              value={formData.city}
              onChange={handleChange}
            />
            <Input
              label="כיתה אחרונה"
              name="class_completed"
              value={formData.class_completed}
              onChange={handleChange}
            />
            <Input
              label="שנת התחלה"
              name="start_year"
              type="number"
              value={formData.start_year}
              onChange={handleChange}
            />
            <Input
              label="שנת סיום"
              name="end_year"
              type="number"
              value={formData.end_year}
              onChange={handleChange}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">שמור</Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(false)}>
              ביטול
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" onClick={() => setShowForm(true)}>
          + הוסף מוסד לימודי
        </Button>
      )}
    </div>
  );
}
