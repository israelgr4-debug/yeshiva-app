'use client';

import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Registration, RegistrationStatus, Student, Family } from '@/lib/types';

export function useRegistrations() {
  const list = useCallback(async (): Promise<Registration[]> => {
    const all: Registration[] = [];
    for (let p = 0; p < 20; p++) {
      const { data } = await supabase
        .from('registrations')
        .select('*')
        .order('created_at', { ascending: false })
        .range(p * 1000, p * 1000 + 999);
      if (!data || data.length === 0) break;
      all.push(...(data as Registration[]));
      if (data.length < 1000) break;
    }
    return all;
  }, []);

  const create = useCallback(async (input: Partial<Registration>): Promise<Registration> => {
    const { data, error } = await supabase
      .from('registrations')
      .insert({ status: 'registered', ...input })
      .select()
      .single();
    if (error) throw error;
    return data as Registration;
  }, []);

  const update = useCallback(async (id: string, patch: Partial<Registration>): Promise<void> => {
    const { error } = await supabase.from('registrations').update(patch).eq('id', id);
    if (error) throw error;
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    const { error } = await supabase.from('registrations').delete().eq('id', id);
    if (error) throw error;
  }, []);

  /**
   * Apply a test slot (date + time + material) to all registrations of a
   * given source yeshiva. Pass null/undefined to leave a field untouched.
   */
  const applyTestSlotToYeshiva = useCallback(
    async (
      yeshivaName: string,
      slot: Partial<
        Pick<
          Registration,
          | 'test_date'
          | 'test_time'
          | 'test_mesechta'
          | 'test_perek'
          | 'test_daf_from'
          | 'test_daf_to'
          | 'test_sugya'
          | 'test_notes'
        >
      >
    ): Promise<number> => {
      // Only update fields explicitly provided
      const patch: any = {};
      for (const k of Object.keys(slot)) {
        const v = (slot as any)[k];
        if (v !== undefined && v !== null && v !== '') patch[k] = v;
      }
      if (Object.keys(patch).length === 0) return 0;
      const { data, error } = await supabase
        .from('registrations')
        .update(patch)
        .eq('prev_yeshiva_name', yeshivaName)
        .in('status', ['registered', 'tested'])
        .select('id');
      if (error) throw error;
      return (data || []).length;
    },
    []
  );

  /**
   * Mark accepted + create a Student row in שיעור 0. If the father's ID matches
   * an existing family, link to it; otherwise create a new Family.
   */
  const acceptAndConvert = useCallback(async (registrationId: string): Promise<{ studentId: string }> => {
    const { data: regData, error: regErr } = await supabase
      .from('registrations')
      .select('*')
      .eq('id', registrationId)
      .single();
    if (regErr) throw regErr;
    const r = regData as Registration;

    // Find or create family
    let familyId: string | null = null;
    if (r.father_id_number) {
      const { data: fams } = await supabase
        .from('families')
        .select('id')
        .eq('father_id_number', r.father_id_number)
        .limit(1);
      if (fams && fams.length > 0) familyId = (fams[0] as any).id;
    }
    if (!familyId) {
      const familyInput: Partial<Family> = {
        family_name: r.last_name,
        father_name: r.father_name || '',
        father_phone: r.father_phone || '',
        father_id_number: r.father_id_number || '',
        father_email: r.father_email || '',
        mother_name: r.mother_name || '',
        mother_phone: r.mother_phone || '',
        mother_id_number: r.mother_id_number || '',
        address: r.address || '',
        city: r.city || '',
        postal_code: r.postal_code || '',
        home_phone: r.home_phone || '',
      };
      const { data: famNew, error: famErr } = await supabase
        .from('families')
        .insert(familyInput)
        .select('id')
        .single();
      if (famErr) throw famErr;
      familyId = (famNew as any).id;
    }

    // Create student in שיעור 0
    const studentInput: Partial<Student> = {
      first_name: r.first_name,
      last_name: r.last_name,
      id_number: r.id_number || '',
      date_of_birth: r.date_of_birth || '',
      phone: r.phone || '',
      email: r.email || '',
      shiur: 'שיעור 0',
      status: 'active',
      admission_date: new Date().toISOString().slice(0, 10),
      notes: r.notes || '',
      family_id: familyId,
      photo_url: r.photo_url || null,
    };
    const { data: studentNew, error: stErr } = await supabase
      .from('students')
      .insert(studentInput)
      .select('id')
      .single();
    if (stErr) throw stErr;
    const studentId = (studentNew as any).id;

    // Copy education history (yeshiva ketana)
    if (r.prev_yeshiva_name) {
      await supabase.from('education_history').insert({
        student_id: studentId,
        institution_name: r.prev_yeshiva_name,
        institution_type: 'yeshiva_ketana',
        city: r.prev_yeshiva_city || '',
        class_completed: r.prev_class_completed || '',
      });
    }
    if (r.prev_talmud_torah) {
      await supabase.from('education_history').insert({
        student_id: studentId,
        institution_name: r.prev_talmud_torah,
        institution_type: 'elementary',
        city: '',
        class_completed: '',
      });
    }

    // Mark registration converted
    await supabase
      .from('registrations')
      .update({
        status: 'converted',
        converted_to_student_id: studentId,
        decided_at: new Date().toISOString(),
      })
      .eq('id', registrationId);

    return { studentId };
  }, []);

  const setStatus = useCallback(async (id: string, status: RegistrationStatus): Promise<void> => {
    const patch: any = { status };
    if (status === 'accepted' || status === 'rejected') {
      patch.decided_at = new Date().toISOString();
    }
    const { error } = await supabase.from('registrations').update(patch).eq('id', id);
    if (error) throw error;
  }, []);

  /** Upload a photo for a registration. Returns the public URL. */
  const uploadPhoto = useCallback(async (id: string, file: File): Promise<string> => {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('registration-photos')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from('registration-photos').getPublicUrl(path);
    const url = pub.publicUrl;
    await supabase.from('registrations').update({ photo_url: url }).eq('id', id);
    return url;
  }, []);

  return { list, create, update, remove, applyTestSlotToYeshiva, acceptAndConvert, setStatus, uploadPhoto };
}
