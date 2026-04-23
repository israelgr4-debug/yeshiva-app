'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { FamilyPicker } from '@/components/finances/FamilyPicker';
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

function tokens(s: string | null | undefined): string[] {
  return (s || '').trim().split(/\s+/).filter(Boolean);
}

function hasToken(clientTokens: string[], t: string | null | undefined): boolean {
  if (!t) return false;
  return clientTokens.includes(t.trim());
}

export default function NedarimMatchPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);
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
      // Load ALL students (not just active) so we can mark active-vs-inactive families
      supabase.from('students').select('id, family_id, first_name, last_name, status'),
    ]);
    setSubs((s || []) as Subscription[]);
    setFamilies((f || []) as Family[]);
    setStudents((st || []) as Student[]);
    setLoading(false);
  };

  // Active families: those with at least one active student
  const activeFamilyIds = useMemo(() => {
    const set = new Set<string>();
    for (const st of students) if (st.status === 'active') set.add(st.family_id);
    return set;
  }, [students]);

  useEffect(() => {
    load();
  }, []);

  // Build suggestions map with new priority:
  // 1. ת.ז (strongest)
  // 2. שם משפחה + שם אב (both as tokens in client_name) - strongest name match
  // 3. שם משפחה בלבד
  // 4. שם פרטי (אב) בלבד - weakest
  // Active families get a boost.
  const suggestions = useMemo(() => {
    const byFatherId = new Map<string, Family>();
    for (const f of families) {
      if (f.father_id_number) {
        byFatherId.set(f.father_id_number.trim().replace(/\D/g, ''), f);
      }
    }
    const result: Record<string, Array<{ family: Family; score: number; reason: string; isActive: boolean }>> = {};
    for (const s of subs) {
      const candidates = new Map<string, { family: Family; score: number; reason: string; isActive: boolean }>();
      const clientTokens = tokens(s.client_name);

      const addCandidate = (family: Family, baseScore: number, reason: string) => {
        const isActive = activeFamilyIds.has(family.id);
        const score = isActive ? baseScore : baseScore * 0.7; // penalize inactive
        const existing = candidates.get(family.id);
        if (!existing || score > existing.score) {
          candidates.set(family.id, { family, score, reason, isActive });
        }
      };

      // 1. Exact ID match (strongest)
      if (s.client_zeout) {
        const normalized = s.client_zeout.replace(/\D/g, '').replace(/^0+/, '');
        const hit = byFatherId.get(s.client_zeout.trim()) || byFatherId.get(normalized);
        if (hit) addCandidate(hit, 1.0, 'ת.ז אב');
      }

      // 2-4. Name matching
      if (clientTokens.length > 0) {
        for (const f of families) {
          const familyNameHit = hasToken(clientTokens, f.family_name);
          const fatherNameHit = hasToken(clientTokens, f.father_name);

          if (familyNameHit && fatherNameHit) {
            addCandidate(f, 0.95, 'משפחה + אב');
          } else if (familyNameHit) {
            addCandidate(f, 0.6, 'שם משפחה');
          } else if (fatherNameHit) {
            addCandidate(f, 0.35, 'שם פרטי (אב)');
          }
        }
      }

      const sorted = Array.from(candidates.values()).sort((a, b) => {
        // Active first, then by score
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return b.score - a.score;
      });
      result[s.id] = sorted.slice(0, 6);
    }
    return result;
  }, [subs, families, activeFamilyIds]);

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

  const handleAutoMatch = async () => {
    if (!confirm(
      'הסקריפט ישייך אוטומטית רק הוקים שיש להם ת.ז אב זהה למשפחה אחת בדיוק.\n\n' +
        'הוקים עם שם זהה בלבד (ללא ת.ז) יישארו להצעה ידנית.\n\n' +
        'להמשיך?'
    )) return;
    setAutoMatching(true);
    try {
      const { data, error } = await supabase.rpc('auto_match_nedarim_by_zeout');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      alert(
        `✓ שיוך אוטומטי הושלם\n\n` +
          `לפי ת.ז אב: ${row?.matched_by_father ?? row?.matched_count ?? 0}\n` +
          `לפי ת.ז אם: ${row?.matched_by_mother ?? 0}\n` +
          `לפי שם מלא (משפחה + אב): ${row?.matched_by_name ?? 0}\n` +
          `---\n` +
          `ללא ת.ז בנדרים: ${row?.missing_zeout_count ?? 0}\n` +
          `ת.ז לא תואמת לאף משפחה: ${row?.no_match_count ?? 0}\n` +
          `ת.ז תואמת ליותר ממשפחה אחת: ${row?.ambiguous_count ?? 0}\n\n` +
          `הנשארים - שייך ידנית לפי ההצעות.`
      );
      await load();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setAutoMatching(false);
    }
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
        <div className="flex gap-2 flex-wrap items-center justify-between">
          <Link
            href="/finances/nedarim"
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            ← חזרה לרשימה
          </Link>
          <Button onClick={handleAutoMatch} disabled={autoMatching || loading}>
            {autoMatching ? 'משייך...' : '⚡ שיוך אוטומטי לפי ת.ז'}
          </Button>
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
                ? (studentsByFamily.get(chosenFamilyId) || []).filter((s) => s.status === 'active')
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
                                } ${!c.isActive ? 'opacity-60' : ''}`}
                              >
                                <div className="flex justify-between items-center gap-2">
                                  <span className="font-medium flex items-center gap-1">
                                    {c.isActive ? (
                                      <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="פעילה" />
                                    ) : (
                                      <span className="inline-block w-2 h-2 rounded-full bg-gray-300" title="לא פעילה" />
                                    )}
                                    {c.family.family_name} / {c.family.father_name}
                                  </span>
                                  <span className="text-xs text-gray-500 whitespace-nowrap">
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

                        {/* Full searchable picker fallback */}
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            או חפש מכל המשפחות (פעילות ראשונות):
                          </label>
                          <FamilyPicker
                            families={families}
                            activeFamilyIds={activeFamilyIds}
                            value={chosenFamilyId || null}
                            onChange={(id) =>
                              setSelectedFamily((prev) => ({ ...prev, [sub.id]: id }))
                            }
                          />
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
