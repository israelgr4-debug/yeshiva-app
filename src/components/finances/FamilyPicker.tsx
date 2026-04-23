'use client';

import { useState, useMemo, useRef, useEffect } from 'react';

interface Family {
  id: string;
  family_name: string;
  father_name?: string | null;
  father_id_number?: string | null;
}

interface Props {
  families: Family[];
  activeFamilyIds: Set<string>;
  value: string | null;
  onChange: (familyId: string) => void;
  placeholder?: string;
}

export function FamilyPicker({ families, activeFamilyIds, value, onChange, placeholder }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const chosen = useMemo(() => families.find((f) => f.id === value) || null, [families, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = families.filter((f) => {
      if (!q) return true;
      return (
        (f.family_name || '').toLowerCase().includes(q) ||
        (f.father_name || '').toLowerCase().includes(q) ||
        (f.father_id_number || '').includes(q)
      );
    });
    // Sort: active first, then by family_name Hebrew
    return list.sort((a, b) => {
      const aActive = activeFamilyIds.has(a.id);
      const bActive = activeFamilyIds.has(b.id);
      if (aActive !== bActive) return aActive ? -1 : 1;
      return (a.family_name || '').localeCompare(b.family_name || '', 'he');
    });
  }, [families, query, activeFamilyIds]);

  const displayLabel = chosen
    ? `${chosen.family_name}${chosen.father_name ? ' · ' + chosen.father_name : ''}`
    : placeholder || 'בחר משפחה';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-start bg-white flex items-center justify-between"
      >
        <span className={chosen ? 'text-gray-900' : 'text-gray-400'}>
          {chosen && (
            <span
              className={`inline-block w-2 h-2 rounded-full me-2 ${
                activeFamilyIds.has(chosen.id) ? 'bg-green-500' : 'bg-gray-300'
              }`}
            />
          )}
          {displayLabel}
        </span>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 overflow-hidden flex flex-col">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חפש לפי שם / ת.ז..."
            className="w-full px-3 py-2 border-b border-gray-200 text-sm focus:outline-none"
            autoFocus
          />
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-sm text-gray-500">לא נמצאו משפחות</div>
            ) : (
              filtered.slice(0, 200).map((f) => {
                const isActive = activeFamilyIds.has(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      onChange(f.id);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`w-full text-start px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-100 last:border-0 ${
                      !isActive ? 'opacity-60' : ''
                    } ${value === f.id ? 'bg-blue-100' : ''}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                          isActive ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      />
                      <span className="font-medium">{f.family_name}</span>
                      {f.father_name && <span className="text-gray-600">· {f.father_name}</span>}
                      {!isActive && (
                        <span className="text-xs text-gray-400 ms-auto">(לא פעילה)</span>
                      )}
                    </div>
                    {f.father_id_number && (
                      <div className="text-xs text-gray-500 mt-0.5">ת.ז: {f.father_id_number}</div>
                    )}
                  </button>
                );
              })
            )}
            {filtered.length > 200 && (
              <div className="p-2 text-center text-xs text-gray-400">
                מוצגות 200 ראשונות - צמצם חיפוש
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
