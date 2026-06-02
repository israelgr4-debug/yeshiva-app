'use client';

import { useMemo, useState } from 'react';
import { Graduate } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';

type Scope = 'all' | 'machzor' | 'father' | 'single';

interface Props {
  graduates: Graduate[];   // all non-pending graduates already loaded by parent
  onClose: () => void;
}

export function SendUpdateRequestsDialog({ graduates, onClose }: Props) {
  const [scope, setScope] = useState<Scope>('all');
  const [selectedMachzorim, setSelectedMachzorim] = useState<Set<string>>(new Set());
  const [selectedFather, setSelectedFather] = useState<string>('');
  const [fatherSearch, setFatherSearch] = useState('');
  const [singleGradId, setSingleGradId] = useState<string>('');
  const [singleSearch, setSingleSearch] = useState('');
  const [mode, setMode] = useState<'first' | 'reminder'>('first');
  const [batchLimit, setBatchLimit] = useState(50);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; queued: number; errors?: { graduate_id: string; error: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // === Computed lookups ===
  const machzorim = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of graduates) {
      const m = (g.machzor_name || '').trim();
      if (!m) continue;
      if (!g.email || g.email_unsubscribed) continue;
      counts[m] = (counts[m] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [graduates]);

  const fathers = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of graduates) {
      const f = (g.father_name || '').trim();
      if (!f) continue;
      counts[f] = (counts[f] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count); // sort by # of siblings desc
  }, [graduates]);

  // === Filtered list ===
  const recipients = useMemo(() => {
    const withEmail = graduates.filter(
      (g) => g.email && /\S+@\S+\.\S+/.test(g.email) && !g.email_unsubscribed
    );
    switch (scope) {
      case 'all':
        return withEmail;
      case 'machzor':
        if (selectedMachzorim.size === 0) return [];
        return withEmail.filter((g) => g.machzor_name && selectedMachzorim.has(g.machzor_name.trim()));
      case 'father':
        if (!selectedFather) return [];
        return withEmail.filter((g) => (g.father_name || '').trim() === selectedFather);
      case 'single':
        if (!singleGradId) return [];
        return withEmail.filter((g) => g.id === singleGradId);
      default:
        return [];
    }
  }, [graduates, scope, selectedMachzorim, selectedFather, singleGradId]);

  const stats = useMemo(() => {
    const allWithEmail = graduates.filter(
      (g) => g.email && /\S+@\S+\.\S+/.test(g.email) && !g.email_unsubscribed
    ).length;
    return { total: graduates.length, withEmail: allWithEmail, recipients: recipients.length };
  }, [graduates, recipients]);

  const filteredFathers = useMemo(() => {
    const q = fatherSearch.trim();
    if (!q) return fathers.slice(0, 30);
    return fathers.filter((f) => f.name.includes(q)).slice(0, 30);
  }, [fathers, fatherSearch]);

  const filteredSingle = useMemo(() => {
    const q = singleSearch.trim();
    if (!q) return [];
    return graduates
      .filter((g) => {
        const full = `${g.first_name} ${g.last_name}`;
        return full.includes(q) || (g.email || '').toLowerCase().includes(q.toLowerCase());
      })
      .slice(0, 15);
  }, [graduates, singleSearch]);

  // === Send ===
  const handleSend = async () => {
    if (sending) return;
    if (recipients.length === 0) return;

    const effectiveLimit = scope === 'all' ? batchLimit : recipients.length;
    const willSend = Math.min(recipients.length, effectiveLimit);

    if (!confirm(
      mode === 'reminder'
        ? `לשלוח תזכורת ל-${willSend} בוגרים שעדיין לא עדכנו?`
        : `לשלוח בקשת עדכון ל-${willSend} בוגרים?`
    )) return;

    setSending(true);
    setError(null);
    setResult(null);
    try {
      // For non-'all' scopes pass specific IDs; for 'all' pass limit only
      const body: any = { reminder: mode === 'reminder' };
      if (scope === 'all') {
        body.limit = batchLimit;
      } else {
        body.graduateIds = recipients.map((g) => g.id);
        body.limit = recipients.length;
      }
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess?.session?.access_token;
      if (!accessToken) {
        setError('פג תוקף ההתחברות, רענן את הדף');
        setSending(false);
        return;
      }
      const res = await fetch('/api/graduates/send-update-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
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

  const willSendCount = scope === 'all'
    ? Math.min(stats.recipients, batchLimit)
    : recipients.length;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">📧 שליחת בקשות עדכון</h2>
            <p className="text-sm text-slate-500 mt-1">בחירת נמענים ושליחה</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 mb-5 text-center text-sm">
          <Stat label="סה״כ" value={stats.total} tint="bg-slate-50 text-slate-700" />
          <Stat label="עם אימייל" value={stats.withEmail} tint="bg-blue-50 text-blue-700" />
          <Stat label="ישלחו עכשיו" value={willSendCount} tint="bg-emerald-50 text-emerald-700" />
        </div>

        {/* Scope picker */}
        <label className="block text-sm font-semibold text-slate-700 mb-1">קהל יעד</label>
        <div className="grid grid-cols-4 gap-1.5 mb-4">
          <ScopeBtn active={scope === 'single'} onClick={() => setScope('single')}>🧪 בודד</ScopeBtn>
          <ScopeBtn active={scope === 'father'} onClick={() => setScope('father')}>👨‍👦 אחים</ScopeBtn>
          <ScopeBtn active={scope === 'machzor'} onClick={() => setScope('machzor')}>🎓 מחזורים</ScopeBtn>
          <ScopeBtn active={scope === 'all'} onClick={() => setScope('all')}>🌍 הכל</ScopeBtn>
        </div>

        {/* Scope-specific picker */}
        {scope === 'single' && (
          <div className="mb-4">
            <input
              type="text"
              autoFocus
              placeholder="חפש בוגר לפי שם או אימייל..."
              value={singleSearch}
              onChange={(e) => { setSingleSearch(e.target.value); setSingleGradId(''); }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 mb-2"
            />
            {singleGradId ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm flex justify-between items-center">
                {(() => {
                  const g = graduates.find((x) => x.id === singleGradId);
                  return g ? (
                    <span>
                      ✓ <b>{g.first_name} {g.last_name}</b>
                      <span className="text-slate-500 mx-2">·</span>
                      <span className="text-slate-600 text-xs" dir="ltr">{g.email}</span>
                      {g.machzor_name && <span className="text-xs text-slate-500 mr-2">· מחזור {g.machzor_name}</span>}
                    </span>
                  ) : null;
                })()}
                <button onClick={() => { setSingleGradId(''); setSingleSearch(''); }} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
              </div>
            ) : (
              filteredSingle.length > 0 && (
                <div className="border border-slate-200 rounded-xl max-h-48 overflow-y-auto divide-y">
                  {filteredSingle.map((g) => {
                    const ok = g.email && /\S+@\S+\.\S+/.test(g.email) && !g.email_unsubscribed;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        disabled={!ok}
                        onClick={() => { setSingleGradId(g.id); setSingleSearch(''); }}
                        className={`w-full text-right px-3 py-2 text-sm flex justify-between items-center ${
                          ok ? 'hover:bg-blue-50' : 'opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <span>
                          <b>{g.first_name} {g.last_name}</b>
                          {g.machzor_name && <span className="text-xs text-slate-500 mr-2">מחזור {g.machzor_name}</span>}
                        </span>
                        <span className="text-xs text-slate-500" dir="ltr">
                          {g.email || '(אין מייל)'}
                          {g.email_unsubscribed && ' 🚫'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )
            )}
          </div>
        )}

        {scope === 'father' && (
          <div className="mb-4">
            <input
              type="text"
              autoFocus
              placeholder="חפש שם אב..."
              value={fatherSearch}
              onChange={(e) => setFatherSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 mb-2"
            />
            <p className="text-xs text-slate-500 mb-2">ממוין לפי מספר אחים. ייסגרו כל הבוגרים שאביהם בשם זה.</p>
            <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y">
              {filteredFathers.length === 0 && (
                <div className="text-center text-sm text-slate-400 py-6">אין תוצאות</div>
              )}
              {filteredFathers.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => setSelectedFather(f.name)}
                  className={`w-full text-right px-3 py-2 text-sm flex justify-between items-center ${
                    selectedFather === f.name ? 'bg-blue-100' : 'hover:bg-blue-50'
                  }`}
                >
                  <span>{f.name}</span>
                  <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{f.count} בנים</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {scope === 'machzor' && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs text-slate-500">בחר מחזור אחד או יותר. המספר ליד = בוגרים עם מייל</p>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedMachzorim(new Set(machzorim.map((m) => m.name)))}
                  className="text-xs text-blue-600 hover:underline"
                >בחר הכל</button>
                <span className="text-slate-300">·</span>
                <button
                  type="button"
                  onClick={() => setSelectedMachzorim(new Set())}
                  className="text-xs text-slate-500 hover:underline"
                >נקה</button>
              </div>
            </div>
            <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-0.5 p-1">
              {machzorim.map((m) => {
                const checked = selectedMachzorim.has(m.name);
                return (
                  <label
                    key={m.name}
                    className={`text-sm px-2 py-1.5 rounded cursor-pointer flex items-center gap-2 ${
                      checked ? 'bg-blue-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        const next = new Set(selectedMachzorim);
                        if (checked) next.delete(m.name); else next.add(m.name);
                        setSelectedMachzorim(next);
                      }}
                    />
                    <span className="flex-1">{m.name}</span>
                    <span className="text-xs text-slate-500">{m.count}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {scope === 'all' && (
          <div className="mb-4">
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              מקסימום נמענים בפעימה (השאר ימשיכו בפעימה הבאה)
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={batchLimit}
              onChange={(e) => setBatchLimit(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </div>
        )}

        {/* Preview of selected recipients */}
        {scope !== 'all' && recipients.length > 0 && (
          <div className="bg-slate-50 rounded-xl p-3 mb-4 text-xs">
            <div className="font-semibold text-slate-700 mb-1">ישלח אל ({recipients.length}):</div>
            <div className="space-y-0.5 max-h-32 overflow-y-auto">
              {recipients.slice(0, 12).map((g) => (
                <div key={g.id} className="flex justify-between text-slate-600">
                  <span>{g.first_name} {g.last_name}</span>
                  <span dir="ltr" className="text-slate-400">{g.email}</span>
                </div>
              ))}
              {recipients.length > 12 && (
                <div className="text-slate-400 italic">…ועוד {recipients.length - 12}</div>
              )}
            </div>
          </div>
        )}

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

        <div className="text-xs text-slate-500 mb-5 leading-relaxed">
          <p>• השליחה דרך Gmail (לפי הגדרות → אימייל). השהיה 1.2 שניות בין שליחות.</p>
          <p>• מומלץ להתחיל ב<b>בודד</b> כדי לוודא שהמייל נראה תקין.</p>
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
                    <li key={i}>{e.graduate_id.slice(0, 8)} — {e.error}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={onClose} disabled={sending}>סגור</Button>
          <Button onClick={handleSend} disabled={sending || willSendCount === 0}>
            {sending ? 'שולח...' : `📨 שלח ל-${willSendCount}`}
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

function ScopeBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-2 rounded-xl text-sm font-semibold transition-all border ${
        active
          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
      }`}
    >
      {children}
    </button>
  );
}
