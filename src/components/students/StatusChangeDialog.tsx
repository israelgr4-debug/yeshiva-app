'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export type StatusChange =
  | 'leave' // active → inactive / graduated
  | 'chizuk' // active → chizuk
  | 'return'; // inactive / chizuk → active

interface Props {
  isOpen: boolean;
  change: StatusChange;
  newStatus: string; // 'inactive' | 'graduated' | 'chizuk' | 'active'
  onCancel: () => void;
  onConfirm: (data: { exitDate?: string; expectedReturn?: string; entryDate?: string; notes?: string }) => Promise<void>;
}

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_LABELS: Record<string, string> = {
  active: 'פעיל',
  inactive: 'לא פעיל / עזב',
  graduated: 'סיים',
  chizuk: 'חיזוק',
};

export function StatusChangeDialog({ isOpen, change, newStatus, onCancel, onConfirm }: Props) {
  const [exitDate, setExitDate] = useState(today());
  const [expectedReturn, setExpectedReturn] = useState('');
  const [entryDate, setEntryDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isLeave = change === 'leave';
  const isChizuk = change === 'chizuk';
  const isReturn = change === 'return';

  const title = isLeave
    ? `יציאה מהמערכת - סטטוס: ${STATUS_LABELS[newStatus] || newStatus}`
    : isChizuk
    ? 'יציאה לחיזוק'
    : 'חזרה למערכת (סטטוס פעיל)';

  const handleConfirm = async () => {
    setError(null);

    if (isLeave || isChizuk) {
      if (!exitDate) {
        setError('חובה למלא תאריך יציאה');
        return;
      }
    }
    if (isChizuk && !expectedReturn) {
      // אופציונלי - אבל מומלץ
    }
    if (isReturn && !entryDate) {
      setError('חובה למלא תאריך חזרה');
      return;
    }

    setSaving(true);
    try {
      await onConfirm({
        exitDate: isLeave || isChizuk ? exitDate : undefined,
        expectedReturn: isChizuk ? expectedReturn || undefined : undefined,
        entryDate: isReturn ? entryDate : undefined,
        notes: notes.trim() || undefined,
      });
    } catch (err: any) {
      setError(err?.message || 'שגיאה');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold">{title}</h3>
          <p className="text-sm text-gray-600 mt-1">
            {isLeave && 'התלמיד יצא מהישיבה. הזן תאריך יציאה וסיבה (אופציונלי).'}
            {isChizuk && 'התלמיד יוצא לחיזוק. הזן תאריך יציאה ותאריך חזרה משוער.'}
            {isReturn && 'התלמיד חוזר למערכת. הזן תאריך חזרה.'}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {(isLeave || isChizuk) && (
            <Input
              label={isChizuk ? 'תאריך יציאה לחיזוק *' : 'תאריך יציאה *'}
              type="date"
              value={exitDate}
              onChange={(e) => setExitDate(e.target.value)}
            />
          )}

          {isChizuk && (
            <Input
              label="תאריך חזרה משוער (אופציונלי)"
              type="date"
              value={expectedReturn}
              onChange={(e) => setExpectedReturn(e.target.value)}
            />
          )}

          {isReturn && (
            <Input
              label="תאריך חזרה *"
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
            />
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">הערה (אופציונלי)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder={isLeave ? 'סיבת יציאה...' : isChizuk ? 'סיבת חיזוק...' : 'הערה כללית'}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">{error}</div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-2">
          <Button onClick={handleConfirm} disabled={saving} className="flex-1">
            {saving ? 'שומר...' : 'אשר ושמור'}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={saving} className="flex-1">
            ביטול
          </Button>
        </div>
      </div>
    </div>
  );
}
