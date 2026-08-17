'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { PageGuard } from '@/components/ui/PageGuard';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SearchInput } from '@/components/ui/SearchInput';
import { useChargeAdjustments, MonthlyRow, PayMethod } from '@/hooks/useChargeAdjustments';
import { ChargeAdjustment } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { validateBankAccountFull } from '@/lib/israeli-validators';

const METHOD_LABELS: Record<PayMethod, string> = {
  bank_ho: 'הו"ק בנק',
  credit_nedarim: 'אשראי',
  office: 'משרד',
  exempt: 'פטור',
  none: 'לא מוגדר',
};
const METHOD_COLORS: Record<PayMethod, string> = {
  bank_ho: 'bg-blue-100 text-blue-800',
  credit_nedarim: 'bg-purple-100 text-purple-800',
  office: 'bg-green-100 text-green-800',
  exempt: 'bg-gray-100 text-gray-700',
  none: 'bg-red-100 text-red-800',
};
const COLLECTION_META: Record<string, { label: string; cls: string }> = {
  paid: { label: '✅ נגבה', cls: 'bg-emerald-100 text-emerald-800' },
  pending: { label: '⏳ ממתין', cls: 'bg-slate-100 text-slate-600' },
  returned: { label: '↩️ חזר', cls: 'bg-red-100 text-red-800' },
  none: { label: '—', cls: 'text-slate-300' },
};
const SHIUR_ORDER = ['שיעור א','שיעור ב','שיעור ג','שיעור ד','שיעור ה','שיעור ו','שיעור ז','שיעור ח','שיעור ט','שיעור י','שיעור יא','קיבוץ'];

function ils(n: number) { return '₪' + Math.round(n).toLocaleString('he-IL'); }
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function monthOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const d = new Date();
  for (let i = -3; i <= 6; i++) {
    const dd = new Date(d.getFullYear(), d.getMonth() + i, 1);
    out.push({ value: `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}`,
               label: `${String(dd.getMonth() + 1).padStart(2, '0')}/${dd.getFullYear()}` });
  }
  return out;
}

export default function MonthlyCollectionPage() {
  const { loadMonth, addAdjustment, cancelAdjustment, createGroupAction } = useChargeAdjustments();
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [shiurFilter, setShiurFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState<PayMethod | ''>('');
  const [sortKey, setSortKey] = useState<'name' | 'shiur' | 'method' | 'base' | 'final'>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const [adjFor, setAdjFor] = useState<MonthlyRow | null>(null);
  const [setupFor, setSetupFor] = useState<MonthlyRow | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setRows(await loadMonth(month));
    setLoading(false);
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload(); }, [reload]);

  const shiurOptions = useMemo(() => {
    const present = new Set(rows.map((r) => r.shiur || ''));
    return SHIUR_ORDER.filter((s) => present.has(s));
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows;
    if (methodFilter) list = list.filter((r) => r.method === methodFilter);
    if (shiurFilter) list = list.filter((r) => (r.shiur || '') === shiurFilter);
    if (search.trim()) {
      const q = search.trim();
      list = list.filter((r) => `${r.last_name} ${r.first_name}`.includes(q));
    }
    const dir = sortAsc ? 1 : -1;
    const sorted = [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name': return dir * `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'he');
        case 'shiur': return dir * (SHIUR_ORDER.indexOf(a.shiur || '') - SHIUR_ORDER.indexOf(b.shiur || ''));
        case 'method': return dir * a.method.localeCompare(b.method);
        case 'base': return dir * (a.base - b.base);
        case 'final': return dir * (a.final - b.final);
      }
    });
    return sorted;
  }, [rows, methodFilter, shiurFilter, search, sortKey, sortAsc]);

  const totals = useMemo(() => {
    const t = { base: 0, adj: 0, final: 0, changed: 0 };
    for (const r of filtered) {
      t.base += r.base;
      t.adj += r.final - r.base;
      t.final += r.final;
      if (r.final !== r.base) t.changed += 1;
    }
    return t;
  }, [filtered]);

  const undefinedCount = useMemo(() => rows.filter((r) => r.method === 'none').length, [rows]);

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortAsc((v) => !v);
    else { setSortKey(k); setSortAsc(true); }
  };

  // REQ7/8 credit dispatch: fire a one-time Nedarim charge (TashlumBodedNew) for one
  // addition. Real money — always behind an explicit per-row confirm.
  const chargeInNedarim = async (adj: ChargeAdjustment, studentName: string) => {
    if (!confirm(`לחייב ${ils(adj.amount)} בנדרים לתלמיד ${studentName}?\n\nזהו חיוב אמיתי בכרטיס האשראי השמור בהוראת הקבע.`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch('/api/nedarim/charge-adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ adjustment_id: adj.id }),
      });
      const json = await res.json();
      if (json.ok) alert('✓ חויב בנדרים בהצלחה');
      else alert('✗ שגיאה: ' + (json.error || 'לא ידוע'));
    } catch (e: any) {
      alert('✗ שגיאת תקשורת: ' + (e?.message || e));
    }
    reload();
  };

  return (
    <PageGuard requires="write">
      <LeaversReminder />
      <Header title="הרצת גבייה חודשית" subtitle="בסיס ± שינויים = סכום סופי לכל תלמיד" />
      <PendingHkRestoreBanner />
      <div className="p-4 md:p-8 space-y-5">
        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-36">
            <Select label="חודש" value={month} onChange={(e) => setMonth(e.target.value)} options={monthOptions()} />
          </div>
          <div className="w-40">
            <Select label="שיעור" value={shiurFilter} onChange={(e) => setShiurFilter(e.target.value)}
              options={[{ value: '', label: 'כל השיעורים' }, ...shiurOptions.map((s) => ({ value: s, label: s }))]} />
          </div>
          <div className="w-40">
            <Select label="אופן תשלום" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value as PayMethod | '')}
              options={[{ value: '', label: 'הכל' }, ...(Object.keys(METHOD_LABELS) as PayMethod[]).map((m) => ({ value: m, label: METHOD_LABELS[m] }))]} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <SearchInput value={search} onSearch={setSearch} placeholder="חיפוש תלמיד..." />
          </div>
          <Button variant="primary" onClick={() => setGroupOpen(true)}>👥 פעולת קבוצה</Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="תלמידים" value={filtered.length.toLocaleString('he-IL')} />
          <button onClick={() => setMethodFilter((m) => (m === 'none' ? '' : 'none'))} className="text-start">
            <StatCard label={methodFilter === 'none' ? 'לא מוגדר (מסונן)' : 'לא מוגדר'} value={undefinedCount.toLocaleString('he-IL')} danger={undefinedCount > 0} />
          </button>
          <StatCard label="בסיס" value={ils(totals.base)} />
          <StatCard label="שינויים החודש" value={(totals.adj >= 0 ? '+' : '') + ils(totals.adj)} accent={totals.adj !== 0} />
          <StatCard label="סה״כ לגבייה" value={ils(totals.final)} strong />
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {loading ? (
              <div className="p-10 text-center text-slate-400">טוען…</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                    <Th onClick={() => toggleSort('name')} active={sortKey === 'name'} asc={sortAsc}>תלמיד</Th>
                    <Th onClick={() => toggleSort('shiur')} active={sortKey === 'shiur'} asc={sortAsc}>שיעור</Th>
                    <Th onClick={() => toggleSort('method')} active={sortKey === 'method'} asc={sortAsc}>אופן</Th>
                    <Th onClick={() => toggleSort('base')} active={sortKey === 'base'} asc={sortAsc}>בסיס</Th>
                    <th className="text-start px-3 py-2 font-semibold">שינויים החודש</th>
                    <Th onClick={() => toggleSort('final')} active={sortKey === 'final'} asc={sortAsc}>סופי</Th>
                    <th className="text-start px-3 py-2 font-semibold">סטטוס</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.student_id} className="border-b border-slate-50 hover:bg-blue-50/40">
                      <td className="px-3 py-2">
                        <Link href={`/students/${r.student_id}`} className="text-blue-700 hover:underline">
                          {r.last_name} {r.first_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{(r.shiur || '').replace('שיעור ', '') || '—'}</td>
                      <td className="px-3 py-2">
                        {r.method === 'none' ? (
                          <button onClick={() => setSetupFor(r)}
                            className="px-2.5 py-1 rounded-full text-xs bg-red-600 text-white hover:bg-red-700 font-medium">
                            ⚙ הגדר תשלום
                          </button>
                        ) : (
                          <button onClick={() => setSetupFor(r)} title="שנה אופן תשלום"
                            className={`px-2 py-0.5 rounded-full text-xs ${METHOD_COLORS[r.method]} hover:ring-2 hover:ring-slate-300`}>
                            {METHOD_LABELS[r.method]}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{ils(r.base)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {r.adjustments.filter((a) => a.status === 'active').map((a) => (
                            <span key={a.id}
                              className={`group inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${a.kind === 'override' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}
                              title={a.reason || ''}>
                              {a.kind === 'override' ? `→${ils(a.amount)}` : `${a.amount >= 0 ? '+' : ''}${ils(a.amount)}`}
                              {a.reason ? ` · ${a.reason}` : ''}
                              {r.method === 'credit_nedarim' && a.kind === 'addition' && a.amount > 0 && (
                                a.nedarim_result === 'success'
                                  ? <span className="text-emerald-700" title="חויב בנדרים">✓</span>
                                  : <button onClick={() => chargeInNedarim(a, `${r.last_name} ${r.first_name}`)}
                                      className="text-purple-700 font-medium hover:underline"
                                      title={a.nedarim_result === 'error' ? `נכשל: ${a.nedarim_error || ''} — נסה שוב` : 'חייב בנדרים עכשיו'}>
                                      {a.nedarim_result === 'error' ? '↻נדרים' : '₪נדרים'}
                                    </button>
                              )}
                              <button onClick={async () => { await cancelAdjustment(a.id); reload(); }}
                                className="opacity-50 hover:opacity-100" aria-label="בטל">×</button>
                            </span>
                          ))}
                          {r.adjustments.filter((a) => a.status === 'active').length === 0 && <span className="text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className={`px-3 py-2 font-semibold ${r.final !== r.base ? 'text-emerald-700' : 'text-slate-800'}`}>{ils(r.final)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${COLLECTION_META[r.collection].cls}`}>{COLLECTION_META[r.collection].label}</span>
                      </td>
                      <td className="px-3 py-2 text-end">
                        <button onClick={() => setAdjFor(r)} className="text-blue-600 hover:bg-blue-50 rounded-lg w-7 h-7" title="הוסף שינוי">＋</button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="p-10 text-center text-slate-400">אין תלמידים תואמים</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {adjFor && (
        <AdjustmentDialog row={adjFor} month={month} onClose={() => setAdjFor(null)}
          onSave={async (kind, amount, reason) => {
            await addAdjustment({ student_id: adjFor.student_id, month, kind, amount, reason, dispatch_method: adjFor.method });
            setAdjFor(null); reload();
          }} />
      )}
      {setupFor && (
        <SetupDialog row={setupFor} onClose={() => setSetupFor(null)} onSaved={() => { setSetupFor(null); reload(); }} />
      )}
      {groupOpen && (
        <GroupActionDialog month={month} shiurOptions={SHIUR_ORDER} onClose={() => setGroupOpen(false)}
          onSave={async (p) => {
            const res = await createGroupAction({ month, ...p });
            if (!res.ok) { alert(res.error || 'שגיאה'); return; }
            let msg = `בוצע ל-${res.count} תלמידים`;
            if (res.credit) {
              msg += `\n\nאשראי (נדרים):\n• ${res.credit.applied} הו״ק שונו זמנית (יוחזרו אוטומטית אחרי החיוב)`;
              if (res.credit.skipped) msg += `\n• ${res.credit.skipped} דולגו (הו״ק משותפת) — לטיפול ידני: ${res.credit.skippedNames.join(', ')}`;
              if (res.credit.failed) msg += `\n• ${res.credit.failed} נכשלו`;
            }
            alert(msg);
            setGroupOpen(false); reload();
          }} />
      )}
    </PageGuard>
  );
}

// Safety net: credit HKs temporarily changed by a group override, awaiting restore.
function PendingHkRestoreBanner() {
  const [rows, setRows] = useState<{ id: string; amount: number; base: number; name: string }[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('charge_adjustments')
        .select('id, amount, hk_base_amount, students!inner(first_name,last_name)')
        .not('hk_override_applied_at', 'is', null)
        .is('hk_override_restored_at', null);
      setRows((data || []).map((r: any) => ({
        id: r.id, amount: Number(r.amount), base: Number(r.hk_base_amount),
        name: `${r.students.last_name} ${r.students.first_name}`,
      })));
    })();
  }, []);
  if (rows.length === 0) return null;
  return (
    <div className="mx-4 md:mx-8 mt-4 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-4 py-3 text-sm">
      🔄 <b>{rows.length}</b> הו״ק אשראי שונו זמנית וממתינות להחזרה לסכום הקבוע (אוטומטית אחרי יום החיוב):
      <span className="text-amber-700"> {rows.slice(0, 8).map((r) => `${r.name} (${ils(r.amount)}→${ils(r.base)})`).join(' · ')}{rows.length > 8 ? ' …' : ''}</span>
    </div>
  );
}

// Reminder popup: students who left / went to chizuk but are still being charged
// (their status changed outside the leave dialog, so tuition wasn't stopped).
function LeaversReminder() {
  const [count, setCount] = useState(0);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    (async () => {
      if (typeof window !== 'undefined' && sessionStorage.getItem('leavers_reminder_dismissed')) return;
      const { count: c } = await supabase
        .from('student_tuition')
        .select('student_id, students!inner(status)', { count: 'exact', head: true })
        .eq('active', true)
        .in('payment_method', ['bank_ho', 'credit_nedarim'])
        .in('students.status', ['inactive', 'graduated', 'chizuk']);
      if (c && c > 0) { setCount(c); setDismissed(false); }
    })();
  }, []);
  if (dismissed || count === 0) return null;
  const close = () => { try { sessionStorage.setItem('leavers_reminder_dismissed', '1'); } catch {} setDismissed(true); };
  return (
    <Modal isOpen onClose={close} title="⚠️ תזכורת — תלמידים שעזבו">
      <div className="space-y-4">
        <div className="text-sm text-slate-700">
          יש <b>{count.toLocaleString('he-IL')}</b> תלמידים שעזבו / בחיזוק ועדיין <b>מחויבים בשכר לימוד</b> (הו״ק פעילה).
          כדאי לבדוק ולעצור את מי שלא אמור להיות מחויב.
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={close}>אחר כך</Button>
          <Link href="/finances/inactive-payers"><Button variant="primary" onClick={close}>לטיפול</Button></Link>
        </div>
      </div>
    </Modal>
  );
}

function StatCard({ label, value, strong, accent, danger }: { label: string; value: string; strong?: boolean; accent?: boolean; danger?: boolean }) {
  return (
    <div className={`bg-white rounded-2xl border elevation-1 px-4 py-3 ${danger ? 'border-red-300' : 'border-slate-200/70'}`}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 ${strong ? 'text-xl font-bold text-slate-900' : danger ? 'text-lg font-bold text-red-700' : accent ? 'text-lg font-semibold text-emerald-700' : 'text-lg font-semibold text-slate-800'}`}>{value}</div>
    </div>
  );
}

function Th({ children, onClick, active, asc }: { children: React.ReactNode; onClick: () => void; active: boolean; asc: boolean }) {
  return (
    <th className="text-start px-3 py-2 font-semibold cursor-pointer select-none hover:text-slate-800" onClick={onClick}>
      {children}{active ? (asc ? ' ▲' : ' ▼') : ''}
    </th>
  );
}

function AdjustmentDialog({ row, month, onClose, onSave }: {
  row: MonthlyRow; month: string; onClose: () => void;
  onSave: (kind: 'addition' | 'override', amount: number, reason: string) => void;
}) {
  const [kind, setKind] = useState<'addition' | 'override'>('addition');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const amt = Number(amount);
  const preview = kind === 'override' ? amt : row.base + amt;
  return (
    <Modal isOpen onClose={onClose} title={`שינוי חודשי · ${row.last_name} ${row.first_name}`}>
      <div className="space-y-4">
        <div className="text-sm text-slate-500">חודש {month} · אופן {METHOD_LABELS[row.method]} · בסיס {ils(row.base)}</div>
        <Select label="סוג" value={kind} onChange={(e) => setKind(e.target.value as any)}
          options={[{ value: 'addition', label: 'תוספת / הנחה (מתווסף לבסיס)' }, { value: 'override', label: 'סכום מוחלט לחודש זה (דורס את הבסיס)' }]} />
        <Input label={kind === 'addition' ? 'סכום (חיובי=תוספת, שלילי=הנחה)' : 'סכום מוחלט לחודש'} type="number"
          value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        <Input label="הערה (למה?)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="לדוגמה: טיול, הנחה חד-פעמית" />
        {amount !== '' && !isNaN(amt) && (
          <div className="text-sm bg-slate-50 rounded-xl p-3">סופי לחודש זה: <b>{ils(preview)}</b></div>
        )}
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
          <Button variant="primary" disabled={amount === '' || isNaN(amt)} onClick={() => onSave(kind, amt, reason)}>שמור</Button>
        </div>
      </div>
    </Modal>
  );
}

function SetupDialog({ row, onClose, onSaved }: { row: MonthlyRow; onClose: () => void; onSaved: () => void }) {
  const { getFamilyPaymentContext, saveTuitionSetup, saveFamilyBank } = useChargeAdjustments();
  const [method, setMethod] = useState<PayMethod>(row.method === 'none' ? 'bank_ho' : row.method);
  const [amount, setAmount] = useState(row.base ? String(row.base) : '');
  const [bankDay, setBankDay] = useState('20');
  const [subId, setSubId] = useState('');
  const [bank, setBank] = useState({ bank_number: '', bank_branch: '', bank_account: '' });
  const [subs, setSubs] = useState<Array<{ id: string; amount_per_charge: number; last_4_digits: string | null; scheduled_day: number | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [linking, setLinking] = useState(false);

  const genLink = async () => {
    setLinking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/nedarim/payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ student_id: row.student_id, amount: Number(amount) || undefined }),
      });
      const json = await res.json();
      if (json.ok) setLink(json.url); else alert('שגיאה: ' + (json.error || ''));
    } catch (e: any) { alert('שגיאה: ' + (e?.message || e)); }
    finally { setLinking(false); }
  };

  useEffect(() => {
    (async () => {
      if (!row.family_id) { setLoading(false); return; }
      const ctx = await getFamilyPaymentContext(row.family_id);
      setBank({
        bank_number: ctx.bank.bank_number != null ? String(ctx.bank.bank_number) : '',
        bank_branch: ctx.bank.bank_branch != null ? String(ctx.bank.bank_branch) : '',
        bank_account: ctx.bank.bank_account != null ? String(ctx.bank.bank_account) : '',
      });
      setSubs(ctx.nedarimSubs);
      setLoading(false);
    })();
  }, [row.family_id]); // eslint-disable-line

  const needsAmount = method === 'bank_ho' || method === 'credit_nedarim' || method === 'office';

  const save = async () => {
    setBusy(true);
    try {
      if (method === 'bank_ho' && row.family_id) await saveFamilyBank(row.family_id, bank);
      const ok = await saveTuitionSetup(row.student_id, {
        method, amount: Number(amount) || 0, bank_day: Number(bankDay) || 20,
        nedarim_subscription_id: method === 'credit_nedarim' ? (subId || null) : null,
      });
      if (!ok) { alert('שגיאה בשמירה'); setBusy(false); return; }
      onSaved();
    } catch (e: any) { alert('שגיאה: ' + (e?.message || e)); setBusy(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title={`הגדרת תשלום · ${row.last_name} ${row.first_name}`}>
      {loading ? <div className="p-6 text-center text-slate-400">טוען…</div> : (
        <div className="space-y-4">
          <div className="text-sm text-slate-500">שיעור {(row.shiur || '').replace('שיעור ', '') || '—'}</div>
          <Select label="אופן תשלום" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)} options={[
            { value: 'bank_ho', label: 'הו"ק בנקאי' },
            { value: 'credit_nedarim', label: 'נדרים (אשראי)' },
            { value: 'office', label: 'משרד' },
            { value: 'exempt', label: 'פטור' },
          ]} />
          {needsAmount && <Input label="סכום חודשי" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />}

          {method === 'bank_ho' && (
            <div className="space-y-3 bg-blue-50/50 rounded-xl p-3">
              <div className="text-sm font-semibold text-slate-700">פרטי בנק (למשפחה)</div>
              <div className="grid grid-cols-3 gap-2">
                <Input label="בנק" value={bank.bank_number} onChange={(e) => setBank((b) => ({ ...b, bank_number: e.target.value }))} />
                <Input label="סניף" value={bank.bank_branch} onChange={(e) => setBank((b) => ({ ...b, bank_branch: e.target.value }))} />
                <Input label="חשבון" value={bank.bank_account} onChange={(e) => setBank((b) => ({ ...b, bank_account: e.target.value }))} />
              </div>
              {bank.bank_number && bank.bank_branch && bank.bank_account && (() => {
                const r = validateBankAccountFull(bank.bank_number, bank.bank_branch, bank.bank_account);
                if (r === 'valid') return <div className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-1.5">✓ חשבון תקין</div>;
                if (r === 'bad-check') return <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-1.5 font-medium">❌ מספר החשבון שגוי (ספרת ביקורת לא תואמת) — בדוק שוב</div>;
                if (r === 'invalid') return <div className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-1.5 font-medium">❌ מבנה חשבון לא תקין (ספרות בלבד)</div>;
                return <div className="text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-1.5">מבנה תקין (ספרת ביקורת לא נבדקה לבנק זה)</div>;
              })()}
              <Input label="יום חיוב" type="number" value={bankDay} onChange={(e) => setBankDay(e.target.value)} />
              <div className="text-xs text-slate-500">ההו״ק תיכלל אוטומטית בקובץ המס״ב החודשי — אין צורך באישור נפרד.</div>
            </div>
          )}

          {method === 'credit_nedarim' && (
            <div className="space-y-2 bg-purple-50/50 rounded-xl p-3">
              <div className="text-sm font-semibold text-slate-700">קישור להוראת קבע בנדרים</div>
              {subs.length === 0 ? (
                <div className="space-y-2">
                  <div className="text-sm text-slate-500">אין עדיין הו״ק נדרים למשפחה זו. הקם אחת:</div>
                  <Link href={`/finances/nedarim/new-hk?student=${row.student_id}${amount ? `&amount=${amount}` : ''}`}>
                    <Button size="sm" variant="primary">💳 הקם הו״ק — הזן כרטיס</Button>
                  </Link>
                  <div className="text-xs text-slate-400 pt-1">או שלח קישור להורה שיזין בעצמו:</div>
                  {!link ? (
                    <Button size="sm" variant="secondary" disabled={linking} onClick={genLink}>
                      {linking ? 'מייצר…' : '🔗 קישור לתשלום להורה'}
                    </Button>
                  ) : (
                    <div className="space-y-2 bg-white rounded-lg p-2 border border-purple-200">
                      <div className="text-xs text-slate-500">פתח במשרד (הזן כרטיס) או שלח להורה. אחרי ההקמה — סנכרן וקשר.</div>
                      <input readOnly value={link} onFocus={(e) => e.target.select()} className="w-full text-xs border rounded px-2 py-1 bg-slate-50" />
                      <div className="flex gap-2">
                        <a href={link} target="_blank" rel="noreferrer"><Button size="sm" variant="primary">פתח דף תשלום</Button></a>
                        <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(link); alert('הקישור הועתק'); }}>העתק קישור</Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Select label="בחר הו״ק" value={subId} onChange={(e) => setSubId(e.target.value)} options={[
                  { value: '', label: '— בחר —' },
                  ...subs.map((s) => ({ value: s.id, label: `₪${s.amount_per_charge} · כרטיס …${s.last_4_digits || '?'} · יום ${s.scheduled_day || '?'}` })),
                ]} />
              )}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={onClose}>ביטול</Button>
            <Button variant="primary" disabled={busy || (method === 'credit_nedarim' && subs.length > 0 && !subId)} onClick={save}>{busy ? 'שומר…' : 'שמור'}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function GroupActionDialog({ month, shiurOptions, onClose, onSave }: {
  month: string; shiurOptions: string[]; onClose: () => void;
  onSave: (p: { action_kind: 'addition' | 'override'; amount: number; target_type: 'shiur'; target_value: string; reason: string; skip_exempt: boolean }) => void;
}) {
  const [shiur, setShiur] = useState(shiurOptions[0]);
  const [kind, setKind] = useState<'addition' | 'override'>('addition');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const amt = Number(amount);
  return (
    <Modal isOpen onClose={onClose} title="פעולת קבוצה">
      <div className="space-y-4">
        <div className="text-sm text-slate-500">חודש {month} · מדלג אוטומטית על פטורים/לא מוגדרים · כל תלמיד יחויב לפי אופן התשלום שלו</div>
        <Select label="שיעור" value={shiur} onChange={(e) => setShiur(e.target.value)} options={shiurOptions.map((s) => ({ value: s, label: s }))} />
        <Select label="סוג" value={kind} onChange={(e) => setKind(e.target.value as any)}
          options={[{ value: 'addition', label: 'תוספת לכולם (לדוגמה: טיול +300)' }, { value: 'override', label: 'סכום מוחלט לחודש זה לכולם' }]} />
        <Input label="סכום" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        <Input label="הערה (למה?)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="לדוגמה: טיול שיעור א" />
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
          <Button variant="primary" disabled={amount === '' || isNaN(amt) || !shiur}
            onClick={() => onSave({ action_kind: kind, amount: amt, target_type: 'shiur', target_value: shiur, reason, skip_exempt: true })}>
            החל על הקבוצה
          </Button>
        </div>
      </div>
    </Modal>
  );
}
