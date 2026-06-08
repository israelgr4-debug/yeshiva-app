'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import { buildMasavFile, downloadFile, MasavCharge } from '@/lib/masav';

interface StudentLite {
  id: string;
  first_name: string;
  last_name: string;
  status: string | null;
  institution_name: string | null;
  shiur: string | null;
  family_id: string | null;
}

interface FamilyLite {
  id: string;
  family_name: string;
  father_name: string | null;
  father_id_number: string | null;
  bank_number: number | null;
  bank_branch: string | null;
  bank_account: string | null;
}

type Method = 'office' | 'bank_transfer' | 'standing_order';

const METHOD_LABEL: Record<Method, string> = {
  office: '💰 משרד (מזומן / צ׳ק)',
  bank_transfer: '🏦 העברה בנקאית',
  standing_order: '📝 הוראת קבע (לשליחה למס״ב)',
};

interface OneTimeChargeRow {
  id: string;
  student_id: string | null;
  family_id: string;
  amount: number;
  charge_date: string;
  description: string | null;
  status: string;
  masav_send_counter: number | null;
  created_at: string;
}

export default function OneTimeCollectionPage() {
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [families, setFamilies] = useState<Record<string, FamilyLite>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<Method>('office');
  const [chargeDate, setChargeDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const [recentOffice, setRecentOffice] = useState<any[]>([]);
  const [queueHK, setQueueHK] = useState<OneTimeChargeRow[]>([]);
  const [masavDate, setMasavDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [masavCounter, setMasavCounter] = useState<number>(1);
  const [generatingMasav, setGeneratingMasav] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const all: StudentLite[] = [];
      for (let p = 0; p < 20; p++) {
        const { data } = await supabase
          .from('students')
          .select('id, first_name, last_name, status, institution_name, shiur, family_id')
          .range(p * 1000, (p + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        all.push(...(data as StudentLite[]));
        if (data.length < 1000) break;
      }
      all.sort((a, b) => {
        if ((a.status === 'active') !== (b.status === 'active')) {
          return a.status === 'active' ? -1 : 1;
        }
        return (a.last_name || '').localeCompare(b.last_name || '', 'he');
      });
      setStudents(all);

      // Load families (for bank info)
      const famIds = Array.from(new Set(all.map((s) => s.family_id).filter(Boolean))) as string[];
      const fmap: Record<string, FamilyLite> = {};
      for (let i = 0; i < famIds.length; i += 500) {
        const chunk = famIds.slice(i, i + 500);
        const { data } = await supabase
          .from('families')
          .select('id, family_name, father_name, father_id_number, bank_number, bank_branch, bank_account')
          .in('id', chunk);
        for (const f of (data || []) as FamilyLite[]) fmap[f.id] = f;
      }
      setFamilies(fmap);

      setLoading(false);
    })();
    loadRecent();
    loadQueue();
  }, []);

  const loadRecent = async () => {
    const { data } = await supabase
      .from('office_payments')
      .select('id, student_id, amount, payment_date, method, reference, covers_month, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    setRecentOffice(data || []);
  };

  const loadQueue = async () => {
    const { data } = await supabase
      .from('one_time_charges')
      .select('id, student_id, family_id, amount, charge_date, description, status, masav_send_counter, created_at')
      .order('charge_date', { ascending: true })
      .limit(200);
    setQueueHK((data || []) as OneTimeChargeRow[]);
  };

  const filteredStudents = useMemo(() => {
    const q = search.trim();
    if (!q) return students.slice(0, 50);
    return students
      .filter((s) => {
        const full = `${s.first_name || ''} ${s.last_name || ''}`;
        return full.includes(q) || (s.last_name || '').includes(q) || (s.first_name || '').includes(q);
      })
      .slice(0, 50);
  }, [students, search]);

  const selected = useMemo(() => students.find((s) => s.id === selectedId), [students, selectedId]);
  const selectedFamily = useMemo(
    () => (selected?.family_id ? families[selected.family_id] : null),
    [selected, families]
  );

  // For standing_order method, family bank info must be valid
  const bankIssues = useMemo(() => {
    if (method !== 'standing_order') return [];
    if (!selected) return [];
    const issues: string[] = [];
    if (!selectedFamily) issues.push('לתלמיד אין משפחה משויכת');
    else {
      if (!selectedFamily.bank_number) issues.push('חסר מספר בנק');
      if (!selectedFamily.bank_branch) issues.push('חסר סניף');
      if (!selectedFamily.bank_account) issues.push('חסר חשבון');
    }
    return issues;
  }, [method, selected, selectedFamily]);

  const handleSubmit = async () => {
    setStatus(null);
    if (!selectedId || !selected) { setStatus({ ok: false, msg: 'בחר תלמיד' }); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { setStatus({ ok: false, msg: 'הזן סכום תקין' }); return; }
    if (!chargeDate) { setStatus({ ok: false, msg: 'הזן תאריך' }); return; }
    if (method === 'standing_order' && bankIssues.length > 0) {
      setStatus({ ok: false, msg: 'לא ניתן לרשום הוראת קבע: ' + bankIssues.join(', ') });
      return;
    }

    const confirmMsg =
      `${selected.last_name} ${selected.first_name}\n` +
      `סכום: ₪${amt.toLocaleString('he-IL')}\n` +
      `אמצעי: ${METHOD_LABEL[method]}\n` +
      (method === 'standing_order' ? `תאריך חיוב: ${chargeDate}\n` : `תאריך תשלום: ${chargeDate}\n`) +
      (description ? `תיאור: ${description}\n` : '') +
      `\n${method === 'standing_order' ? 'יתווסף לתור הוראת קבע - תוכל להפיק קובץ מס״ב.' : 'התשלום ייכנס כגביה במשרד.'}`;

    if (!confirm(confirmMsg)) return;

    setSaving(true);
    try {
      if (method === 'standing_order') {
        const { error } = await supabase.from('one_time_charges').insert({
          student_id: selectedId,
          family_id: selected.family_id,
          amount: amt,
          charge_date: chargeDate,
          description: description || null,
          notes: notes || null,
          status: 'pending',
        });
        if (error) throw error;
        await loadQueue();
        setStatus({ ok: true, msg: `✅ נוסף לתור הוראת קבע - ₪${amt.toLocaleString('he-IL')}` });
      } else {
        const officeMethod = method === 'bank_transfer' ? 'transfer' : 'cash';
        const { error } = await supabase.from('office_payments').insert({
          student_id: selectedId,
          amount: amt,
          payment_date: chargeDate,
          method: officeMethod,
          reference: null,
          covers_month: chargeDate.slice(0, 7),
          notes: (description ? description : '') + (notes ? ` ${notes}` : '') || null,
        });
        if (error) throw error;
        await loadRecent();
        setStatus({ ok: true, msg: `✅ נרשם בהצלחה - ₪${amt.toLocaleString('he-IL')}` });
      }
      setAmount('');
      setDescription('');
      setNotes('');
    } catch (e: any) {
      setStatus({ ok: false, msg: 'שגיאה: ' + (e?.message || e) });
    } finally {
      setSaving(false);
    }
  };

  // ==== MASAV generation from queue ====
  const queuePendingForDate = useMemo(
    () => queueHK.filter((c) => c.status === 'pending' && c.charge_date === masavDate),
    [queueHK, masavDate]
  );

  const queuePendingTotal = useMemo(
    () => queuePendingForDate.reduce((sum, c) => sum + Number(c.amount), 0),
    [queuePendingForDate]
  );

  const handleGenerateMasav = async () => {
    if (queuePendingForDate.length === 0) {
      alert('אין הוראות בתור לתאריך זה');
      return;
    }

    // Validate each row's family has bank details
    const validRows = queuePendingForDate.filter((c) => {
      const f = families[c.family_id];
      return f && f.bank_number && f.bank_branch && f.bank_account;
    });
    const invalidRows = queuePendingForDate.length - validRows.length;
    if (validRows.length === 0) {
      alert(`לכל ${queuePendingForDate.length} ההוראות חסרים פרטי בנק במשפחה`);
      return;
    }
    if (invalidRows > 0) {
      if (!confirm(`${invalidRows} שורות יחסרו פרטי בנק - יידלגו. להמשיך עם ${validRows.length} שורות?`)) return;
    } else {
      if (!confirm(`להפיק קובץ מס״ב עם ${validRows.length} הוראות (₪${queuePendingTotal.toLocaleString('he-IL')})?`)) return;
    }

    setGeneratingMasav(true);
    try {
      const masavCharges: MasavCharge[] = validRows.map((c, idx) => {
        const f = families[c.family_id]!;
        return {
          reference: String(idx + 1),
          bankNumber: Number(f.bank_number) || 0,
          branch: Number(f.bank_branch) || 0,
          accountNumber: String(f.bank_account || ''),
          payerIdNumber: String(f.father_id_number || ''),
          payerName: `${f.family_name} ${f.father_name || ''}`.trim(),
          amountAgorot: Math.round(Number(c.amount) * 100),
        };
      });

      const content = buildMasavFile(
        {
          mosadNumber: '7001496',
          mosadName: 'ישיבת מיר מודיעין עילית',
          chargeDate: masavDate,
          sendCounter: masavCounter,
        },
        masavCharges
      );
      const filename = `masav_onetime_${masavDate.replace(/-/g, '')}_${masavCounter}.txt`;
      downloadFile(filename, content);

      // Mark the rows as sent
      const ids = validRows.map((c) => c.id);
      const { error } = await supabase
        .from('one_time_charges')
        .update({
          status: 'sent',
          masav_send_counter: masavCounter,
          masav_sent_at: new Date().toISOString(),
        })
        .in('id', ids);
      if (error) throw error;

      setMasavCounter((c) => c + 1);
      await loadQueue();
      alert('✅ הקובץ ירד. סומן בתור כ"נשלח". אחרי שהבנק יחייב - חזור ולחץ "סמן כנפרע".');
    } catch (e: any) {
      alert('שגיאה: ' + (e?.message || e));
    } finally {
      setGeneratingMasav(false);
    }
  };

  // Mark all "sent" rows for a given send_counter as paid
  const handleMarkSentAsPaid = async (counter: number) => {
    const items = queueHK.filter((c) => c.status === 'sent' && c.masav_send_counter === counter);
    if (items.length === 0) return;
    const total = items.reduce((s, c) => s + Number(c.amount), 0);
    if (!confirm(`לסמן ${items.length} הוראות שנשלחו (שידור #${counter}, ₪${total.toLocaleString('he-IL')}) כנפרעו?\n\n*** רק אחרי שהבנק חייב בפועל ***`)) return;
    const { error } = await supabase
      .from('one_time_charges')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .in('id', items.map((c) => c.id));
    if (error) { alert('שגיאה: ' + error.message); return; }

    // Also insert into office_payments so the gauge picks it up
    const inserts = items.filter((c) => c.student_id).map((c) => ({
      student_id: c.student_id,
      amount: Number(c.amount),
      payment_date: c.charge_date,
      method: 'bank_ho',
      reference: `MASAV-${counter}`,
      covers_month: c.charge_date.slice(0, 7),
      notes: 'הוראת קבע חד-פעמית' + (c.description ? `: ${c.description}` : ''),
    }));
    if (inserts.length > 0) {
      await supabase.from('office_payments').insert(inserts);
    }
    await loadQueue();
    await loadRecent();
  };

  const handleCancelCharge = async (id: string) => {
    if (!confirm('לבטל את ההוראה? לא ניתן להחזיר.')) return;
    await supabase.from('one_time_charges').update({ status: 'cancelled' }).eq('id', id);
    await loadQueue();
  };

  const formatCurrency = (n: number) => `₪${Number(n).toLocaleString('he-IL')}`;

  // Group queue by send_counter for "sent" rows so user can mark paid in bulk
  const sentByCounter = useMemo(() => {
    const m: Record<number, OneTimeChargeRow[]> = {};
    for (const c of queueHK) {
      if (c.status === 'sent' && c.masav_send_counter !== null && c.masav_send_counter !== undefined) {
        (m[c.masav_send_counter] ||= []).push(c);
      }
    }
    return m;
  }, [queueHK]);

  const pendingCount = queueHK.filter((c) => c.status === 'pending').length;

  return (
    <>
      <Header title="גביה חד-פעמית" subtitle="קבלת תשלום חד-פעמי מתלמיד / הוספת הוראת קבע חד-פעמית" />

      <div className="p-4 md:p-8 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/finances"
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            ← כספים
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Form */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <h3 className="text-lg font-bold">📥 גביה חדשה</h3>
              </CardHeader>
              <CardContent>
                {/* Student picker */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">תלמיד</label>
                  {selected ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-blue-900">
                          {selected.last_name} {selected.first_name}
                        </div>
                        <div className="text-xs text-blue-700 mt-0.5">
                          {selected.institution_name || '—'} · {selected.shiur || 'ללא שיעור'}
                          {selectedFamily && (
                            <span className="ml-2">· משפחה: {selectedFamily.family_name}</span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedId(null)}
                        className="text-blue-600 hover:text-blue-800 text-sm underline"
                      >
                        שנה
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        autoFocus
                        placeholder="חפש שם משפחה או שם פרטי..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-2"
                      />
                      {loading ? (
                        <div className="text-sm text-gray-500 text-center py-4">טוען...</div>
                      ) : (
                        <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y bg-white">
                          {filteredStudents.length === 0 ? (
                            <div className="text-center text-sm text-gray-400 py-4">אין תוצאות</div>
                          ) : (
                            filteredStudents.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => { setSelectedId(s.id); setSearch(''); }}
                                className={`w-full text-right px-3 py-2 text-sm hover:bg-blue-50 ${
                                  s.status !== 'active' ? 'opacity-60' : ''
                                }`}
                              >
                                <span className="font-semibold">{s.last_name} {s.first_name}</span>
                                <span className="text-xs text-gray-500 mr-2">
                                  · {s.institution_name || '—'} · {s.shiur || '—'}
                                  {s.status !== 'active' && ` · ${s.status}`}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Method */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">אמצעי תשלום</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMethod(m)}
                        className={`text-right p-3 rounded-xl border-2 transition-all text-sm font-semibold ${
                          method === m
                            ? 'border-blue-500 bg-blue-50 text-blue-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        {METHOD_LABEL[m]}
                      </button>
                    ))}
                  </div>
                  {method === 'standing_order' && selected && (
                    bankIssues.length > 0 ? (
                      <div className="bg-red-50 border border-red-200 text-red-700 rounded p-2 mt-2 text-sm">
                        ⚠ {bankIssues.join(', ')} - השלם פרטי בנק בכרטיס המשפחה לפני שליחת הוראת קבע
                      </div>
                    ) : selectedFamily ? (
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded p-2 mt-2 text-xs">
                        ✓ בנק {selectedFamily.bank_number} · סניף {selectedFamily.bank_branch} · חשבון {selectedFamily.bank_account}
                      </div>
                    ) : null
                  )}
                </div>

                {/* Amount + date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">סכום (₪)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-lg font-bold"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {method === 'standing_order' ? 'תאריך חיוב' : 'תאריך תשלום'}
                    </label>
                    <input
                      type="date"
                      value={chargeDate}
                      onChange={(e) => setChargeDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">תיאור (אופציונלי)</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="עבור מה (תרומה, השלמה, וכו׳)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                {/* Notes */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">הערה פנימית</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                {status && (
                  <div className={`p-3 rounded-lg mb-3 text-sm ${
                    status.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                    'bg-red-50 text-red-700 border border-red-200'
                  }`}>{status.msg}</div>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    onClick={handleSubmit}
                    disabled={saving || !selectedId || !amount || (method === 'standing_order' && bankIssues.length > 0)}
                  >
                    {saving
                      ? 'שומר...'
                      : method === 'standing_order'
                        ? '➕ הוסף לתור הוראת קבע'
                        : '✓ בצע גביה'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Standing-order queue + MASAV gen */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <h3 className="text-lg font-bold">
                    📝 תור הוראות קבע ({pendingCount} ממתינות)
                  </h3>
                </div>
              </CardHeader>
              <CardContent>
                {pendingCount === 0 && Object.keys(sentByCounter).length === 0 ? (
                  <p className="text-sm text-gray-400 italic">התור ריק. הוסף הוראות מהטופס למעלה.</p>
                ) : (
                  <>
                    {pendingCount > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                        <h4 className="font-semibold text-sm mb-2">הפקת קובץ מס״ב מהתור</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">תאריך חיוב</label>
                            <input
                              type="date"
                              value={masavDate}
                              onChange={(e) => setMasavDate(e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-gray-700 mb-1">מספר שידור</label>
                            <input
                              type="number"
                              min={1}
                              value={masavCounter}
                              onChange={(e) => setMasavCounter(Number(e.target.value) || 1)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </div>
                          <Button
                            size="sm"
                            onClick={handleGenerateMasav}
                            disabled={generatingMasav || queuePendingForDate.length === 0}
                          >
                            {generatingMasav
                              ? 'מפיק...'
                              : `💾 הפק (${queuePendingForDate.length} שורות · ₪${queuePendingTotal.toLocaleString('he-IL')})`}
                          </Button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          הקובץ יכלול רק הוראות עם <b>תאריך חיוב = {masavDate}</b> שעוד בסטטוס &quot;ממתין&quot;.
                        </p>
                      </div>
                    )}

                    {/* Pending */}
                    {pendingCount > 0 && (
                      <div className="mb-4">
                        <h4 className="font-semibold text-sm mb-2 text-amber-900">⏳ ממתינות ({pendingCount})</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="px-2 py-1 text-start">תלמיד</th>
                                <th className="px-2 py-1 text-start">משפחה</th>
                                <th className="px-2 py-1 text-start">תאריך חיוב</th>
                                <th className="px-2 py-1 text-start">סכום</th>
                                <th className="px-2 py-1 text-start">תיאור</th>
                                <th className="px-2 py-1 text-start"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {queueHK.filter((c) => c.status === 'pending').map((c) => {
                                const s = students.find((x) => x.id === c.student_id);
                                const f = families[c.family_id];
                                const hasBank = f && f.bank_number && f.bank_branch && f.bank_account;
                                return (
                                  <tr key={c.id} className="border-t border-gray-200">
                                    <td className="px-2 py-1">{s ? `${s.last_name} ${s.first_name}` : '—'}</td>
                                    <td className="px-2 py-1">
                                      {f?.family_name || '—'}
                                      {!hasBank && <span className="text-red-600 mr-1">⚠ חסר בנק</span>}
                                    </td>
                                    <td className="px-2 py-1 tabular-nums">{c.charge_date}</td>
                                    <td className="px-2 py-1 font-semibold">{formatCurrency(c.amount)}</td>
                                    <td className="px-2 py-1 text-xs text-gray-600">{c.description || ''}</td>
                                    <td className="px-2 py-1">
                                      <button
                                        type="button"
                                        onClick={() => handleCancelCharge(c.id)}
                                        className="text-xs text-red-600 hover:underline"
                                      >
                                        בטל
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Sent groups */}
                    {Object.keys(sentByCounter).length > 0 && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2 text-blue-900">📤 נשלחו - ממתינות לאישור הבנק</h4>
                        {Object.entries(sentByCounter).sort((a, b) => Number(b[0]) - Number(a[0])).map(([cnt, items]) => {
                          const tot = items.reduce((s, c) => s + Number(c.amount), 0);
                          return (
                            <div key={cnt} className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                              <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                                <div className="text-sm">
                                  <b>שידור #{cnt}</b> · {items.length} הוראות · {formatCurrency(tot)} · תאריך {items[0].charge_date}
                                </div>
                                <Button size="sm" onClick={() => handleMarkSentAsPaid(Number(cnt))}>
                                  ✅ סמן כנפרעו (הבנק חייב)
                                </Button>
                              </div>
                              <div className="text-xs text-blue-800 space-y-0.5 max-h-24 overflow-y-auto">
                                {items.map((c) => {
                                  const s = students.find((x) => x.id === c.student_id);
                                  return (
                                    <div key={c.id} className="flex justify-between">
                                      <span>{s ? `${s.last_name} ${s.first_name}` : '—'}</span>
                                      <span>{formatCurrency(c.amount)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent office */}
          <div>
            <Card>
              <CardHeader>
                <h3 className="text-lg font-bold">🕐 גביות אחרונות (משרד)</h3>
              </CardHeader>
              <CardContent>
                {recentOffice.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">עדיין אין גביות</p>
                ) : (
                  <div className="space-y-2">
                    {recentOffice.map((r) => {
                      const s = students.find((x) => x.id === r.student_id);
                      return (
                        <div key={r.id} className="bg-gray-50 rounded-lg p-2 text-sm">
                          <div className="flex justify-between">
                            <span className="font-semibold">
                              {s ? `${s.last_name} ${s.first_name}` : '—'}
                            </span>
                            <span className="font-bold text-emerald-700">{formatCurrency(r.amount)}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {r.payment_date} · {r.method}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
