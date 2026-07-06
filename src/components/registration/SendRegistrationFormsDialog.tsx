'use client';

import { useEffect, useMemo, useState } from 'react';
import { Registration } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';

interface Props {
  registrations: Registration[]; // full list loaded by the parent page
  onClose: () => void;
}

const EMAIL_RE = /\S+@\S+\.\S+/;

// Resolve the single recipient address for a registration: father → candidate.
function resolveRecipient(r: Registration): { email: string; type: 'father' | 'student' } | null {
  const father = String(r.father_email || '').trim();
  if (father && EMAIL_RE.test(father)) return { email: father, type: 'father' };
  const student = String(r.email || '').trim();
  if (student && EMAIL_RE.test(student)) return { email: student, type: 'student' };
  return null;
}

const STATUS_LABEL: Record<string, string> = {
  registered: 'נרשם',
  tested: 'נבחן',
  accepted: 'התקבל',
  rejected: 'נדחה',
  converted: 'הומר',
};

interface HistoryRow {
  id: string;
  recipient_email: string;
  recipient_type: string;
  sent_at: string | null;
  send_error: string | null;
  sent_by: string | null;
  created_at: string;
  registrations: { first_name: string | null; last_name: string | null } | null;
}

export function SendRegistrationFormsDialog({ registrations, onClose }: Props) {
  const [view, setView] = useState<'send' | 'history'>('send');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    { sent: number; failed: number; skipped: number; deduped: number; queued: number; errors?: { registration_id: string; error: string }[] } | null
  >(null);

  // History
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const rows: HistoryRow[] = [];
      for (let p = 0; p < 20; p++) {
        const { data } = await supabase
          .from('registration_form_emails')
          .select('id, recipient_email, recipient_type, sent_at, send_error, sent_by, created_at, registrations(first_name, last_name)')
          .order('created_at', { ascending: false })
          .range(p * 1000, p * 1000 + 999);
        if (!data || data.length === 0) break;
        rows.push(...(data as unknown as HistoryRow[]));
        if (data.length < 1000) break;
      }
      setHistory(rows);
      setHistoryLoaded(true);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Load history the first time the tab is opened, and refresh after a send.
  useEffect(() => {
    if (view === 'history' && !historyLoaded) loadHistory();
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Candidates worth showing - hide already-converted (they're students now).
  const candidates = useMemo(
    () => registrations.filter((r) => r.status !== 'converted'),
    [registrations]
  );

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return candidates;
    const lq = q.toLowerCase();
    return candidates.filter((r) => {
      const name = `${r.first_name || ''} ${r.last_name || ''}`;
      const father = r.father_name || '';
      const email = `${r.father_email || ''} ${r.email || ''}`.toLowerCase();
      return name.includes(q) || father.includes(q) || email.includes(lq);
    });
  }, [candidates, search]);

  // Selected registrations → unique recipient emails (what actually gets sent)
  const willSend = useMemo(() => {
    const emails = new Set<string>();
    let withoutEmail = 0;
    for (const id of selected) {
      const r = candidates.find((x) => x.id === id);
      if (!r) continue;
      const rec = resolveRecipient(r);
      if (!rec) { withoutEmail++; continue; }
      emails.add(rec.email.toLowerCase());
    }
    return { unique: emails.size, withoutEmail };
  }, [selected, candidates]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectAllFiltered = () => {
    const next = new Set(selected);
    for (const r of filtered) next.add(r.id);
    setSelected(next);
  };

  const clearAll = () => setSelected(new Set());

  const handleSend = async () => {
    if (sending || selected.size === 0) return;
    if (!confirm(
      `לשלוח את טפסי הרישום ל-${willSend.unique} נמענים?` +
      (willSend.withoutEmail > 0 ? `\n(${willSend.withoutEmail} נרשמים ללא כתובת מייל ידולגו)` : '')
    )) return;

    setSending(true);
    setError(null);
    setResult(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess?.session?.access_token;
      if (!accessToken) {
        setError('פג תוקף ההתחברות, רענן את הדף');
        setSending(false);
        return;
      }
      const res = await fetch('/api/registration/send-forms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ registrationIds: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'השליחה נכשלה');
      } else {
        setResult(data);
        setSelected(new Set());
        setHistoryLoaded(false); // force refresh next time history is opened
      }
    } catch (e: any) {
      setError(e?.message || 'שגיאת רשת');
    } finally {
      setSending(false);
    }
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('he-IL', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">📧 טפסי רישום</h2>
            <p className="text-sm text-slate-500 mt-1">שליחת הטפסים להורי הנרשמים ומעקב</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        {/* Tab toggle */}
        <div className="flex gap-2 mb-5">
          <button
            type="button"
            onClick={() => setView('send')}
            className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${
              view === 'send' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
          >
            📨 שליחה חדשה
          </button>
          <button
            type="button"
            onClick={() => setView('history')}
            className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${
              view === 'history' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
            }`}
          >
            📜 היסטוריה
          </button>
        </div>

        {view === 'send' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mb-5 text-center text-sm">
              <Stat label="נבחרו" value={selected.size} tint="bg-slate-50 text-slate-700" />
              <Stat label="ישלחו" value={willSend.unique} tint="bg-emerald-50 text-emerald-700" />
              <Stat label="ללא מייל" value={willSend.withoutEmail} tint="bg-amber-50 text-amber-700" />
            </div>

            {/* Search + bulk actions */}
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                placeholder="חפש לפי שם נרשם / אב / אימייל..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
            <div className="flex justify-between items-center mb-2 text-xs">
              <span className="text-slate-500">{filtered.length} נרשמים ברשימה</span>
              <div className="flex gap-1">
                <button type="button" onClick={selectAllFiltered} className="text-blue-600 hover:underline">בחר הכל</button>
                <span className="text-slate-300">·</span>
                <button type="button" onClick={clearAll} className="text-slate-500 hover:underline">נקה</button>
              </div>
            </div>

            {/* List */}
            <div className="border border-slate-200 rounded-xl max-h-72 overflow-y-auto divide-y mb-4">
              {filtered.length === 0 && (
                <div className="text-center text-sm text-slate-400 py-8">אין תוצאות</div>
              )}
              {filtered.map((r) => {
                const rec = resolveRecipient(r);
                const checked = selected.has(r.id);
                return (
                  <label
                    key={r.id}
                    className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${
                      checked ? 'bg-blue-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggle(r.id)} className="shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="font-semibold">{r.first_name} {r.last_name}</span>
                      <span className="text-xs text-slate-400 mr-2">{STATUS_LABEL[r.status] || r.status}</span>
                    </span>
                    <span className="text-xs shrink-0" dir="ltr">
                      {rec ? (
                        <span className="text-slate-500">{rec.email}{rec.type === 'student' ? ' 👤' : ''}</span>
                      ) : (
                        <span className="text-amber-600">אין מייל</span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="text-xs text-slate-500 mb-4 leading-relaxed">
              <p>• הטפסים והנוסח מוגדרים ב<b>הגדרות → אימייל → טפסי רישום</b>.</p>
              <p>• נמען = כתובת האב, ואם אין - מייל המועמד (👤). כתובת שחוזרת נשלחת פעם אחת.</p>
              <p>• השליחה דרך Gmail עם השהיה קצרה בין מיילים - השארת החלון פתוח עד סיום.</p>
            </div>

            {error && <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm mb-4">{error}</div>}

            {result && (
              <div className="bg-emerald-50 text-emerald-800 rounded-lg p-3 text-sm mb-4">
                <p>
                  ✓ נשלחו: <b>{result.sent}</b> · נכשלו: <b>{result.failed}</b>
                  {result.skipped > 0 && <> · ללא מייל: <b>{result.skipped}</b></>}
                  {result.deduped > 0 && <> · כפולים: <b>{result.deduped}</b></>}
                </p>
                {result.errors && result.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer">פירוט שגיאות ({result.errors.length})</summary>
                    <ul className="mt-2 max-h-32 overflow-y-auto text-xs space-y-1">
                      {result.errors.map((e, i) => (
                        <li key={i}>{e.registration_id.slice(0, 8)} — {e.error}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={onClose} disabled={sending}>סגור</Button>
              <Button onClick={handleSend} disabled={sending || willSend.unique === 0}>
                {sending ? 'שולח...' : `📨 שלח ל-${willSend.unique}`}
              </Button>
            </div>
          </>
        )}

        {view === 'history' && (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 mb-4 text-center text-sm">
              <Stat label="סה״כ שליחות" value={history.length} tint="bg-slate-50 text-slate-700" />
              <Stat label="נשלחו" value={history.filter((h) => h.sent_at).length} tint="bg-emerald-50 text-emerald-700" />
              <Stat label="נכשלו" value={history.filter((h) => h.send_error).length} tint="bg-red-50 text-red-700" />
            </div>

            {loadingHistory ? (
              <div className="text-center py-10">
                <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 text-sm mt-3">טוען...</p>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center text-sm text-slate-400 py-10 border border-slate-200 rounded-xl mb-4">
                עדיין לא נשלחו טפסים
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl max-h-96 overflow-y-auto divide-y mb-4">
                {history.map((h) => {
                  const name = `${h.registrations?.first_name || ''} ${h.registrations?.last_name || ''}`.trim() || '(נרשם נמחק)';
                  return (
                    <div key={h.id} className="px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold truncate">{name}</span>
                        {h.sent_at ? (
                          <span className="text-xs text-emerald-600 shrink-0">✓ נשלח</span>
                        ) : (
                          <span className="text-xs text-red-600 shrink-0">✗ נכשל</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mt-0.5">
                        <span dir="ltr" className="truncate">{h.recipient_email}{h.recipient_type === 'student' ? ' 👤' : ''}</span>
                        <span className="shrink-0">{fmtDate(h.created_at)}</span>
                      </div>
                      {h.send_error && (
                        <div className="text-xs text-red-500 mt-1 truncate" title={h.send_error}>שגיאה: {h.send_error}</div>
                      )}
                      {h.sent_by && (
                        <div className="text-[11px] text-slate-400 mt-0.5">נשלח ע״י {h.sent_by}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={onClose}>סגור</Button>
              <Button onClick={loadHistory} disabled={loadingHistory}>
                {loadingHistory ? 'טוען...' : '🔄 רענן'}
              </Button>
            </div>
          </>
        )}
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
