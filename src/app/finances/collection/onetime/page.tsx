'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { PageGuard } from '@/components/ui/PageGuard';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/supabase-paginate';
import { buildMasavFile, downloadMasavFile, MasavCharge } from '@/lib/masav';

interface StudentLite { id: string; first_name: string; last_name: string; shiur: string | null; family_id: string | null; }
interface FamilyLite { id: string; family_name: string; father_name: string | null; father_id_number: string | null; bank_number: number | null; bank_branch: string | null; bank_account: string | null; }
interface ChargeRow { id: string; student_id: string | null; family_id: string; amount: number; charge_date: string; description: string | null; status: string; masav_send_counter: number | null; channel: string; nedarim_error: string | null; }

const MOSAD_ID = '39050646';         // מוסד/נושא — 8 ספרות
const MASAV_SENDER_NUMBER = '39050'; // מוסד שולח — 5 ספרות
function ils(n: number) { return '₪' + Number(n).toLocaleString('he-IL'); }
function inDays(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

export default function ChargeByDatePage() {
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [families, setFamilies] = useState<Record<string, FamilyLite>>({});
  const [methodBySid, setMethodBySid] = useState<Record<string, string>>({});
  const [queue, setQueue] = useState<ChargeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [firing, setFiring] = useState<string | null>(null);

  // add-charge form
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [chargeDate, setChargeDate] = useState(inDays(2));
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // masav export
  const [masavDate, setMasavDate] = useState(inDays(2));
  const [masavCounter, setMasavCounter] = useState(1);

  const loadQueue = async () => {
    const rows = await fetchAll<ChargeRow>('one_time_charges',
      'id, student_id, family_id, amount, charge_date, description, status, masav_send_counter, channel, nedarim_error',
      (q) => q.in('status', ['pending', 'sent']).order('charge_date', { ascending: true }));
    setQueue(rows);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [st, fams, tu] = await Promise.all([
        fetchAll<StudentLite>('students', 'id, first_name, last_name, shiur, family_id', (q) => q.eq('status', 'active')),
        fetchAll<FamilyLite>('families', 'id, family_name, father_name, father_id_number, bank_number, bank_branch, bank_account'),
        fetchAll<{ student_id: string; payment_method: string }>('student_tuition', 'student_id, payment_method', (q) => q.eq('active', true)),
      ]);
      setStudents(st);
      const fmap: Record<string, FamilyLite> = {};
      for (const f of fams) fmap[f.id] = f;
      setFamilies(fmap);
      const mmap: Record<string, string> = {};
      for (const t of tu) mmap[t.student_id] = t.payment_method;
      setMethodBySid(mmap);
      await loadQueue();
      setLoading(false);
    })();
  }, []);

  const selected = useMemo(() => students.find((s) => s.id === selectedId) || null, [students, selectedId]);
  const selectedFamily = useMemo(() => (selected?.family_id ? families[selected.family_id] : null), [selected, families]);
  const selectedMethod = selected ? methodBySid[selected.id] : undefined;
  const isCredit = selectedMethod === 'credit_nedarim';
  const bankMissing = selected && !isCredit && (!selectedFamily || !selectedFamily.bank_number || !selectedFamily.bank_branch || !selectedFamily.bank_account);

  const matches = useMemo(() => {
    if (!search.trim() || selectedId) return [];
    const q = search.trim();
    return students.filter((s) => `${s.last_name} ${s.first_name}`.includes(q)).slice(0, 8);
  }, [search, students, selectedId]);

  const addCharge = async () => {
    if (!selected || !selected.family_id) { alert('בחר תלמיד'); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { alert('סכום לא תקין'); return; }
    if (bankMissing && !confirm('חסרים פרטי בנק למשפחה — לא יהיה ניתן להפיק מס״ב. להוסיף בכל זאת?')) return;
    setSaving(true);
    const { error } = await supabase.from('one_time_charges').insert({
      student_id: selected.id, family_id: selected.family_id, amount: amt,
      charge_date: chargeDate, description: description || null, status: 'pending',
      channel: isCredit ? 'credit' : 'bank',
    });
    setSaving(false);
    if (error) { alert('שגיאה: ' + error.message); return; }
    setSelectedId(null); setSearch(''); setAmount(''); setDescription('');
    await loadQueue();
  };

  const removeCharge = async (id: string) => {
    if (!confirm('לבטל את החיוב מהתור?')) return;
    await supabase.from('one_time_charges').update({ status: 'cancelled' }).eq('id', id);
    await loadQueue();
  };

  const bankPending = useMemo(() => queue.filter((c) => c.status === 'pending' && c.channel !== 'credit'), [queue]);
  const creditPending = useMemo(() => queue.filter((c) => c.status === 'pending' && c.channel === 'credit'), [queue]);
  const pendingForDate = useMemo(() => bankPending.filter((c) => c.charge_date === masavDate), [bankPending, masavDate]);
  const todayStr = inDays(0);

  const fireCredit = async (id: string) => {
    if (!confirm('לחייב עכשיו בנדרים? זהו חיוב אמיתי בכרטיס האשראי השמור.')) return;
    setFiring(id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/nedarim/charge-onetime', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ charge_id: id }),
      });
      const j = await res.json();
      if (j.ok) alert('✓ חויב בנדרים'); else alert('✗ ' + (j.error || 'נכשל'));
    } catch (e: any) { alert('שגיאה: ' + (e?.message || e)); }
    finally { setFiring(null); await loadQueue(); }
  };
  const sentGroups = useMemo(() => {
    const g: Record<number, ChargeRow[]> = {};
    for (const c of queue) if (c.status === 'sent' && c.masav_send_counter != null) (g[c.masav_send_counter] ||= []).push(c);
    return g;
  }, [queue]);

  const studentName = (sid: string | null) => { const s = students.find((x) => x.id === sid); return s ? `${s.last_name} ${s.first_name}` : '—'; };

  const generateMasav = async () => {
    const valid = pendingForDate.filter((c) => { const f = families[c.family_id]; return f && f.bank_number && f.bank_branch && f.bank_account; });
    if (valid.length === 0) { alert('אין חיובים תקינים (עם פרטי בנק) לתאריך זה'); return; }
    if (!confirm(`להפיק קובץ מס״ב עם ${valid.length} חיובים לתאריך ${masavDate}?`)) return;
    const charges: MasavCharge[] = valid.map((c, idx) => { const f = families[c.family_id]!; return {
      reference: String(idx + 1), bankNumber: Number(f.bank_number) || 0, branch: Number(f.bank_branch) || 0,
      accountNumber: String(f.bank_account || ''), payerIdNumber: String(f.father_id_number || ''),
      payerName: `${f.family_name} ${f.father_name || ''}`.trim(), amountAgorot: Math.round(Number(c.amount) * 100),
    }; });
    const content = buildMasavFile({ mosadNumber: MOSAD_ID, senderNumber: MASAV_SENDER_NUMBER, mosadName: 'ישיבת מיר מודיעין עילית', chargeDate: masavDate, sendCounter: masavCounter }, charges);
    downloadMasavFile(`masav_date_${masavDate.replace(/-/g, '')}_${masavCounter}.txt`, content);
    await supabase.from('one_time_charges').update({ status: 'sent', masav_send_counter: masavCounter, masav_sent_at: new Date().toISOString() }).in('id', valid.map((c) => c.id));
    setMasavCounter((c) => c + 1);
    await loadQueue();
    alert('✅ הקובץ ירד וסומן כ"נשלח". אחרי שהבנק יחייב — סמן כנפרע.');
  };

  const markPaid = async (counter: number) => {
    const items = sentGroups[counter] || [];
    if (items.length === 0) return;
    if (!confirm(`לסמן ${items.length} חיובים (שידור #${counter}) כנפרעו?\n*** רק אחרי שהבנק חייב בפועל ***`)) return;
    await supabase.from('one_time_charges').update({ status: 'paid', paid_at: new Date().toISOString() }).in('id', items.map((c) => c.id));
    // record in payment_history so it shows in history + gauge
    const rows = items.filter((c) => c.student_id).map((c) => ({
      student_id: c.student_id, payment_date: c.charge_date, amount_ils: Number(c.amount),
      status_code: 2, status_name: 'נפרע', group_number: counter,
    }));
    if (rows.length) await supabase.from('payment_history').insert(rows);
    await loadQueue();
    alert('✓ סומנו כנפרעו');
  };

  return (
    <PageGuard requires="write">
      <Header title="חיוב לתאריך" subtitle="חיוב חד-פעמי בתאריך שתבחר — בנק (מס״ב) או אשראי (נדרים)" />
      <div className="p-4 md:p-8 space-y-5 max-w-4xl">
        <Link href="/finances"><Button variant="ghost">← כספים</Button></Link>

        {/* Add a charge */}
        <Card>
          <CardHeader><h3 className="text-lg font-bold">הוספת חיוב</h3></CardHeader>
          <CardContent className="space-y-4">
            {!selected ? (
              <div className="relative">
                <Input label="תלמיד" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חפש שם תלמיד..." />
                {matches.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                    {matches.map((s) => (
                      <button key={s.id} onClick={() => { setSelectedId(s.id); setSearch(''); }}
                        className="block w-full text-start px-3 py-2 hover:bg-blue-50 text-sm">
                        {s.last_name} {s.first_name} <span className="text-slate-400">· {(s.shiur || '').replace('שיעור ', '') || '—'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                <div>
                  <div className="font-semibold">{selected.last_name} {selected.first_name}</div>
                  <div className="text-xs text-slate-500">
                    {isCredit
                      ? '💳 אשראי — יחויב בנדרים בתאריך שנבחר'
                      : (selectedFamily ? `🏦 בנק ${selectedFamily.bank_number || '—'} · סניף ${selectedFamily.bank_branch || '—'} · חשבון ${selectedFamily.bank_account || '—'}` : 'ללא משפחה')}
                  </div>
                </div>
                <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-slate-700 text-sm">החלף</button>
              </div>
            )}
            {bankMissing && selected && <div className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">⚠️ חסרים פרטי בנק למשפחה — עדכן בכרטיס המשפחה כדי שאפשר יהיה להפיק מס״ב.</div>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input label="סכום" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
              <Input label="תאריך חיוב" type="date" value={chargeDate} onChange={(e) => setChargeDate(e.target.value)} />
              <Input label="סיבה / הערה" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="לדוגמה: חיוב חוזר לאחר חזרה" />
            </div>
            <div className="flex justify-end">
              <Button variant="primary" disabled={saving || !selected || !amount} onClick={addCharge}>{saving ? 'מוסיף…' : 'הוסף לתור'}</Button>
            </div>
          </CardContent>
        </Card>

        {/* Bank queue + MASAV export */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h3 className="text-lg font-bold">🏦 תור בנק — מס״ב ({bankPending.length})</h3>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? <div className="text-center text-slate-400 py-6">טוען…</div> : bankPending.length === 0 ? (
              <div className="text-center text-slate-400 py-6">אין חיובי בנק בתור.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-slate-500 border-b"><th className="text-start px-2 py-1">תלמיד</th><th className="text-start px-2 py-1">תאריך</th><th className="text-start px-2 py-1">סכום</th><th className="text-start px-2 py-1">סיבה</th><th></th></tr></thead>
                  <tbody>
                    {bankPending.map((c) => (
                      <tr key={c.id} className="border-b border-slate-50">
                        <td className="px-2 py-1.5">{studentName(c.student_id)}</td>
                        <td className="px-2 py-1.5 text-slate-600">{c.charge_date}</td>
                        <td className="px-2 py-1.5 font-semibold">{ils(c.amount)}</td>
                        <td className="px-2 py-1.5 text-slate-500">{c.description || '—'}</td>
                        <td className="px-2 py-1.5 text-end"><button onClick={() => removeCharge(c.id)} className="text-red-500 hover:text-red-700">×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="border-t pt-4 flex flex-wrap items-end gap-3">
              <Input label="הפק מס״ב לתאריך" type="date" value={masavDate} onChange={(e) => setMasavDate(e.target.value)} />
              <Input label="מונה שידור" type="number" value={String(masavCounter)} onChange={(e) => setMasavCounter(Number(e.target.value) || 1)} />
              <Button variant="primary" disabled={pendingForDate.length === 0} onClick={generateMasav}>🏦 הפק מס״ב ({pendingForDate.length})</Button>
            </div>
          </CardContent>
        </Card>

        {/* Credit queue — fired via Nedarim on the charge date */}
        {creditPending.length > 0 && (
          <Card>
            <CardHeader><h3 className="text-lg font-bold">💳 תור אשראי — נדרים ({creditPending.length})</h3></CardHeader>
            <CardContent>
              <div className="text-xs text-slate-500 mb-3">חיוב אשראי מבוצע בנדרים בתאריך שנקבע (אוטומטית פעם ביום), או ידנית בכפתור "בצע עכשיו".</div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-slate-500 border-b"><th className="text-start px-2 py-1">תלמיד</th><th className="text-start px-2 py-1">תאריך</th><th className="text-start px-2 py-1">סכום</th><th className="text-start px-2 py-1">סיבה</th><th></th></tr></thead>
                  <tbody>
                    {creditPending.map((c) => (
                      <tr key={c.id} className="border-b border-slate-50">
                        <td className="px-2 py-1.5">{studentName(c.student_id)}</td>
                        <td className="px-2 py-1.5 text-slate-600">{c.charge_date}{c.charge_date > todayStr && <span className="text-amber-600"> (עתידי)</span>}</td>
                        <td className="px-2 py-1.5 font-semibold">{ils(c.amount)}</td>
                        <td className="px-2 py-1.5 text-slate-500">{c.description || '—'}{c.nedarim_error && <span className="text-red-600"> · ✗ {c.nedarim_error}</span>}</td>
                        <td className="px-2 py-1.5 text-end whitespace-nowrap">
                          <Button size="sm" variant="primary" disabled={firing === c.id} onClick={() => fireCredit(c.id)}>{firing === c.id ? '…' : 'בצע עכשיו'}</Button>
                          <button onClick={() => removeCharge(c.id)} className="text-red-500 hover:text-red-700 ms-2">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sent groups awaiting confirmation */}
        {Object.keys(sentGroups).length > 0 && (
          <Card>
            <CardHeader><h3 className="text-lg font-bold">נשלחו — ממתינים לאישור הבנק</h3></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(sentGroups).map(([counter, items]) => (
                <div key={counter} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                  <div className="text-sm">שידור #{counter} · {items.length} חיובים · {ils(items.reduce((s, c) => s + Number(c.amount), 0))}</div>
                  <Button size="sm" variant="secondary" onClick={() => markPaid(Number(counter))}>סמן כנפרע</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </PageGuard>
  );
}
