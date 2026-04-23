'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';

interface Subscription {
  id: string;
  nedarim_keva_id: string;
  kind: 'credit' | 'bank';
  status: string;
  family_id: string | null;
  client_zeout: string | null;
  client_name: string | null;
  client_phone: string | null;
  amount_per_charge: number;
  groupe: string | null;
}

interface Family {
  id: string;
  family_name: string;
  father_name: string | null;
  mother_name: string | null;
  father_id_number: string | null;
  phone: string | null;
}

interface Student {
  id: string;
  family_id: string;
  first_name: string;
  last_name: string;
  status: string;
}

// Simple Hebrew name similarity using normalized tokens
function nameScore(a: string, b: string): number {
  const na = (a || '').trim().split(/\s+/).filter(Boolean);
  const nb = (b || '').trim().split(/\s+/).filter(Boolean);
  if (!na.length || !nb.length) return 0;
  const setA = new Set(na);
  const setB = new Set(nb);
  let overlap = 0;
  for (const t of setA) if (setB.has(t)) overlap++;
  return overlap / Math.max(setA.size, setB.size);
}

export default function NedarimMatchPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedFamily, setSelectedFamily] = useState<Record<string, string>>({});
  const [selectedStudents, setSelectedStudents] = useState<Record<string, string[]>>({});

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: f }, { data: st }] = await Promise.all([
      supabase
        .from('nedarim_subscriptions')
        .select('*')
        .is('family_id', null)
        .neq('status', 'deleted')
        .order('amount_per_charge', { ascending: false }),
      supabase.from('families').select('id, family_name, father_name, mother_name, father_id_number, phone'),
      supabase.from('students').select('id, family_id, first_name, last_name, status').eq('status', 'active'),
    ]);
    setSubs((s || []) as Subscription[]);
    setFamilies((f || []) as Family[]);
    setStudents((st || []) as Student[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Build suggestions map: for each subscription, rank families
  const suggestions = useMemo(() => {
    const byFatherId = new Map<string, Family>();
    for (const f of families) {
      if (f.father_id_number) byFatherId.set(f.father_id_number.trim(), f);
    }
    const result: Record<string, Array<{ family: Family; score: number; reason: string }>> = {};
    for (const s of subs) {
      const candidates: Array<{ family: Family; score: number; reason: string }> = [];

      // Exact match by father's ID number
      if (s.client_zeout) {
        const hit = byFatherId.get(s.client_zeout.trim());
        if (hit) candidates.push({ family: hit, score: 1.0, reason: 'התאמת ת.ז אב' });
      }

      // Name matching
      if (s.client_name) {
        for (const f of families) {
          const fatherScore = nameScore(s.client_name, f.father_name || '');
          const familyScore = nameScore(s.client_name, f.family_name || '');
          const best = Math.max(fatherScore, familyScore);
          if (best >= 0.4 && !candidates.find((c) => c.family.id === f.id)) {
            candidates.push({
              family: f,
              score: best * 0.8, // lower confidence than zeout match
              reason: fatherScore > familyScore ? 'התאמת שם אב' : 'התאמת שם משפחה',
            });
          }
        }
      }

      candidates.sort((a, b) => b.score - a.score);
      result[s.id] = candidates.slice(0, 5);
    }
    return result;
  }, [subs, families]);

  const handleMatch = async (sub: Subscription) => {
    const familyId = selectedFamily[sub.id];
    if (!familyId) {
      alert('בחר משפחה');
      return;
    }
    const studentIds = selectedStudents[sub.id] || [];
    setSavingId(sub.id);
    try {
      const { error } = await supabase
        .from('nedarim_subscriptions')
        .update({
          family_id: familyId,
          student_ids: studentIds.length ? studentIds : null,
        })
        .eq('id', sub.id);
      if (error) throw error;
      // Remove from list
      setSubs((prev) => prev.filter((s) => s.id !== sub.id));
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setSavingId(null);
    }
  };

  const handleSkip = (subId: string) => {
    // Just filter it out of view for this session
    setSubs((prev) => prev.filter((s) => s.id !== subId));
  };

  const familyById = useMemo(() => {
    const m = new Map<string, Family>();
    for (const f of families) m.set(f.id, f);
    return m;
  }, [families]);

  const studentsByFamily = useMemo(() => {
    const m = new Map<string, Student[]>();
    for (const s of students) {
      if (!m.has(s.family_id)) m.set(s.family_id, []);
      m.get(s.family_id)!.push(s);
    }
    return m;
  }, [students]);

  const formatCurrency = (n: number) => `₪${Number(n).toLocaleString('he-IL')}`;

  return (
    <>
      <Header title="שיוך נדרים למשפחות" subtitle="עבור על כל הוראת קבע ושייך למשפחה" />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/finances/nedarim"
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            ← חזרה לרשימה
          </Link>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          ℹ️ ההצעות מתבססות על ת.ז של האב ועל התאמת שמות. בחר משפחה מההצעות או מרשימה מלאה, סמן תלמידים רלוונטיים ושייך.
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">טוען...</div>
        ) : subs.length === 0 ? (
          <Card>
            <CardContent>
              <div className="text-center py-8">
                <p className="text-xl font-bold text-green-700">🎉 כל ההוראות משויכות!</p>
                <p className="text-sm text-gray-600 mt-2">אין עוד הוראות שדורשות שיוך</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              {subs.length.toLocaleString('he-IL')} הוראות ממתינות לשיוך
            </p>

            {subs.slice(0, 30).map((sub) => {
              const sugg = suggestions[sub.id] || [];
              const chosenFamilyId = selectedFamily[sub.id];
              const chosenFamily = chosenFamilyId ? familyById.get(chosenFamilyId) : null;
              const familyStudents = chosenFamilyId
                ? studentsByFamily.get(chosenFamilyId) || []
                : [];
              const chosenStudents = selectedStudents[sub.id] || [];

              return (
                <Card key={sub.id}>
                  <CardContent>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Subscription info */}
                      <div className="border-s-4 border-blue-500 ps-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                            {sub.kind === 'credit' ? '💳 אשראי' : '🏦 בנקאי'}
                          </span>
                          <span className="text-xs text-gray-500">
                            מזהה: {sub.nedarim_keva_id}
                          </span>
                        </div>
                        <p className="font-bold text-lg">{sub.client_name || '—'}</p>
                        {sub.client_zeout && (
                          <p className="text-sm text-gray-600">ת.ז: {sub.client_zeout}</p>
                        )}
                        {sub.client_phone && (
                          <p className="text-sm text-gray-600">טלפון: {sub.client_phone}</p>
                        )}
                        <p className="text-lg font-bold text-green-700 mt-2">
                          {formatCurrency(sub.amount_per_charge)} / חודש
                        </p>
                        {sub.groupe && (
                          <p className="text-xs text-gray-500 mt-1">קטגוריה: {sub.groupe}</p>
                        )}
                      </div>

                      {/* Match UI */}
                      <div className="space-y-3">
                        <label className="block text-sm font-medium">
                          שיוך למשפחה
                        </label>

                        {/* Suggestions */}
                        {sugg.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs text-gray-500">הצעות:</p>
                            {sugg.map((c) => (
                              <button
                                key={c.family.id}
                                type="button"
                                onClick={() =>
                                  setSelectedFamily((prev) => ({ ...prev, [sub.id]: c.family.id }))
                                }
                                className={`w-full text-start p-2 rounded border text-sm transition-colors ${
                                  chosenFamilyId === c.family.id
                                    ? 'bg-blue-50 border-blue-400'
                                    : 'bg-white border-gray-200 hover:bg-gray-50'
                                }`}
                              >
                                <div className="flex justify-between items-center">
                                  <span className="font-medium">
                                    {c.family.family_name} / {c.family.father_name}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {c.reason} · {Math.round(c.score * 100)}%
                                  </span>
                                </div>
                                {c.family.father_id_number && (
                                  <div className="text-xs text-gray-500">
                                    ת.ז: {c.family.father_id_number}
                                  </div>
                                )}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Full dropdown fallback */}
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            או חפש מכל המשפחות:
                          </label>
                          <select
                            value={chosenFamilyId || ''}
                            onChange={(e) =>
                              setSelectedFamily((prev) => ({ ...prev, [sub.id]: e.target.value }))
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="">-- בחר משפחה --</option>
                            {families
                              .slice()
                              .sort((a, b) => a.family_name.localeCompare(b.family_name, 'he'))
                              .map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.family_name}
                                  {f.father_name ? ` · ${f.father_name}` : ''}
                                  {f.father_id_number ? ` · ${f.father_id_number}` : ''}
                                </option>
                              ))}
                          </select>
                        </div>

                        {/* Students checkboxes */}
                        {chosenFamily && familyStudents.length > 0 && (
                          <div>
                            <label className="block text-xs text-gray-500 mb-1">
                              תלמידים שההוק הזו מממנת (לא חובה):
                            </label>
                            <div className="space-y-1">
                              {familyStudents.map((st) => (
                                <label
                                  key={st.id}
                                  className="flex items-center gap-2 text-sm cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={chosenStudents.includes(st.id)}
                                    onChange={(e) => {
                                      setSelectedStudents((prev) => {
                                        const cur = prev[sub.id] || [];
                                        return {
                                          ...prev,
                                          [sub.id]: e.target.checked
                                            ? [...cur, st.id]
                                            : cur.filter((id) => id !== st.id),
                                        };
                                      });
                                    }}
                                  />
                                  <span>
                                    {st.first_name} {st.last_name}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                          <Button
                            onClick={() => handleMatch(sub)}
                            disabled={!chosenFamilyId || savingId === sub.id}
                            className="flex-1"
                          >
                            {savingId === sub.id ? 'שומר...' : '✓ אשר שיוך'}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => handleSkip(sub.id)}
                            disabled={savingId === sub.id}
                          >
                            דלג לעת עתה
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {subs.length > 30 && (
              <p className="text-center text-sm text-gray-500">
                מוצגות 30 הראשונות מתוך {subs.length}. השלם אותן ורענן.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
