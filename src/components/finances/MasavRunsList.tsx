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
  cancelled_at: string | null; cancelled_by: string | null;
}
interface Item { id: string; student_id: string | null; student_name: string | null; family_name: string | null; bank: string | null; branch: string | null; account: string | null; amount: number }

const ils = (n: number) => '₪' + Number(n).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const dmy = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const dt = (iso: string) => new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const isOpen = (r: Run) => !r.marked_paid_at && !r.cancelled_at;

async function loadRunItems(runId: string): Promise<Item[]> {
  const all: Item[] = [];
  for (let p = 0; p < 20; p++) {
    const { data } = await supabase.from('masav_run_items').select('*').eq('run_id', runId)
      .order('family_name').order('id').range(p * 1000, p * 1000 + 999);
    if (!data || data.length === 0) break;
    all.push(...(data as Item[]));
    if (data.length < 1000) break;
  }
  return all;
}

/**
 * mode="open"    → banner for the OPEN produced file: "שודר וזוכה" or "ביטול".
 * mode="history" → list of all produced files and what happened to them.
 * A produced file stays open until one of the two is chosen; the page blocks producing
 * a new file meanwhile (onOpenChange).
 */
export function MasavRunsList({ mode, refreshKey, onChanged, onOpenChange }: {
  mode: 'open' | 'history';
  refreshKey: number;
  onChanged?: () => void;
  onOpenChange?: (open: boolean) => void;
}) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, Item[]>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('masav_runs').select('*').eq('kind', 'tuition')
      .order('created_at', { ascending: false }).limit(36);
    const list = (data as Run[]) || [];
    setRuns(list);
    onOpenChange?.(list.some(isOpen));
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load, refreshKey]);

  const toggle = async (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    if (!items[id]) { const its = await loadRunItems(id); setItems((p) => ({ ...p, [id]: its })); }
    setOpenId(id);
  };

  const credited = async (r: Run) => {
    if (!confirm(`לאשר שקובץ שידור ${r.send_counter} (חיוב ${dmy(r.charge_date)}) שודר וזוכה?\n${r.student_count} תלמידים · ${ils(r.total_amount)}\n\nכל התלמידים בקובץ יסומנו כנפרעו — לפי הסכומים שהופקו בקובץ.`)) return;
    setBusy(true);
    try {
      const its = await loadRunItems(r.id);
      const valid = its.filter((i) => i.student_id);
      const res = await markItemsPaid(valid.map((i) => ({ student_id: i.student_id!, amount: Number(i.amount), name: i.student_name || i.family_name || '' })), r.charge_date, r.send_counter);
      if (its.length - valid.length) res.errors.unshift(`${its.length - valid.length} שורות ללא תלמיד (נמחק) — לא סומנו`);
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('masav_runs').update({ marked_paid_at: new Date().toISOString(), marked_paid_by: user?.email || null, mark_result: res }).eq('id', r.id);
      alert(`✓ סומן כשודר וזוכה.\nנוספו ${res.inserted} · עודכנו ${res.updated} · דולגו ${res.skipped}` + (res.errors.length ? `\n\nלבדיקה:\n${res.errors.slice(0, 15).map((e) => '• ' + e).join('\n')}` : ''));
      await load(); onChanged?.();
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally { setBusy(false); }
  };

  const cancel = async (r: Run) => {
    if (!confirm(`לבטל את קובץ שידור ${r.send_counter} (חיוב ${dmy(r.charge_date)})?\n\nהקובץ לא יסומן כנפרע ושום תשלום לא ישתנה. אחרי הביטול אפשר להפיק קובץ חדש.`)) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('masav_runs').update({ cancelled_at: new Date().toISOString(), cancelled_by: user?.email || null }).eq('id', r.id);
    setBusy(false);
    await load(); onChanged?.();
  };

  // ---------- OPEN FILE BANNER ----------
  if (mode === 'open') {
    const open = runs.filter(isOpen);
    if (loading || open.length === 0) return null;
    return (
      <div className="space-y-2">
        {open.map((r) => (
          <div key={r.id} className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-amber-900">
                <div className="font-bold text-base">📄 קובץ מס״ב פתוח — ממתין להחלטה</div>
                <div className="mt-0.5">
                  חיוב <b>{dmy(r.charge_date)}</b> · שידור <b>{r.send_counter}</b> · {r.family_count} משפחות / {r.student_count} תלמידים · <b>{ils(r.total_amount)}</b>
                </div>
                <div className="text-xs text-amber-700 mt-0.5">הופק {dt(r.created_at)}{r.created_by ? ` ע״י ${r.created_by}` : ''}</div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => credited(r)} disabled={busy}>✅ שודר וזוכה</Button>
                <Button variant="secondary" onClick={() => cancel(r)} disabled={busy}>✖ ביטול</Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ---------- HISTORY ----------
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 elevation-1">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <span className="w-1 h-4 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full" />
        <h3 className="font-bold text-slate-800">📜 קבצים שהופקו</h3>
      </div>
      {loading ? (
        <div className="p-6 text-center text-slate-400 text-sm">טוען…</div>
      ) : runs.length === 0 ? (
        <div className="p-6 text-center text-slate-400 text-sm">עדיין לא הופקו קבצים. כל קובץ שתפיק מעכשיו יופיע כאן.</div>
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
                        ? <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800" title={r.marked_paid_by || ''}>✅ שודר וזוכה {dmy(r.marked_paid_at)}</span>
                        : r.cancelled_at
                          ? <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500" title={r.cancelled_by || ''}>✖ בוטל {dmy(r.cancelled_at)}</span>
                          : <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">⏳ פתוח</span>}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <button onClick={() => toggle(r.id)} className="text-xs text-blue-600 hover:underline">{openId === r.id ? 'הסתר' : 'פרטים'}</button>
                    </td>
                  </tr>
                  {openId === r.id && (
                    <tr>
                      <td colSpan={7} className="bg-slate-50 px-3 py-2">
                        {r.mark_result && (
                          <div className="text-xs text-slate-600 mb-2">
                            תוצאת סימון: נוספו {r.mark_result.inserted} · עודכנו {r.mark_result.updated} · דולגו {r.mark_result.skipped}
                            {r.mark_result.errors?.length ? ` · ${r.mark_result.errors.length} לבדיקה: ${r.mark_result.errors.slice(0, 5).join(' | ')}` : ''}
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
