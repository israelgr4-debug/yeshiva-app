'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import { Student } from '@/lib/types';
import { SHIURIM } from '@/lib/shiurim';

type Row = Pick<Student, 'id' | 'first_name' | 'last_name' | 'shiur' | 'status' | 'is_chinuch'>;

export function ChinuchTab() {
  const [students, setStudents] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [shiurFilter, setShiurFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'all'>('active');
  const [search, setSearch] = useState('');
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const loadStudents = async () => {
    setLoading(true);
    const all: Row[] = [];
    for (let p = 0; p < 20; p++) {
      const from = p * 1000;
      const to = from + 999;
      let q = supabase
        .from('students')
        .select('id,first_name,last_name,shiur,status,is_chinuch')
        .order('last_name')
        .range(from, to);
      if (statusFilter === 'active') q = q.eq('status', 'active');
      if (shiurFilter !== 'all') q = q.eq('shiur', shiurFilter);
      const { data } = await q;
      if (!data || data.length === 0) break;
      all.push(...(data as Row[]));
      if (data.length < 1000) break;
    }
    setStudents(all);
    setLoading(false);
  };

  useEffect(() => {
    loadStudents();
  }, [shiurFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const s = search.trim();
    if (!s) return students;
    return students.filter(
      (st) =>
        (st.last_name || '').includes(s) ||
        (st.first_name || '').includes(s)
    );
  }, [students, search]);

  const chinuchCount = useMemo(
    () => students.filter((s) => s.is_chinuch).length,
    [students]
  );

  const toggle = async (student: Row) => {
    const newVal = !student.is_chinuch;
    // optimistic update
    setStudents((prev) =>
      prev.map((s) => (s.id === student.id ? { ...s, is_chinuch: newVal } : s))
    );
    setSavingIds((prev) => new Set(prev).add(student.id));
    try {
      const { error } = await supabase
        .from('students')
        .update({ is_chinuch: newVal })
        .eq('id', student.id);
      if (error) throw error;
      setSavedIds((prev) => new Set(prev).add(student.id));
      setTimeout(() => {
        setSavedIds((prev) => {
          const n = new Set(prev);
          n.delete(student.id);
          return n;
        });
      }, 1500);
    } catch (e) {
      // revert
      setStudents((prev) =>
        prev.map((s) => (s.id === student.id ? { ...s, is_chinuch: !newVal } : s))
      );
      alert('שגיאה בשמירה');
    } finally {
      setSavingIds((prev) => {
        const n = new Set(prev);
        n.delete(student.id);
        return n;
      });
    }
  };

  const shiurOptions = [
    { value: 'all', label: 'כל השיעורים' },
    ...SHIURIM.map((s) => ({ value: s.name, label: s.name })),
  ];

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-bold text-gray-900">חינוך</h2>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-gray-600 mb-4">
          סמן תלמידים הרשומים בתת-מוסד &quot;חינוך&quot;. השינוי נשמר אוטומטית.
          מסומנים יקבלו תגית בכרטיס התלמיד, עמודה בדוחות, ובלאנק/לוגו שונה באישורים.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שיעור</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="active">פעילים בלבד</option>
              <option value="all">כולם</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">חיפוש</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="שם משפחה/פרטי"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="flex items-end text-sm text-gray-600">
            {loading
              ? 'טוען...'
              : `${filtered.length} תלמידים · ${chinuchCount} מסומנים כחינוך`}
          </div>
        </div>

        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-center font-semibold w-20">חינוך</th>
                  <th className="px-3 py-2 text-start font-semibold">שם משפחה</th>
                  <th className="px-3 py-2 text-start font-semibold">שם פרטי</th>
                  <th className="px-3 py-2 text-start font-semibold">שיעור</th>
                  <th className="px-3 py-2 text-center font-semibold w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const isSaving = savingIds.has(s.id);
                  const justSaved = savedIds.has(s.id);
                  return (
                    <tr
                      key={s.id}
                      className={`border-t border-gray-100 ${s.is_chinuch ? 'bg-purple-50/40' : ''}`}
                    >
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={!!s.is_chinuch}
                          disabled={isSaving}
                          onChange={() => toggle(s)}
                          className="w-5 h-5 cursor-pointer accent-purple-600"
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">{s.last_name}</td>
                      <td className="px-3 py-2">{s.first_name}</td>
                      <td className="px-3 py-2 text-gray-600">{s.shiur}</td>
                      <td className="px-3 py-2 text-center text-xs">
                        {isSaving ? (
                          <span className="text-gray-400">💾</span>
                        ) : justSaved ? (
                          <span className="text-green-600">✓</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
