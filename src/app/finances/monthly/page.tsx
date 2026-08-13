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

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortAsc((v) => !v);
    else { setSortKey(k); setSortAsc(true); }
  };

  return (
    <PageGuard requires="write">
      <Header title="הרצת גבייה חודשית" subtitle="בסיס ± שינויים = סכום סופי לכל תלמיד" />
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="תלמידים" value={filtered.length.toLocaleString('he-IL')} />
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
                        <span className={`px-2 py-0.5 rounded-full text-xs ${METHOD_COLORS[r.method]}`}>{METHOD_LABELS[r.method]}</span>
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
                              <button onClick={async () => { await cancelAdjustment(a.id); reload(); }}
                                className="opacity-50 hover:opacity-100" aria-label="בטל">×</button>
                            </span>
                          ))}
                          {r.adjustments.filter((a) => a.status === 'active').length === 0 && <span className="text-slate-300">—</span>}
                        </div>
                      </td>
                      <td className={`px-3 py-2 font-semibold ${r.final !== r.base ? 'text-emerald-700' : 'text-slate-800'}`}>{ils(r.final)}</td>
                      <td className="px-3 py-2 text-end">
                        <button onClick={() => setAdjFor(r)} className="text-blue-600 hover:bg-blue-50 rounded-lg w-7 h-7" title="הוסף שינוי">＋</button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="p-10 text-center text-slate-400">אין תלמידים תואמים</td></tr>
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
      {groupOpen && (
        <GroupActionDialog month={month} shiurOptions={SHIUR_ORDER} onClose={() => setGroupOpen(false)}
          onSave={async (p) => {
            const res = await createGroupAction({ month, ...p });
            if (!res.ok) { alert(res.error || 'שגיאה'); return; }
            alert(`בוצע ל-${res.count} תלמידים`);
            setGroupOpen(false); reload();
          }} />
      )}
    </PageGuard>
  );
}

function StatCard({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 elevation-1 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 ${strong ? 'text-xl font-bold text-slate-900' : accent ? 'text-lg font-semibold text-emerald-700' : 'text-lg font-semibold text-slate-800'}`}>{value}</div>
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
