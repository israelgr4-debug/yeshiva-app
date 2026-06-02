'use client';

import { useMemo, useState } from 'react';
import { Graduate } from '@/lib/types';
import { Button } from '@/components/ui/Button';

interface Props {
  graduates: Graduate[];   // all non-pending graduates already loaded by parent
  onClose: () => void;
}

export function SendUpdateRequestsDialog({ graduates, onClose }: Props) {
  const [mode, setMode] = useState<'first' | 'reminder'>('first');
  const [batchSize, setBatchSize] = useState(50);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; queued: number; errors?: { email: string; error: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Eligibility on the client (only an estimate; server is authoritative)
  const stats = useMemo(() => {
    const withEmail = graduates.filter(
      (g) => g.email && /\S+@\S+\.\S+/.test(g.email) && !g.email_unsubscribed
    );
    const updatedRecently = withEmail.filter((g) => {
      if (!g.last_self_update_at) return false;
      const days = (Date.now() - new Date(g.last_self_update_at).getTime()) / 86400000;
      return days < 90;
    });
    return {
      total: graduates.length,
      withEmail: withEmail.length,
      updatedRecently: updatedRecently.length,
      eligible: withEmail.length - updatedRecently.length,
    };
  }, [graduates]);

  const handleSend = async () => {
    if (sending) return;
    if (!confirm(
      mode === 'reminder'
        ? `לשלוח תזכורת ל-${batchSize} בוגרים שעדיין לא עדכנו?`
        : `לשלוח בקשת עדכון ל-${batchSize} בוגרים?\n(נשלח עד הגבול שתוגדר, מי שכבר עדכן לאחרונה ידולג)`
    )) return;

    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/graduates/send-update-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminder: mode === 'reminder', limit: batchSize }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'השליחה נכשלה');
      } else {
        setResult(data);
      }
    } catch (e: any) {
      setError(e.message || 'שגיאת רשת');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">📧 שליחת בקשות עדכון</h2>
            <p className="text-sm text-slate-500 mt-1">לשלוח לבוגרים מייל לעדכון פרטיהם.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-5 text-center text-sm">
          <Stat label="סה״כ בוגרים" value={stats.total} tint="bg-slate-50 text-slate-700" />
          <Stat label="עם אימייל" value={stats.withEmail} tint="bg-blue-50 text-blue-700" />
          <Stat label="עדכנו לאחרונה" value={stats.updatedRecently} tint="bg-emerald-50 text-emerald-700" />
        </div>

        {/* Mode */}
        <label className="block text-sm font-semibold text-slate-700 mb-1">סוג שליחה</label>
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setMode('first')}
            className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold border ${
              mode === 'first' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'
            }`}
          >
            ראשונה
          </button>
          <button
            type="button"
            onClick={() => setMode('reminder')}
            className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold border ${
              mode === 'reminder' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-slate-700 border-slate-200'
            }`}
          >
            תזכורת חכמה
          </button>
        </div>

        {/* Batch size */}
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          מספר נמענים בפעימה זו (מומלץ עד 100)
        </label>
        <input
          type="number"
          min={1}
          max={500}
          value={batchSize}
          onChange={(e) => setBatchSize(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
          className="w-full px-3 py-2 rounded-xl border border-slate-200 mb-4"
        />

        <div className="text-xs text-slate-500 mb-5 leading-relaxed">
          <p>• השליחה דרך Gmail שלכם (לפי ההגדרות בהגדרות → אימייל).</p>
          <p>• השהיה של ~1.2 שניות בין שליחות כדי שלא נחסם.</p>
          <p>• אפשר להריץ שוב מאוחר יותר כדי להמשיך עם הבאים.</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm mb-4">{error}</div>
        )}

        {result && (
          <div className="bg-emerald-50 text-emerald-800 rounded-lg p-3 text-sm mb-4">
            <p>✓ נשלחו: <b>{result.sent}</b> · נכשלו: <b>{result.failed}</b> · בתור: <b>{result.queued}</b></p>
            {result.errors && result.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer">פירוט שגיאות ({result.errors.length})</summary>
                <ul className="mt-2 max-h-32 overflow-y-auto text-xs space-y-1">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e.email} — {e.error}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose} disabled={sending}>סגור</Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? 'שולח...' : `📨 שלח ל-${batchSize} בוגרים`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div className={`rounded-xl py-2 ${tint}`}>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}
