'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { useGraduates } from '@/hooks/useGraduates';
import { useAuth } from '@/hooks/useAuth';
import { Graduate, Student, Family, EducationHistory } from '@/lib/types';
import { useSupabase } from '@/hooks/useSupabase';
import { GraduatesListTab } from '@/components/graduates/GraduatesListTab';
import { GraduatesPendingTab } from '@/components/graduates/GraduatesPendingTab';
import { GraduateFormDialog } from '@/components/graduates/GraduateFormDialog';

type TabId = 'list' | 'pending';

const TABS: { id: TabId; label: string; icon: string; tint: string }[] = [
  { id: 'list', label: 'בוגרים', icon: '🎓', tint: 'from-blue-500 to-indigo-600' },
  { id: 'pending', label: 'ממתינים', icon: '⏳', tint: 'from-amber-500 to-orange-600' },
];

export default function GraduatesPage() {
  const { permissions, loading: authLoading } = useAuth();
  const { list } = useGraduates();
  const { fetchData } = useSupabase();
  const searchParams = useSearchParams();
  const router = useRouter();
  const idParam = searchParams.get('id');

  const [graduates, setGraduates] = useState<Graduate[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [families, setFamilies] = useState<Record<string, Family>>({});
  const [educationByStudent, setEducationByStudent] = useState<Record<string, EducationHistory[]>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('list');
  const [editing, setEditing] = useState<Graduate | null>(null);
  const [seedFromStudent, setSeedFromStudent] = useState<Student | null>(null);
  const [showForm, setShowForm] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [gs, ss, fs, es] = await Promise.all([
        list(),
        fetchData<Student>('students'),
        fetchData<Family>('families'),
        fetchData<EducationHistory>('education_history'),
      ]);
      setGraduates(gs);
      setStudents(ss);
      const fmap: Record<string, Family> = {};
      for (const f of fs) fmap[f.id] = f;
      setFamilies(fmap);
      const emap: Record<string, EducationHistory[]> = {};
      for (const e of es) {
        if (!emap[e.student_id]) emap[e.student_id] = [];
        emap[e.student_id].push(e);
      }
      setEducationByStudent(emap);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Open dialog when ?id=X arrives (deep link from directory)
  useEffect(() => {
    if (!idParam || graduates.length === 0) return;
    const found = graduates.find((g) => g.id === idParam);
    if (found) {
      setEditing(found);
      setSeedFromStudent(null);
      setShowForm(true);
      setTab(found.is_pending ? 'pending' : 'list');
    }
  }, [idParam, graduates]);

  const counts = useMemo(
    () => ({
      list: graduates.filter((g) => !g.is_pending).length,
      pending: graduates.filter((g) => g.is_pending).length,
    }),
    [graduates]
  );

  if (authLoading) return null;
  if (!permissions.canManageGraduates) {
    return (
      <div className="p-8">
        <p className="text-slate-500">אין לך הרשאה לאזור הבוגרים</p>
      </div>
    );
  }

  const handleEdit = (g: Graduate) => {
    setEditing(g);
    setSeedFromStudent(null);
    setShowForm(true);
  };

  const handleAddFromStudent = (s: Student) => {
    setEditing(null);
    setSeedFromStudent(s);
    setShowForm(true);
  };

  const handleAddBlank = () => {
    setEditing(null);
    setSeedFromStudent(null);
    setShowForm(true);
  };

  return (
    <>
      <Header
        title="בוגרים"
        subtitle="ניהול רשומות בוגרים ומידע עדכני"
        action={<Button size="sm" onClick={handleAddBlank}>＋ בוגר חדש</Button>}
      />

      <div className="p-4 md:p-8 space-y-4 animate-fadeIn">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                  active
                    ? `bg-gradient-to-l ${t.tint} text-white shadow-md`
                    : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
                <span
                  className={`text-xs font-bold px-1.5 py-0 rounded-md tabular-nums ${
                    active ? 'bg-white/20' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {counts[t.id]}
                </span>
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 text-sm mt-3">טוען...</p>
          </div>
        ) : tab === 'list' ? (
          <GraduatesListTab graduates={graduates.filter((g) => !g.is_pending)} onEdit={handleEdit} />
        ) : (
          <GraduatesPendingTab
            graduates={graduates.filter((g) => g.is_pending)}
            students={students}
            onEdit={handleEdit}
            onAddFromStudent={handleAddFromStudent}
            onChanged={reload}
          />
        )}
      </div>

      {showForm && (
        <GraduateFormDialog
          graduate={editing}
          seedStudent={seedFromStudent}
          students={students}
          families={families}
          educationByStudent={educationByStudent}
          onClose={() => {
            setShowForm(false); setEditing(null); setSeedFromStudent(null);
            if (idParam) router.replace('/graduates');
          }}
          onSaved={async () => {
            setShowForm(false); setEditing(null); setSeedFromStudent(null);
            if (idParam) router.replace('/graduates');
            await reload();
          }}
        />
      )}
    </>
  );
}
