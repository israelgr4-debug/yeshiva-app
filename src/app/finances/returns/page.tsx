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
import { useBounces, BounceRow, PaidRow, addMonths } from '@/hooks/useBounces';
import { MasavReturnsImport } from '@/components/finances/MasavReturnsImport';

const SHIUR_ORDER = ['שיעור א','שיעור ב','שיעור ג','שיעור ד','שיעור ה','שיעור ו','שיעור ז','שיעור ח','שיעור ט','שיעור י','שיעור יא','קיבוץ'];
const RES_LABELS: Record<string, string> = {
  manual: 'טופל ידנית', next_month: 'לחודש הבא', installments: 'פריסה לתשלומים', recharge: 'חיוב חדש',
};
function ils(n: number) { return '₪' + Math.round(n).toLocaleString('he-IL'); }
function currentMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function monthOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = []; const d = new Date();
  for (let i = -6; i <= 2; i++) { const dd = new Date(d.getFullYear(), d.getMonth() + i, 1);
    out.push({ value: `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}`, label: `${String(dd.getMonth() + 1).padStart(2, '0')}/${dd.getFullYear()}` }); }
  return out;
}

export default function ReturnsPage() {
  const [tab, setTab] = useState<'view' | 'mark' | 'import'>('view');
  return (
    <PageGuard requires="write">
      <Header title="חזרות הו״ק" subtitle="מעקב וטיפול בהוראות קבע שחזרו" />
      <div className="p-4 md:p-8 space-y-5">
        <div className="flex gap-2 flex-wrap">
          <Button variant={tab === 'view' ? 'primary' : 'secondary'} onClick={() => setTab('view')}>↩ חזרות</Button>
          <Button variant={tab === 'mark' ? 'primary' : 'secondary'} onClick={() => setTab('mark')}>✔ סימון חזרות</Button>
          <Button variant={tab === 'import' ? 'primary' : 'secondary'} onClick={() => setTab('import')}>📥 ייבוא קובץ חזרות ממס״ב</Button>
          <Link href="/finances" className="ms-auto"><Button variant="ghost">← כספים</Button></Link>
        </div>
        {tab === 'view' ? <ViewTab /> : tab === 'mark' ? <MarkTab /> : <MasavReturnsImport />}
      </div>
    </PageGuard>
  );
}

function ViewTab() {
  const { loadBounces } = useBounces();
  const [rows, setRows] = useState<BounceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthFilter, setMonthFilter] = useState('');
  const [shiurFilter, setShiurFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [search, setSearch] = useState('');
  const [resolveFor, setResolveFor] = useState<BounceRow | null>(null);

  const reload = useCallback(async () => { setLoading(true); setRows(await loadBounces()); setLoading(false); }, []); // eslint-disable-line
  useEffect(() => { reload(); }, [reload]);

  const shiurOptions = useMemo(() => SHIUR_ORDER.filter((s) => rows.some((r) => r.shiur === s)), [rows]);
  const monthsPresent = useMemo(() => [...new Set(rows.map((r) => r.payment_date.slice(0, 7)))].sort().reverse(), [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (statusFilter === 'open' && r.bounce_resolution) return false;
    if (statusFilter === 'resolved' && !r.bounce_resolution) return false;
    if (monthFilter && r.payment_date.slice(0, 7) !== monthFilter) return false;
    if (shiurFilter && r.shiur !== shiurFilter) return false;
    if (search.trim() && !`${r.last_name} ${r.first_name}`.includes(search.trim())) return false;
    return true;
  }), [rows, statusFilter, monthFilter, shiurFilter, search]);

  const total = filtered.reduce((s, r) => s + r.amount_ils, 0);

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-36"><Select label="חודש" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}
          options={[{ value: '', label: 'כל החודשים' }, ...monthsPresent.map((m) => ({ value: m, label: m }))]} /></div>
        <div className="w-40"><Select label="שיעור" value={shiurFilter} onChange={(e) => setShiurFilter(e.target.value)}
          options={[{ value: '', label: 'כל השיעורים' }, ...shiurOptions.map((s) => ({ value: s, label: s }))]} /></div>
        <div className="w-40"><Select label="מצב" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}
          options={[{ value: 'open', label: 'לא טופלו' }, { value: 'resolved', label: 'טופלו' }, { value: 'all', label: 'הכל' }]} /></div>
        <div className="flex-1 min-w-[180px]"><SearchInput value={search} onSearch={setSearch} placeholder="חיפוש תלמיד..." /></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="חזרות" value={filtered.length.toLocaleString('he-IL')} />
        <Stat label="סכום שחזר" value={ils(total)} accent />
        <Stat label="לא טופלו" value={rows.filter((r) => !r.bounce_resolution).length.toLocaleString('he-IL')} />
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        {loading ? <div className="p-10 text-center text-slate-400">טוען…</div> : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <th className="text-start px-3 py-2 font-semibold">תלמיד</th>
              <th className="text-start px-3 py-2 font-semibold">שיעור</th>
              <th className="text-start px-3 py-2 font-semibold">סכום</th>
              <th className="text-start px-3 py-2 font-semibold">תאריך</th>
              <th className="text-start px-3 py-2 font-semibold">טיפול</th>
              <th className="px-3 py-2"></th>
            </tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-red-50/30">
                  <td className="px-3 py-2"><Link href={`/students/${r.student_id}`} className="text-blue-700 hover:underline">{r.last_name} {r.first_name}</Link></td>
                  <td className="px-3 py-2 text-slate-600">{(r.shiur || '').replace('שיעור ', '') || '—'}</td>
                  <td className="px-3 py-2 font-semibold text-red-700">{ils(r.amount_ils)}</td>
                  <td className="px-3 py-2 text-slate-600">{r.payment_date}</td>
                  <td className="px-3 py-2">
                    {r.bounce_resolution
                      ? <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800" title={r.bounce_note || ''}>{RES_LABELS[r.bounce_resolution] || r.bounce_resolution}</span>
                      : <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800">לא טופל</span>}
                  </td>
                  <td className="px-3 py-2 text-end">
                    <Button size="sm" variant={r.bounce_resolution ? 'ghost' : 'primary'} onClick={() => setResolveFor(r)}>
                      {r.bounce_resolution ? 'שנה' : 'טפל'}
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-slate-400">אין חזרות תואמות 🎉</td></tr>}
            </tbody>
          </table>
        )}
      </CardContent></Card>

      {resolveFor && <ResolveDialog bounce={resolveFor} onClose={() => setResolveFor(null)} onDone={() => { setResolveFor(null); reload(); }} />}
    </>
  );
}

function ResolveDialog({ bounce, onClose, onDone }: { bounce: BounceRow; onClose: () => void; onDone: () => void }) {
  const { resolveManual, resolveNextMonth, resolveInstallments, resolveRecharge } = useBounces();
  const [mode, setMode] = useState<'manual' | 'next_month' | 'installments' | 'recharge'>('next_month');
  const [note, setNote] = useState('');
  const [targetMonth, setTargetMonth] = useState(addMonths(currentMonth(), 1));
  const [count, setCount] = useState(3);
  const [chargeDate, setChargeDate] = useState(() => { const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(20); return d.toISOString().slice(0, 10); });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'manual') await resolveManual(bounce, note);
      else if (mode === 'next_month') await resolveNextMonth(bounce, targetMonth, note);
      else if (mode === 'installments') await resolveInstallments(bounce, targetMonth, count, note);
      else await resolveRecharge(bounce, chargeDate, note);
      onDone();
    } catch (e: any) { alert('שגיאה: ' + (e?.message || e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title={`טיפול בחזרה · ${bounce.last_name} ${bounce.first_name}`}>
      <div className="space-y-4">
        <div className="text-sm bg-red-50 rounded-xl p-3 text-red-800">חזר {ils(bounce.amount_ils)} בתאריך {bounce.payment_date}</div>
        <Select label="אופן טיפול" value={mode} onChange={(e) => setMode(e.target.value as any)} options={[
          { value: 'next_month', label: 'הוסף לחודש הבא' },
          { value: 'installments', label: 'פרוס לתשלומים' },
          { value: 'recharge', label: 'צור חיוב חדש לתאריך' },
          { value: 'manual', label: 'טיפלתי לבד (רק סימון)' },
        ]} />
        {(mode === 'next_month' || mode === 'installments') && (
          <Select label="חודש התחלה" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} options={monthOptions()} />
        )}
        {mode === 'installments' && (
          <Input label="מספר תשלומים" type="number" min={2} value={count} onChange={(e) => setCount(Math.max(2, Number(e.target.value) || 2))} />
        )}
        {mode === 'recharge' && (
          <Input label="תאריך חיוב" type="date" value={chargeDate} onChange={(e) => setChargeDate(e.target.value)} />
        )}
        <Input label="הערה" value={note} onChange={(e) => setNote(e.target.value)} placeholder="אופציונלי" />
        {mode === 'installments' && <div className="text-sm text-slate-500">כ-{ils(bounce.amount_ils / count)} לחודש × {count}, החל מ-{targetMonth}</div>}
        {mode === 'next_month' && <div className="text-sm text-slate-500">{ils(bounce.amount_ils)} יתווסף לגביית {targetMonth} (לפי אופן התשלום של התלמיד)</div>}
        <div className="flex gap-2 justify-end pt-1">
          <Button variant="secondary" onClick={onClose}>ביטול</Button>
          <Button variant="primary" disabled={busy} onClick={submit}>{busy ? 'מבצע…' : 'אשר'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function MarkTab() {
  const { loadPaidForMonth, markAsBounced } = useBounces();
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<PaidRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => { setLoading(true); setSelected(new Set()); setRows(await loadPaidForMonth(month)); setLoading(false); }, [month]); // eslint-disable-line
  useEffect(() => { reload(); }, [reload]);

  const filtered = useMemo(() => rows.filter((r) => !search.trim() || r.name.includes(search.trim())), [rows, search]);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const save = async () => {
    if (selected.size === 0) return;
    if (!confirm(`לסמן ${selected.size} תלמידים כחזרו לחודש ${month}?`)) return;
    setSaving(true);
    const ok = await markAsBounced([...selected]);
    setSaving(false);
    if (ok) { alert(`✓ סומנו ${selected.size} חזרות`); reload(); } else alert('שגיאה בסימון');
  };

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-36"><Select label="חודש" value={month} onChange={(e) => setMonth(e.target.value)} options={monthOptions()} /></div>
        <div className="flex-1 min-w-[180px]"><SearchInput value={search} onSearch={setSearch} placeholder="חיפוש תלמיד..." /></div>
        <Button variant="danger" disabled={selected.size === 0 || saving} onClick={save}>
          {saving ? 'מסמן…' : `סמן ${selected.size || ''} כחזרו`}
        </Button>
      </div>
      <div className="text-sm text-slate-500">בחר מתוך {filtered.length} התלמידים שנגבו החודש את מי שההו״ק שלו חזר.</div>
      <Card><CardContent className="p-0 overflow-x-auto">
        {loading ? <div className="p-10 text-center text-slate-400">טוען…</div> : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <th className="px-3 py-2 w-10"></th>
              <th className="text-start px-3 py-2 font-semibold">תלמיד</th>
              <th className="text-start px-3 py-2 font-semibold">שיעור</th>
              <th className="text-start px-3 py-2 font-semibold">סכום שנגבה</th>
            </tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={`border-b border-slate-50 cursor-pointer ${selected.has(r.id) ? 'bg-red-50' : 'hover:bg-slate-50'}`} onClick={() => toggle(r.id)}>
                  <td className="px-3 py-2 text-center"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} /></td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-slate-600">{(r.shiur || '').replace('שיעור ', '') || '—'}</td>
                  <td className="px-3 py-2 text-slate-700">{ils(r.amount_ils)}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={4} className="p-10 text-center text-slate-400">אין גביות בחודש זה</td></tr>}
            </tbody>
          </table>
        )}
      </CardContent></Card>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 elevation-1 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${accent ? 'text-red-700' : 'text-slate-800'}`}>{value}</div>
    </div>
  );
}
