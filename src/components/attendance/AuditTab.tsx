'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useAttendance } from '@/hooks/useAttendance';
import { AttendanceAudit, AuditKind, DatStored, EligibleRow, KIND_LABEL, auditStats } from '@/lib/attendance';
import { SectionCard, EmptyState, dmy, todayIso } from '@/components/scholarships/shared';
import { DatBanner } from './ReadinessTab';
import { useAuditLive, BigBoard, CallersList, PatrolList, MarkPanel, PrintButtons } from './live';

// "ביקורת": no audit open → the opening form (one click when the auditors arrive);
// an audit is open → the live control room: team link, sheets, robot, the four screens, close.

interface Props { canWrite: boolean; userEmail: string; onClosed: () => void }

export function AuditTab({ canWrite, userEmail, onClosed }: Props) {
  const att = useAttendance();
  const [audit, setAudit] = useState<AttendanceAudit | null | undefined>(undefined);
  const load = useCallback(() => att.getOpenAudit().then(setAudit).catch((e) => { alert(e.message); setAudit(null); }), [att]);
  useEffect(() => { load(); }, [load]);

  if (audit === undefined) return <SectionCard><div className="py-10 text-center text-slate-400">טוען…</div></SectionCard>;
  if (!audit) return <OpenForm canWrite={canWrite} onOpened={setAudit} />;
  return <ControlRoom audit={audit} canWrite={canWrite} userEmail={userEmail} onChanged={load} onClosed={() => { setAudit(null); onClosed(); }} />;
}

// ---------------------------------------------------------------- open

function OpenForm({ canWrite, onOpened }: { canWrite: boolean; onOpened: (a: AttendanceAudit) => void }) {
  const att = useAttendance();
  const [data, setData] = useState<{ dat: DatStored | null; rows: EligibleRow[] } | null>(null);
  const [closedAudits, setClosedAudits] = useState<AttendanceAudit[]>([]);
  const [robotReady, setRobotReady] = useState(false);
  const [kind, setKind] = useState<AuditKind>('real');
  const [title, setTitle] = useState(`ביקורת ${dmy(todayIso())}`);
  const [target, setTarget] = useState('85');
  const [parentId, setParentId] = useState('');
  const [robotAuto, setRobotAuto] = useState(true);
  const [interval, setIntervalMin] = useState('5');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    att.loadEligible().then(setData).catch((e) => alert(e.message));
    att.listAudits().then((l) => { const c = l.filter((a) => a.status === 'closed'); setClosedAudits(c); setParentId(c[0]?.id || ''); }).catch(() => {});
    supabase.from('system_settings').select('value').eq('key', 'attendance_robot_template').maybeSingle().then(({ data: d }) => setRobotReady(!!d?.value));
  }, [att]);

  const pick = (k: AuditKind) => {
    setKind(k);
    setTarget(k === 'repeat' ? '95' : '85');
    setTitle(`${KIND_LABEL[k]} ${dmy(todayIso())}`);
    setRobotAuto(k !== 'practice');
  };

  const open = async () => {
    const n = kind === 'repeat' ? null : data?.rows.length || 0;
    if (kind !== 'repeat' && !n) { alert('אין רשימת זכאים — יש להעלות קובץ דתות'); return; }
    if (kind === 'repeat' && !parentId) { alert('יש לבחור את הביקורת הקודמת'); return; }
    if (!confirm(`לפתוח ${KIND_LABEL[kind]} עכשיו?${n ? `\n${n} זכאים · יעד ${target}%` : ''}${robotAuto ? `\nהרובוט יחייג לחסרים כל ${interval} דקות.` : ''}`)) return;
    setBusy(true);
    try {
      onOpened(await att.openAudit({
        title, kind, targetPct: Number(target) || 85, robotAuto, robotIntervalMin: Math.max(2, Number(interval) || 5),
        eligible: data?.rows, dat: data?.dat, parentId: kind === 'repeat' ? parentId : undefined,
      }));
    } catch (e: any) { alert(e.message); }
    setBusy(false);
  };

  if (!canWrite) return <SectionCard><EmptyState icon="🛡️" text="אין ביקורת פתוחה כרגע" hint="פתיחת ביקורת — למזכירות ולמנהל מערכת" /></SectionCard>;
  if (!data) return <SectionCard><div className="py-10 text-center text-slate-400">טוען…</div></SectionCard>;

  const chip = (on: boolean) => `px-4 py-2 rounded-xl text-sm font-semibold border ${on ? 'bg-gradient-to-r from-indigo-500 to-blue-600 text-white border-transparent' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`;
  const input = 'px-2 py-1.5 border border-slate-300 rounded-lg text-sm';
  return (
    <div className="space-y-4">
      <DatBanner dat={data.dat} />
      <SectionCard title="פתיחת ביקורת" accent="from-indigo-500 to-blue-600">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(kind === 'real')} onClick={() => pick('real')}>🛡️ ביקורת אמיתית</button>
            <button type="button" className={chip(kind === 'practice')} onClick={() => pick('practice')}>🧪 תרגול</button>
            <button type="button" className={chip(kind === 'repeat')} onClick={() => pick('repeat')} disabled={!closedAudits.length} title={closedAudits.length ? '' : 'אין ביקורת קודמת'}>🔁 ביקורת חוזרת</button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-600 flex flex-col flex-1 min-w-[220px]">שם הביקורת
              <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="text-xs text-slate-600 flex flex-col">יעד נוכחות %
              <input className={`${input} w-24`} dir="ltr" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ''))} />
            </label>
            {kind === 'repeat' && (
              <label className="text-xs text-slate-600 flex flex-col min-w-[240px]">חוזרת על הביקורת
                <select className={input} value={parentId} onChange={(e) => setParentId(e.target.value)}>
                  {closedAudits.map((a) => <option key={a.id} value={a.id}>{a.title} · {dmy(a.opened_at)}</option>)}
                </select>
              </label>
            )}
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={robotAuto} onChange={(e) => setRobotAuto(e.target.checked)} />
              🤖 הרובוט מחייג לבד לכל החסרים, כל
              <input className={`${input} w-14 py-0.5`} dir="ltr" inputMode="numeric" value={interval} onChange={(e) => setIntervalMin(e.target.value.replace(/\D/g, ''))} />
              דקות
            </label>
            {!robotReady && <p className="text-xs text-amber-800">⚠️ עדיין לא נבחרה תבנית קמפיין לרובוט (לשונית הגדרות) — בלי זה הוא לא יחייג.</p>}
            <p className="text-xs text-slate-500">החיוג עולה יחידות בימות. לא מחייג למי שסומן &quot;לא יכול&quot;, ולמי שסומן &quot;בדרך&quot; ב-10 הדקות האחרונות. פועל כל עוד מסך של הביקורת פתוח.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={open} disabled={busy}>{busy ? 'פותח…' : `▶ פתח ${KIND_LABEL[kind]}`}</Button>
            <span className="text-sm text-slate-600">
              {kind === 'repeat' ? 'אותה רשימה בדיוק כמו בביקורת הקודמת; מי שחסר בה מסומן ועולה ראשון.' : <>רשימת הזכאים תוקפא: <b>{data.rows.length}</b> זכאים (ישיבה וכולל יחד).</>}
            </span>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------- live control

type View = 'board' | 'callers' | 'patrol' | 'mark';
const VIEWS: { id: View; label: string }[] = [
  { id: 'board', label: '📺 מסך מרכזי' }, { id: 'callers', label: '☎️ טלפנים' }, { id: 'patrol', label: '🚶 סיירים' }, { id: 'mark', label: '✓ סימון' },
];

function ControlRoom({ audit, canWrite, userEmail, onChanged, onClosed }: {
  audit: AttendanceAudit; canWrite: boolean; userEmail: string; onChanged: () => void; onClosed: () => void;
}) {
  const att = useAttendance();
  const live = useAuditLive(audit.access_token, audit.access_code, userEmail);
  const [view, setView] = useState<View>('board');
  const [robotMsg, setRobotMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const link = typeof window !== 'undefined' ? `${window.location.origin}/g/audit/${audit.access_token}` : '';

  // closed from another screen
  useEffect(() => { if (live.closed) onClosed(); }, [live.closed]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    try { await navigator.clipboard.writeText(`${link}\nקוד כניסה: ${audit.access_code}`); alert('הקישור והקוד הועתקו'); } catch { prompt('העתק את הקישור:', link); }
  };

  const robotNow = async () => {
    const missing = live.state ? live.state.students.filter((s) => !s.present).length : 0;
    if (!confirm(`לחייג עכשיו לכל החסרים (${missing})?\nהחיוג עולה יחידות בימות.`)) return;
    setBusy(true); setRobotMsg(null);
    try {
      const r = await fetch('/api/attendance/setup', { method: 'POST', headers: await att.authHeaders(), body: JSON.stringify({ action: 'robot', auditId: audit.id }) });
      const j = await r.json();
      setRobotMsg(j.ok ? (j.dialed ? `✓ יצא חיוג ל-${j.dialed} מספרים` : `לא חויג: ${j.skipped || ''}`) : `⚠️ ${j.error || 'נכשל'}`);
      onChanged();
    } catch (e: any) { setRobotMsg('⚠️ ' + e.message); }
    setBusy(false);
  };

  const toggleAuto = async () => {
    try { await att.updateAudit(audit.id, { robot_auto: !audit.robot_auto }); onChanged(); live.reload(); } catch (e: any) { alert(e.message); }
  };

  const close = async () => {
    const st = live.state ? auditStats(live.state.students, audit.target_pct) : null;
    const line = st ? `נוכחים ${st.present} מתוך ${st.total} (${st.pct}%) — ${st.reached ? 'עברנו את היעד' : `חסרים ${st.needed} ליעד ${Number(audit.target_pct)}%`}.` : '';
    if (!confirm(`לסגור את "${audit.title}"?\n${line}\nאחרי הסגירה הקישור לצוות והסימון בטלפון מפסיקים לעבוד.`)) return;
    try { await att.closeAudit(audit.id); onClosed(); } catch (e: any) { alert(e.message); }
  };

  const pill = (on: boolean) => `px-4 py-2 rounded-full text-sm font-medium border ${on ? 'bg-gradient-to-r from-indigo-500 to-blue-600 text-white border-transparent' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`;

  return (
    <div className="space-y-4">
      <div className="no-print bg-white rounded-2xl border border-indigo-200 elevation-1 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700"><span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" /> פתוחה</span>
            <span className="ms-2 font-bold text-slate-800">{audit.title}</span>
            <span className="ms-2 text-xs text-slate-500">{KIND_LABEL[audit.kind]} · יעד {Number(audit.target_pct)}%</span>
          </div>
          {canWrite && <Button variant="danger" size="sm" onClick={close}>■ סגור ביקורת</Button>}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          <span className="text-slate-600">קישור לצוות:</span>
          <a href={link} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline truncate max-w-[340px]" dir="ltr">{link}</a>
          <span className="text-slate-600">קוד כניסה:</span>
          <b className="font-mono text-lg tabular-nums tracking-widest">{audit.access_code}</b>
          <Button size="sm" variant="secondary" onClick={copy}>📋 העתק</Button>
        </div>

        {canWrite && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button size="sm" variant="secondary" onClick={robotNow} disabled={busy}>{busy ? 'מחייג…' : '🤖 חייג עכשיו לחסרים'}</Button>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={audit.robot_auto} onChange={toggleAuto} /> חיוג אוטומטי כל {audit.robot_interval_min} דק׳</label>
            {robotMsg && <span className={robotMsg.startsWith('✓') ? 'text-emerald-700' : 'text-amber-800'}>{robotMsg}</span>}
          </div>
        )}
      </div>

      {/* outside every no-print box: the sheet it renders must be printable */}
      {live.state && <PrintButtons state={live.state} />}

      <div className="no-print flex gap-2 overflow-x-auto whitespace-nowrap">
        {VIEWS.map((v) => <button key={v.id} type="button" className={pill(view === v.id)} onClick={() => setView(v.id)}>{v.label}</button>)}
      </div>

      <div className="no-print">
        {live.error && <div className="mb-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-2 text-sm">⚠️ {live.error}</div>}
        {!live.state ? <SectionCard><div className="py-10 text-center text-slate-400">טוען…</div></SectionCard>
          : view === 'board' ? <BigBoard state={live.state} updatedAt={live.updatedAt} />
          : view === 'callers' ? <CallersList state={live.state} act={live.act} canAct={canWrite} />
          : view === 'patrol' ? <PatrolList state={live.state} act={live.act} canAct={canWrite} />
          : <MarkPanel state={live.state} act={live.act} canAct={canWrite} />}
      </div>
    </div>
  );
}
