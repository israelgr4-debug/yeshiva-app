'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';

interface LogEntry {
  id: string;
  graduate_id: string;
  submitted_at: string;
  before_snapshot: Record<string, any>;
  after_snapshot: Record<string, any>;
  changed_fields: string[];
  notes_to_admin: string | null;
  ip_address: string | null;
  admin_reviewed_at: string | null;
  admin_note: string | null;
}

interface GradLite {
  id: string;
  first_name: string;
  last_name: string;
  machzor_name: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  street: 'רחוב', building_number: 'מס׳ בית', apartment: 'דירה', entrance: 'כניסה',
  neighborhood: 'שכונה', city: 'עיר', temp_address: 'כתובת זמנית',
  mobile: 'נייד', phone: 'טלפון', email: 'אימייל',
  marital_status: 'מצב משפחתי', spouse_name: 'שם הרעיה',
  marriage_date_text: 'תאריך נישואין',
  spouse_father_name: 'שם החותן', spouse_father_phone: 'נייד חותן',
  spouse_mother_name: 'שם החותנת', spouse_mother_phone: 'נייד חותנת',
  spouse_father_city: 'עיר המחותנים',
};

export function GraduateUpdatesLogTab({ graduateNames }: { graduateNames: Record<string, GradLite> }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unreviewed' | 'with-notes'>('unreviewed');
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('graduate_update_log')
      .select('*')
      .order('submitted_at', { ascending: false })
      .limit(500);
    setEntries(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const markReviewed = async (id: string, note?: string) => {
    await supabase
      .from('graduate_update_log')
      .update({
        admin_reviewed_at: new Date().toISOString(),
        admin_note: note || null,
      })
      .eq('id', id);
    load();
  };

  const filtered = entries.filter((e) => {
    if (filter === 'unreviewed') return !e.admin_reviewed_at;
    if (filter === 'with-notes') return !!e.notes_to_admin;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <FilterPill active={filter === 'unreviewed'} onClick={() => setFilter('unreviewed')}>
          ⏳ ממתינים לבדיקה ({entries.filter((e) => !e.admin_reviewed_at).length})
        </FilterPill>
        <FilterPill active={filter === 'with-notes'} onClick={() => setFilter('with-notes')}>
          💬 עם הערה ({entries.filter((e) => e.notes_to_admin).length})
        </FilterPill>
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>
          הכל ({entries.length})
        </FilterPill>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl py-12 text-center text-slate-500">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl py-12 text-center text-slate-500">
          🎉 אין רשומות תואמות
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => {
            const g = graduateNames[e.graduate_id];
            const isReviewed = !!e.admin_reviewed_at;
            return (
              <div
                key={e.id}
                className={`bg-white rounded-2xl border p-4 ${
                  isReviewed ? 'border-slate-200' : 'border-amber-300 shadow-sm'
                }`}
              >
                <div className="flex justify-between items-start mb-2 flex-wrap gap-2">
                  <div>
                    <a
                      href={`/graduates?id=${e.graduate_id}`}
                      className="font-semibold text-slate-900 hover:text-blue-700"
                    >
                      {g ? `${g.first_name} ${g.last_name}` : '(בוגר לא ידוע)'}
                    </a>
                    {g?.machzor_name && (
                      <span className="text-xs text-slate-500 mr-2">מחזור {g.machzor_name}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 tabular-nums">
                    {new Date(e.submitted_at).toLocaleString('he-IL')}
                    {e.ip_address && <span className="ms-2">· {e.ip_address}</span>}
                  </div>
                </div>

                {e.notes_to_admin && (
                  <div className="bg-amber-50 border-r-4 border-amber-400 p-3 rounded-lg mb-3 text-sm">
                    <div className="text-xs text-amber-700 font-semibold mb-1">💬 הערת הבוגר:</div>
                    <div className="text-slate-800 whitespace-pre-wrap">{e.notes_to_admin}</div>
                  </div>
                )}

                {e.changed_fields.length === 0 ? (
                  <div className="text-sm text-slate-500 italic">
                    לא שונו פרטים (אישור שהכל תקין)
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="text-xs text-slate-500 mb-1">{e.changed_fields.length} שינויים:</div>
                    {e.changed_fields.map((f) => (
                      <div key={f} className="text-sm flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-semibold text-slate-700 min-w-[110px]">
                          {FIELD_LABELS[f] || f}:
                        </span>
                        <span className="line-through text-slate-400">
                          {String(e.before_snapshot?.[f] ?? '') || '—'}
                        </span>
                        <span className="text-slate-400">→</span>
                        <span className="font-semibold text-emerald-700">
                          {String(e.after_snapshot?.[f] ?? '') || '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-slate-100">
                  {isReviewed ? (
                    <div className="text-xs text-emerald-600">
                      ✓ נבדק ב-{new Date(e.admin_reviewed_at!).toLocaleString('he-IL')}
                      {e.admin_note && <div className="mt-1 text-slate-600 italic">הערה: {e.admin_note}</div>}
                    </div>
                  ) : (
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="הערה אישית (אופציונלי)"
                        value={noteDraft[e.id] || ''}
                        onChange={(ev) => setNoteDraft((d) => ({ ...d, [e.id]: ev.target.value }))}
                        className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200"
                      />
                      <Button size="sm" onClick={() => markReviewed(e.id, noteDraft[e.id])}>
                        ✓ סמן כנבדק
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterPill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${
        active
          ? 'bg-gradient-to-l from-emerald-500 to-teal-600 text-white shadow-md'
          : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
      }`}
    >
      {children}
    </button>
  );
}
