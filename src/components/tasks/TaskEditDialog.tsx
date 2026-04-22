'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useTasks, Task, TaskPriority, TaskStatus } from '@/hooks/useTasks';

interface UserLite {
  id: string;
  full_name: string | null;
  email: string;
}

interface Props {
  task: Task | null;
  users: UserLite[];
  onClose: () => void;
  onSaved: () => void;
}

export function TaskEditDialog({ task, users, onClose, onSaved }: Props) {
  const { create, update } = useTasks();

  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState<TaskPriority>(task?.priority || 'normal');
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'pending');
  const [dueDate, setDueDate] = useState(task?.due_date || '');
  const [reminderDate, setReminderDate] = useState(task?.reminder_date || '');
  const [assignedTo, setAssignedTo] = useState(task?.assigned_to || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!title.trim()) {
      setError('כותרת היא שדה חובה');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status,
        due_date: dueDate || null,
        reminder_date: reminderDate || null,
        assigned_to: assignedTo || null,
      };
      if (task) {
        await update(task.id, payload as any);
      } else {
        await create(payload as any);
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'שגיאה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-2xl max-w-lg w-full max-h-[95vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold">{task ? 'ערוך משימה' : 'משימה חדשה'}</h3>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">כותרת*</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">תיאור</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">עדיפות</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="low">נמוכה</option>
                <option value="normal">רגילה</option>
                <option value="high">גבוהה</option>
                <option value="urgent">דחופה</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">סטטוס</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="pending">ממתין</option>
                <option value="in_progress">בטיפול</option>
                <option value="done">בוצע</option>
                <option value="cancelled">בוטל</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="תאריך יעד"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
            <Input
              label="תזכורת"
              type="date"
              value={reminderDate}
              onChange={(e) => setReminderDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">משויך ל</label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">לא משויך</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">{error}</div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-2">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? 'שומר...' : task ? 'עדכן' : 'צור'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving} className="flex-1">
            ביטול
          </Button>
        </div>
      </div>
    </div>
  );
}
