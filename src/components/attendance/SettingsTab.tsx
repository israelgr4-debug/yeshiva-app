'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAttendance } from '@/hooks/useAttendance';
import { SectionCard, EmptyState } from '@/components/scholarships/shared';

// "הגדרות": the two ימות המשיח pieces of ביקורת נוכחות —
//   1. the extension the markers call from a kosher phone (ext.ini type=api → our server)
//   2. the campaign template the robot runs to dial everyone who is still missing

interface Setup {
  tokenMissing?: boolean;
  extension: string; extensionOk: boolean; rootFolders: string[]; treeError: string | null;
  templateId: string; templates: { id: string; description: string; callerId: string; hasMessage: boolean }[]; templatesError: string | null;
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

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch('/api/attendance/setup', { headers: await att.authHeaders(), cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) { setError(j.error || 'שגיאה'); return; }
      setS(j);
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
            הרובוט מפעיל קמפיין חיוג בימות לכל מי שעוד לא סומן (חוץ ממי שסומן &quot;לא יכול&quot;). ההודעה שמושמעת היא ההקלטה של התבנית שנבחרת כאן —
            מקליטים אותה פעם אחת בימות. כל חיוג עולה יחידות מהחשבון בימות.
            {s.extension && <> נוסח מוצע להקלטה: <b>&quot;יש ביקורת בישיבה, נא להגיע מיד. מי שבדרך או שאינו יכול להגיע — יחייג לקו הישיבה, שלוחה {s.extension}, ויעדכן.&quot;</b></>}
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
          {canAdmin && s.templateId && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 space-y-1.5">
              <div className="font-medium text-slate-700">חיוג ניסיון — למספר אחד בלבד</div>
              <div className="flex flex-wrap items-center gap-2">
                <input className={`${input} w-40`} dir="ltr" inputMode="tel" placeholder="050-0000000" value={testPhone} onChange={(e) => setTestPhone(e.target.value.replace(/[^\d-]/g, ''))} />
                <Button size="sm" variant="secondary" onClick={testDial} disabled={busy || testPhone.replace(/\D/g, '').length < 9}>{busy ? 'מחייג…' : '📞 חייג אליי'}</Button>
                {testMsg && <span className={testMsg.startsWith('✓') ? 'text-emerald-700' : 'text-amber-800'}>{testMsg}</span>}
              </div>
              <p className="text-xs text-slate-500">כך שומעים את ההקלטה ובודקים שהרובוט עובד, בלי לחייג לכל הרשימה. הכפתור &quot;חייג עכשיו לחסרים&quot; בביקורת (גם בתרגול) מחייג לכל מי שחסר.</p>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
