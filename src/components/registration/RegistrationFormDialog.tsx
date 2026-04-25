'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useRegistrations } from '@/hooks/useRegistrations';
import { Registration } from '@/lib/types';

interface Props {
  registration: Registration | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RegistrationFormDialog({ registration, onClose, onSaved }: Props) {
  const isEdit = !!registration;
  const { create, update } = useRegistrations();
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<Partial<Registration>>(
    registration || {
      first_name: '',
      last_name: '',
      id_number: '',
      date_of_birth: '',
      phone: '',
      email: '',
      father_name: '',
      father_phone: '',
      father_id_number: '',
      mother_name: '',
      mother_phone: '',
      address: '',
      city: '',
      home_phone: '',
      prev_yeshiva_name: '',
      prev_yeshiva_city: '',
      prev_talmud_torah: '',
      prev_class_completed: '',
      notes: '',
    }
  );

  const set = <K extends keyof Registration>(key: K, value: any) =>
    setForm((p) => ({ ...p, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name?.trim() || !form.last_name?.trim()) {
      alert('שם פרטי ושם משפחה נדרשים');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && registration) {
        await update(registration.id, form);
      } else {
        await create(form);
      }
      onSaved();
    } catch (e: any) {
      alert('שגיאה בשמירה: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? 'עריכת רישום' : 'רישום חדש'}
      className="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Student section */}
        <Section title="פרטי התלמיד" tint="from-sky-500 to-cyan-600">
          <Grid cols={2}>
            <Input
              label="שם פרטי *"
              value={form.first_name || ''}
              onChange={(e) => set('first_name', e.target.value)}
              required
            />
            <Input
              label="שם משפחה *"
              value={form.last_name || ''}
              onChange={(e) => set('last_name', e.target.value)}
              required
            />
            <Input
              label="תעודת זהות"
              value={form.id_number || ''}
              onChange={(e) => set('id_number', e.target.value)}
            />
            <Input
              label="תאריך לידה"
              type="date"
              value={form.date_of_birth || ''}
              onChange={(e) => set('date_of_birth', e.target.value)}
            />
            <Input
              label="טלפון תלמיד"
              value={form.phone || ''}
              onChange={(e) => set('phone', e.target.value)}
            />
            <Input
              label="דוא״ל"
              type="email"
              value={form.email || ''}
              onChange={(e) => set('email', e.target.value)}
            />
          </Grid>
        </Section>

        {/* Parents */}
        <Section title="פרטי הורים" tint="from-violet-500 to-purple-600">
          <Grid cols={2}>
            <Input
              label="שם האב"
              value={form.father_name || ''}
              onChange={(e) => set('father_name', e.target.value)}
            />
            <Input
              label="טלפון אב"
              value={form.father_phone || ''}
              onChange={(e) => set('father_phone', e.target.value)}
            />
            <Input
              label="ת״ז אב"
              value={form.father_id_number || ''}
              onChange={(e) => set('father_id_number', e.target.value)}
            />
            <Input
              label="דוא״ל אב"
              type="email"
              value={form.father_email || ''}
              onChange={(e) => set('father_email', e.target.value)}
            />
            <Input
              label="שם האם"
              value={form.mother_name || ''}
              onChange={(e) => set('mother_name', e.target.value)}
            />
            <Input
              label="טלפון אם"
              value={form.mother_phone || ''}
              onChange={(e) => set('mother_phone', e.target.value)}
            />
          </Grid>
          <Grid cols={3}>
            <Input
              label="כתובת"
              value={form.address || ''}
              onChange={(e) => set('address', e.target.value)}
            />
            <Input
              label="עיר"
              value={form.city || ''}
              onChange={(e) => set('city', e.target.value)}
            />
            <Input
              label="טלפון בית"
              value={form.home_phone || ''}
              onChange={(e) => set('home_phone', e.target.value)}
            />
          </Grid>
        </Section>

        {/* Previous education */}
        <Section title="לימודים קודמים" tint="from-amber-500 to-orange-600">
          <Grid cols={2}>
            <Input
              label="ישיבה קטנה"
              value={form.prev_yeshiva_name || ''}
              onChange={(e) => set('prev_yeshiva_name', e.target.value)}
              placeholder="לדוגמה: ישיבת תפארת ירושלים"
            />
            <Input
              label="עיר"
              value={form.prev_yeshiva_city || ''}
              onChange={(e) => set('prev_yeshiva_city', e.target.value)}
            />
            <Input
              label="תלמוד תורה"
              value={form.prev_talmud_torah || ''}
              onChange={(e) => set('prev_talmud_torah', e.target.value)}
            />
            <Input
              label="כיתה אחרונה שסיים"
              value={form.prev_class_completed || ''}
              onChange={(e) => set('prev_class_completed', e.target.value)}
            />
          </Grid>
        </Section>

        {/* Notes */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">הערות</label>
          <textarea
            value={form.notes || ''}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            className="w-full px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30 rounded-xl text-slate-900 transition-all"
          />
        </div>

        <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
          <Button type="button" variant="secondary" onClick={onClose}>
            ביטול
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'שומר...' : isEdit ? 'שמור שינויים' : 'הוסף רישום'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Section({
  title,
  tint,
  children,
}: {
  title: string;
  tint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-bold text-slate-800 mb-2.5 flex items-center gap-2">
        <span className={`w-1 h-4 bg-gradient-to-b ${tint} rounded-full`} />
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Grid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${cols === 3 ? 'lg:grid-cols-3' : ''} gap-3`}>
      {children}
    </div>
  );
}
