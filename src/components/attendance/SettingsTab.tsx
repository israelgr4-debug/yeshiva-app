'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAttendance } from '@/hooks/useAttendance';
import { SectionCard, EmptyState } from '@/components/scholarships/shared';

// "הגדרות": the two ימות המשיח pieces of ביקורת נוכחות —
//   1. the extension the markers call from a kosher phone (ext.ini type=api → our server)
//   2. the campaign template the robot runs to dial everyone who is still missing

type RobotMode = 'tts' | 'template' | 'bridge';
const MODES: { id: RobotMode; icon: string; title: string; text: string }[] = [
  { id: 'tts', icon: '🔊', title: 'הקראת טקסט', text: 'ימות מקריאה את הטקסט שכתוב כאן. אין מה להקליט ואין מה להגדיר באתר ימות.' },
  { id: 'template', icon: '🎙️', title: 'הקלטה שלך', text: 'מושמעת הקלטה שהקלטת פעם אחת בתבנית קמפיין באתר ימות. קול מוכר.' },
  { id: 'bridge', icon: '⌨️', title: 'שיחה עם תפריט', text: 'מי שעונה שומע "שלום [שם], יש ביקורת…" ומקיש באותה שיחה: 1 בדרך, 2 לא יכול. בלי להתקשר חזרה.' },
];

interface Setup {
  tokenMissing?: boolean;
  extension: string; extensionOk: boolean; rootFolders: string[]; treeError: string | null;
  robotMode: RobotMode; robotText: string; robotTextDefault: string;
  templateId: string; templates: { id: string; description: string; callerId: string; hasMessage: boolean }[]; templatesError: string | null;
  /** the in-call answer: none = no template · off = not connected · written = ימות accepted the file · verified = read back */
  webhookState: 'none' | 'off' | 'written' | 'verified';
  webhookLog: { at: string; phone: string; key: string; result: string; fields: Record<string, string> }[];
}

export function SettingsTab({ canAdmin }: { canAdmin: boolean }) {
  const att = useAttendance();
  const [s, setS] = useState<Setup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ext, setExt] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [manual, setManual] = useState<{ ext: string; contents: string; error: string } | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [hookMsg, setHookMsg] = useState<string | null>(null);
  const [hookManual, setHookManual] = useState<string | null>(null);
  const [rawOf, setRawOf] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch('/api/attendance/setup', { headers: await att.authHeaders(), cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) { setError(j.error || 'שגיאה'); return; }
      setS(j);
      if (!j.tokenMissing) setText(j.robotText || '');
      if (!j.tokenMissing) {
        const used = new Set<string>(j.rootFolders || []);
        setExt(j.extension || (['2', '3', '4', '5', '6', '7', '9'].find((n) => !used.has(n)) || ''));
      }
    } catch (e: any) { setError(e.message); }
  }, [att]);
  useEffect(() => { load(); }, [load]);

  const post = async (body: any) => {
    const r = await fetch('/api/attendance/setup', { method: 'POST', headers: await att.authHeaders(), body: JSON.stringify(body) });
    return { status: r.status, j: await r.json().catch(() => ({})) };
  };

  const createExt = async (force = false) => {
    if (!ext) return;
    if (!force && !confirm(`להגדיר את שלוחה ${ext} בימות המשיח כשלוחת סימון הנוכחות?\nהמערכת תכתוב את קובץ ההגדרות של השלוחה (ext.ini).`)) return;
    setBusy(true); setMsg(null);
    try {
      const { status, j } = await post({ action: 'create_extension', ext, force });
      if (status === 409 && j.exists) {
        if (confirm(`שלוחה ${ext} כבר קיימת ומוגדרת למשהו אחר:\n\n${j.current}\n\nלדרוס אותה? (ההגדרה הקודמת נשמרת בגיבוי)`)) { setBusy(false); return createExt(true); }
      } else if (!j.ok && j.manual) setManual({ ext, contents: j.manual, error: j.error || '' });
      else if (!j.ok) alert(j.error || 'הפעולה נכשלה');
      else { setManual(null); setMsg(`✓ שלוחה ${ext} הוגדרה. עכשיו כדאי לעשות שיחת ניסיון בביקורת תרגול.`); await load(); }
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  // after setting the extension by hand in ימות: check it there and remember the number
  const confirmManual = async () => {
    if (!manual) return;
    setBusy(true);
    try {
      const { j } = await post({ action: 'confirm_extension', ext: manual.ext });
      if (!j.ok) alert(j.error || 'הבדיקה נכשלה');
      else { setManual(null); setMsg(`✓ שלוחה ${manual.ext} מוגדרת.`); await load(); }
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  const setTemplate = async (id: string) => {
    setBusy(true);
    const { j } = await post({ action: 'set_template', templateId: id });
    if (!j.ok) alert(j.error || 'השמירה נכשלה'); else await load();
    setBusy(false);
  };

  const setRobot = async (mode: RobotMode, withText = false) => {
    setBusy(true);
    const { j } = await post({ action: 'set_robot', mode, ...(withText ? { text } : {}) });
    if (!j.ok) alert(j.error || 'השמירה נכשלה'); else await load();
    setBusy(false);
  };

  // the in-call answer: write our link into the template's ini in ימות
  const connectHook = async () => {
    if (!s || !confirm(`לחבר את תבנית ${s.templateId} לקבלת תשובות?\n\nהמערכת תכתוב בקובץ ההגדרות של התבנית בימות (${s.templateId}.ini) שורה ששולחת אלינו את נתוני כל שיחה.`)) return;
    setBusy(true); setHookMsg(null); setHookManual(null);
    try {
      const { j } = await post({ action: 'connect_webhook' });
      if (!j.ok) { setHookMsg(`⚠️ ${j.error || 'נכשל'}`); if (j.manual) setHookManual(j.manual); }
      else { setHookMsg(j.verified ? '✓ התבנית חוברה, והקובץ נקרא חזרה מימות.' : '✓ ימות קיבלה את הקובץ. לא הצלחתי לקרוא אותו חזרה כדי לוודא — חיוג ניסיון יראה אם זה עובד.'); await load(); }
    } catch (e: any) { setHookMsg('⚠️ ' + e.message); }
    setBusy(false);
  };
  const clearHookLog = async () => { setBusy(true); await post({ action: 'clear_webhook_log' }); await load(); setBusy(false); };

  // one call to one number — to hear the recording and see that the robot works, before an audit
  const testDial = async () => {
    if (!confirm(`לחייג עכשיו חיוג ניסיון למספר ${testPhone}?\nהחיוג עולה יחידה בימות.`)) return;
    setBusy(true); setTestMsg(null);
    try {
      const { j } = await post({ action: 'robot_test', phone: testPhone });
      setTestMsg(j.ok ? '✓ הבקשה התקבלה בימות. הטלפון אמור לצלצל תוך דקה.' : `⚠️ ${j.error || 'נכשל'}`);
    } catch (e: any) { setTestMsg('⚠️ ' + e.message); }
    setBusy(false);
  };

  if (error) return <SectionCard><EmptyState icon="⚠️" text={error} /></SectionCard>;
  if (!s) return <SectionCard><div className="py-10 text-center text-slate-400">טוען מימות המשיח…</div></SectionCard>;
  if (s.tokenMissing) return <SectionCard><EmptyState icon="🔑" text="YEMOT_API_TOKEN לא מוגדר ב-Vercel" hint="בלי החיבור לימות אין סימון מטלפון כשר ואין רובוט. המסכים וההדפסות עובדים גם בלעדיו." /></SectionCard>;

  const input = 'px-2 py-1.5 border border-slate-300 rounded-lg text-sm';
  return (
    <div className="space-y-4">
      <SectionCard title="📞 סימון מטלפון כשר">
        <div className="space-y-3 text-sm">
          <div className={`rounded-xl px-4 py-2.5 border ${s.extensionOk ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
            {s.extensionOk
              ? <>✓ שלוחה <b>{s.extension}</b> מוגדרת לסימון נוכחות.</>
              : s.extension ? <>⚠️ שלוחה {s.extension} נשמרה כאן, אבל ההגדרה שלה בימות לא תואמת. יש להגדיר אותה מחדש.</> : <>עדיין לא הוגדרה שלוחת סימון.</>}
          </div>
          <p className="text-slate-600">
            בזמן ביקורת המסמן מתקשר לקו של הישיבה, נכנס לשלוחה, ומקיש <b>קוד תלמיד + #</b> מדף הקודים (או ת״ז מלאה).
            המערכת מקריאה את השם ומסמנת נוכח. <b>* קוד #</b> מבטל סימון, <b>0 #</b> מקריא את חמשת האחרונים.
          </p>
          <p className="text-slate-600">
            <b>אותה שלוחה משמשת גם את התלמידים:</b> תלמיד חסר שמתקשר אליה מהטלפון שרשום אצלנו שומע תפריט אישי —
            <b> 1</b> אני בדרך (ומקיש בעוד כמה דקות), <b>2</b> לא יכול להגיע (<b>1</b> מחוץ לעיר, <b>2</b> אחר). הוא לא יכול לסמן את עצמו נוכח.
            מסמן שהוא בעצמו ברשימת החסרים מקיש <b>9</b> כדי לעבור לסימון.
          </p>
          <p className="text-xs text-slate-500">
            שלוחות קיימות בתפריט הראשי: {s.treeError ? `לא נקרא (${s.treeError})` : (s.rootFolders.join(', ') || 'אין')}.
          </p>
          {canAdmin && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-600 flex flex-col">מספר שלוחה
                <input className={`${input} w-24`} dir="ltr" value={ext} onChange={(e) => setExt(e.target.value.replace(/\D/g, '').slice(0, 3))} />
              </label>
              <Button size="sm" onClick={() => createExt()} disabled={busy || !ext}>{busy ? 'כותב…' : s.extensionOk && ext === s.extension ? 'כתוב מחדש' : 'הגדר שלוחת סימון'}</Button>
              {msg && <span className="text-emerald-700">{msg}</span>}
            </div>
          )}
          {manual && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 space-y-2">
              <div className="font-semibold text-amber-900">ימות לא אישרה את הכתיבה האוטומטית של שלוחה {manual.ext} — אפשר להגדיר אותה ביד (2 דקות)</div>
              <ol className="list-decimal ps-5 text-slate-700 space-y-0.5">
                <li>באתר הניהול של ימות, בתפריט הראשי, יוצרים שלוחה חדשה מספר <b>{manual.ext}</b> (אם היא עוד לא קיימת).</li>
                <li>פותחים את קובץ ההגדרות של השלוחה (<span dir="ltr">ext.ini</span> / &quot;הגדרות מתקדמות&quot;), מוחקים מה שיש בו ומדביקים את שלוש השורות האלה:</li>
              </ol>
              <pre dir="ltr" className="text-xs bg-white border border-slate-300 rounded-lg p-2 overflow-x-auto select-all">{manual.contents}</pre>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(manual.contents).then(() => alert('הועתק')).catch(() => {})}>📋 העתק את השורות</Button>
                <Button size="sm" onClick={confirmManual} disabled={busy}>{busy ? 'בודק…' : 'הדבקתי ושמרתי — בדוק'}</Button>
                <button type="button" className="text-slate-500 hover:underline" onClick={() => setManual(null)}>סגור</button>
              </div>
              <p className="text-xs text-slate-500" dir="ltr">{manual.error}</p>
            </div>
          )}
          <p className="text-xs text-slate-500">ההקראה משתמשת בהקראת טקסט (TTS) של ימות. אם בשיחת הניסיון לא נשמע שם התלמיד — צריך להפעיל הקראת טקסט בעברית במערכת בימות.</p>
        </div>
      </SectionCard>

      <SectionCard title="🤖 רובוט — חיוג לחסרים" accent="from-blue-500 to-indigo-600">
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            הרובוט מחייג דרך ימות לכל מי שעוד לא סומן (חוץ ממי שסומן &quot;לא יכול&quot;, וממי שאמר שהוא בדרך — עד שעבר הזמן שמסר). כל חיוג עולה יחידות מהחשבון בימות.
            בוחרים כאן <b>איך</b> הוא פונה:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {MODES.map((m) => {
              const on = s.robotMode === m.id;
              return (
                <button key={m.id} type="button" disabled={!canAdmin || busy} onClick={() => { if (!on) setRobot(m.id); }}
                  className={`text-start rounded-xl border px-3 py-2.5 transition-all disabled:opacity-70 ${on ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                  <div className="font-semibold text-slate-800">{m.icon} {m.title}{on ? ' ✓' : ''}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{m.text}</div>
                </button>
              );
            })}
          </div>

          {s.robotMode === 'tts' && (
            <div className="space-y-1.5">
              <label className="text-xs text-slate-600 flex flex-col">הטקסט שיוקרא (פעמיים)
                <textarea className={`${input} min-h-[72px]`} value={text} disabled={!canAdmin} onChange={(e) => setText(e.target.value)} maxLength={600} />
              </label>
              {canAdmin && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => setRobot('tts', true)} disabled={busy || text.trim() === s.robotText.trim()}>שמור טקסט</Button>
                  <button type="button" className="text-xs text-slate-500 hover:underline" onClick={() => setText(s.robotTextDefault)}>חזור לנוסח המוצע</button>
                  {text.trim() !== s.robotText.trim() && <span className="text-xs text-amber-800">יש שינוי שלא נשמר</span>}
                </div>
              )}
            </div>
          )}

          {s.robotMode === 'template' && (
            <div className="space-y-2">
              <p className="text-slate-600">
                יוצרים תבנית קמפיין באתר ימות ומקליטים לה הודעה פעם אחת.
                {s.extension && <> נוסח מוצע: <b>&quot;{s.robotTextDefault}&quot;</b></>}
              </p>
              {s.templatesError ? <div className="text-red-700">לא ניתן לקרוא תבניות מימות: {s.templatesError}</div> : s.templates.length === 0 ? (
                <div className="text-amber-800">אין תבניות קמפיין בחשבון ימות. יוצרים תבנית בניהול הקמפיינים בימות, מקליטים הודעה, וחוזרים לכאן.</div>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-slate-600 flex flex-col">תבנית קמפיין
                    <select className={`${input} min-w-[260px]`} value={s.templateId} disabled={!canAdmin || busy} onChange={(e) => setTemplate(e.target.value)}>
                      <option value="">— לא נבחרה —</option>
                      {s.templates.map((t) => <option key={t.id} value={t.id}>{t.id} · {t.description || 'ללא תיאור'}{t.hasMessage ? '' : ' (אין הקלטה)'}</option>)}
                    </select>
                  </label>
                  {s.templateId ? <span className="text-emerald-700">✓ נבחרה תבנית {s.templateId}</span> : <span className="text-amber-800">בלי תבנית הרובוט לא יחייג</span>}
                </div>
              )}
            </div>
          )}

          {s.robotMode === 'template' && !!s.templateId && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 px-3 py-3 space-y-2">
              <div className="font-semibold text-slate-800">⌨️ תשובה במקש בתוך השיחה</div>
              <p className="text-slate-600">
                מי שעונה לרובוט מקיש <b>1</b> = אני בדרך, <b>2</b> = לא יכול להגיע — והתשובה נרשמת מיד בביקורת, בלי להתקשר חזרה לשלוחה.
                ימות שולחת אלינו את נתוני כל שיחה בסיומה. צריך לומר את זה בהקלטה, למשל: <b>&quot;יש ביקורת נוכחות, נא להגיע מיד. אם אתה בדרך הקש 1, אם אינך יכול להגיע הקש 2.&quot;</b>
              </p>
              <div className={`rounded-lg px-3 py-2 border ${s.webhookState === 'verified' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : s.webhookState === 'written' ? 'bg-sky-50 border-sky-200 text-sky-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                {s.webhookState === 'verified' ? <>✓ תבנית <b>{s.templateId}</b> מחוברת (נבדק מול ימות).</>
                  : s.webhookState === 'written' ? <>תבנית <b>{s.templateId}</b> חוברה — ימות קיבלה את הקובץ, אבל אי אפשר היה לקרוא אותו חזרה. חיוג ניסיון יראה אם מגיעות בקשות.</>
                  : <>תבנית <b>{s.templateId}</b> עוד לא מחוברת — הקשות בשיחה לא יגיעו למערכת.</>}
              </div>
              {canAdmin && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={connectHook} disabled={busy}>{busy ? 'מחבר…' : s.webhookState === 'off' ? '🔗 חבר את התבנית לקבלת תשובות' : '🔗 חבר מחדש'}</Button>
                  {hookMsg && <span className={hookMsg.startsWith('✓') ? 'text-emerald-700' : 'text-amber-800'}>{hookMsg}</span>}
                </div>
              )}
              {hookManual && (
                <div className="space-y-1">
                  <div className="text-slate-700">אפשר גם ביד: באתר ימות, בקובץ ההגדרות של התבנית (<span dir="ltr">{s.templateId}.ini</span>), מוסיפים את השורה:</div>
                  <pre dir="ltr" className="text-xs bg-white border border-slate-300 rounded-lg p-2 overflow-x-auto select-all">{hookManual}</pre>
                </div>
              )}
              <p className="text-xs text-slate-500">
                <b>עוד לא נבדק בשיחה אמיתית.</b> לבדיקה: מחברים, ואז &quot;חייג אליי&quot; למטה, עונים ומקישים 1. תוך דקה אמורה להופיע כאן שורה.
                בחיוג ניסיון המספר שלך לא ברשימת ביקורת, ולכן ייכתב &quot;הטלפון לא נמצא&quot; — זה תקין; מה שחשוב הוא שהבקשה הגיעה ושהמקש נקלט.
                אם לא הוקש כלום ומגיע &quot;לא הוקש מקש&quot; — ייתכן שבתבנית בימות צריך להפעיל קליטת הקשות.
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="font-medium text-slate-700">בקשות אחרונות שהגיעו מימות ({s.webhookLog.length})</div>
                <div className="flex items-center gap-3">
                  <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => load()}>🔄 רענן</button>
                  {canAdmin && s.webhookLog.length > 0 && <button type="button" className="text-xs text-slate-500 hover:underline" onClick={clearHookLog}>נקה</button>}
                </div>
              </div>
              {s.webhookLog.length === 0 ? <div className="text-xs text-slate-500">עוד לא הגיעה אף בקשה.</div> : (
                <div className="bg-white border border-slate-200 rounded-lg max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {s.webhookLog.map((l, i) => (
                    <div key={l.at + i} className="px-3 py-1.5">
                      <button type="button" className="w-full flex flex-wrap items-center gap-x-3 gap-y-0.5 text-start" onClick={() => setRawOf(rawOf === i ? null : i)}>
                        <span className="text-xs text-slate-500 tabular-nums" dir="ltr">{new Date(l.at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jerusalem' })}</span>
                        <span className="tabular-nums" dir="ltr">{l.phone || '—'}</span>
                        <span className="text-xs rounded bg-slate-100 px-1.5 py-0.5">מקש: {l.key || '—'}</span>
                        <span className="flex-1 min-w-[140px] text-slate-700">{l.result}</span>
                        <span className="text-[11px] text-blue-700">{rawOf === i ? 'סגור ▲' : 'הנתונים ▼'}</span>
                      </button>
                      {rawOf === i && (
                        <pre dir="ltr" className="mt-1 text-[11px] bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto">{Object.entries(l.fields || {}).map(([k, v]) => `${k} = ${v}`).join('\n') || '(empty)'}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {s.robotMode === 'bridge' && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-slate-700 space-y-1">
              {!s.extensionOk && <div className="text-red-700 font-medium">קודם צריך להגדיר את שלוחת הסימון (למעלה) — השיחות נכנסות אליה.</div>}
              <div><b>עוד לא נבדק אצלכם.</b> כדי שהתפריט האישי יושמע, ימות צריכה להעביר לשלוחה את המספר של מי שענה. אם בחיוג הניסיון נשמע &quot;שלום [שם]&quot; — זה עובד. אם נשמע &quot;הקישו קוד תלמיד&quot; — לא, ואז עדיף אחד משני המצבים האחרים.</div>
              <div className="text-xs">לבדיקה: פותחים ביקורת תרגול, ומחייגים חיוג ניסיון למספר של מישהו שברשימה ועוד לא סומן.</div>
            </div>
          )}

          {canAdmin && (s.robotMode !== 'template' || !!s.templateId) && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 space-y-1.5">
              <div className="font-medium text-slate-700">חיוג ניסיון — למספר אחד בלבד</div>
              <div className="flex flex-wrap items-center gap-2">
                <input className={`${input} w-40`} dir="ltr" inputMode="tel" placeholder="050-0000000" value={testPhone} onChange={(e) => setTestPhone(e.target.value.replace(/[^\d-]/g, ''))} />
                <Button size="sm" variant="secondary" onClick={testDial} disabled={busy || testPhone.replace(/\D/g, '').length < 9}>{busy ? 'מחייג…' : '📞 חייג אליי'}</Button>
                {testMsg && <span className={testMsg.startsWith('✓') ? 'text-emerald-700' : 'text-amber-800'}>{testMsg}</span>}
              </div>
              <p className="text-xs text-slate-500">כך שומעים בדיוק מה שהרובוט משמיע במצב שנבחר, בלי לחייג לכל הרשימה. הכפתור &quot;חייג עכשיו לחסרים&quot; בביקורת (גם בתרגול) מחייג לכל מי שחסר.</p>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
