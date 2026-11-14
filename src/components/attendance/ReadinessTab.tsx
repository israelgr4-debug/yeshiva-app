'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAttendance } from '@/hooks/useAttendance';
import { DatStored, EligibleRow, DAT_MAX_AGE_DAYS, buildReadiness, datAgeDays } from '@/lib/attendance';
import { SectionCard, EmptyState, dmy } from '@/components/scholarships/shared';

// "מוכנות": is the yeshiva ready for a surprise audit — how old the Ministry of Religion file
// is, who is on the eligible list, and what should be fixed today (each row opens the
// student card).

export function DatBanner({ dat }: { dat: DatStored | null }) {
  const age = datAgeDays(dat);
  if (!dat) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-900 rounded-xl px-4 py-3 text-sm">
        ⛔ <b>לא הועלה קובץ דתות.</b> בלי הקובץ אין רשימת זכאים, ואי אפשר לפתוח ביקורת.{' '}
        <Link href="/actions" className="font-semibold underline">להעלאה: פעולות ← השוואה למשרדים</Link>
      </div>
    );
  }
  const old = age !== null && age > DAT_MAX_AGE_DAYS;
  return (
    <div className={`rounded-xl px-4 py-3 text-sm border ${old ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
      {old ? '⚠️' : '✓'} קובץ הדתות: <b>{dat.fileName}</b> · הועלה {dmy(dat.uploadedAt)}{age !== null ? ` (לפני ${age} ימים)` : ''}.
      {old && <> <b>הקובץ ישן מ-{DAT_MAX_AGE_DAYS} יום</b> — רשימת הזכאים אולי השתנתה.{' '}
        <Link href="/actions" className="font-semibold underline">להעלאת קובץ עדכני</Link></>}
    </div>
  );
}

export function ReadinessTab() {
  const att = useAttendance();
  const [data, setData] = useState<{ dat: DatStored | null; rows: EligibleRow[]; excluded: EligibleRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => { att.loadEligible().then(setData).catch((e) => setError(e.message)); }, [att]);
  const sections = useMemo(() => (data ? buildReadiness(data.rows) : []), [data]);

  if (error) return <SectionCard><EmptyState icon="⚠️" text={error} /></SectionCard>;
  if (!data) return <SectionCard><div className="py-10 text-center text-slate-400">טוען…</div></SectionCard>;

  const count = (g: string) => data.rows.filter((r) => r.grp === g).length;
  const urgent = sections.filter((s) => s.tone === 'red').reduce((a, s) => a + s.items.length, 0);
  const tone = { red: 'border-red-200 bg-red-50/60 text-red-900', amber: 'border-amber-200 bg-amber-50/60 text-amber-900', blue: 'border-blue-200 bg-blue-50/60 text-blue-900' };

  return (
    <div className="space-y-4">
      <DatBanner dat={data.dat} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['זכאים בביקורת', data.rows.length], ['בחורים', count('yeshiva')], ['אברכים', count('kollel')], ['לא נמצאו במערכת', count('unknown')]].map(([l, v]) => (
          <div key={l as string} className="bg-white rounded-2xl border border-slate-200/70 elevation-1 px-4 py-3">
            <div className="text-xs text-slate-500">{l}</div>
            <div className="text-2xl font-bold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      {data.excluded.length > 0 && (
        <p className="text-xs text-slate-500">לא נספרים: {data.excluded.length} זכאים מהכולל של ר׳ יצחק פינקל (לא פעיל).</p>
      )}

      <SectionCard title={urgent ? `מה לתקן לפני ביקורת · ${urgent} דחופים` : 'מה לתקן לפני ביקורת'}>
        {data.rows.length === 0 ? <EmptyState icon="📄" text="אין רשימת זכאים" hint="יש להעלות קובץ דתות" /> : (
          <div className="space-y-2">
            {sections.map((s) => (
              <div key={s.key} className={`rounded-xl border ${s.items.length ? tone[s.tone] : 'border-slate-200 bg-white text-slate-500'}`}>
                <button type="button" className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-start" onClick={() => setOpen(open === s.key ? null : s.key)} disabled={!s.items.length}>
                  <span>
                    <span className="font-semibold">{s.items.length ? '' : '✓ '}{s.title}</span>
                    <span className="block text-xs opacity-80">{s.hint}</span>
                  </span>
                  <span className="text-xl font-bold tabular-nums">{s.items.length}</span>
                </button>
                {open === s.key && s.items.length > 0 && (
                  <div className="bg-white rounded-b-xl border-t border-slate-200 max-h-80 overflow-y-auto divide-y divide-slate-100 text-slate-800">
                    {s.items.map((it, i) => (
                      <div key={it.key + i} className="flex items-center gap-3 px-4 py-1.5 text-sm">
                        <span className="flex-1 truncate font-medium">{it.name}</span>
                        <span className="w-24 text-xs text-slate-500 truncate">{it.shiur}</span>
                        <span className="w-24 text-xs text-slate-500 tabular-nums" dir="ltr">{it.idNumber}</span>
                        <span className="w-28 text-xs text-slate-600 truncate">{it.extra || ''}</span>
                        {it.studentId
                          ? <Link href={`/students/${it.studentId}`} className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap">לכרטיס ←</Link>
                          : <span className="w-12" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
