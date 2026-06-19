'use client';

import { useMemo, useState } from 'react';
import { Registration } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { useRegistrations } from '@/hooks/useRegistrations';

interface Props {
  registrations: Registration[];
  onEdit: (r: Registration) => void;
  onChanged: () => void;
}

const STATUS_OPTIONS = [
  { value: '', label: 'כל הסטטוסים' },
  { value: 'registered', label: 'רשום' },
  { value: 'tested', label: 'נבחן' },
  { value: 'accepted', label: 'התקבל' },
  { value: 'rejected', label: 'לא התקבל' },
  { value: 'converted', label: 'הומר לתלמיד' },
];

const STATUS_LABEL: Record<string, string> = {
  registered: 'רשום',
  tested: 'נבחן',
  accepted: 'התקבל',
  rejected: 'לא התקבל',
  converted: 'הומר',
};

const STATUS_TONE: Record<string, string> = {
  registered: 'bg-sky-50 text-sky-800 ring-sky-200',
  tested: 'bg-amber-50 text-amber-800 ring-amber-200',
  accepted: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  rejected: 'bg-red-50 text-red-800 ring-red-200',
  converted: 'bg-violet-50 text-violet-800 ring-violet-200',
};

type SortKey = 'name' | 'id_number' | 'prev_yeshiva_name' | 'father_name' | 'father_phone' | 'city' | 'status';

export function RegistrationsListTab({ registrations, onEdit, onChanged }: Props) {
  const { remove } = useRegistrations();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [yeshivaFilter, setYeshivaFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const yeshivot = useMemo(() => {
    const set = new Set<string>();
    for (const r of registrations) {
      if (r.prev_yeshiva_name) set.add(r.prev_yeshiva_name.trim());
    }
    return [
      { value: '', label: 'כל הישיבות' },
      ...Array.from(set).sort((a, b) => a.localeCompare(b, 'he')).map((y) => ({ value: y, label: y })),
    ];
  }, [registrations]);

  const filtered = useMemo(() => {
    const list = registrations.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (yeshivaFilter && r.prev_yeshiva_name !== yeshivaFilter) return false;
      if (search) {
        const digits = (v: string) => v.replace(/\D/g, '');
        const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const text = [
          r.first_name, r.last_name, r.id_number, r.phone, r.email,
          r.father_name, r.father_phone, r.mother_name, r.mother_phone,
          r.address, r.city, r.prev_yeshiva_name, r.prev_yeshiva_city,
        ].filter(Boolean).map((v) => String(v).toLowerCase()).join(' ');
        const dPool = [r.id_number, r.phone, r.father_phone, r.mother_phone]
          .filter(Boolean).map((v) => digits(String(v))).join(' ');
        return tokens.every((t) =>
          /^\d/.test(t) ? dPool.includes(digits(t)) || text.includes(t) : text.includes(t)
        );
      }
      return true;
    });

    // Sort
    const keyVal = (r: Registration): string => {
      switch (sortKey) {
        case 'name':              return `${r.last_name || ''} ${r.first_name || ''}`.trim();
        case 'id_number':         return r.id_number || '';
        case 'prev_yeshiva_name': return r.prev_yeshiva_name || '';
        case 'father_name':       return r.father_name || '';
        case 'father_phone':      return r.father_phone || '';
        case 'city':              return r.city || '';
        case 'status':            return r.status || '';
      }
    };
    const sorted = [...list].sort((a, b) => {
      const va = keyVal(a);
      const vb = keyVal(b);
      // Push empty values to the end always (regardless of asc/desc)
      if (!va && vb) return 1;
      if (va && !vb) return -1;
      const cmp = va.localeCompare(vb, 'he', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [registrations, search, statusFilter, yeshivaFilter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleDelete = async (r: Registration) => {
    if (!confirm(`למחוק את הרישום של ${r.first_name} ${r.last_name}?`)) return;
    try {
      await remove(r.id);
      onChanged();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    }
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 elevation-1 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FilterField label="חיפוש">
            <SearchInput
              placeholder="שם / ת״ז / טלפון / הורה / ישיבה..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </FilterField>
          <FilterField label="סטטוס">
            <Select
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            />
          </FilterField>
          <FilterField label="ישיבה קטנה">
            <Select
              options={yeshivot}
              value={yeshivaFilter}
              onChange={(e) => setYeshivaFilter(e.target.value)}
            />
          </FilterField>
        </div>
      </div>

      <div className="text-sm text-slate-600">
        <span className="font-bold text-slate-900 text-base">{filtered.length}</span> רישומים
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <p className="text-5xl mb-3 opacity-40">📝</p>
          <p className="text-slate-500 text-base font-medium">אין רישומים להצגה</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden elevation-1">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <SortHeader col="name"              label="שם"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader col="id_number"         label="ת״ז"         sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader col="prev_yeshiva_name" label="ישיבה קטנה"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader col="city"              label="עיר"         sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader col="father_name"       label="אב"          sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader col="father_phone"      label="טלפון"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortHeader col="status"            label="סטטוס"       sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-b-0 hover:bg-blue-50/40 transition-colors">
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => onEdit(r)}
                        className="font-semibold text-blue-700 hover:text-blue-800 hover:underline"
                      >
                        {r.last_name} {r.first_name}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{r.id_number || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{r.prev_yeshiva_name || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{r.city || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{r.father_name || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums">
                      {r.father_phone ? (
                        <a href={`tel:${r.father_phone}`} className="hover:text-blue-700">{r.father_phone}</a>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${STATUS_TONE[r.status] || 'bg-slate-100 text-slate-700 ring-slate-200'}`}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-end">
                      <Button size="sm" variant="ghost" onClick={() => onEdit(r)}>✏️</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(r)}>🗑️</Button>
                    </td>
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

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  );
}

function SortHeader({
  col, label, sortKey, sortDir, onSort,
}: {
  col: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  const arrow = active ? (sortDir === 'asc' ? '▲' : '▼') : '↕';
  return (
    <th className="px-3 py-2.5 text-start">
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`flex items-center gap-1 font-semibold text-xs uppercase tracking-wider transition-colors ${
          active ? 'text-blue-700' : 'text-slate-600 hover:text-slate-900'
        }`}
        title={active ? `מסונן לפי ${label} (${sortDir === 'asc' ? 'א-ת' : 'ת-א'}) - לחץ להפיכה` : `מיין לפי ${label}`}
      >
        <span>{label}</span>
        <span className={`text-[10px] ${active ? 'opacity-100' : 'opacity-30'}`}>{arrow}</span>
      </button>
    </th>
  );
}
