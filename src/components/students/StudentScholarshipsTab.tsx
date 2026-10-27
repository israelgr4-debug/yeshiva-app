'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useScholarships, StudentLedger } from '@/hooks/useScholarships';
import { ScholarshipBatch, ScholarshipType } from '@/lib/types';
import { ils, dmy, todayIso } from '@/components/scholarships/shared';

// Student card → "מלגות": balance cards + a ledger (charge per batch entry, credit per
// payment, running balance). Writers can add a single entry and mark entries as paid.

interface LedgerLine {
  key: string;
  date: string;
  kind: 'charge' | 'credit';
  description: string;
  debit: number;
  credit: number;
  balance: number;
  entryId?: string;
  paid?: boolean;
  paymentId?: string;
  typeId?: string;
}

export function StudentScholarshipsTab({ studentId }: { studentId: string }) {
  const sch = useScholarships();
  const { permissions } = useAuth();
  const canWrite = permissions.canWrite;
  const canAdmin = permissions.canDelete;

  const [ledger, setLedger] = useState<StudentLedger | null>(null);
  const [types, setTypes] = useState<ScholarshipType[]>([]);
  const [batches, setBatches] = useState<ScholarshipBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [openPayment, setOpenPayment] = useState<string | null>(null);
  const [marking, setMarking] = useState<Set<string>>(new Set());
  const [paidAt, setPaidAt] = useState(todayIso());
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, t] = await Promise.all([sch.getStudentLedger(studentId), sch.listTypes(true)]);
      setLedger(l);
      setTypes(t);
    } catch (e: any) { alert('שגיאה בטעינת מלגות: ' + e.message); }
    setLoading(false);
  }, [sch, studentId]);
  useEffect(() => { load(); }, [load]);

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);

  const lines = useMemo<LedgerLine[]>(() => {
    if (!ledger) return [];
    const entries = ledger.entries.filter((e) => !typeFilter || e.type_id === typeFilter);
    const raw: Omit<LedgerLine, 'balance'>[] = entries.map((e) => ({
      key: 'e' + e.id, date: e.entry_date, kind: 'charge', description: e.batch_title || typeById.get(e.type_id)?.name || 'חיוב',
      debit: Number(e.amount), credit: 0, entryId: e.id, paid: !!e.payment_id, paymentId: e.payment_id || undefined, typeId: e.type_id,
    }));
    if (!onlyOpen) {
      for (const p of ledger.payments) {
        // under a type filter, a payment counts only for that type's entries
        const amt = typeFilter
          ? entries.filter((e) => e.payment_id === p.id).reduce((s, e) => s + Number(e.amount), 0)
          : Number(p.amount);
        if (amt <= 0) continue;
        raw.push({ key: 'p' + p.id, date: p.paid_at, kind: 'credit', description: `תשלום ${dmy(p.paid_at)}${p.notes ? ` · ${p.notes}` : ''}`, debit: 0, credit: amt, paymentId: p.id });
      }
    }
    const filtered = onlyOpen ? raw.filter((l) => l.kind === 'charge' && !l.paid) : raw;
    // chronological for the running balance (charges before credits on the same day)
    filtered.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === 'charge' ? -1 : 1));
    let bal = 0;
    const withBal = filtered.map((l) => { bal += l.debit - l.credit; return { ...l, balance: bal }; });
    return withBal.reverse(); // newest first
  }, [ledger, typeFilter, onlyOpen, typeById]);

  const totals = useMemo(() => {
    const b = ledger?.balances || [];
    return {
      charged: b.reduce((s, r) => s + r.total_charged, 0),
      paid: b.reduce((s, r) => s + r.total_paid, 0),
      balance: b.reduce((s, r) => s + r.balance, 0),
    };
  }, [ledger]);

  const markPaid = async () => {
    if (!marking.size) return;
    const sum = (ledger?.entries || []).filter((e) => marking.has(e.id)).reduce((s, e) => s + Number(e.amount), 0);
    if (!confirm(`לסמן ${marking.size} זכאויות כשולמו בתאריך ${dmy(paidAt)}? (${ils(sum)})`)) return;
    setBusy(true);
    try {
      await sch.markPaid({ entryIds: [...marking], paidAt });
      setMarking(new Set());
      await load();
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  const cancelPayment = async (paymentId: string) => {
    const p = ledger?.payments.find((x) => x.id === paymentId);
    if (!p || !confirm(`לבטל את התשלום מ-${dmy(p.paid_at)} (${ils(p.amount)})? הזכאויות יחזרו להיות פתוחות.`)) return;
    try { await sch.cancelPayment(paymentId); await load(); } catch (e: any) { alert(e.message); }
  };

  const deleteEntry = async (entryId: string) => {
    if (!confirm('למחוק את הזכאות?')) return;
    try { await sch.deleteEntry(entryId); await load(); } catch (e: any) { alert(e.message); }
  };

  if (loading) return <div className="py-8 text-center text-slate-400">טוען מלגות…</div>;

  return (
    <div className="space-y-4">
      {/* summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-center">
          <div className="text-xs text-slate-500">סה״כ חיובים</div>
          <div className="text-xl font-bold tabular-nums">{ils(totals.charged)}</div>
        </div>
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3 text-center">
          <div className="text-xs text-emerald-700">סה״כ זיכויים (שולם)</div>
          <div className="text-xl font-bold tabular-nums text-emerald-800">{ils(totals.paid)}</div>
        </div>
        <div className={`rounded-2xl border p-3 text-center ${totals.balance > 0 ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200'}`}>
          <div className="text-xs text-orange-700">יתרה פתוחה</div>
          <div className={`text-xl font-bold tabular-nums ${totals.balance > 0 ? 'text-orange-700' : 'text-slate-500'}`}>{ils(totals.balance)}</div>
        </div>
      </div>
      {(ledger?.balances.length || 0) > 1 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {ledger!.balances.map((b) => (
            <span key={b.type_id} className="px-2.5 py-1 rounded-full bg-white border border-slate-200">
              <b>{typeById.get(b.type_id)?.name || '—'}</b>: חויב {ils(b.total_charged)} · שולם {ils(b.total_paid)} · <span className={b.balance > 0 ? 'text-orange-700 font-semibold' : ''}>יתרה {ils(b.balance)}</span>
            </span>
          ))}
        </div>
      )}

      {/* filters + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm">
          <option value="">כל הרכיבים</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> רק פתוחים</label>
        <div className="flex-1" />
        {canWrite && <Button size="sm" variant="secondary" onClick={() => { setAddOpen(!addOpen); if (!batches.length) sch.listBatches({ limit: 100 }).then(setBatches); }}>➕ הוסף זכאות</Button>}
      </div>

      {addOpen && canWrite && (
        <AddEntryForm studentId={studentId} types={types} batches={batches}
          existingBatchIds={new Set((ledger?.entries || []).map((e) => e.batch_id))}
          onDone={() => { setAddOpen(false); load(); }} />
      )}

      {canWrite && marking.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-sm">
          <span>סומנו {marking.size} זכאויות</span>
          <label className="flex items-center gap-1">תאריך תשלום
            <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="px-2 py-1 border border-slate-300 rounded-lg" />
          </label>
          <Button size="sm" onClick={markPaid} disabled={busy}>✅ סמן כשולם</Button>
          <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setMarking(new Set())}>נקה</button>
        </div>
      )}

      {/* ledger */}
      {lines.length === 0 ? (
        <div className="py-8 text-center"><div className="text-4xl mb-1">🎁</div><div className="text-slate-500">אין תנועות מלגה</div></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-slate-500 border-b border-slate-100">
                {canWrite && <th className="w-8"></th>}
                <th className="text-start px-3 py-2">תאריך</th>
                <th className="text-start px-3 py-2">סוג</th>
                <th className="text-start px-3 py-2">תיאור</th>
                <th className="text-start px-3 py-2">חיוב ₪</th>
                <th className="text-start px-3 py-2">זיכוי ₪</th>
                <th className="text-start px-3 py-2">יתרה מצטברת ₪</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <React.Fragment key={l.key}>
                  <tr className={`border-b border-slate-50 hover:bg-blue-50/40 ${l.kind === 'credit' ? 'bg-emerald-50/40 cursor-pointer' : ''}`}
                    onClick={() => l.kind === 'credit' && setOpenPayment(openPayment === l.paymentId ? null : l.paymentId!)}>
                    {canWrite && (
                      <td className="px-2" onClick={(e) => e.stopPropagation()}>
                        {l.kind === 'charge' && !l.paid && (
                          <input type="checkbox" checked={marking.has(l.entryId!)} onChange={() => {
                            const n = new Set(marking);
                            if (n.has(l.entryId!)) n.delete(l.entryId!); else n.add(l.entryId!);
                            setMarking(n);
                          }} />
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 tabular-nums">{dmy(l.date)}</td>
                    <td className="px-3 py-2">{l.kind === 'charge' ? <span className="text-slate-700">חיוב</span> : <span className="text-emerald-700 font-medium">זיכוי</span>}</td>
                    <td className="px-3 py-2">
                      {l.description}
                      {l.kind === 'charge' && l.paid && <span className="ms-2 text-[11px] text-emerald-700">✓ שולם</span>}
                      {l.kind === 'credit' && <span className="ms-2 text-[11px] text-slate-400">{openPayment === l.paymentId ? '▲' : '▼ פירוט'}</span>}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{l.debit ? ils(l.debit) : ''}</td>
                    <td className="px-3 py-2 tabular-nums text-emerald-700">{l.credit ? ils(l.credit) : ''}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{ils(l.balance)}</td>
                    <td className="px-3 py-2 text-end" onClick={(e) => e.stopPropagation()}>
                      {canWrite && l.kind === 'charge' && !l.paid && (
                        <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => deleteEntry(l.entryId!)}>מחק</button>
                      )}
                      {canAdmin && l.kind === 'credit' && (
                        <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => cancelPayment(l.paymentId!)}>בטל תשלום</button>
                      )}
                    </td>
                  </tr>
                  {l.kind === 'credit' && openPayment === l.paymentId && (
                    <tr className="bg-emerald-50/60">
                      <td colSpan={canWrite ? 8 : 7} className="px-6 py-2 text-xs">
                        <div className="font-semibold text-emerald-900 mb-1">הזכאויות שהתשלום סגר:</div>
                        {(ledger?.entries || []).filter((e) => e.payment_id === l.paymentId).map((e) => (
                          <div key={e.id} className="flex gap-3">
                            <span className="tabular-nums">{dmy(e.entry_date)}</span>
                            <span>{e.batch_title}</span>
                            <span className="tabular-nums font-semibold">{ils(Number(e.amount))}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AddEntryForm({ studentId, types, batches, existingBatchIds, onDone }: {
  studentId: string; types: ScholarshipType[]; batches: ScholarshipBatch[]; existingBatchIds: Set<string>; onDone: () => void;
}) {
  const sch = useScholarships();
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [batchId, setBatchId] = useState('');
  const manualTypes = types.filter((t) => t.is_active && t.source === 'manual');
  const [typeId, setTypeId] = useState(manualTypes[0]?.id || '');
  const [title, setTitle] = useState(manualTypes[0] ? `${manualTypes[0].name} ` : '');
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const available = batches.filter((b) => !existingBatchIds.has(b.id));

  const submit = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) { alert('הזן סכום'); return; }
    setBusy(true);
    try {
      let bid = batchId;
      if (mode === 'new') {
        if (!typeId || !title.trim()) { alert('בחר רכיב וכותרת'); setBusy(false); return; }
        bid = (await sch.createBatch({ type_id: typeId, title, entry_date: date, source: 'manual' })).id;
      } else if (!bid) { alert('בחר חיוב תקופתי'); setBusy(false); return; }
      await sch.addEntry(bid, studentId, amt);
      onDone();
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  const input = 'px-2 py-1.5 border border-slate-300 rounded-lg text-sm';
  return (
    <div className="p-3 rounded-xl bg-orange-50/60 border border-orange-200 space-y-2">
      <div className="flex gap-2 text-sm">
        <label className="flex items-center gap-1"><input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} /> חיוב תקופתי קיים</label>
        <label className="flex items-center gap-1"><input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} /> חיוב חדש</label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {mode === 'existing' ? (
          <select className={`${input} min-w-[240px]`} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">— בחר —</option>
            {available.map((b) => <option key={b.id} value={b.id}>{b.title} · {dmy(b.entry_date)}</option>)}
          </select>
        ) : (
          <>
            <select className={input} value={typeId} onChange={(e) => { setTypeId(e.target.value); const t = types.find((x) => x.id === e.target.value); if (t) setTitle(`${t.name} `); }}>
              {manualTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת" />
            <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
          </>
        )}
        <input className={`${input} w-28`} value={amount} inputMode="numeric" dir="ltr" placeholder="סכום ₪"
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        <Button size="sm" onClick={submit} disabled={busy}>{busy ? '…' : 'הוסף'}</Button>
      </div>
    </div>
  );
}
