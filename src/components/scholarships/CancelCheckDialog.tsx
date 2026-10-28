'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useScholarships } from '@/hooks/useScholarships';
import { ScholarshipPayment } from '@/lib/types';
import { ils, dmy } from './shared';

// "צ'ק בוטל": reason + the question "להכניס לתשלומים חד פעמיים?" in one dialog.

const REASONS = ['אבד', 'נקרע', 'לא עבר בבנק', 'אחר'];

export function CancelCheckDialog({ payment, studentName, onClose, onDone }: {
  payment: ScholarshipPayment;
  studentName: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const sch = useScholarships();
  const [reason, setReason] = useState('אבד');
  const [other, setOther] = useState('');
  const [move, setMove] = useState(true);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const r = reason === 'אחר' ? other.trim() || 'אחר' : reason;
    setBusy(true);
    try {
      const res = await sch.cancelCheck(payment.id, r, move);
      onDone(res.replacement
        ? `✓ הצ'ק סומן כמבוטל ונוספה שורה לתשלומים החד פעמיים (${ils(Number(payment.amount))})`
        : `✓ הצ'ק סומן כמבוטל — הסכום חזר להיות פתוח לתלמיד`);
    } catch (e: any) {
      alert(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-center pt-24 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <div>
          <h3 className="font-bold text-lg">🚫 צ׳ק בוטל</h3>
          <p className="text-sm text-slate-600 mt-1">
            {studentName} · {ils(Number(payment.amount))} · צ׳ק מ-{dmy(payment.paid_at)}
          </p>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium text-slate-700">סיבה</div>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${reason === r ? 'bg-red-600 text-white border-red-600' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                {r}
              </button>
            ))}
          </div>
          {reason === 'אחר' && (
            <input autoFocus value={other} onChange={(e) => setOther(e.target.value)} placeholder="פרט סיבה…"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          )}
        </div>

        <label className="flex items-start gap-2 p-3 rounded-xl bg-orange-50 border border-orange-200 text-sm cursor-pointer">
          <input type="checkbox" className="mt-1" checked={move} onChange={(e) => setMove(e.target.checked)} />
          <span>
            <b>להכניס שורה לתשלומים החד פעמיים?</b>
            <span className="block text-xs text-slate-600 mt-0.5">
              {move
                ? 'ייווצר "צ׳ק חלופי" ברשימת החד פעמיים, והסכום לא יופיע שוב בדוחות הרגילים.'
                : 'הסכום יחזור להיות פתוח, ויופיע שוב בדוח הרגיל הבא של אותו רכיב.'}
            </span>
          </span>
        </label>

        <p className="text-xs text-slate-500">הצ׳ק לא נמחק: הוא יוצג בכרטיס התלמיד כמבוטל, עם הסיבה.</p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>חזרה</Button>
          <Button variant="danger" onClick={submit} disabled={busy}>{busy ? 'מבטל…' : 'סמן צ׳ק כמבוטל'}</Button>
        </div>
      </div>
    </div>
  );
}
