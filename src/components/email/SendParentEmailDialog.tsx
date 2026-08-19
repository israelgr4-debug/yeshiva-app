'use client';

import { useEffect, useMemo, useState } from 'react';
import { Student, Family } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { SHIURIM } from '@/lib/shiurim';

interface Props {
  students: Student[];                    // full list loaded by the students page
  families: Record<string, Family>;       // family_id → family (holds parent emails)
  onClose: () => void;
}

const EMAIL_RE = /\S+@\S+\.\S+/;
const DEFAULT_SUBJECT = 'הודעה מישיבת מיר מודיעין עילית';
const DEFAULT_BODY = `לכבוד משפחת {{last_name}},

שלום וברכה,

[כתבו כאן את תוכן ההודעה]

בברכה,
{{from_name}}`;

const INSTITUTION_OPTIONS = [
  { value: '', label: 'כל המוסדות' },
  { value: 'ישיבה', label: 'ישיבה' },
  { value: 'כולל', label: 'כולל' },
  { value: "כולל של ר' יצחק פינקל", label: "כולל ר' יצחק פינקל" },
];
const STATUS_OPTIONS = [
  { value: 'active', label: 'פעיל' },
  { value: 'chizuk', label: 'חיזוק' },
  { value: 'inactive', label: 'לא פעיל' },
  { value: 'graduated', label: 'סיים' },
  { value: '', label: 'כל הסטטוסים' },
];

// The parent (household) recipient for a student: father → mother.
function resolveRecipient(fam: Family | undefined): { email: string; type: 'father' | 'mother' } | null {
  if (!fam) return null;
  const father = String(fam.father_email || '').trim();
  if (father && EMAIL_RE.test(father)) return { email: father, type: 'father' };
  const mother = String(fam.mother_email || '').trim();
  if (mother && EMAIL_RE.test(mother)) return { email: mother, type: 'mother' };
  return null;
}

interface Household {
  familyId: string;
  rep: Student;          // representative student (for the name placeholders)
  to: string;
  toType: 'father' | 'mother';
}

interface HistoryRow {
  id: string;
  recipient_email: string;
  recipient_type: string;
  cc_email: string | null;
  subject: string | null;
  sent_at: string | null;
  send_error: string | null;
  sent_by: string | null;
  created_at: string;
  students: { first_name: string | null; last_name: string | null } | null;
}

export function SendParentEmailDialog({ students, families, onClose }: Props) {
  const [view, setView] = useState<'send' | 'history'>('send');

  // Compose
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [includeMother, setIncludeMother] = useState(false);

  // Recipients
  const [mode, setMode] = useState<'group' | 'manual'>('group');
  const [selShiurim, setSelShiurim] = useState<Set<string>>(new Set());
  const [groupStatus, setGroupStatus] = useState('active');
  const [groupInstitution, setGroupInstitution] = useState('ישיבה');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set()); // manual: student ids

  const [batchLimit, setBatchLimit] = useState(50);
  const [sentFamilies, setSentFamilies] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    { sent: number; failed: number; skipped: number; deduped: number; queued: number; errors?: { student_id: string; error: string }[] } | null
  >(null);

  // History
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Prefill the last-used נוסח (saved by the send route).
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('system_settings').select('key, value')
        .in('key', ['parent_email_subject', 'parent_email_body']);
      for (const r of data || []) {
        if (r.key === 'parent_email_subject' && r.value) setSubject(String(r.value));
        if (r.key === 'parent_email_body' && r.value) setBody(String(r.value));
      }
    })();
  }, []);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const rows: HistoryRow[] = [];
      for (let p = 0; p < 20; p++) {
        const { data } = await supabase
          .from('parent_emails')
          .select('id, recipient_email, recipient_type, cc_email, subject, sent_at, send_error, sent_by, created_at, students(first_name, last_name)')
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
  useEffect(() => { if (view === 'history' && !historyLoaded) loadHistory(); }, [view]); // eslint-disable-line

  // Students matched by the current mode.
  const matchedStudents = useMemo(() => {
    if (mode === 'manual') return students.filter((s) => selected.has(s.id));
    return students.filter((s) => {
      if (groupStatus && s.status !== groupStatus) return false;
      if (groupInstitution && (s.institution_name || '') !== groupInstitution) return false;
      if (selShiurim.size > 0 && !selShiurim.has(s.shiur || '')) return false;
      if (selShiurim.size === 0) return false; // group mode requires ≥1 shiur
      return true;
    });
  }, [mode, students, selected, groupStatus, groupInstitution, selShiurim]);

  // Collapse to one household per family; count those with no parent email.
  const { households, withoutEmail } = useMemo(() => {
    const map = new Map<string, Household>();
    let noEmail = 0;
    for (const s of matchedStudents) {
      if (!s.family_id) { noEmail++; continue; }
      if (map.has(s.family_id)) continue; // sibling already represents the household
      const rec = resolveRecipient(families[s.family_id]);
      if (!rec) { noEmail++; continue; }
      map.set(s.family_id, { familyId: s.family_id, rep: s, to: rec.email, toType: rec.type });
    }
    const list = Array.from(map.values()).sort((a, b) =>
      (a.rep.last_name || '').localeCompare(b.rep.last_name || '', 'he') ||
      (a.rep.first_name || '').localeCompare(b.rep.first_name || '', 'he')
    );
    return { households: list, withoutEmail: noEmail };
  }, [matchedStudents, families]);

  // Households not yet sent in this session, then the current batch.
  const pending = useMemo(() => households.filter((h) => !sentFamilies.has(h.familyId)), [households, sentFamilies]);
  const batch = useMemo(() => pending.slice(0, batchLimit), [pending, batchLimit]);
  const remaining = Math.max(0, pending.length - batch.length);

  // Manual-mode list (search over all students).
  const manualList = useMemo(() => {
    const q = search.trim();
    const base = students;
    const filtered = q
      ? base.filter((s) => `${s.last_name || ''} ${s.first_name || ''}`.includes(q))
      : base;
    return filtered.slice(0, 300); // cap the rendered rows
  }, [students, search]);

  const toggle = (id: string) => setSelected((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleShiur = (name: string) => setSelShiurim((prev) => {
    const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n;
  });

  const composeValid = subject.trim().length > 0 && body.trim().length > 0;

  const handleSend = async () => {
    if (sending || batch.length === 0 || !composeValid) return;
    if (!confirm(
      `לשלוח את המייל להורי ${batch.length} משפחות?` +
      (includeMother ? '\n(כולל האם ב-CC כשקיים מייל נפרד)' : '') +
      (remaining > 0 ? `\n(מנה זו בלבד; ${remaining} משפחות נותרו למנה הבאה)` : '') +
      (withoutEmail > 0 ? `\n(${withoutEmail} תלמידים ללא מייל הורים - ידולגו)` : '')
    )) return;

    const batchFamilyIds = batch.map((h) => h.familyId);
    const studentIds = batch.map((h) => h.rep.id);
    setSending(true); setError(null); setResult(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess?.session?.access_token;
      if (!accessToken) { setError('פג תוקף ההתחברות, רענן את הדף'); setSending(false); return; }
      const res = await fetch('/api/parents/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ studentIds, subject, body, includeMother }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'השליחה נכשלה'); }
      else {
        setResult(data);
        setSentFamilies((prev) => new Set([...prev, ...batchFamilyIds])); // don't resend next batch
        setHistoryLoaded(false);
      }
    } catch (e: any) {
      setError(e?.message || 'שגיאת רשת');
    } finally { setSending(false); }
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">📧 מייל להורים</h2>
            <p className="text-sm text-slate-500 mt-1">כתיבת נוסח ושליחה לקבוצה או ליחידים</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          {(['send', 'history'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={`flex-1 px-3 py-2 rounded-xl text-sm font-semibold border transition-all ${
                view === v ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
              }`}>
              {v === 'send' ? '📨 שליחה חדשה' : '📜 היסטוריה'}
            </button>
          ))}
        </div>

        {view === 'send' && (
          <>
            {/* Compose */}
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">נושא</label>
                <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200" placeholder="נושא המייל" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">תוכן</label>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 leading-relaxed" placeholder="תוכן המייל" />
                <p className="text-xs text-slate-400 mt-1">
                  שדות אישיים: <code>{'{{first_name}}'}</code> <code>{'{{last_name}}'}</code> <code>{'{{father_name}}'}</code> <code>{'{{from_name}}'}</code>
                  {' '}· שורה ריקה = פסקה חדשה. הנוסח נשמר כברירת מחדל לפעם הבאה.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={includeMother} onChange={(e) => setIncludeMother(e.target.checked)} />
                שלח עותק גם לאם (CC), כשקיים מייל אם נפרד
              </label>
            </div>

            {/* Recipient mode */}
            <div className="flex gap-2 mb-3">
              {(['group', 'manual'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium border ${
                    mode === m ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'
                  }`}>
                  {m === 'group' ? '👥 לפי קבוצה' : '✔️ בחירה ידנית'}
                </button>
              ))}
            </div>

            {mode === 'group' ? (
              <div className="bg-slate-50 rounded-xl p-3 mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">סטטוס</label>
                    <select value={groupStatus} onChange={(e) => setGroupStatus(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm">
                      {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">מוסד</label>
                    <select value={groupInstitution} onChange={(e) => setGroupInstitution(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm">
                      {INSTITUTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs text-slate-500">שיעורים</label>
                    <div className="flex gap-1 text-xs">
                      <button type="button" onClick={() => setSelShiurim(new Set(SHIURIM.map((s) => s.name)))} className="text-blue-600 hover:underline">בחר הכל</button>
                      <span className="text-slate-300">·</span>
                      <button type="button" onClick={() => setSelShiurim(new Set())} className="text-slate-500 hover:underline">נקה</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SHIURIM.map((s) => {
                      const on = selShiurim.has(s.name);
                      return (
                        <button key={s.name} type="button" onClick={() => toggleShiur(s.name)}
                          className={`px-2.5 py-1 rounded-full text-xs border ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>
                          {s.name.replace('שיעור ', '')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-4">
                <input type="text" placeholder="חפש תלמיד לסימון..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 mb-2" />
                <div className="flex justify-between items-center mb-2 text-xs">
                  <span className="text-slate-500">{manualList.length} תלמידים {search ? '' : '(מוצגים 300 ראשונים — חפש לצמצום)'}</span>
                  <button type="button" onClick={() => setSelected(new Set())} className="text-slate-500 hover:underline">נקה בחירה ({selected.size})</button>
                </div>
                <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y">
                  {manualList.length === 0 && <div className="text-center text-sm text-slate-400 py-8">אין תוצאות</div>}
                  {manualList.map((s) => {
                    const rec = resolveRecipient(s.family_id ? families[s.family_id] : undefined);
                    const checked = selected.has(s.id);
                    return (
                      <label key={s.id} className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${checked ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggle(s.id)} className="shrink-0" />
                        <span className="flex-1 min-w-0">
                          <span className="font-semibold">{s.last_name} {s.first_name}</span>
                          <span className="text-xs text-slate-400 mr-2">{(s.shiur || '').replace('שיעור ', '')}</span>
                        </span>
                        <span className="text-xs shrink-0" dir="ltr">
                          {rec ? <span className="text-slate-500">{rec.email}{rec.type === 'mother' ? ' (אם)' : ''}</span> : <span className="text-amber-600">אין מייל</span>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mb-4 text-center text-sm">
              <Stat label="משפחות תואמות" value={households.length} tint="bg-slate-50 text-slate-700" />
              <Stat label="ישלחו במנה זו" value={batch.length} tint="bg-emerald-50 text-emerald-700" />
              <Stat label="נותרו למנה הבאה" value={remaining} tint="bg-amber-50 text-amber-700" />
            </div>

            {/* Batch limit */}
            <div className="flex items-center justify-between gap-3 mb-4 bg-slate-50 rounded-xl px-3 py-2">
              <label className="text-sm text-slate-700 font-medium">מקסימום נמענים בשליחה אחת</label>
              <input type="number" min={1} max={200} value={batchLimit}
                onChange={(e) => setBatchLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="w-24 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-center" />
            </div>

            <div className="text-xs text-slate-500 mb-4 leading-relaxed">
              <p>• מייל אחד לכל משק בית (אב, ובאין - אם). אחים אינם מקבלים כפול.</p>
              <p>• שולחים <b>מנה</b> בכל פעם (ברירת מחדל 50). Gmail רגיל מוגבל ל-~500 ליום.</p>
              <p>• אחרי כל מנה - הנשלחים יורדו. חכה כדקה, ואז לחץ שוב למנה הבאה.</p>
              {withoutEmail > 0 && <p className="text-amber-600">• {withoutEmail} תלמידים תואמים ללא מייל הורים - ידולגו.</p>}
            </div>

            {error && <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm mb-4">{error}</div>}
            {result && (
              <div className="bg-emerald-50 text-emerald-800 rounded-lg p-3 text-sm mb-4">
                <p>✓ נשלחו: <b>{result.sent}</b> · נכשלו: <b>{result.failed}</b>
                  {result.skipped > 0 && <> · ללא מייל: <b>{result.skipped}</b></>}
                  {result.deduped > 0 && <> · אחים מאוחדים: <b>{result.deduped}</b></>}
                </p>
                {result.errors && result.errors.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer">פירוט שגיאות ({result.errors.length})</summary>
                    <ul className="mt-2 max-h-32 overflow-y-auto text-xs space-y-1">
                      {result.errors.map((e, i) => <li key={i}>{e.student_id.slice(0, 8)} — {e.error}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={onClose} disabled={sending}>סגור</Button>
              <Button onClick={handleSend} disabled={sending || batch.length === 0 || !composeValid}>
                {sending ? 'שולח...' : `📨 שלח ל-${batch.length}`}
              </Button>
            </div>
          </>
        )}

        {view === 'history' && (
          <>
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
              <div className="text-center text-sm text-slate-400 py-10 border border-slate-200 rounded-xl mb-4">עדיין לא נשלחו מיילים</div>
            ) : (
              <div className="border border-slate-200 rounded-xl max-h-96 overflow-y-auto divide-y mb-4">
                {history.map((h) => {
                  const name = `${h.students?.last_name || ''} ${h.students?.first_name || ''}`.trim() || '(תלמיד נמחק)';
                  return (
                    <div key={h.id} className="px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold truncate">{name}{h.subject ? <span className="text-xs text-slate-400 font-normal mr-2">· {h.subject}</span> : null}</span>
                        {h.sent_at ? <span className="text-xs text-emerald-600 shrink-0">✓ נשלח</span> : <span className="text-xs text-red-600 shrink-0">✗ נכשל</span>}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mt-0.5">
                        <span dir="ltr" className="truncate">{h.recipient_email}{h.recipient_type === 'mother' ? ' (אם)' : ''}{h.cc_email ? ` +CC` : ''}</span>
                        <span className="shrink-0">{fmtDate(h.created_at)}</span>
                      </div>
                      {h.send_error && <div className="text-xs text-red-500 mt-1 truncate" title={h.send_error}>שגיאה: {h.send_error}</div>}
                      {h.sent_by && <div className="text-[11px] text-slate-400 mt-0.5">נשלח ע״י {h.sent_by}</div>}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={onClose}>סגור</Button>
              <Button onClick={loadHistory} disabled={loadingHistory}>{loadingHistory ? 'טוען...' : '🔄 רענן'}</Button>
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
