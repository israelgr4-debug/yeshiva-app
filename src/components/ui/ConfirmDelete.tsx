'use client';

import { useState, ReactNode } from 'react';
import { Button } from './Button';

interface Props {
  trigger: (open: () => void) => ReactNode;
  title?: string;
  itemDescription: string; // e.g., "התלמיד ישראל כהן"
  consequences?: string; // e.g., "פעולה זו תמחק גם את כל ההיסטוריה שלו"
  onConfirm: () => Promise<void> | void;
}

// Double-confirmation delete dialog. First click: warning. Second click: typed confirmation.
export function ConfirmDelete({ trigger, title = 'אישור מחיקה', itemDescription, consequences, onConfirm }: Props) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [typedText, setTypedText] = useState('');
  const [working, setWorking] = useState(false);

  const requiredText = 'למחוק';

  const close = () => {
    setOpen(false);
    setStep(1);
    setTypedText('');
    setWorking(false);
  };

  const handleFirstConfirm = () => setStep(2);

  const handleFinalConfirm = async () => {
    if (typedText.trim() !== requiredText) return;
    setWorking(true);
    try {
      await onConfirm();
      close();
    } catch (err: any) {
      alert('שגיאה במחיקה: ' + (err?.message || err));
      setWorking(false);
    }
  };

  return (
    <>
      {trigger(() => setOpen(true))}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6 border-4 border-red-500">
            <div className="flex items-start gap-3 mb-4">
              <div className="bg-red-100 rounded-full p-2 flex-shrink-0">
                <span className="text-2xl">⚠️</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-red-900">{title}</h3>
                <p className="text-gray-600 text-sm mt-1">פעולה זו אינה הפיכה!</p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="font-bold text-red-900 mb-1">עומד להימחק:</p>
              <p className="text-red-700">{itemDescription}</p>
              {consequences && (
                <p className="text-sm text-red-600 mt-3 pt-3 border-t border-red-200">
                  <strong>שים לב:</strong> {consequences}
                </p>
              )}
            </div>

            {step === 1 && (
              <div className="flex gap-2">
                <Button variant="danger" onClick={handleFirstConfirm} className="flex-1">
                  אני מבין, להמשיך
                </Button>
                <Button variant="secondary" onClick={close} className="flex-1">
                  ביטול
                </Button>
              </div>
            )}

            {step === 2 && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    לאישור סופי, הקלד <strong className="font-mono bg-yellow-100 px-2 rounded">{requiredText}</strong>:
                  </label>
                  <input
                    type="text"
                    value={typedText}
                    onChange={(e) => setTypedText(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-red-300 rounded-lg focus:outline-none focus:border-red-500"
                    placeholder="הקלד כאן"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    onClick={handleFinalConfirm}
                    disabled={typedText.trim() !== requiredText || working}
                    className="flex-1"
                  >
                    {working ? 'מוחק...' : 'מחק לצמיתות'}
                  </Button>
                  <Button variant="secondary" onClick={close} className="flex-1" disabled={working}>
                    ביטול
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
