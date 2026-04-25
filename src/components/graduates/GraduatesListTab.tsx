'use client';

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Graduate } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';

interface Props {
  graduates: Graduate[];
  onEdit: (g: Graduate) => void;
}

const MARITAL_TONE: Record<string, string> = {
  'נשוי': 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  'מאורס': 'bg-amber-50 text-amber-800 ring-amber-200',
  'רווק': 'bg-blue-50 text-blue-800 ring-blue-200',
  'עזב': 'bg-slate-100 text-slate-700 ring-slate-200',
  'נפטר': 'bg-violet-50 text-violet-800 ring-violet-200',
};

export function GraduatesListTab({ graduates, onEdit }: Props) {
  const [search, setSearch] = useState('');
  const [maritalFilter, setMaritalFilter] = useState('');
  const [machzorFilter, setMachzorFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');

  const machzors = useMemo(() => {
    const set = new Set<string>();
    for (const g of graduates) if (g.machzor_name) set.add(g.machzor_name.trim());
    return ['', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'he'))];
  }, [graduates]);

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const g of graduates) if (g.city) set.add(g.city.trim());
    return ['', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'he'))];
  }, [graduates]);

  const filtered = useMemo(() => {
    return graduates.filter((g) => {
      if (maritalFilter && g.marital_status !== maritalFilter) return false;
      if (machzorFilter && g.machzor_name !== machzorFilter) return false;
      if (cityFilter && g.city !== cityFilter) return false;
      if (search.trim()) {
        const digits = (v: string) => v.replace(/\D/g, '');
        const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const text = [
          g.first_name, g.last_name, g.father_name, g.mother_name,
          g.spouse_name, g.spouse_father_name, g.spouse_mother_name,
          g.city, g.street, g.neighborhood, g.email,
          g.machzor_name,
        ].filter(Boolean).map((v) => String(v).toLowerCase()).join(' ');
        const dPool = [g.mobile, g.phone, g.spouse_father_phone, g.spouse_mother_phone]
          .filter(Boolean).map((v) => digits(String(v))).join(' ');
        return tokens.every((t) =>
          /^\d/.test(t) ? dPool.includes(digits(t)) || text.includes(t) : text.includes(t)
        );
      }
      return true;
    });
  }, [graduates, search, maritalFilter, machzorFilter, cityFilter]);

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-slate-200 elevation-1 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="חיפוש">
            <SearchInput
              placeholder="שם / טלפון / כתובת / אשה / הורה..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field label="סטטוס">
            <Select
              options={[
                { value: '', label: 'כולם' },
                { value: 'נשוי', label: 'נשוי' },
                { value: 'מאורס', label: 'מאורס' },
                { value: 'רווק', label: 'רווק' },
                { value: 'עזב', label: 'עזב' },
                { value: 'נפטר', label: 'נפטר' },
              ]}
              value={maritalFilter}
              onChange={(e) => setMaritalFilter(e.target.value)}
            />
          </Field>
          <Field label="מחזור">
            <Select
              options={machzors.map((m) => ({ value: m, label: m || 'כל המחזורים' }))}
              value={machzorFilter}
              onChange={(e) => setMachzorFilter(e.target.value)}
            />
          </Field>
          <Field label="עיר">
            <Select
              options={cities.map((c) => ({ value: c, label: c || 'כל הערים' }))}
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm text-slate-600">
          <span className="font-bold text-slate-900 text-base">{filtered.length.toLocaleString('he-IL')}</span> בוגרים
        </div>
        <Button size="sm" variant="secondary" onClick={() => exportToExcel(filtered)} disabled={filtered.length === 0}>
          📥 ייצא לאקסל
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <p className="text-5xl mb-3 opacity-40">🎓</p>
          <p className="text-slate-500 text-base font-medium">אין בוגרים להצגה</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden elevation-1">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-start font-semibold text-slate-600 text-xs uppercase tracking-wider">שם</th>
                  <th className="px-3 py-2.5 text-start font-semibold text-slate-600 text-xs uppercase tracking-wider">מחזור</th>
                  <th className="px-3 py-2.5 text-start font-semibold text-slate-600 text-xs uppercase tracking-wider">סטטוס</th>
                  <th className="px-3 py-2.5 text-start font-semibold text-slate-600 text-xs uppercase tracking-wider">עיר</th>
                  <th className="px-3 py-2.5 text-start font-semibold text-slate-600 text-xs uppercase tracking-wider">נייד</th>
                  <th className="px-3 py-2.5 text-start font-semibold text-slate-600 text-xs uppercase tracking-wider">חתונה</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => (
                  <tr
                    key={g.id}
                    className="border-b border-slate-100 last:border-b-0 hover:bg-blue-50/40 transition-colors cursor-pointer"
                    onClick={() => onEdit(g)}
                  >
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-blue-700 hover:text-blue-800">
                        {g.last_name} {g.first_name}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{g.machzor_name || '—'}</td>
                    <td className="px-3 py-2.5">
                      {g.marital_status ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${MARITAL_TONE[g.marital_status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
                          {g.marital_status}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{g.city || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums">
                      {g.mobile ? <a href={`tel:${g.mobile}`} onClick={(e) => e.stopPropagation()} className="hover:text-blue-700">{g.mobile}</a> : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 text-xs">{g.marriage_date_text || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function exportToExcel(graduates: Graduate[]) {
  const headers = [
    'שם משפחה', 'שם פרטי', 'מחזור', 'סטטוס',
    'עיר', 'שכונה', 'רחוב', 'מס׳ בניין', 'כניסה', 'דירה', 'כתובת זמנית',
    'נייד', 'טלפון בית', 'דוא״ל',
    'נשוי ל-', 'זמן חתונה', 'תאריך עזיבה',
    'שם האב', 'שם האם',
    'שם אבי האשה', 'טלפון אבי האשה', 'עיר אבי האשה',
    'שם אם האשה', 'טלפון אם האשה',
    'הערות',
  ];
  const rows: any[][] = [headers];
  for (const g of graduates) {
    rows.push([
      g.last_name || '',
      g.first_name || '',
      g.machzor_name || '',
      g.marital_status || '',
      g.city || '',
      g.neighborhood || '',
      g.street || '',
      g.building_number || '',
      g.entrance || '',
      g.apartment || '',
      g.temp_address || '',
      g.mobile || '',
      g.phone || '',
      g.email || '',
      g.spouse_name || '',
      g.marriage_date_text || '',
      g.left_date || '',
      g.father_name || '',
      g.mother_name || '',
      g.spouse_father_name || '',
      g.spouse_father_phone || '',
      g.spouse_father_city || '',
      g.spouse_mother_name || '',
      g.spouse_mother_phone || '',
      g.notes || '',
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = headers.map(() => ({ wch: 15 }));
  if (!(ws as any)['!sheetView']) (ws as any)['!sheetView'] = [{ rightToLeft: true }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'בוגרים');
  XLSX.writeFile(wb, `בוגרים_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  );
}
