'use client';

import { EducationHistory as EducationHistoryType } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { supabase } from '@/lib/supabase';

interface EducationHistoryProps {
  studentId: string;
}

interface StudentPeriod {
  id: string;
  student_id: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  notes: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  active: 'פעיל בישיבה',
  chizuk: 'חיזוק',
  inactive: 'לא פעיל / עזב',
  graduated: 'סיים',
};
const STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  chizuk: 'bg-amber-50 text-amber-900 ring-amber-200',
  inactive: 'bg-slate-100 text-slate-700 ring-slate-200',
  graduated: 'bg-violet-50 text-violet-800 ring-violet-200',
};
const STATUS_DOT: Record<string, string> = {
  active: 'bg-emerald-500',
  chizuk: 'bg-amber-500',
  inactive: 'bg-slate-400',
  graduated: 'bg-violet-500',
};

function formatHebDate(d: string | null): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

function durationLabel(start: string | null, end: string | null): string {
  if (!start) return '';
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  const months = Math.max(0, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));
  if (months < 1) return '';
  if (months < 12) return `${months} חודשים`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years} שנים ${rem} חודשים` : `${years} שנים`;
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
  const [periods, setPeriods] = useState<StudentPeriod[]>([]);
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
    const { data: periodsData } = await supabase
      .from('student_periods')
      .select('*')
      .eq('student_id', studentId)
      .order('start_date', { ascending: true });
    setPeriods((periodsData as StudentPeriod[]) || []);
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
    <div className="space-y-6">
      {/* ציר זמן בישיבה */}
      <section>
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full" />
          ציר זמן בישיבה
        </h3>
        {periods.length === 0 ? (
          <p className="text-sm text-slate-500 bg-slate-50 rounded-xl p-4 border border-slate-200">
            אין רשומות תקופה. תקופות נוצרות אוטומטית כשמשנים סטטוס תלמיד עם תאריכי כניסה/יציאה.
          </p>
        ) : (
          <ol className="relative ms-3 border-s-2 border-slate-200 space-y-4">
            {periods.map((p) => {
              const status = (p.status || 'active') as string;
              const isOpen = !p.end_date;
              return (
                <li key={p.id} className="relative ps-5">
                  <span
                    className={`absolute -start-[7px] top-2 w-3 h-3 rounded-full ring-4 ring-white ${STATUS_DOT[status] || 'bg-slate-400'}`}
                    aria-hidden
                  />
                  <div className="bg-white border border-slate-200 rounded-xl p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ${STATUS_TONE[status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}
                      >
                        {STATUS_LABEL[status] || status}
                      </span>
                      {isOpen && (
                        <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
                          פעיל כעת
                        </span>
                      )}
                      <span className="text-[11px] text-slate-500 ms-auto">
                        {durationLabel(p.start_date, p.end_date)}
                      </span>
                    </div>
                    <div className="text-sm text-slate-800 flex flex-wrap gap-2">
                      <span>
                        <span className="text-slate-500 text-xs">כניסה:</span>{' '}
                        <span className="font-semibold tabular-nums">{formatHebDate(p.start_date)}</span>
                      </span>
                      <span className="text-slate-300">·</span>
                      <span>
                        <span className="text-slate-500 text-xs">יציאה:</span>{' '}
                        <span className="font-semibold tabular-nums">
                          {p.end_date ? formatHebDate(p.end_date) : <span className="text-emerald-600">— ממשיך</span>}
                        </span>
                      </span>
                    </div>
                    {p.notes && <p className="text-xs text-slate-500 mt-1.5">{p.notes}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
        <span className="w-1 h-4 bg-gradient-to-b from-amber-500 to-orange-600 rounded-full" />
        מוסדות לימוד קודמים
      </h3>

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
