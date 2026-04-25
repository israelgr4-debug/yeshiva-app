'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Graduate, Student } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { SearchInput } from '@/components/ui/SearchInput';
import { useGraduates } from '@/hooks/useGraduates';

interface Props {
  graduates: Graduate[]; // pending ones
  students: Student[];
  onEdit: (g: Graduate) => void;
  onAddFromStudent: (s: Student) => void;
  onChanged: () => void;
}

export function GraduatesPendingTab({ graduates, students, onEdit, onAddFromStudent, onChanged }: Props) {
  const { remove } = useGraduates();
  const [studentSearch, setStudentSearch] = useState('');

  // Active students that don't already have a graduate row
  const pendingStudentIds = useMemo(
    () => new Set(graduates.filter((g) => g.student_id).map((g) => g.student_id!)),
    [graduates]
  );

  const eligibleStudents = useMemo(() => {
    let list = students.filter(
      (s) => (s.status === 'active' || s.status === 'chizuk') && !pendingStudentIds.has(s.id)
    );
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase();
      list = list.filter(
        (s) =>
          (s.first_name || '').toLowerCase().includes(q) ||
          (s.last_name || '').toLowerCase().includes(q) ||
          (s.id_number || '').includes(q)
      );
    }
    return list.sort((a, b) => (a.last_name || '').localeCompare(b.last_name || '', 'he')).slice(0, 100);
  }, [students, pendingStudentIds, studentSearch]);

  const handleDelete = async (g: Graduate) => {
    if (!confirm(`למחוק את ${g.first_name} ${g.last_name} מרשימת הממתינים?`)) return;
    try {
      await remove(g.id);
      onChanged();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Left: pending graduates */}
      <div className="bg-white rounded-2xl border border-slate-200 elevation-1 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-l from-amber-50 to-white">
          <h3 className="font-bold text-slate-900" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>
            ⏳ ממתינים להשלמת פרטים
          </h3>
          <p className="text-xs text-slate-500">{graduates.length} בקשות</p>
        </div>
        {graduates.length === 0 ? (
          <p className="text-center py-8 text-slate-400 text-sm">אין בקשות ממתינות</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {graduates.map((g) => (
              <div key={g.id} className="p-3 hover:bg-blue-50/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => onEdit(g)}
                      className="font-semibold text-blue-700 hover:underline text-start"
                    >
                      {g.last_name} {g.first_name}
                    </button>
                    <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-1">
                      {g.pending_reason && (
                        <span className="bg-amber-50 text-amber-800 ring-1 ring-amber-200 rounded-md px-1.5">
                          {g.pending_reason}
                        </span>
                      )}
                      {g.machzor_name && <span>· מחזור {g.machzor_name}</span>}
                      {g.student_id && (
                        <Link
                          href={`/students/${g.student_id}`}
                          className="text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          כרטיס תלמיד ↗
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" onClick={() => onEdit(g)}>השלם פרטים</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(g)}>🗑️</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: pick a student to add to pending */}
      <div className="bg-white rounded-2xl border border-slate-200 elevation-1 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-l from-violet-50 to-white">
          <h3 className="font-bold text-slate-900" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>
            ➕ הוסף תלמיד לממתינים
          </h3>
          <p className="text-xs text-slate-500">לדוגמא תלמיד שהתארס - אפשר להתחיל לאסוף פרטים</p>
        </div>
        <div className="p-3">
          <SearchInput
            placeholder="שם / ת״ז..."
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
          />
        </div>
        <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
          {eligibleStudents.length === 0 ? (
            <p className="text-center py-8 text-slate-400 text-sm">אין תלמידים תואמים</p>
          ) : (
            eligibleStudents.map((s) => (
              <div key={s.id} className="p-3 flex items-center justify-between gap-2 hover:bg-blue-50/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm">
                    {s.last_name} {s.first_name}
                  </p>
                  <p className="text-xs text-slate-500">{s.shiur || '—'} · ת״ז {s.id_number || '—'}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => onAddFromStudent(s)}>
                  ＋ הוסף
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
