'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { supabase } from '@/lib/supabase';
import { Student } from '@/lib/types';
import { SHIURIM } from '@/lib/shiurim';

type SortKey = 'last_name' | 'first_name' | 'current_room' | 'new_room' | 'shiur';
type SortDir = 'asc' | 'desc';

export default function DormitoryManagePage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRooms, setNewRooms] = useState<Record<string, string>>({});
  const [shiurFilter, setShiurFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyWithChanges, setOnlyWithChanges] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('current_room');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const loadStudents = async () => {
    setLoading(true);
    // Load all active students (paginated)
    const all: Student[] = [];
    for (let p = 0; p < 20; p++) {
      const from = p * 1000;
      const to = from + 999;
      const { data } = await supabase
        .from('students')
        .select('id,first_name,last_name,shiur,room_number,status,id_number')
        .eq('status', 'active')
        .range(from, to);
      if (!data || data.length === 0) break;
      all.push(...(data as Student[]));
      if (data.length < 1000) break;
    }
    setStudents(all);
    setLoading(false);
  };

  useEffect(() => {
    loadStudents();
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    let result = students;
    if (shiurFilter) result = result.filter((s) => s.shiur === shiurFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((s) =>
        [s.first_name, s.last_name, s.id_number, String(s.room_number || '')]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    if (onlyWithChanges) {
      result = result.filter((s) => {
        const newVal = (newRooms[s.id] ?? '').trim();
        if (!newVal) return false;
        const currentVal = s.room_number ? String(s.room_number) : '';
        return newVal !== currentVal;
      });
    }

    const sorted = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'last_name':
          cmp = (a.last_name || '').localeCompare(b.last_name || '', 'he');
          break;
        case 'first_name':
          cmp = (a.first_name || '').localeCompare(b.first_name || '', 'he');
          break;
        case 'current_room':
          cmp = (a.room_number || 0) - (b.room_number || 0);
          break;
        case 'new_room':
          cmp = (parseInt(newRooms[a.id] || '0') || 0) - (parseInt(newRooms[b.id] || '0') || 0);
          break;
        case 'shiur':
          cmp = (a.shiur || '').localeCompare(b.shiur || '', 'he');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return sorted;
  }, [students, shiurFilter, searchQuery, onlyWithChanges, sortKey, sortDir, newRooms]);

  const handleChangeRoom = (id: string, value: string) => {
    setNewRooms((prev) => {
      const next = { ...prev };
      if (value.trim() === '') delete next[id];
      else next[id] = value.trim();
      return next;
    });
  };

  const pendingChanges = useMemo(() => {
    return students.filter((s) => {
      const newVal = (newRooms[s.id] ?? '').trim();
      if (!newVal) return false;
      const currentVal = s.room_number ? String(s.room_number) : '';
      return newVal !== currentVal;
    });
  }, [students, newRooms]);

  const handleClearAll = () => {
    if (Object.keys(newRooms).length === 0) return;
    if (!confirm('לנקות את כל השינויים שהוזנו?')) return;
    setNewRooms({});
  };

  const handleApplyChanges = async () => {
    if (pendingChanges.length === 0) {
      alert('אין שינויים לביצוע');
      return;
    }

    if (!confirm(`לעדכן ${pendingChanges.length} תלמידים למספרי חדרים חדשים?`)) return;

    setSaving(true);
    let updated = 0;
    let errors = 0;
    for (const s of pendingChanges) {
      const newVal = newRooms[s.id];
      try {
        const newRoom = parseInt(newVal);
        if (!newRoom || isNaN(newRoom)) continue;
        const { error } = await supabase
          .from('students')
          .update({ room_number: newRoom })
          .eq('id', s.id);
        if (error) errors++;
        else updated++;
      } catch {
        errors++;
      }
    }

    setSaving(false);
    alert(`בוצע: ${updated} תלמידים עודכנו${errors > 0 ? `, ${errors} שגיאות` : ''}`);
    setNewRooms({});
    await loadStudents();
  };

  const SortHeader = ({ label, sortK }: { label: string; sortK: SortKey }) => (
    <button
      type="button"
      onClick={() => toggleSort(sortK)}
      className="flex items-center gap-1 font-semibold hover:text-blue-600"
    >
      {label}
      {sortKey === sortK && <span className="text-xs">{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  );

  const shiurOptions = [{ value: '', label: 'כל השיעורים' }, ...SHIURIM.map((s) => ({ value: s.name, label: s.name }))];

  return (
    <>
      <Header title="ניהול פנימייה" subtitle="שיבוץ חדרים המוני לתלמידים" />

      <div className="p-4 md:p-8 space-y-4">
        {/* Nav */}
        <div className="flex flex-wrap gap-2">
          <Link href="/dormitory" className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            ← מפת פנימייה
          </Link>
          <Link href="/dormitory/edit" className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            ערוך מפה
          </Link>
        </div>

        {/* Filters + summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <SearchInput placeholder="חיפוש לפי שם, ת.ז., חדר..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          <select value={shiurFilter} onChange={(e) => setShiurFilter(e.target.value)} className="px-4 py-2 border border-gray-300 rounded-lg">
            {shiurOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg cursor-pointer bg-white">
            <input type="checkbox" checked={onlyWithChanges} onChange={(e) => setOnlyWithChanges(e.target.checked)} className="w-4 h-4" />
            <span className="text-sm">הצג רק שינויים</span>
          </label>
          <div className="text-sm text-gray-600 flex items-center">
            {filtered.length} תלמידים {loading && '(טוען...)'}
          </div>
        </div>

        {/* Action bar - sticky */}
        <div className="sticky top-0 z-10 bg-white shadow-md rounded-lg p-4 border border-gray-200 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm">
              <strong>{pendingChanges.length}</strong> שינויים ממתינים
            </span>
          </div>
          <div className="mr-auto flex gap-2">
            <Button variant="secondary" onClick={handleClearAll} disabled={Object.keys(newRooms).length === 0}>
              נקה הכל
            </Button>
            <Button onClick={handleApplyChanges} disabled={saving || pendingChanges.length === 0}>
              {saving ? 'מבצע...' : `✓ בצע ${pendingChanges.length > 0 ? `(${pendingChanges.length})` : ''}`}
            </Button>
          </div>
        </div>

        {/* Students table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-3 py-2 text-start"><SortHeader label="שם משפחה" sortK="last_name" /></th>
                <th className="px-3 py-2 text-start"><SortHeader label="שם פרטי" sortK="first_name" /></th>
                <th className="px-3 py-2 text-start"><SortHeader label="שיעור" sortK="shiur" /></th>
                <th className="px-3 py-2 text-start"><SortHeader label="חדר נוכחי" sortK="current_room" /></th>
                <th className="px-3 py-2 text-start"><SortHeader label="חדר חדש" sortK="new_room" /></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const newVal = newRooms[s.id] || '';
                const currentVal = s.room_number ? String(s.room_number) : '';
                const hasChange = newVal && newVal !== currentVal;
                return (
                  <tr key={s.id} className={`border-t border-gray-100 ${hasChange ? 'bg-blue-50/40' : ''}`}>
                    <td className="px-3 py-2">
                      <Link href={`/students/${s.id}`} className="text-blue-600 hover:underline font-medium">
                        {s.last_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{s.first_name}</td>
                    <td className="px-3 py-2 text-gray-600">{s.shiur || '-'}</td>
                    <td className="px-3 py-2 font-medium">{currentVal || <span className="text-gray-400">-</span>}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={newVal}
                        onChange={(e) => handleChangeRoom(s.id, e.target.value)}
                        placeholder="—"
                        className={`w-24 px-2 py-1 border rounded text-center font-medium ${
                          hasChange ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                        }`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && !loading && (
            <div className="text-center py-12 text-gray-500">אין תלמידים להצגה</div>
          )}
        </div>
      </div>
    </>
  );
}
