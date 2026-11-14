'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuditLive, BigBoard, CallersList, PatrolList, MarkPanel, PrintButtons } from '@/components/attendance/live';

// PUBLIC team link of an open ביקורת נוכחות — no login. The link's token + the short code
// from the manager open it; it stops working when the audit is closed. Shows the central
// screen, the callers' and patrol lists (with printing) and screen marking. No ID numbers.

type View = 'board' | 'callers' | 'patrol' | 'mark';
const VIEWS: { id: View; label: string }[] = [
  { id: 'board', label: '📺 מסך מרכזי' }, { id: 'callers', label: '☎️ טלפנים' }, { id: 'patrol', label: '🚶 סיירים' }, { id: 'mark', label: '✓ סימון' },
];

export default function TeamAuditPage() {
  const { token } = useParams<{ token: string }>();
  const [code, setCode] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [view, setView] = useState<View>('board');
  const key = `audit-team-${token}`;

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (saved?.code) { setCode(saved.code); setName(saved.name || ''); }
    } catch { /* first visit */ }
  }, [key]);

  const live = useAuditLive(token || null, code, name || 'צוות');
  const wrongCode = live.error === 'קוד שגוי';
  useEffect(() => { if (wrongCode) { setCode(null); try { sessionStorage.removeItem(key); } catch { /* ignore */ } } }, [wrongCode, key]);

  const enter = () => {
    const c = codeInput.trim();
    if (!c) return;
    try { sessionStorage.setItem(key, JSON.stringify({ code: c, name })); } catch { /* ignore */ }
    setCode(c);
  };

  if (live.closed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 text-center" dir="rtl">
        <div>
          <div className="text-6xl mb-3">✅</div>
          <h1 className="text-2xl font-bold text-slate-800">{live.closed} נסגרה</h1>
          <p className="text-slate-500 mt-1">הקישור הזה כבר לא פעיל. תודה על העזרה.</p>
        </div>
      </div>
    );
  }

  if (!code) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6" dir="rtl">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
          <h1 className="text-xl font-bold text-slate-800 text-center">🛡️ ביקורת נוכחות — צוות</h1>
          {wrongCode && <div className="text-sm text-red-700 text-center">הקוד שגוי. נסו שוב.</div>}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="השם שלך (לרישום מי עדכן)" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <input value={codeInput} onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ''))} inputMode="numeric" dir="ltr" placeholder="קוד כניסה"
            onKeyDown={(e) => { if (e.key === 'Enter') enter(); }}
            className="w-full px-3 py-3 border border-slate-300 rounded-lg text-center text-2xl tracking-widest font-mono" />
          <button type="button" onClick={enter} className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-600 text-white font-semibold">כניסה</button>
        </div>
      </div>
    );
  }

  const pill = (on: boolean) => `px-4 py-2 rounded-full text-sm font-medium border ${on ? 'bg-gradient-to-r from-indigo-500 to-blue-600 text-white border-transparent' : 'bg-white border-slate-200 text-slate-600'}`;
  return (
    <div className="min-h-screen bg-slate-50 p-3 md:p-6 space-y-3" dir="rtl">
      <div className="no-print flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => <button key={v.id} type="button" className={pill(view === v.id)} onClick={() => setView(v.id)}>{v.label}</button>)}
      </div>
      {live.state && view !== 'board' && <PrintButtons state={live.state} kinds={view === 'callers' ? ['callers', 'missing', 'out'] : view === 'patrol' ? ['patrol'] : ['codes']} />}
      <div className="no-print">
        {live.error && !wrongCode && <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-2 text-sm">⚠️ {live.error}</div>}
        {!live.state ? <div className="py-20 text-center text-slate-400">טוען…</div>
          : view === 'board' ? <BigBoard state={live.state} updatedAt={live.updatedAt} />
          : view === 'callers' ? <CallersList state={live.state} act={live.act} canAct />
          : view === 'patrol' ? <PatrolList state={live.state} act={live.act} canAct />
          : <MarkPanel state={live.state} act={live.act} canAct />}
      </div>
    </div>
  );
}
