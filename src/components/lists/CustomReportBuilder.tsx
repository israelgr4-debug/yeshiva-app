'use client';

import { useState, useMemo } from 'react';
import { Student, Family, Machzor, EducationHistory } from '@/lib/types';
import { sortStudentsByName, getShiurFilterOptions } from '@/lib/list-reports';
import { toHebrewDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

interface Props {
  students: Student[];
  families: Record<string, Family>;
  machzorot: Record<string, Machzor>;
  education: Record<string, EducationHistory[]>;
}

interface FieldDef {
  key: string;
  label: string;
  group: string;
  get: (s: Student, f: Family | undefined, m: Machzor | undefined, edu: EducationHistory[]) => string;
}

const ALL_FIELDS: FieldDef[] = [
  // ===== תלמיד =====
  { key: 'last_name', label: 'שם משפחה', group: 'תלמיד', get: (s) => s.last_name || '' },
  { key: 'first_name', label: 'שם פרטי', group: 'תלמיד', get: (s) => s.first_name || '' },
  { key: 'id_number', label: 'תעודת זהות', group: 'תלמיד', get: (s) => s.id_number || '' },
  { key: 'passport', label: 'דרכון', group: 'תלמיד', get: (s: any) => s.passport_number || '' },
  { key: 'dob', label: 'תאריך לידה', group: 'תלמיד', get: (s) => s.date_of_birth || '' },
  { key: 'dob_he', label: 'תאריך לידה עברי', group: 'תלמיד', get: (s) => toHebrewDate(s.date_of_birth) },
  { key: 'phone', label: 'טלפון תלמיד', group: 'תלמיד', get: (s) => s.phone || '' },
  { key: 'email', label: 'דוא"ל תלמיד', group: 'תלמיד', get: (s) => s.email || '' },
  { key: 'shiur', label: 'שיעור', group: 'תלמיד', get: (s) => s.shiur || '' },
  { key: 'equivalent', label: 'מקבילה', group: 'תלמיד', get: (s: any) => s.equivalent_number || s.equivalent_year || '' },
  { key: 'machzor', label: 'מחזור', group: 'תלמיד', get: (_, __, m) => m?.name || '' },
  { key: 'status', label: 'סטטוס', group: 'תלמיד', get: (s) => ({ active: 'פעיל', chizuk: 'חיזוק', inactive: 'לא פעיל', graduated: 'סיים' } as Record<string,string>)[s.status] || s.status },
  { key: 'institution', label: 'מוסד', group: 'תלמיד', get: (s) => s.institution_name || '' },
  { key: 'is_chinuch', label: 'חינוך', group: 'תלמיד', get: (s: any) => s.is_chinuch ? 'כן' : 'לא' },
  { key: 'room', label: 'חדר בפנימייה', group: 'תלמיד', get: (s) => (s.room_number ? String(s.room_number) : '') },
  { key: 'entry_shiur', label: 'נכנס לישיבה בשיעור', group: 'תלמיד', get: (s: any) => s.entry_shiur || '' },
  { key: 'health_fund', label: 'קופת חולים', group: 'תלמיד', get: (s: any) => s.health_fund_name || '' },
  { key: 'admission_date', label: 'תאריך כניסה', group: 'תלמיד', get: (s) => s.admission_date || '' },
  { key: 'exit_date', label: 'תאריך יציאה', group: 'תלמיד', get: (s: any) => s.exit_date || '' },
  { key: 'notes', label: 'הערות תלמיד', group: 'תלמיד', get: (s) => s.notes || '' },

  // ===== הורים =====
  { key: 'family_name', label: 'שם המשפחה', group: 'משפחה', get: (_, f) => f?.family_name || '' },
  { key: 'yichus', label: 'ייחוס (כהן/לוי/ישראל)', group: 'משפחה', get: (_, f: any) => f?.yichus_name || '' },
  { key: 'father_name', label: 'שם האב', group: 'משפחה', get: (_, f) => f?.father_name || '' },
  { key: 'father_id', label: 'תעודת זהות אב', group: 'משפחה', get: (_, f) => f?.father_id_number || '' },
  { key: 'father_phone', label: 'טלפון אב', group: 'משפחה', get: (_, f) => f?.father_phone || '' },
  { key: 'father_occupation', label: 'עיסוק אב', group: 'משפחה', get: (_, f: any) => f?.father_occupation_name || f?.father_occupation || '' },
  { key: 'mother_name', label: 'שם האם', group: 'משפחה', get: (_, f) => f?.mother_name || '' },
  { key: 'mother_id', label: 'תעודת זהות אם', group: 'משפחה', get: (_, f) => f?.mother_id_number || '' },
  { key: 'mother_phone', label: 'טלפון אם', group: 'משפחה', get: (_, f) => f?.mother_phone || '' },
  { key: 'mother_occupation', label: 'עיסוק אם', group: 'משפחה', get: (_, f: any) => f?.mother_occupation_name || f?.mother_occupation || '' },
  { key: 'home_phone', label: 'טלפון בבית', group: 'משפחה', get: (_, f) => f?.home_phone || '' },
  { key: 'address', label: 'כתובת', group: 'משפחה', get: (_, f) => f?.address || '' },
  { key: 'street', label: 'רחוב', group: 'משפחה', get: (_, f: any) => f?.street || '' },
  { key: 'house_number', label: 'מס׳ בית', group: 'משפחה', get: (_, f: any) => f?.house_number || '' },
  { key: 'city', label: 'עיר', group: 'משפחה', get: (_, f: any) => f?.city_name || f?.city || '' },
  { key: 'postal_code', label: 'מיקוד', group: 'משפחה', get: (_, f) => f?.postal_code || '' },

  // ===== בנק =====
  { key: 'bank_number', label: 'מספר בנק', group: 'בנק', get: (_, f: any) => f?.bank_number ? String(f.bank_number) : '' },
  { key: 'bank_name', label: 'שם הבנק', group: 'בנק', get: (_, f) => f?.bank_name || '' },
  { key: 'bank_branch', label: 'סניף', group: 'בנק', get: (_, f) => f?.bank_branch || '' },
  { key: 'bank_account', label: 'מספר חשבון', group: 'בנק', get: (_, f) => f?.bank_account || '' },

  // ===== חינוך קודם =====
  {
    key: 'talmud_torah',
    label: 'תלמוד תורה',
    group: 'לימודים קודמים',
    get: (_, __, ___, edu) => edu.find((e) => e.institution_type === 'elementary')?.institution_name || '',
  },
  {
    key: 'yeshiva_ketana',
    label: 'ישיבה קטנה',
    group: 'לימודים קודמים',
    get: (_, __, ___, edu) => edu.find((e) => e.institution_type === 'yeshiva_ketana')?.institution_name || '',
  },
  {
    key: 'previous_yeshiva',
    label: 'ישיבה קודמת',
    group: 'לימודים קודמים',
    get: (_, __, ___, edu) => edu.filter((e) => e.institution_type === 'other').map((e) => e.institution_name).join(', '),
  },
];

const DEFAULT_FIELDS = ['last_name', 'first_name', 'id_number', 'shiur', 'machzor', 'room', 'father_name', 'father_phone', 'city'];

type StatusFilter = 'active' | 'inactive' | 'chizuk' | 'graduated' | 'all' | 'active_all';

export function CustomReportBuilder({ students, families, machzorot, education }: Props) {
  const shiurOptions = getShiurFilterOptions();

  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(DEFAULT_FIELDS));
  const [shiurFilter, setShiurFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [institutionFilter, setInstitutionFilter] = useState('');

  const groups = useMemo(() => {
    const g: Record<string, FieldDef[]> = {};
    for (const f of ALL_FIELDS) {
      if (!g[f.group]) g[f.group] = [];
      g[f.group].push(f);
    }
    return g;
  }, []);

  const toggle = (key: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllGroup = (group: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      for (const f of groups[group]) next.add(f.key);
      return next;
    });
  };

  const clearGroup = (group: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      for (const f of groups[group]) next.delete(f.key);
      return next;
    });
  };

  const filteredStudents = useMemo(() => {
    let result = students;
    if (statusFilter === 'active_all') {
      result = result.filter((s) => s.status === 'active' || s.status === 'chizuk');
    } else if (statusFilter !== 'all') {
      result = result.filter((s) => s.status === statusFilter);
    }
    if (shiurFilter) result = result.filter((s) => s.shiur === shiurFilter);
    if (institutionFilter) result = result.filter((s) => s.institution_name === institutionFilter);
    return sortStudentsByName(result);
  }, [students, statusFilter, shiurFilter, institutionFilter]);

  const exportToCsv = () => {
    const fields = ALL_FIELDS.filter((f) => selectedFields.has(f.key));
    if (fields.length === 0) {
      alert('בחר לפחות שדה אחד');
      return;
    }
    if (filteredStudents.length === 0) {
      alert('אין תלמידים המתאימים למסננים');
      return;
    }

    const header = fields.map((f) => f.label).join(',');
    const lines = filteredStudents.map((s) => {
      const fam = s.family_id ? families[s.family_id] : undefined;
      const mach = s.machzor_id ? machzorot[s.machzor_id] : undefined;
      const edu = education[s.id] || [];
      return fields
        .map((f) => {
          const v = f.get(s, fam, mach, edu);
          return `"${String(v || '').replace(/"/g, '""')}"`;
        })
        .join(',');
    });

    const csv = '\uFEFF' + header + '\r\n' + lines.join('\r\n') + '\r\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `דוח_מותאם_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-3">שלב 1: סינון התלמידים</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">סטטוס</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="active">פעילים בלבד</option>
              <option value="active_all">פעילים + חיזוק</option>
              <option value="chizuk">חיזוק</option>
              <option value="inactive">לא פעיל</option>
              <option value="graduated">סיים</option>
              <option value="all">כל התלמידים</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">שיעור</label>
            <select
              value={shiurFilter}
              onChange={(e) => setShiurFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              {shiurOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">מוסד</label>
            <select
              value={institutionFilter}
              onChange={(e) => setInstitutionFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">כל המוסדות</option>
              <option value="ישיבה">ישיבה</option>
              <option value="כולל">כולל</option>
              <option value="כולל של ר' יצחק פינקל">כולל של ר׳ יצחק פינקל</option>
            </select>
          </div>
        </div>
        <p className="text-sm text-blue-700 mt-2">
          נבחרו <strong>{filteredStudents.length.toLocaleString('he-IL')}</strong> תלמידים
        </p>
      </div>

      {/* Fields selection */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold text-gray-900">שלב 2: בחר שדות ({selectedFields.size})</h3>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSelectedFields(new Set(ALL_FIELDS.map((f) => f.key)))}
            >
              בחר הכל
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setSelectedFields(new Set())}>
              נקה
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setSelectedFields(new Set(DEFAULT_FIELDS))}>
              ברירת מחדל
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {Object.entries(groups).map(([group, fields]) => (
            <div key={group} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold text-gray-700 text-sm">{group}</h4>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => selectAllGroup(group)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    הכל
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => clearGroup(group)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    נקה
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {fields.map((f) => (
                  <label
                    key={f.key}
                    className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer text-sm ${
                      selectedFields.has(f.key)
                        ? 'bg-blue-50 border-blue-300 text-blue-800'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFields.has(f.key)}
                      onChange={() => toggle(f.key)}
                      className="w-4 h-4"
                    />
                    <span>{f.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Export */}
      <div className="flex justify-center">
        <Button
          size="lg"
          onClick={exportToCsv}
          disabled={selectedFields.size === 0 || filteredStudents.length === 0}
        >
          📊 ייצא לאקסל ({filteredStudents.length} תלמידים, {selectedFields.size} שדות)
        </Button>
      </div>
    </div>
  );
}
