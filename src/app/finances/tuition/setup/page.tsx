'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/supabase-paginate';

type PaymentMethod = 'bank_ho' | 'credit_nedarim' | 'office' | 'exempt' | 'none';

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  family_id: string | null;
  shiur: string | null;
  status: string;
}

type StatusFilter = 'active' | 'all_enrolled' | 'all';

interface Family {
  id: string;
  family_name: string;
  father_name: string | null;
  father_phone: string | null;
  bank_number: number | null;
  bank_branch: string | null;
  bank_account: string | null;
}

interface TuitionRow {
  id?: string;
  student_id: string;
  payment_method: PaymentMethod;
  monthly_amount: number;
  bank_day: number | null;
  nedarim_subscription_id: string | null;
  notes: string | null;
}

interface NedarimSub {
  id: string;
  family_id: string | null;
  amount_per_charge: number;
  last_4_digits: string | null;
  scheduled_day: number | null;
  student_ids: string[] | null;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_ho: 'הו"ק בנק',
  credit_nedarim: 'אשראי',
  office: 'משרד',
  exempt: 'פטור',
  none: 'לא מוגדר',
};

const METHOD_COLORS: Record<PaymentMethod, string> = {
  bank_ho: 'bg-blue-100 text-blue-800',
  credit_nedarim: 'bg-purple-100 text-purple-800',
  office: 'bg-green-100 text-green-800',
  exempt: 'bg-gray-100 text-gray-700',
  none: 'bg-red-100 text-red-800',
};

export default function TuitionSetupPage() {
  const [tuition, setTuition] = useState<Record<string, TuitionRow>>({});
  const [students, setStudents] = useState<Student[]>([]);
  const [familiesById, setFamiliesById] = useState<Record<string, Family>>({});
  const [nedarimByFamily, setNedarimByFamily] = useState<Record<string, NedarimSub[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PaymentMethod | 'all'>('none');
  const [shiurFilter, setShiurFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    const [st, fam, tui, ns] = await Promise.all([
      fetchAll<Student>('students', 'id, first_name, last_name, family_id, shiur, status'),
      fetchAll<Family>('families', 'id, family_name, father_name, father_phone, bank_number, bank_branch, bank_account'),
      fetchAll<TuitionRow>('student_tuition', '*'),
      fetchAll<NedarimSub>(
        'nedarim_subscriptions',
        'id, family_id, amount_per_charge, last_4_digits, scheduled_day, student_ids',
        (q) => q.eq('status', 'active').not('family_id', 'is', null)
      ),
    ]);

    setStudents(st);
    const fmap: Record<string, Family> = {};
    for (const f of fam) fmap[f.id] = f;
    setFamiliesById(fmap);

    const tmap: Record<string, TuitionRow> = {};
    for (const t of tui) tmap[t.student_id] = t;
    // Ensure every student has a row in state
    for (const s of st) {
      if (!tmap[s.id]) {
        tmap[s.id] = {
          student_id: s.id,
          payment_method: 'none',
          monthly_amount: 0,
          bank_day: 20,
          nedarim_subscription_id: null,
          notes: null,
        };
      }
    }
    setTuition(tmap);

    const nmap: Record<string, NedarimSub[]> = {};
    for (const n of ns) {
      if (!n.family_id) continue;
      if (!nmap[n.family_id]) nmap[n.family_id] = [];
      nmap[n.family_id].push(n);
    }
    setNedarimByFamily(nmap);

    setDirty({});
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const updateRow = (studentId: string, patch: Partial<TuitionRow>) => {
    setTuition((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
    setDirty((prev) => ({ ...prev, [studentId]: true }));
  };

  const saveRow = async (studentId: string) => {
    const row = tuition[studentId];
    if (!row) return;
    setSavingIds((prev) => ({ ...prev, [studentId]: true }));
    try {
      const payload = {
        student_id: studentId,
        payment_method: row.payment_method,
        monthly_amount: Number(row.monthly_amount) || 0,
        nedarim_subscription_id:
          row.payment_method === 'credit_nedarim' ? row.nedarim_subscription_id : null,
        bank_day: row.payment_method === 'bank_ho' ? Number(row.bank_day) || 20 : null,
        notes: row.notes,
        active: true,
      };

      // Check if a row already exists
      const { data: existing } = await supabase
        .from('student_tuition')
        .select('id')
        .eq('student_id', studentId)
        .maybeSingle();

      let err: any = null;
      if (existing) {
        const { error } = await supabase
          .from('student_tuition')
          .update(payload)
          .eq('student_id', studentId);
        err = error;
      } else {
        const { error } = await supabase.from('student_tuition').insert(payload);
        err = error;
      }
      if (err) throw err;

      // Update local state with the saved row (also clear any stale id reference)
      setTuition((prev) => ({
        ...prev,
        [studentId]: { ...row, id: existing?.id || prev[studentId]?.id },
      }));
      setDirty((prev) => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
    } catch (e: any) {
      console.error('saveRow error', e);
      alert('שגיאה בשמירה: ' + (e?.message || e?.details || JSON.stringify(e)));
    } finally {
      setSavingIds((prev) => ({ ...prev, [studentId]: false }));
    }
  };

  const shiurOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) if (s.shiur) set.add(s.shiur);
    return Array.from(set).sort();
  }, [students]);

  const filtered = useMemo(() => {
    return students.filter((s) => {
      // Status filter (default: active only - looking forward, no need to show students who left)
      if (statusFilter === 'active' && s.status !== 'active') return false;
      if (statusFilter === 'all_enrolled' && s.status !== 'active' && s.status !== 'chizuk') return false;

      const t = tuition[s.id];
      if (filter !== 'all' && t?.payment_method !== filter) return false;
      if (shiurFilter && s.shiur !== shiurFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const fam = s.family_id ? familiesById[s.family_id] : null;
        if (
          !`${s.first_name} ${s.last_name}`.toLowerCase().includes(q) &&
          !(fam?.family_name || '').toLowerCase().includes(q) &&
          !(fam?.father_name || '').toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [students, tuition, filter, shiurFilter, search, familiesById]);

  // Counts per method
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: students.length, bank_ho: 0, credit_nedarim: 0, office: 0, exempt: 0, none: 0 };
    for (const s of students) {
      const t = tuition[s.id];
      if (!t) continue;
      c[t.payment_method]++;
    }
    return c;
  }, [students, tuition]);

  return (
    <>
      <Header title="הגדרת שכר לימוד" subtitle="סדר את אופן התשלום של כל תלמיד" />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/finances"
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            ← כספים
          </Link>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 flex-wrap">
          {(['none', 'bank_ho', 'credit_nedarim', 'office', 'exempt', 'all'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setFilter(m)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                filter === m
                  ? 'bg-blue-600 text-white'
                  : m === 'none' && counts.none > 0
                  ? 'bg-red-100 text-red-800 hover:bg-red-200'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {m === 'all' ? 'הכל' : METHOD_LABELS[m]} ({counts[m] || 0})
            </button>
          ))}
        </div>

        {/* Search / shiur / status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="חיפוש לפי שם תלמיד / משפחה / אב"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          />
          <select
            value={shiurFilter}
            onChange={(e) => setShiurFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">כל השיעורים</option>
            {shiurOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="active">רק פעילים (ברירת מחדל)</option>
            <option value="all_enrolled">פעילים + חיזוק</option>
            <option value="all">הכל (כולל שעזבו)</option>
          </select>
        </div>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-bold">תלמידים ({filtered.length.toLocaleString('he-IL')})</h3>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">טוען...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-gray-500">אין תוצאות</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-start">תלמיד</th>
                      <th className="px-2 py-2 text-start">משפחה</th>
                      <th className="px-2 py-2 text-start">שיטה</th>
                      <th className="px-2 py-2 text-start">פרטים</th>
                      <th className="px-2 py-2 text-start">סכום</th>
                      <th className="px-2 py-2 text-start"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 200).map((s) => {
                      const t = tuition[s.id];
                      const fam = s.family_id ? familiesById[s.family_id] : null;
                      const familySubs = s.family_id ? nedarimByFamily[s.family_id] || [] : [];
                      const isDirty = dirty[s.id];

                      return (
                        <tr key={s.id} className="border-t border-gray-200 hover:bg-gray-50">
                          <td className="px-2 py-2">
                            <Link href={`/students/${s.id}`} className="text-blue-600 hover:underline">
                              {s.first_name} {s.last_name}
                            </Link>
                            {s.shiur && <div className="text-xs text-gray-500">{s.shiur}</div>}
                          </td>
                          <td className="px-2 py-2">
                            {fam ? (
                              <Link
                                href={`/families/${fam.id}`}
                                className="text-blue-600 hover:underline text-xs"
                              >
                                {fam.family_name}
                                {fam.father_name && ` · ${fam.father_name}`}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <select
                              value={t?.payment_method || 'none'}
                              onChange={(e) =>
                                updateRow(s.id, {
                                  payment_method: e.target.value as PaymentMethod,
                                  nedarim_subscription_id: null,
                                })
                              }
                              className={`text-xs px-2 py-1 rounded ${METHOD_COLORS[t?.payment_method || 'none']}`}
                            >
                              {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                                <option key={m} value={m}>
                                  {METHOD_LABELS[m]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            {t?.payment_method === 'credit_nedarim' && (
                              <select
                                value={t.nedarim_subscription_id || ''}
                                onChange={(e) =>
                                  updateRow(s.id, { nedarim_subscription_id: e.target.value || null })
                                }
                                className="text-xs px-2 py-1 border border-gray-300 rounded w-full"
                              >
                                <option value="">-- בחר הוק --</option>
                                {familySubs.map((n) => (
                                  <option key={n.id} value={n.id}>
                                    ₪{Number(n.amount_per_charge).toLocaleString('he-IL')}
                                    {n.last_4_digits && ` · ****${n.last_4_digits}`}
                                    {n.student_ids && n.student_ids.length > 1 && ` · ${n.student_ids.length} ילדים`}
                                  </option>
                                ))}
                              </select>
                            )}
                            {t?.payment_method === 'bank_ho' && (
                              <input
                                type="number"
                                min={1}
                                max={31}
                                placeholder="יום"
                                value={t.bank_day || 20}
                                onChange={(e) => updateRow(s.id, { bank_day: Number(e.target.value) })}
                                className="text-xs px-2 py-1 border border-gray-300 rounded w-16"
                              />
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {(t?.payment_method !== 'exempt' && t?.payment_method !== 'none') && (
                              <input
                                type="number"
                                min={0}
                                step={10}
                                placeholder="₪"
                                value={t?.monthly_amount || ''}
                                onChange={(e) =>
                                  updateRow(s.id, { monthly_amount: Number(e.target.value) || 0 })
                                }
                                className="text-xs px-2 py-1 border border-gray-300 rounded w-24"
                              />
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {isDirty && (
                              <Button
                                size="sm"
                                onClick={() => saveRow(s.id)}
                                disabled={savingIds[s.id]}
                              >
                                {savingIds[s.id] ? '...' : 'שמור'}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filtered.length > 200 && (
                  <p className="text-center text-xs text-gray-500 mt-3">
                    מוצגים 200 ראשונים מתוך {filtered.length}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
