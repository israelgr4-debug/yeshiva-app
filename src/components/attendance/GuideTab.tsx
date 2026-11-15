'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';

// "מדריך": the whole audit day on one printable page — for the manager and the team.
// Keep it in sync with the flow (lib/attendance-dialog.ts for the phone keys).

const h = { fontFamily: "'Frank Ruhl Libre', serif" };
const B = ({ children }: { children: React.ReactNode }) => <b className="text-slate-900">{children}</b>;

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="flex gap-3">
      <span className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 text-white font-bold flex items-center justify-center print:bg-none print:border print:border-slate-800 print:text-slate-900">{n}</span>
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-bold text-slate-800" style={h}>{title}</h3>
        <div className="mt-1 space-y-1.5 text-sm text-slate-700 leading-relaxed">{children}</div>
      </div>
    </section>
  );
}

export function GuideTab() {
  const [ext, setExt] = useState('');
  useEffect(() => {
    supabase.from('system_settings').select('value').eq('key', 'attendance_yemot_extension').maybeSingle().then(({ data }) => setExt(data?.value ? String(data.value) : ''));
  }, []);
  const line = ext ? `שלוחה ${ext}` : 'שלוחת הביקורת';
  const css = `@page { size: A4 portrait; margin: 12mm; }
    @media print { .att-guide { font-size: 12px; } .att-guide .card { box-shadow: none !important; border: none !important; padding: 0 !important; } .att-guide section { break-inside: avoid; } }`;

  return (
    <div className="att-guide print-area max-w-3xl mx-auto" dir="rtl">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="card bg-white rounded-2xl border border-slate-200/70 elevation-1 p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900" style={h}>ביקורת נוכחות — מדריך קצר</h2>
            <p className="text-sm text-slate-500">מתכוננים מראש, פותחים בלחיצה כשהמבקרים מגיעים, וכל הצוות רואה בכל רגע כמה חסרים ומי.</p>
          </div>
          <Button size="sm" variant="secondary" className="no-print" onClick={() => window.print()}>🖨️ הדפס</Button>
        </div>

        <Step n={1} title="לפני — מוכנות שוטפת">
          <p>מעלים קובץ דתות עדכני (<B>פעולות ← השוואה למשרדים</B>). אם הקובץ ישן מ-30 יום מופיעה אזהרה כאן ובדף הבית.</p>
          <p>בלשונית <B>מוכנות</B>, לחיצה על אחד הכרטיסים למעלה (זכאים / בחורים / אברכים / לא נמצאו במערכת) פותחת את <B>הרשימה עצמה</B> — עם חיפוש, הדפסה ואקסל. כך רואים בדיוק מי צריך להיות בביקורת.</p>
          <p>באותה לשונית עוברים על מה שצריך תיקון: זכאי שלא נמצא במערכת, זכאי שכבר לא פעיל, בלי נייד, נייד כפול, בחור בלי חדר. לחיצה על &quot;לכרטיס&quot; פותחת את התלמיד לתיקון.</p>
          <p>בלשונית <B>קבוצות</B> מחלקים את הזכאים לקבוצות (&quot;חלוקה אוטומטית&quot;, או מסמנים תלמידים ומוסיפים לקבוצה), ומסמנים בכל קבוצה <B>שני אחראים</B> בלחיצה על ☆. מדפיסים <B>דף לכל אחראים</B> — כך כל אחד יודע מראש על מי הוא אחראי. משם אפשר להדפיס גם את <B>רשימת הזכאים</B> המלאה עם הקבוצה של כל אחד.</p>
        </Step>

        <Step n={2} title="המבקרים הגיעו — פותחים ביקורת">
          <p>לשונית <B>ביקורת ← &quot;פתח ביקורת&quot;</B>. רשימת הזכאים (ישיבה וכולל יחד) מוקפאת יחד עם החלוקה לקבוצות, וכל אחד מקבל קוד.</p>
          <p>מדפיסים <B>דף קודים</B> למסמנים, ושולחים לצוות את <B>הקישור וקוד הכניסה</B> (כפתור &quot;העתק&quot;). את המסך המרכזי פותחים על מסך גדול במשרד.</p>
        </Step>

        <Step n={3} title="בזמן הביקורת — מי עושה מה">
          <p><B>מסמן</B> (עומד ביציאה משולחן המבקרים, עם טלפון כשר): מתקשר לקו הישיבה, {line}, ומקיש <B>קוד + #</B> לכל תלמיד שעבר. <B>* קוד #</B> מבטל, <B>0 #</B> מקריא את חמשת האחרונים. אפשר להקיש גם ת״ז מלאה.</p>
          <p><B>טלפנים</B>: רואים את האברכים החסרים עם הנייד, ומסמנים מה יצא מהשיחה — <B>בדרך / לא עונה / מחוץ לעיר / לא יכול</B>. כך לא מתקשרים פעמיים לאותו אדם.</p>
          <p><B>סיירים</B>: רואים את הבחורים החסרים לפי חדר בפנימייה, והולכים לחפש.</p>
          <p><B>הרובוט</B> מחייג לבד לכל מי שעוד חסר ומשמיע את ההודעה המוקלטת. לא מחייג למי שסומן &quot;לא יכול&quot;, ולא למי שאמר שהוא בדרך — עד שעבר הזמן שמסר.</p>
          <p><B>תלמיד שקיבל שיחה</B> מתקשר חזרה לקו הישיבה, {line}, מהטלפון שלו: <B>1</B> — אני בדרך (ומקיש בעוד כמה דקות). <B>2</B> — לא יכול להגיע, ואז <B>1</B> מחוץ לעיר או <B>2</B> סיבה אחרת. תלמיד לא יכול לסמן את עצמו נוכח — רק המסמן.</p>
          <p><B>אחראי קבוצה</B>: בקישור הצוות בוחר למעלה את <B>הקבוצה שלו</B>, ורואה רק את החסרים שלה — מתקשר, מחפש, ומעדכן מה יצא. במסך המרכזי רואים כמה חסרים בכל קבוצה.</p>
          <p className="text-slate-500">מי שאין להם מסך: מכל רשימה אפשר להדפיס דף מעודכן (עם שעת העדכון) — חסרים לטלפנים, חסרים לפי חדר, חסרים לפי קבוצה (דף לכל אחראים), מחוץ לעיר.</p>
        </Step>

        <Step n={4} title="סיום">
          <p><B>&quot;סגור ביקורת&quot;</B> — הקישור לצוות והסימון בטלפון מפסיקים לעבוד, והביקורת נשמרת ב<B>היסטוריה</B>: מי נכח, מי חסר ולמה, עם הדפסה ואקסל.</p>
          <p>לא הגענו ליעד? פותחים <B>ביקורת חוזרת</B>: אותה רשימה בדיוק, יעד 95%, ומי שחסר בפעם הקודמת מסומן ועולה ראשון אצל הטלפנים ואצל הרובוט.</p>
        </Step>

        <section className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700 space-y-1">
          <div><B>שיניתם קבוצות כשביקורת כבר פתוחה?</B> בלשונית קבוצות — &quot;עדכן אותה לפי החלוקה הנוכחית&quot;.</div>
          <div><B>מי מחוץ לעיר?</B> במסך הטלפנים — הכפתור &quot;🧳 מחוץ לעיר&quot;; במסך המרכזי — המונה; בהיסטוריה — אותו סינון, וגם דף להדפסה.</div>
          <div><B>כדאי להתחיל מתרגול.</B> ביקורת מסוג &quot;תרגול&quot; עובדת בדיוק כמו אמיתית ונשמרת בנפרד — כך הצוות מכיר את התפקידים לפני שזה קורה באמת.</div>
        </section>
      </div>
    </div>
  );
}
