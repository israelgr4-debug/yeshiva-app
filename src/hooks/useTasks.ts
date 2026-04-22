'use client';

import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  reminder_date: string | null;
  assigned_to: string | null;
  created_by: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useTasks() {
  const list = useCallback(async (filters?: { status?: TaskStatus; assigned_to?: string }): Promise<Task[]> => {
    let q = supabase.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false });
    if (filters?.status) q = q.eq('status', filters.status);
    if (filters?.assigned_to) q = q.eq('assigned_to', filters.assigned_to);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as Task[];
  }, []);

  const create = useCallback(async (t: Partial<Task>): Promise<Task> => {
    const { data: userData } = await supabase.auth.getUser();
    const { data: profile } = userData?.user
      ? await supabase.from('app_users').select('id').eq('id', userData.user.id).single()
      : { data: null };

    const payload: any = {
      title: t.title,
      description: t.description || null,
      status: t.status || 'pending',
      priority: t.priority || 'normal',
      due_date: t.due_date || null,
      reminder_date: t.reminder_date || null,
      assigned_to: t.assigned_to || null,
      created_by: profile?.id || null,
      related_entity_type: t.related_entity_type || null,
      related_entity_id: t.related_entity_id || null,
      notes: t.notes || null,
    };
    const { data, error } = await supabase.from('tasks').insert(payload).select().single();
    if (error) throw error;
    return data as Task;
  }, []);

  const update = useCallback(async (id: string, patch: Partial<Task>): Promise<Task> => {
    const updates: any = { ...patch };
    if (patch.status === 'done' && !patch.completed_at) {
      updates.completed_at = new Date().toISOString();
    }
    const { data, error } = await supabase.from('tasks').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data as Task;
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
  }, []);

  // Count tasks that need attention (pending + reminder_date <= today)
  const countOverdue = useCallback(async (assignedTo?: string): Promise<number> => {
    const today = new Date().toISOString().slice(0, 10);
    let q = supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .or(`due_date.lte.${today},reminder_date.lte.${today}`);
    if (assignedTo) q = q.eq('assigned_to', assignedTo);
    const { count, error } = await q;
    if (error) throw error;
    return count || 0;
  }, []);

  return { list, create, update, remove, countOverdue };
}
