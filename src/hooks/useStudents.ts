'use client';

import { Student } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { useCallback, useState } from 'react';

export function useStudents() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getStudents = useCallback(
    async (filters?: { status?: string; shiur?: string; search?: string }): Promise<Student[]> => {
      setLoading(true);
      setError(null);
      try {
        let query = supabase.from('students').select('*');

        if (filters?.status) {
          query = query.eq('status', filters.status);
        }

        if (filters?.shiur) {
          query = query.eq('shiur', filters.shiur);
        }

        if (filters?.search) {
          const search = filters.search.toLowerCase();
          query = query.or(
            `first_name.ilike.%${search}%,last_name.ilike.%${search}%,id_number.ilike.%${search}%`
          );
        }

        const { data, error: err } = await query.order('last_name', { ascending: true });

        if (err) throw err;
        return (data || []) as Student[];
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to fetch students';
        setError(errorMessage);
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getStudentById = useCallback(async (id: string): Promise<Student | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.from('students').select('*').eq('id', id).single();

      if (err) throw err;
      return (data || null) as Student | null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch student';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const createStudent = useCallback(async (student: Omit<Student, 'id' | 'created_at' | 'updated_at'>): Promise<Student | null> => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('students')
        .insert([student])
        .select()
        .single();

      if (err) throw err;
      return (data || null) as Student | null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create student';
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateStudent = useCallback(
    async (id: string, updates: Partial<Student>): Promise<Student | null> => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from('students')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (err) throw err;
        return (data || null) as Student | null;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to update student';
        setError(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteStudent = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('students').delete().eq('id', id);

      if (err) throw err;
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete student';
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    getStudents,
    getStudentById,
    createStudent,
    updateStudent,
    deleteStudent,
    loading,
    error,
  };
}
