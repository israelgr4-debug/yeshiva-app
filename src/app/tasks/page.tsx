'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
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
  pending: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-blue-100 text-blue-800',
  done: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-600',
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
      <Header title="משימות" subtitle="ניהול משימות ותזכורות" />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            <Link
              href="/"
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              ← ראשי
            </Link>
          </div>
          <Button onClick={() => setShowNew(true)}>➕ משימה חדשה</Button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
          {(
            [
              ['open', '📋 פתוחות', counts.open],
              ['overdue', '⏰ באיחור', counts.overdue],
              ['mine', '👤 שלי', counts.mine],
              ['all', 'הכל', counts.all],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                filter === key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        {/* Task list */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-bold">רשימת משימות</h3>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">טוען...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-gray-500">אין משימות</div>
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
                      className={`bg-white border rounded-lg p-3 flex items-start gap-3 ${
                        isOverdue ? 'border-red-300 bg-red-50' : 'border-gray-200'
                      } ${t.status === 'done' ? 'opacity-60' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={t.status === 'done'}
                        onChange={() => handleToggleDone(t)}
                        className="mt-1.5 w-5 h-5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <p
                              className={`font-medium ${t.status === 'done' ? 'line-through text-gray-500' : ''} ${
                                PRIORITY_COLORS[t.priority]
                              }`}
                            >
                              {t.priority === 'urgent' && '🔴 '}
                              {t.priority === 'high' && '🟡 '}
                              {t.title}
                            </p>
                            {t.description && (
                              <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-line">{t.description}</p>
                            )}
                            <div className="flex gap-2 flex-wrap mt-1.5 text-xs">
                              <span className={`px-2 py-0.5 rounded ${STATUS_COLORS[t.status]}`}>
                                {STATUS_LABELS[t.status]}
                              </span>
                              {t.due_date && (
                                <span className={`px-2 py-0.5 rounded ${isOverdue ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                                  📅 {t.due_date}
                                </span>
                              )}
                              {t.reminder_date && (
                                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                                  ⏰ {t.reminder_date}
                                </span>
                              )}
                              {assignee && (
                                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                                  👤 {assignee.full_name || assignee.email}
                                </span>
                              )}
                              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                                עדיפות: {PRIORITY_LABELS[t.priority]}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => setEditing(t)}
                              className="text-blue-600 hover:text-blue-800 text-sm"
                              title="ערוך"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(t)}
                              className="text-red-600 hover:text-red-800 text-sm"
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
          </CardContent>
        </Card>
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
