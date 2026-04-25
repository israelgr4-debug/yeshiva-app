'use client';

import { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useGraduates } from '@/hooks/useGraduates';
import { Graduate, Student, Family, EducationHistory } from '@/lib/types';

interface Props {
  graduate: Graduate | null;
  seedStudent?: Student | null;
  students: Student[];
  families: Record<string, Family>;
  educationByStudent: Record<string, EducationHistory[]>;
  onClose: () => void;
  onSaved: () => void;
}

type SectionKey = 'identity' | 'address' | 'contact' | 'marital' | 'parents' | 'spouse_parents';

const MARITAL_OPTIONS = [
  { value: '', label: '—' },
  { value: 'נשוי', label: 'נשוי' },
  { value: 'מאורס', label: 'מאורס' },
  { value: 'רווק', label: 'רווק' },
  { value: 'עזב', label: 'עזב' },
  { value: 'נפטר', label: 'נפטר' },
];

export function GraduateFormDialog({
  graduate, seedStudent, students, families, educationByStudent, onClose, onSaved,
}: Props) {
  const isEdit = !!graduate;
  const { create, update } = useGraduates();
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<SectionKey>('identity');

  const initial: Partial<Graduate> = useMemo(() => {
    if (graduate) return { ...graduate };
    if (seedStudent) {
      const fam = seedStudent.family_id ? families[seedStudent.family_id] : undefined;
      return {
        student_id: seedStudent.id,
        family_id: seedStudent.family_id,
        first_name: seedStudent.first_name,
        last_name: seedStudent.last_name,
        mobile: seedStudent.phone || '',
        email: seedStudent.email || '',
        father_name: fam?.father_name || '',
        mother_name: fam?.mother_name || '',
        is_pending: true,
        pending_reason: 'נוסף ידנית',
      };
    }
    return { is_pending: false };
  }, [graduate, seedStudent, families]);

  const [form, setForm] = useState<Partial<Graduate>>(initial);
  const set = <K extends keyof Graduate>(k: K, v: any) =>
    setForm((p) => ({ ...p, [k]: v }));

  // For "match to original student" - both manual and auto
  const linkedStudent = useMemo(
    () => (form.student_id ? students.find((s) => s.id === form.student_id) : null),
    [form.student_id, students]
  );
  const linkedFamily = linkedStudent?.family_id ? families[linkedStudent.family_id] : null;

  // Education history of linked student
  const linkedEdu = linkedStudent ? educationByStudent[linkedStudent.id] || [] : [];

  // Auto-suggest student match by exact name
  const autoMatch = useMemo(() => {
    if (form.student_id || !form.first_name || !form.last_name) return null;
    const matches = students.filter(
      (s) =>
        (s.first_name || '').trim() === (form.first_name || '').trim() &&
        (s.last_name || '').trim() === (form.last_name || '').trim()
    );
    return matches.length === 1 ? matches[0] : null;
  }, [form.student_id, form.first_name, form.last_name, students]);

  const handleLinkToStudent = (s: Student) => {
    const fam = s.family_id ? families[s.family_id] : undefined;
    set('student_id', s.id);
    set('family_id', s.family_id);
    if (!form.father_name) set('father_name', fam?.father_name || '');
    if (!form.mother_name) set('mother_name', fam?.mother_name || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name?.trim() || !form.last_name?.trim()) {
      return alert('שם פרטי ושם משפחה נדרשים');
    }
    setSaving(true);
    try {
      if (isEdit && graduate) {
        await update(graduate.id, form);
      } else {
        await create(form);
      }
      onSaved();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handlePromoteToFinal = async () => {
    if (!confirm('להעביר מבוגר ממתין לבוגר רשום?')) return;
    setSaving(true);
    try {
      const next = { ...form, is_pending: false };
      if (graduate) await update(graduate.id, next);
      else await create(next);
      onSaved();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const SECTIONS: { id: SectionKey; label: string; icon: string }[] = [
    { id: 'identity', label: 'זהות', icon: '👤' },
    { id: 'address', label: 'כתובת', icon: '📍' },
    { id: 'contact', label: 'צור קשר', icon: '📞' },
    { id: 'marital', label: 'מצב משפחתי', icon: '💍' },
    { id: 'parents', label: 'הורים', icon: '👨‍👩‍👦' },
    { id: 'spouse_parents', label: 'הורי האשה', icon: '👩‍👧' },
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? 'עריכת בוגר' : (form.is_pending ? 'בוגר ממתין' : 'בוגר חדש')}
      className="max-w-5xl"
    >
      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-4 border-b border-slate-100">
        {SECTIONS.map((s) => {
          const active = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm font-semibold transition-all whitespace-nowrap border-b-2 -mb-px ${
                active
                  ? 'border-blue-600 text-blue-700 bg-blue-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Auto-match suggestion */}
      {autoMatch && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 flex items-center justify-between gap-2">
          <p className="text-sm text-emerald-900">
            🔗 נמצא תלמיד תואם: <strong>{autoMatch.last_name} {autoMatch.first_name}</strong>{autoMatch.shiur ? ` · ${autoMatch.shiur}` : ''}
          </p>
          <Button size="sm" variant="secondary" onClick={() => handleLinkToStudent(autoMatch)}>
            קשר אליו
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {section === 'identity' && (
          <Grid cols={2}>
            <Input label="שם פרטי *" value={form.first_name || ''} onChange={(e) => set('first_name', e.target.value)} required />
            <Input label="שם משפחה *" value={form.last_name || ''} onChange={(e) => set('last_name', e.target.value)} required />
            <Input label="מחזור" value={form.machzor_name || ''} onChange={(e) => set('machzor_name', e.target.value)} placeholder="לדוגמא: יז" />
            <Input label="הערה כללית" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} />
          </Grid>
        )}

        {section === 'address' && (
          <>
            <Grid cols={2}>
              <Input label="עיר" value={form.city || ''} onChange={(e) => set('city', e.target.value)} />
              <Input label="שכונה" value={form.neighborhood || ''} onChange={(e) => set('neighborhood', e.target.value)} />
              <Input label="רחוב" value={form.street || ''} onChange={(e) => set('street', e.target.value)} />
              <Input label="מס׳ בנין" value={form.building_number || ''} onChange={(e) => set('building_number', e.target.value)} />
              <Input label="כניסה" value={form.entrance || ''} onChange={(e) => set('entrance', e.target.value)} />
              <Input label="דירה" value={form.apartment || ''} onChange={(e) => set('apartment', e.target.value)} />
            </Grid>
            <Input label="כתובת זמנית" value={form.temp_address || ''} onChange={(e) => set('temp_address', e.target.value)} />
          </>
        )}

        {section === 'contact' && (
          <Grid cols={2}>
            <Input label="טלפון נייד" type="tel" value={form.mobile || ''} onChange={(e) => set('mobile', e.target.value)} />
            <Input label="טלפון בית" type="tel" value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} />
            <Input label="דוא״ל" type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
          </Grid>
        )}

        {section === 'marital' && (
          <Grid cols={2}>
            <Select
              label="סטטוס"
              options={MARITAL_OPTIONS}
              value={form.marital_status || ''}
              onChange={(e) => set('marital_status', e.target.value as any)}
            />
            <Input label="זמן חתונה" value={form.marriage_date_text || ''} onChange={(e) => set('marriage_date_text', e.target.value)} placeholder="לדוגמא: סיון ס&quot;ב" />
            <Input label="נשוי ל-" value={form.spouse_name || ''} onChange={(e) => set('spouse_name', e.target.value)} />
            <Input label="תאריך עזיבה" type="date" value={form.left_date || ''} onChange={(e) => set('left_date', e.target.value)} />
          </Grid>
        )}

        {section === 'spouse_parents' && (
          <Grid cols={2}>
            <Input label="שם אבי האשה" value={form.spouse_father_name || ''} onChange={(e) => set('spouse_father_name', e.target.value)} />
            <Input label="טלפון אבי האשה" type="tel" value={form.spouse_father_phone || ''} onChange={(e) => set('spouse_father_phone', e.target.value)} />
            <Input label="שם אם האשה" value={form.spouse_mother_name || ''} onChange={(e) => set('spouse_mother_name', e.target.value)} />
            <Input label="טלפון אם האשה" type="tel" value={form.spouse_mother_phone || ''} onChange={(e) => set('spouse_mother_phone', e.target.value)} />
            <Input label="עיר אבי האשה" value={form.spouse_father_city || ''} onChange={(e) => set('spouse_father_city', e.target.value)} />
          </Grid>
        )}

        {section === 'parents' && (
          <>
            {linkedStudent ? (
              <>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
                  🔗 מקושר לתלמיד: <strong>{linkedStudent.last_name} {linkedStudent.first_name}</strong>
                  {linkedStudent.shiur && ` · ${linkedStudent.shiur}`}
                </div>
                <Grid cols={2}>
                  <Input label="שם האב" value={form.father_name || ''} onChange={(e) => set('father_name', e.target.value)} />
                  <Input label="שם האם" value={form.mother_name || ''} onChange={(e) => set('mother_name', e.target.value)} />
                </Grid>
                {linkedFamily && (
                  <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                    <h4 className="font-semibold text-slate-700 mb-2">פרטי המשפחה במערכת</h4>
                    <p>📞 אב: {linkedFamily.father_phone || '—'}</p>
                    <p>📞 אם: {linkedFamily.mother_phone || '—'}</p>
                    <p>📍 {[linkedFamily.address, linkedFamily.city].filter(Boolean).join(', ') || '—'}</p>
                  </div>
                )}
                {linkedEdu.length > 0 && (
                  <div className="bg-amber-50/60 rounded-lg p-3 text-sm space-y-1">
                    <h4 className="font-semibold text-slate-700 mb-2">לימודים קודמים</h4>
                    {linkedEdu.map((e) => (
                      <p key={e.id} className="text-xs">
                        <span className="font-semibold">
                          {e.institution_type === 'elementary' ? 'ת"ת' : e.institution_type === 'yeshiva_ketana' ? 'ישיבה קטנה' : 'אחר'}:
                        </span>{' '}
                        {e.institution_name} {e.city && `· ${e.city}`}
                      </p>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500 italic">לא מקושר לתלמיד במערכת</p>
                <Grid cols={2}>
                  <Input label="שם האב" value={form.father_name || ''} onChange={(e) => set('father_name', e.target.value)} />
                  <Input label="שם האם" value={form.mother_name || ''} onChange={(e) => set('mother_name', e.target.value)} />
                </Grid>
              </>
            )}
          </>
        )}

        <div className="flex gap-2 justify-between pt-3 border-t border-slate-100">
          <div className="flex gap-2">
            {form.is_pending && (
              <Button type="button" variant="secondary" onClick={handlePromoteToFinal} disabled={saving}>
                ✓ העבר לבוגרים רשמיים
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>ביטול</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'שומר...' : isEdit ? 'שמור' : 'הוסף בוגר'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function Grid({ children }: { cols: 2; children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
}
