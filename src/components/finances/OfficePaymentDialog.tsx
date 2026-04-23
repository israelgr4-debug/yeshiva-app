'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/supabase';

interface Props {
  isOpen: boolean;
  studentId: string;
  defaultAmount?: number;
  onClose: () => void;
  onDone: () => void;
}

const METHOD_OPTIONS = [
  { value: 'cash', label: 'מזומן' },
  { value: 'check', label: 'צ״ק' },
  { value: 'transfer', label: 'העברה בנקאית' },
  { value: 'other', label: 'אחר' },
];

export function OfficePaymentDialog({ isOpen, studentId, defaultAmount, onClose, onDone }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : '');
  const [paymentDate, setPaymentDate] = useState(today);
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [coversMonth, setCoversMonth] = useState(thisMonth);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!amount || Number(amount) <= 0) {
      setError('חובה לציין סכום');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: profile } = userData?.user
        ? await supabase.from('app_users').select('id').eq('id', userData.user.id).maybeSingle()
        : { data: null };

      const { error } = await supabase.from('office_payments').insert({
        student_id: studentId,
        amount: Number(amount),
        payment_date: paymentDate,
        method,
        reference: reference || null,
        covers_month: coversMonth || null,
        notes: notes || null,
        received_by: profile?.id || null,
      });
      if (error) throw error;
      onDone();
      onClose();
      // reset
      setAmount('');
      setReference('');
      setNotes('');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-2xl max-w-lg w-full max-h-[95vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 bg-green-50">
          <h3 className="text-xl font-bold">💰 תשלום במשרד</h3>
          <p className="text-sm text-green-800 mt-1">מזין תשלום שהתקבל במשרד ומשייך לחודש</p>
        </div>

        <div className="p-6 space-y-3">
          <Input
            label="סכום (₪)*"
            type="number"
            min={0}
            step={10}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />

          <Input
            label="תאריך תשלום*"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />

          <div>
            <label className="block text-sm font-medium mb-1">אופן תשלום</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              {METHOD_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <Input
            label={method === 'check' ? 'מספר צ״ק' : 'אסמכתא'}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={method === 'check' ? '12345' : ''}
          />

          <Input
            label="עבור חודש (YYYY-MM)"
            type="month"
            value={coversMonth}
            onChange={(e) => setCoversMonth(e.target.value)}
          />

          <div>
            <label className="block text-sm font-medium mb-1">הערות</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded p-2 text-sm">{error}</div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-2">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? 'שומר...' : '✓ רשום תשלום'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving} className="flex-1">
            ביטול
          </Button>
        </div>
      </div>
    </div>
  );
}
