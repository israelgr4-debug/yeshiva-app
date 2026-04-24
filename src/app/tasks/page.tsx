'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { useTasks, Task, TaskPriority, TaskStatus } from '@/hooks/useTasks';
import { supabase } from '@/lib/supabase';
import { TaskEditDialog } from '@/components/tasks/TaskEditDialog';

interface UserLite {
  id: string;
  full_name: string | null;
  email: string;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'ממתין',
  in_progress: 'בטיפול',
  done: 'בוצע',
  cancelled: 'בוטל',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  in_progress: 'bg-blue-50 text-blue-800 ring-1 ring-blue-200',
  done: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'נמוכה',
  normal: 'רגילה',
  high: 'גבוהה',
  urgent: 'דחופה',
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'text-gray-500',
  normal: 'text-gray-700',
  high: 'text-orange-600',
  urgent: 'text-red-600 font-bold',
};

export default function TasksPage() {
  const { list, update, remove } = useTasks();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<Record<string, UserLite>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'mine' | 'open' | 'overdue'>('open');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [showNew, setShowNew] = useState(false);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await list();
      setTasks(data);
    } catch (e: any) {
      alert('שגיאה בטעינה: ' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();

    // Current user
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id || null);
    });

    // Users for assignee display
    supabase.from('app_users').select('id, full_name, email').then(({ data }) => {
      if (data) {
        const map: Record<string, UserLite> = {};
        for (const u of data) map[u.id] = u as UserLite;
        setUsers(map);
      }
    });
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const filtered = tasks.filter((t) => {
    if (filter === 'mine') return t.assigned_to === currentUserId;
    if (filter === 'open') return t.status === 'pending' || t.status === 'in_progress';
    if (filter === 'overdue')
      return (
        (t.status === 'pending' || t.status === 'in_progress') &&
        ((t.due_date && t.due_date <= today) || (t.reminder_date && t.reminder_date <= today))
      );
    return true;
  });

  const handleToggleDone = async (t: Task) => {
    try {
      const newStatus: TaskStatus = t.status === 'done' ? 'pending' : 'done';
      await update(t.id, { status: newStatus });
      await loadTasks();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    }
  };

  const handleDelete = async (t: Task) => {
    if (!confirm(`למחוק את המשימה "${t.title}"?`)) return;
    try {
      await remove(t.id);
      await loadTasks();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    }
  };

  const counts = {
    all: tasks.length,
    open: tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress').length,
    mine: tasks.filter((t) => t.assigned_to === currentUserId).length,
    overdue: tasks.filter(
      (t) =>
        (t.status === 'pending' || t.status === 'in_progress') &&
        ((t.due_date && t.due_date <= today) || (t.reminder_date && t.reminder_date <= today))
    ).length,
  };

  return (
    <>
      <Header
        title="משימות"
        subtitle="ניהול משימות ותזכורות"
        action={<Button size="sm" onClick={() => setShowNew(true)}>＋ משימה חדשה</Button>}
      />

      <div className="p-4 md:p-8 space-y-4 animate-fadeIn">
        {/* Filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ['open', '📋 פתוחות', counts.open, 'blue'],
              ['overdue', '⏰ באיחור', counts.overdue, 'red'],
              ['mine', '👤 שלי', counts.mine, 'violet'],
              ['all', 'הכל', counts.all, 'slate'],
            ] as const
          ).map(([key, label, count, tone]) => {
            const active = filter === key;
            const toneMap: Record<string, string> = {
              blue: 'from-blue-500 to-indigo-600',
              red: 'from-red-500 to-rose-600',
              violet: 'from-violet-500 to-purple-600',
              slate: 'from-slate-500 to-slate-700',
            };
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                  active
                    ? `bg-gradient-to-l ${toneMap[tone]} text-white shadow-md`
                    : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <span>{label}</span>
                <span
                  className={`text-xs font-bold px-1.5 py-0 rounded-md tabular-nums ${
                    active ? 'bg-white/20' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Task list */}
        {loading ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 text-sm mt-3">טוען...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <p className="text-5xl mb-3 opacity-40">🎉</p>
            <p className="text-slate-500 text-base font-medium">אין משימות בקטגוריה זו</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((t) => {
              const isOverdue =
                (t.status === 'pending' || t.status === 'in_progress') &&
                ((t.due_date && t.due_date <= today) || (t.reminder_date && t.reminder_date <= today));
              const assignee = t.assigned_to ? users[t.assigned_to] : null;
              return (
                <div
                  key={t.id}
                  className={`bg-white rounded-xl border-s-4 elevation-1 hover:elevation-2 transition-all flex items-start gap-3 p-3 ${
                    isOverdue
                      ? 'border-s-red-500 border-y border-e border-slate-200'
                      : t.priority === 'urgent'
                      ? 'border-s-red-500 border-y border-e border-slate-200'
                      : t.priority === 'high'
                      ? 'border-s-amber-500 border-y border-e border-slate-200'
                      : 'border-s-slate-200 border-y border-e border-slate-200'
                  } ${t.status === 'done' ? 'opacity-60' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleDone(t)}
                    className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all shrink-0 ${
                      t.status === 'done'
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-slate-300 hover:border-emerald-500'
                    }`}
                    aria-label={t.status === 'done' ? 'בוצע' : 'סמן כבוצע'}
                  >
                    {t.status === 'done' && <span className="text-xs">✓</span>}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p
                          className={`font-semibold text-slate-900 ${
                            t.status === 'done' ? 'line-through text-slate-400' : ''
                          } ${PRIORITY_COLORS[t.priority]}`}
                        >
                          {t.priority === 'urgent' && '🔴 '}
                          {t.priority === 'high' && '🟡 '}
                          {t.title}
                        </p>
                        {t.description && (
                          <p className="text-sm text-slate-600 mt-1 whitespace-pre-line leading-relaxed">
                            {t.description}
                          </p>
                        )}
                        <div className="flex gap-1.5 flex-wrap mt-2 text-[11px]">
                          <span className={`px-2 py-0.5 rounded-md font-medium ${STATUS_COLORS[t.status]}`}>
                            {STATUS_LABELS[t.status]}
                          </span>
                          {t.due_date && (
                            <span
                              className={`px-2 py-0.5 rounded-md font-medium ring-1 ${
                                isOverdue
                                  ? 'bg-red-50 text-red-700 ring-red-200'
                                  : 'bg-slate-50 text-slate-700 ring-slate-200'
                              }`}
                            >
                              📅 {t.due_date}
                            </span>
                          )}
                          {t.reminder_date && (
                            <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 ring-1 ring-violet-200 font-medium">
                              ⏰ {t.reminder_date}
                            </span>
                          )}
                          {assignee && (
                            <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 ring-1 ring-blue-200 font-medium">
                              👤 {assignee.full_name || assignee.email}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 ring-1 ring-slate-200">
                            {PRIORITY_LABELS[t.priority]}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(t)}
                          className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 w-7 h-7 rounded-md flex items-center justify-center transition-colors"
                          title="ערוך"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(t)}
                          className="text-slate-400 hover:text-red-600 hover:bg-red-50 w-7 h-7 rounded-md flex items-center justify-center transition-colors"
                          title="מחק"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(showNew || editing) && (
        <TaskEditDialog
          task={editing}
          users={Object.values(users)}
          onClose={() => {
            setShowNew(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setShowNew(false);
            setEditing(null);
            await loadTasks();
          }}
        />
      )}
    </>
  );
}
