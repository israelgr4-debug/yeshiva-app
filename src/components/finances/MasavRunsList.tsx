'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { markItemsPaid, MarkResult } from '@/lib/masav-mark';

interface Run {
  id: string; charge_date: string; send_counter: number;
  family_count: number; student_count: number; total_amount: number;
  created_by: string | null; created_at: string;
  marked_paid_at: string | null; marked_paid_by: string | null; mark_result: MarkResult | null;
}
interface Item { id: string; student_id: string | null; student_name: string | null; family_name: string | null; bank: string | null; branch: string | null; account: string | null; amount: number }

const ils = (n: number) => '₪' + Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const dt = (iso: string) => new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

// Every מס"ב file the system produced — mark a run as paid by exactly what was in it.
export function MasavRunsList({ refreshKey }: { refreshKey: number }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, Item[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('masav_runs').select('*').eq('kind', 'tuition')
      .order('charge_date', { ascending: false }).order('created_at', { ascending: false }).limit(36);
    setRuns((data as Run[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const loadItems = async (runId: string): Promise<Item[]> => {
    if (items[runId]) return items[runId];
    const all: Item[] = [];
    for (let p = 0; p < 20; p++) {
      const { data } = await supabase.from('masav_run_items').select('*').eq('run_id', runId)
        .order('family_name').range(p * 1000, p * 1000 + 999);
      if (!data || data.length === 0) break;
      all.push(...(data as Item[]));
      if (data.length < 1000) break;
    }
    setItems((prev) => ({ ...prev, [runId]: all }));
    return all;
  };

  const toggle = async (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    await loadItems(id); setOpenId(id);
  };

  const markPaid = async (r: Run) => {
    if (!confirm(`לסמן את שידור ${r.send_counter} (${dmy(r.charge_date)}) כנפרע?\n${r.student_count} תלמידים · ${ils(r.total_amount)}\n\nהסימון לפי מה שהופק בקובץ, לא לפי נתוני היום.\n*** רק אחרי שהבנק זיכה ***`)) return;
    setBusyId(r.id);
    try {
      const its = await loadItems(r.id);
      const valid = its.filter((i) => i.student_id);
      const res = await markItemsPaid(valid.map((i) => ({ student_id: i.student_id!, amount: Number(i.amount), name: i.student_name || i.family_name || '' })), r.charge_date, r.send_counter);
      const missing = its.length - valid.length;
      if (missing) res.errors.unshift(`${missing} שורות ללא תלמיד (נמחק מהמערכת) — לא סומנו`);
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('masav_runs').update({ marked_paid_at: new Date().toISOString(), marked_paid_by: user?.email || null, mark_result: res }).eq('id', r.id);
      alert(`✓ נוספו ${res.inserted} · עודכנו (צפי→נפרע) ${res.updated} · דולגו ${res.skipped}` + (res.errors.length ? `\n\nלבדיקה:\n${res.errors.slice(0, 15).map((e) => '• ' + e).join('\n')}` : ''));
      await load();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally { setBusyId(null); }
  };

  const remove = async (r: Run) => {
    if (!confirm(`למחוק את רישום שידור ${r.send_counter} (${dmy(r.charge_date)})?\nלמשל אם הקובץ הופק אך לא נשלח לבנק. (לא משנה שום תשלום)`)) return;
    await supabase.from('masav_runs').delete().eq('id', r.id);
    await load();
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 elevation-1">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <span className="w-1 h-4 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full" />
        <h3 className="font-bold text-slate-800">📜 שידורים שהופקו</h3>
        <span className="text-xs text-slate-400">כל קובץ שהורד נרשם — סמן כנפרע לפי מה שהיה בו</span>
      </div>
      {loading ? (
        <div className="p-6 text-center text-slate-400 text-sm">טוען…</div>
      ) : runs.length === 0 ? (
        <div className="p-6 text-center text-slate-400 text-sm">עדיין לא נרשמו שידורים. כל קובץ שתוריד מעכשיו יופיע כאן.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <th className="text-start px-3 py-2">תאריך חיוב</th>
                <th className="text-start px-3 py-2">שידור</th>
                <th className="text-start px-3 py-2">משפחות / תלמידים</th>
                <th className="text-start px-3 py-2">סה״כ</th>
                <th className="text-start px-3 py-2">הופק</th>
                <th className="text-start px-3 py-2">סטטוס</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <Fragment key={r.id}>
                  <tr className="border-b border-slate-50 hover:bg-blue-50/40">
                    <td className="px-3 py-2 font-medium">{dmy(r.charge_date)}</td>
                    <td className="px-3 py-2">{r.send_counter}</td>
                    <td className="px-3 py-2 text-slate-600">{r.family_count} / {r.student_count}</td>
                    <td className="px-3 py-2 font-semibold">{ils(r.total_amount)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{dt(r.created_at)}{r.created_by ? ` · ${r.created_by}` : ''}</td>
                    <td className="px-3 py-2">
                      {r.marked_paid_at
                        ? <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800" title={r.marked_paid_by || ''}>✅ סומן נפרע {dmy(r.marked_paid_at)}</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">⏳ לא סומן</span>}
                    </td>
                    <td className="px-3 py-2 text-end whitespace-nowrap">
                      <button onClick={() => toggle(r.id)} className="text-xs text-blue-600 hover:underline me-3">{openId === r.id ? 'הסתר' : 'פרטים'}</button>
                      {!r.marked_paid_at && (
                        <>
                          <Button size="sm" onClick={() => markPaid(r)} disabled={busyId === r.id}>{busyId === r.id ? 'מסמן…' : '✅ סמן כנפרע'}</Button>
                          <button onClick={() => remove(r)} className="text-xs text-slate-400 hover:text-red-600 ms-2" title="מחק רישום (קובץ שלא נשלח)">🗑️</button>
                        </>
                      )}
                    </td>
                  </tr>
                  {openId === r.id && (
                    <tr>
                      <td colSpan={7} className="bg-slate-50 px-3 py-2">
                        {r.mark_result && (
                          <div className="text-xs text-slate-600 mb-2">
                            תוצאת סימון: נוספו {r.mark_result.inserted} · עודכנו {r.mark_result.updated} · דולגו {r.mark_result.skipped}
                            {r.mark_result.errors?.length ? ` · ${r.mark_result.errors.length} לבדיקה` : ''}
                          </div>
                        )}
                        <div className="max-h-64 overflow-y-auto">
                          <table className="w-full text-xs">
                            <tbody>
                              {(items[r.id] || []).map((i) => (
                                <tr key={i.id} className="border-t border-slate-100">
                                  <td className="px-2 py-1">{i.student_id ? <Link href={`/students/${i.student_id}`} className="text-blue-700 hover:underline">{i.student_name}</Link> : <span className="text-slate-400">{i.student_name} (נמחק)</span>}</td>
                                  <td className="px-2 py-1 text-slate-500">{i.family_name}</td>
                                  <td className="px-2 py-1 text-slate-500" dir="ltr">{i.bank}-{i.branch}-{i.account}</td>
                                  <td className="px-2 py-1 font-semibold">{ils(i.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
