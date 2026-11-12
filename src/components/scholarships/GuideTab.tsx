'use client';

import React from 'react';
import { Button } from '@/components/ui/Button';
import { ScholarshipTabProps, ScholarshipTabId } from './shared';

// "מדריך": the whole מלגות work order on one printable page — written for the office staff.

const h = { fontFamily: "'Frank Ruhl Libre', serif" };

const Step = ({ n, title, to, children }: { n: number; title: string; to: React.ReactNode; children: React.ReactNode }) => (
  <section className="flex gap-3">
    <span className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-red-600 text-white font-bold flex items-center justify-center print:border print:border-slate-800 print:text-slate-900 print:bg-none">{n}</span>
    <div className="flex-1 min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-lg font-bold text-slate-800" style={h}>{title}</h3>
        {to}
      </div>
      <div className="mt-1 space-y-1.5 text-sm text-slate-700 leading-relaxed">{children}</div>
    </div>
  </section>
);
const B = ({ children }: { children: React.ReactNode }) => <b className="text-slate-900">{children}</b>;

export function GuideTab({ nav }: ScholarshipTabProps) {
  const go = (t: ScholarshipTabId, label: string) => (
    <button type="button" className="no-print text-xs font-semibold text-orange-700 hover:underline" onClick={() => nav(t)}>{label} ←</button>
  );
  const css = `@page { size: A4 portrait; margin: 12mm; }
    @media print { .sch-guide { font-size: 12px; } .sch-guide .card { box-shadow: none !important; border: none !important; padding: 0 !important; }
      .sch-guide section { break-inside: avoid; } }`;
  return (
    <div className="sch-guide print-area max-w-3xl mx-auto" dir="rtl">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="card bg-white rounded-2xl border border-slate-200/70 elevation-1 p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900" style={h}>מלגות — מדריך קצר</h2>
            <p className="text-sm text-slate-500">שלושה שלבים, תמיד באותו סדר: קולטים זכאויות ← מפיקים דוח צ׳קים ← מסמנים מי קיבל.</p>
          </div>
          <Button size="sm" variant="secondary" className="no-print" onClick={() => window.print()}>🖨️ הדפס</Button>
        </div>

        <section className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          <div><B>סוג מלגה</B> — על מה משלמים (שבתות, סיכומים…).</div>
          <div><B>חיוב תקופתי</B> — רשימת הזכאים לתקופה אחת (&quot;סיכומים חשוון&quot;).</div>
          <div><B>זכאות</B> — סכום שמגיע לתלמיד אחד. עד שמסמנים תשלום היא &quot;פתוחה&quot;.</div>
          <div><B>הפקה</B> — דוח צ׳קים שהודפס ונשמר. צ׳ק אחד לתלמיד.</div>
        </section>

        <Step n={1} title="קליטת זכאויות" to={go('yemot', 'לקליטה')}>
          <p><B>📞 יבוא ימות</B> — בוחרים סוג וטווח תאריכים ← &quot;משוך מימות עכשיו&quot;. בתצוגה המקדימה עוברים על &quot;שאלות לבירור&quot;, ואפשר לסנן לפי סכום, <B>לדחות</B> שיחה לחיוב הבא או <B>להסיר</B> אותה. בסוף: &quot;צור חיוב&quot;.</p>
          <p><B>❓ ת״ז לא מזוהות</B> — מי שהקיש ת״ז שלא קיימת במערכת. משייכים לתלמיד; &quot;שייך תמיד&quot; זוכר גם לפעמים הבאות.</p>
          <p><B>⌨️ הזנה ידנית</B> — &quot;חיוב תקופתי חדש&quot;, ומקלידים סכום ליד כל תלמיד (Enter יורד שורה). תא ריק = אין זכאות. אפשר להדפיס קודם טופס ריק למילוי ביד.</p>
          <p><B>💳 חד פעמיים</B> — תשלום בודד לתלמיד: שם, סכום ותיאור.</p>
        </Step>

        <Step n={2} title="הפקה לתשלום" to={go('report', 'להפקה')}>
          <p>בוחרים אילו סוגים ומאיזה תאריך ← <B>&quot;הצג לבדיקה&quot;</B>. מופיע &quot;סיכום לפני הפקה&quot; עם כל התלמידים והסכומים.</p>
          <p>בסיכום אפשר לסנן לפי סכום (למשל כל מי שמתחת ל-₪50) ואז: <B>דחה</B> — לא נכנס להפקה הזו, נשאר פתוח לפעם הבאה. <B>מחק</B> — מוחק את הזכאות לגמרי.</p>
          <p>כשהרשימה נכונה: <B>&quot;הדפס ושמור הפקה&quot;</B>. יוצא דף סיכום ודף לכל שיעור עם מקום לחתימה. יש גם ייצוא לאקסל.</p>
          <p className="text-slate-500">המערכת מתריעה אם תלמיד כבר נמצא בהפקה קודמת שלא שולמה (כדי שלא ייצא צ׳ק כפול), ואם נשארו זכאויות ישנות מחוץ לטווח.</p>
        </Step>

        <Step n={3} title="סימון תשלום" to={go('payment', 'לסימון')}>
          <p>אחרי שחילקו את הצ׳קים: בוחרים את ההפקה, מסמנים מי קיבל (&quot;סמן הכל&quot;, או לחיצה על שם שיעור / שם תלמיד), בוחרים תאריך ← <B>&quot;שמור תשלום&quot;</B>. מי שלא קיבל נשאר פתוח באותה הפקה.</p>
          <p><B>צ׳ק אבד, נקרע או חזר?</B> לוחצים &quot;צ׳ק בוטל&quot; ליד התשלום. אפשר להעביר את הסכום ל&quot;חד פעמיים&quot; כצ׳ק חלופי — והוא ייצא בהפקה הבאה שלהם.</p>
          <p className="text-slate-500">זכאות ששולמה ננעלת — אי אפשר לשנות או למחוק אותה בלי לבטל קודם את התשלום.</p>
        </Step>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-700">
          <div className="rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex items-baseline justify-between"><h4 className="font-bold text-slate-800" style={h}>📈 דוחות</h4>{go('analysis', 'לדוחות')}</div>
            <p className="mt-1">כמה חויב, כמה שולם וכמה פתוח — לפי סוג מלגה, שיעור, חודש, חיוב או תלמיד, וגם טבלה מצולבת (למשל שיעור × סוג). לפי תאריך החיוב או לפי תאריך התשלום. הדוחות לצפייה בלבד: לא יוצרים הפקה ולא משנים דבר.</p>
          </div>
          <div className="rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex items-baseline justify-between"><h4 className="font-bold text-slate-800" style={h}>📊 סקירה</h4>{go('overview', 'לסקירה')}</div>
            <p className="mt-1">מסך הפתיחה מראה מה מחכה בכל שלב: שיחות שלא חויבו, זכאויות שלא הופקו, והפקות שלא סומנו. לחיצה לוקחת ישר למקום.</p>
            <p className="mt-1">תלמיד בודד: בכרטיס התלמיד, לשונית &quot;מלגות&quot; — כל הזכאויות, התשלומים והיתרה.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
