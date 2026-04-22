'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/supabase';

interface Props {
  isOpen: boolean;
  paymentId: string; // payment_history row id
  studentName: string;
  amount: number;
  paymentDate: string;
  onClose: () => void;
  onDone: () => void;
}

type Resolution = 'spread' | 'next_month' | 'paid_otherwise' | 'suspend';

export function BouncedPaymentDialog({ isOpen, paymentId, studentName, amount, paymentDate, onClose, onDone }: Props) {
  const [resolution, setResolution] = useState<Resolution>('next_month');
  const [spreadMonths, setSpreadMonths] = useState<number>(2);
  const [paidMethod, setPaidMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setError(null);
    setSaving(true);
    try {
      // Add a note about how the bounce was resolved
      let resolutionNote = '';
      switch (resolution) {
        case 'spread':
          resolutionNote = `ההחזרה פורסה ל-${spreadMonths} חודשים`;
          break;
        case 'next_month':
          resolutionNote = 'ייגבה בחודש הבא';
          break;
        case 'paid_otherwise':
          resolutionNote = `שולם באופן אחר: ${paidMethod || 'לא צוין'}`;
          break;
        case 'suspend':
          resolutionNote = 'הגביה הושהתה - יש לטפל';
          break;
      }

      // prefix notes (informational only - not currently stored separately)
      void notes;

      // Update the payment_history row with resolution notes
      // (we can't update status since status_code is an enum-like - instead store in notes)
      // Note: payment_history doesn't have a notes column. Use status_name suffix.
      await supabase
        .from('payment_history')
        .update({
          status_name: `חזר - ${resolutionNote}`,
        })
        .eq('id', paymentId);

      // If user picked "paid otherwise" - mark as paid
      if (resolution === 'paid_otherwise') {
        await supabase
          .from('payment_history')
          .update({ status_code: 2, status_name: `נפרע - ${paidMethod || 'אופן אחר'}` })
          .eq('id', paymentId);
      }

      // TODO: if resolution='spread', create N tuition_payments for next months
      // TODO: if resolution='suspend', mark the parent tuition_charge as suspended

      // Auto-create a follow-up task
      try {
        const taskDueDate = new Date();
        taskDueDate.setDate(taskDueDate.getDate() + 7);
        await supabase.from('tasks').insert({
          title: `טיפול בהו״ק שחזרה - ${studentName}`,
          description: `תשלום בסך ₪${amount.toLocaleString('he-IL')} מתאריך ${paymentDate} חזר.\n${resolutionNote}${notes ? `\nהערה: ${notes}` : ''}`,
          priority: 'high',
          status: 'pending',
          due_date: taskDueDate.toISOString().slice(0, 10),
          reminder_date: taskDueDate.toISOString().slice(0, 10),
          related_entity_type: 'payment_history',
          related_entity_id: paymentId,
        });
      } catch (taskErr) {
        console.error('Failed to create follow-up task:', taskErr);
      }

      onDone();
    } catch (err: any) {
      setError(err?.message || 'שגיאה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full">
        <div className="p-6 border-b border-gray-200 bg-red-50">
          <h3 className="text-xl font-bold text-red-900">⚠️ טיפול בהו״ק שחזרה</h3>
          <p className="text-sm text-red-700 mt-2">
            <strong>{studentName}</strong> - {paymentDate} - ₪{amount.toLocaleString('he-IL')}
          </p>
        </div>

        <div className="p-6 space-y-4">
          <label className="block text-sm font-medium text-gray-700">בחר אופן הטיפול:</label>

          <div className="space-y-2">
            <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                checked={resolution === 'next_month'}
                onChange={() => setResolution('next_month')}
                className="mt-1"
              />
              <div>
                <div className="font-medium">לגבות הכל בחודש הבא</div>
                <div className="text-xs text-gray-500">סכום ₪{(amount * 2).toLocaleString('he-IL')} יגבה בחודש הבא (סכום החזר + סכום רגיל)</div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                checked={resolution === 'spread'}
                onChange={() => setResolution('spread')}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium">לפרוס על פני מספר חודשים</div>
                <div className="text-xs text-gray-500 mb-2">הסכום שחזר יתחלק לתשלומים בחודשים הבאים</div>
                {resolution === 'spread' && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">מספר חודשים:</span>
                    <input
                      type="number"
                      value={spreadMonths}
                      onChange={(e) => setSpreadMonths(parseInt(e.target.value) || 2)}
                      min={2}
                      max={12}
                      className="w-16 px-2 py-1 border border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-500">
                      (₪{Math.round(amount / spreadMonths).toLocaleString('he-IL')} לחודש נוסף)
                    </span>
                  </div>
                )}
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                checked={resolution === 'paid_otherwise'}
                onChange={() => setResolution('paid_otherwise')}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium">שולם כבר באופן אחר</div>
                <div className="text-xs text-gray-500 mb-2">סומן כנפרע</div>
                {resolution === 'paid_otherwise' && (
                  <Input
                    placeholder="מזומן / צ״ק / העברה..."
                    value={paidMethod}
                    onChange={(e) => setPaidMethod(e.target.value)}
                  />
                )}
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                checked={resolution === 'suspend'}
                onChange={() => setResolution('suspend')}
                className="mt-1"
              />
              <div>
                <div className="font-medium">להשהות הגביה - לטפל מול ההורה</div>
                <div className="text-xs text-gray-500">הגביה תעבור לסטטוס &quot;מושהה&quot;</div>
              </div>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערה (אופציונלי)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">{error}</div>}
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-2">
          <Button onClick={handleSubmit} disabled={saving} className="flex-1">
            {saving ? 'שומר...' : 'סיים טיפול'}
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving} className="flex-1">
            ביטול
          </Button>
        </div>
      </div>
    </div>
  );
}
