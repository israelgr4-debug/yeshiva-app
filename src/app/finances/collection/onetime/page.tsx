'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';

interface StudentLite {
  id: string;
  first_name: string;
  last_name: string;
  status: string | null;
  institution_name: string | null;
  shiur: string | null;
}

type Method = 'cash' | 'check' | 'transfer' | 'credit' | 'other';

const METHOD_LABEL: Record<Method, string> = {
  cash: 'מזומן',
  check: 'צ׳ק',
  transfer: 'העברה בנקאית',
  credit: 'אשראי',
  other: 'אחר',
};

export default function OneTimeCollectionPage() {
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [coversMonth, setCoversMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [method, setMethod] = useState<Method>('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // recent collections
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const all: StudentLite[] = [];
      for (let p = 0; p < 20; p++) {
        const { data } = await supabase
          .from('students')
          .select('id, first_name, last_name, status, institution_name, shiur')
          .range(p * 1000, (p + 1) * 1000 - 1);
        if (!data || data.length === 0) break;
        all.push(...(data as StudentLite[]));
        if (data.length < 1000) break;
      }
      // Sort active first, then by last_name
      all.sort((a, b) => {
        if ((a.status === 'active') !== (b.status === 'active')) {
          return a.status === 'active' ? -1 : 1;
        }
        return (a.last_name || '').localeCompare(b.last_name || '', 'he');
      });
      setStudents(all);
      setLoading(false);
    })();
    loadRecent();
  }, []);

  const loadRecent = async () => {
    const { data } = await supabase
      .from('office_payments')
      .select('id, student_id, amount, payment_date, method, reference, covers_month, notes, created_at')
      .order('created_at', { ascending: false })
      .limit(15);
    setRecent(data || []);
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

  const handleSubmit = async () => {
    setStatus(null);
    if (!selectedId) { setStatus({ ok: false, msg: 'בחר תלמיד' }); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { setStatus({ ok: false, msg: 'הזן סכום תקין' }); return; }
    if (!paymentDate) { setStatus({ ok: false, msg: 'הזן תאריך' }); return; }

    if (!confirm(
      `לסמן גביה חד-פעמית של ${selected?.last_name} ${selected?.first_name}?\n` +
      `סכום: ₪${amt.toLocaleString('he-IL')}\n` +
      `תאריך: ${paymentDate}\n` +
      `אמצעי: ${METHOD_LABEL[method]}${reference ? ` (${reference})` : ''}`
    )) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('office_payments').insert({
        student_id: selectedId,
        amount: amt,
        payment_date: paymentDate,
        method,
        reference: reference || null,
        covers_month: coversMonth || null,
        notes: notes || null,
      });
      if (error) throw error;

      setStatus({ ok: true, msg: `✅ נרשם בהצלחה - ₪${amt.toLocaleString('he-IL')} עבור ${selected?.last_name} ${selected?.first_name}` });
      // Clear form for next entry
      setAmount('');
      setReference('');
      setNotes('');
      // Don't clear student - might do multiple for same student
      await loadRecent();
    } catch (e: any) {
      setStatus({ ok: false, msg: 'שגיאה: ' + (e?.message || e) });
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (n: number) => `₪${Number(n).toLocaleString('he-IL')}`;

  return (
    <>
      <Header title="גביה חד-פעמית" subtitle="קבלת תשלום ידני מתלמיד (מזומן / צ׳ק / העברה / אשראי)" />

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
                          {selected.institution_name || '—'} · {selected.shiur || 'ללא שיעור'} · {selected.status || ''}
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

                {/* Amount + date */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
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
                    <label className="block text-sm font-medium text-gray-700 mb-1">תאריך התשלום</label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">בגין חודש</label>
                    <input
                      type="month"
                      value={coversMonth}
                      onChange={(e) => setCoversMonth(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                {/* Method + reference */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">אמצעי תשלום</label>
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value as Method)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      {(Object.keys(METHOD_LABEL) as Method[]).map((m) => (
                        <option key={m} value={m}>{METHOD_LABEL[m]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {method === 'check' ? 'מספר צ׳ק' : method === 'transfer' ? 'אסמכתא' : 'אסמכתא / מס׳'}
                    </label>
                    <input
                      type="text"
                      value={reference}
                      onChange={(e) => setReference(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder={method === 'check' ? '12345' : ''}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">הערה</label>
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
                  <Button onClick={handleSubmit} disabled={saving || !selectedId || !amount}>
                    {saving ? 'שומר...' : '✓ בצע גביה'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent */}
          <div>
            <Card>
              <CardHeader>
                <h3 className="text-lg font-bold">🕐 גביות אחרונות</h3>
              </CardHeader>
              <CardContent>
                {recent.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">עדיין אין גביות חד-פעמיות</p>
                ) : (
                  <div className="space-y-2">
                    {recent.map((r) => {
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
                            {r.payment_date} · {METHOD_LABEL[r.method as Method] || r.method}
                            {r.reference && ` · ${r.reference}`}
                          </div>
                          {r.covers_month && (
                            <div className="text-xs text-gray-400">בגין {r.covers_month}</div>
                          )}
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
