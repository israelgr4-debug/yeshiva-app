'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/supabase-paginate';

interface NedarimSub {
  id: string;
  nedarim_keva_id: string;
  family_id: string;
  amount_per_charge: number;
  last_4_digits: string | null;
  scheduled_day: number | null;
  client_name: string | null;
  student_ids: string[] | null;
  status: string;
}

interface Student {
  id: string;
  family_id: string;
  first_name: string;
  last_name: string;
  status: string;
}

interface Family {
  id: string;
  family_name: string;
  father_name: string | null;
}

interface Tuition {
  student_id: string;
  payment_method: string;
  monthly_amount: number;
  nedarim_subscription_id: string | null;
}

export default function TuitionSplitPage() {
  const [subs, setSubs] = useState<NedarimSub[]>([]);
  const [studentsByFamily, setStudentsByFamily] = useState<Record<string, Student[]>>({});
  const [familiesById, setFamiliesById] = useState<Record<string, Family>>({});
  const [tuitionByStudent, setTuitionByStudent] = useState<Record<string, Tuition>>({});
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, Record<string, number>>>({});

  const load = async () => {
    setLoading(true);
    const [s, st, f, t] = await Promise.all([
      fetchAll<NedarimSub>(
        'nedarim_subscriptions',
        'id, nedarim_keva_id, family_id, amount_per_charge, last_4_digits, scheduled_day, client_name, student_ids, status',
        (q) => q.eq('status', 'active').not('family_id', 'is', null)
      ),
      fetchAll<Student>('students', 'id, family_id, first_name, last_name, status', (q) =>
        q.eq('status', 'active')
      ),
      fetchAll<Family>('families', 'id, family_name, father_name'),
      fetchAll<Tuition>('student_tuition', 'student_id, payment_method, monthly_amount, nedarim_subscription_id'),
    ]);

    // Only multi-student subs
    const multiStudent = s.filter((sub) => (sub.student_ids?.length || 0) > 1);
    setSubs(multiStudent);

    const stMap: Record<string, Student[]> = {};
    for (const stu of st) {
      if (!stMap[stu.family_id]) stMap[stu.family_id] = [];
      stMap[stu.family_id].push(stu);
    }
    setStudentsByFamily(stMap);

    const fmap: Record<string, Family> = {};
    for (const fam of f) fmap[fam.id] = fam;
    setFamiliesById(fmap);

    const tmap: Record<string, Tuition> = {};
    for (const tui of t) tmap[tui.student_id] = tui;
    setTuitionByStudent(tmap);

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const setAmount = (subId: string, studentId: string, amount: number) => {
    setDrafts((prev) => ({
      ...prev,
      [subId]: { ...(prev[subId] || {}), [studentId]: amount },
    }));
  };

  const getAmount = (subId: string, studentId: string): number => {
    const draft = drafts[subId]?.[studentId];
    if (draft !== undefined) return draft;
    const t = tuitionByStudent[studentId];
    if (t?.nedarim_subscription_id === subId) return Number(t.monthly_amount);
    return 0;
  };

  const applyEvenSplit = (sub: NedarimSub) => {
    const students = sub.student_ids || [];
    if (students.length === 0) return;
    const per = Math.round((Number(sub.amount_per_charge) / students.length) * 100) / 100;
    const next: Record<string, number> = {};
    for (const sid of students) next[sid] = per;
    setDrafts((prev) => ({ ...prev, [sub.id]: next }));
  };

  const save = async (sub: NedarimSub) => {
    setSavingIds((prev) => ({ ...prev, [sub.id]: true }));
    try {
      const students = sub.student_ids || [];
      // Build amount_breakdown {studentId: amount}
      const breakdown: Record<string, number> = {};
      for (const sid of students) {
        breakdown[sid] = getAmount(sub.id, sid);
      }

      // Update each student's tuition
      for (const sid of students) {
        const amt = breakdown[sid];
        const existing = tuitionByStudent[sid];
        const payload = {
          student_id: sid,
          payment_method: 'credit_nedarim' as const,
          monthly_amount: amt,
          nedarim_subscription_id: sub.id,
          notes: existing?.payment_method === 'credit_nedarim' && existing.nedarim_subscription_id === sub.id
            ? null
            : '[ידני] שויך מתוך עורך חלוקה',
          active: true,
        };
        await supabase.from('student_tuition').upsert(payload, { onConflict: 'student_id' });
      }

      // Store the breakdown on the subscription too
      await supabase
        .from('nedarim_subscriptions')
        .update({ amount_breakdown: breakdown })
        .eq('id', sub.id);

      // Clear draft
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[sub.id];
        return next;
      });
      await load();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setSavingIds((prev) => ({ ...prev, [sub.id]: false }));
    }
  };

  // Filter by mismatched subs (total != sub.amount)
  const [showOnlyMismatched, setShowOnlyMismatched] = useState(false);

  const filteredSubs = useMemo(() => {
    if (!showOnlyMismatched) return subs;
    return subs.filter((sub) => {
      const total = (sub.student_ids || []).reduce((sum, sid) => sum + getAmount(sub.id, sid), 0);
      return Math.abs(total - Number(sub.amount_per_charge)) > 0.01;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subs, drafts, tuitionByStudent, showOnlyMismatched]);

  const formatCurrency = (n: number) => `₪${Number(n).toLocaleString('he-IL')}`;

  return (
    <>
      <Header title="חלוקת הוראות קבע רב-תלמידיות" subtitle="כמה משלם כל תלמיד בתוך הוק משפחתית" />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/finances"
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            ← כספים
          </Link>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          ℹ️ מוצגות הוראות קבע פעילות מנדרים שמכסות 2+ תלמידים. עדכן את החלוקה כך שסך
          הסכומים של הילדים יהיה שווה לסכום ההוק.
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showOnlyMismatched}
              onChange={(e) => setShowOnlyMismatched(e.target.checked)}
            />
            הצג רק הוקים שהחלוקה לא מסתדרת
          </label>
          <span className="text-sm text-gray-600">
            {filteredSubs.length.toLocaleString('he-IL')} הוראות
          </span>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">טוען...</div>
        ) : filteredSubs.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-center py-8 text-gray-500">
                {subs.length === 0
                  ? 'אין הוראות קבע רב-תלמידיות.'
                  : 'כל ההוראות מאוזנות. 🎉'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredSubs.map((sub) => {
              const fam = familiesById[sub.family_id];
              const familyStudents = studentsByFamily[sub.family_id] || [];
              const subStudentIds = sub.student_ids || [];
              // Show only the students listed in student_ids, but allow adding more if they're family members
              const subStudents = familyStudents.filter((s) => subStudentIds.includes(s.id));
              const extra = familyStudents.filter((s) => !subStudentIds.includes(s.id));

              const total = subStudentIds.reduce((sum, sid) => sum + getAmount(sub.id, sid), 0);
              const mismatch = Math.abs(total - Number(sub.amount_per_charge)) > 0.01;
              const isDirty = !!drafts[sub.id];

              return (
                <Card key={sub.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start flex-wrap gap-2">
                      <div>
                        <h4 className="font-bold">
                          {fam?.family_name} / {fam?.father_name || sub.client_name}
                        </h4>
                        <p className="text-sm text-gray-500">
                          הוק {sub.nedarim_keva_id} ·{' '}
                          {sub.last_4_digits && `****${sub.last_4_digits} · `}
                          יום {sub.scheduled_day}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="text-sm text-gray-500">סכום הוק חודשי</p>
                        <p className="text-xl font-bold text-green-700">
                          {formatCurrency(Number(sub.amount_per_charge))}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {subStudents.length === 0 ? (
                        <p className="text-sm text-amber-700">
                          ⚠️ אין תלמידים פעילים ברשימת ההוק - בדוק שיוך במסך נדרים.
                        </p>
                      ) : (
                        subStudents.map((stu) => {
                          const amount = getAmount(sub.id, stu.id);
                          const currentTuit = tuitionByStudent[stu.id];
                          const conflict =
                            currentTuit &&
                            currentTuit.payment_method === 'credit_nedarim' &&
                            currentTuit.nedarim_subscription_id !== sub.id;
                          return (
                            <div
                              key={stu.id}
                              className="flex items-center gap-3 p-2 border border-gray-200 rounded"
                            >
                              <Link
                                href={`/students/${stu.id}`}
                                className="flex-1 min-w-0 text-blue-600 hover:underline font-medium"
                              >
                                {stu.first_name} {stu.last_name}
                              </Link>
                              <input
                                type="number"
                                min={0}
                                step={10}
                                value={amount || ''}
                                onChange={(e) => setAmount(sub.id, stu.id, Number(e.target.value) || 0)}
                                className="w-28 px-2 py-1 border border-gray-300 rounded text-sm text-end"
                                placeholder="₪"
                              />
                              {conflict && (
                                <span className="text-xs text-amber-600" title="כרגע משויך להוק אחרת">
                                  ⚠
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}

                      {extra.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-500 cursor-pointer">
                            + {extra.length} תלמידים נוספים במשפחה לא בהוק הזו
                          </summary>
                          <div className="space-y-1 mt-2 ps-4">
                            {extra.map((stu) => (
                              <div key={stu.id} className="text-xs text-gray-500 flex justify-between">
                                <span>
                                  {stu.first_name} {stu.last_name}
                                </span>
                                {tuitionByStudent[stu.id] && (
                                  <span>
                                    {tuitionByStudent[stu.id].payment_method} ·{' '}
                                    {formatCurrency(tuitionByStudent[stu.id].monthly_amount)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>

                    {/* Footer: total + actions */}
                    <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-200 flex-wrap gap-2">
                      <div>
                        <span className="text-sm text-gray-500">סה"כ תלמידים: </span>
                        <span
                          className={`font-bold text-lg ${
                            mismatch ? 'text-red-700' : 'text-green-700'
                          }`}
                        >
                          {formatCurrency(total)}
                        </span>
                        {mismatch && (
                          <span className="text-sm text-red-700 ms-2">
                            (חסר/עודף: {formatCurrency(Number(sub.amount_per_charge) - total)})
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => applyEvenSplit(sub)}>
                          ➗ חלק שווה
                        </Button>
                        {isDirty && (
                          <Button size="sm" onClick={() => save(sub)} disabled={savingIds[sub.id]}>
                            {savingIds[sub.id] ? 'שומר...' : '✓ שמור'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
