'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/hooks/useAuth';
import { useAttendance } from '@/hooks/useAttendance';
import { ReadinessTab } from '@/components/attendance/ReadinessTab';
import { AuditTab } from '@/components/attendance/AuditTab';
import { HistoryTab } from '@/components/attendance/HistoryTab';
import { SettingsTab } from '@/components/attendance/SettingsTab';

// ביקורת נוכחות — surprise attendance audits of the Ministry of Religion.
//   מוכנות (ongoing) → ביקורת (open / live / close) → היסטוריה · הגדרות (ימות)
// Everyone logged in can watch; opening, marking and closing need write permission.

type Tab = 'ready' | 'audit' | 'history' | 'settings';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'ready', label: 'מוכנות', icon: '🧭' },
  { id: 'audit', label: 'ביקורת', icon: '🛡️' },
  { id: 'history', label: 'היסטוריה', icon: '🗂️' },
  { id: 'settings', label: 'הגדרות', icon: '⚙️' },
];

export default function AttendancePage() {
  const { permissions, user } = useAuth();
  const att = useAttendance();
  const [tab, setTab] = useState<Tab>('ready');
  const [hasOpen, setHasOpen] = useState(false);

  // an audit is running → land on it
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (t && TABS.some((x) => x.id === t)) setTab(t);
    att.getOpenAudit().then((a) => { setHasOpen(!!a); if (a && !t) setTab('audit'); }).catch(() => {});
  }, [att]);

  const go = (t: Tab) => {
    setTab(t);
    try { window.history.replaceState(null, '', `/attendance?tab=${t}`); } catch { /* ignore */ }
  };

  return (
    <>
      <Header title="ביקורת נוכחות" subtitle="ביקורות משרד הדתות" />
      <div className="p-4 md:p-8 space-y-4">
        {!permissions.canWrite && (
          <div className="no-print bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 text-sm">👁️ <strong>מצב צפייה בלבד.</strong> פתיחה, סימון וסגירה של ביקורת — למזכירות ולמנהל מערכת.</div>
        )}
        <div className="no-print flex gap-2 overflow-x-auto whitespace-nowrap pb-1">
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => go(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                  on ? 'bg-gradient-to-r from-indigo-500 to-blue-600 text-white border-transparent shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}>
                <span>{t.icon}</span><span>{t.label}</span>
                {t.id === 'audit' && hasOpen && <span className={`ms-1 w-2 h-2 rounded-full ${on ? 'bg-white' : 'bg-red-600'} animate-pulse`} />}
              </button>
            );
          })}
        </div>

        {tab === 'ready' && <ReadinessTab />}
        {tab === 'audit' && <AuditTab canWrite={permissions.canWrite} userEmail={user?.email || 'משתמש'} onClosed={() => { setHasOpen(false); go('history'); }} />}
        {tab === 'history' && <HistoryTab canAdmin={permissions.canDelete} />}
        {tab === 'settings' && <SettingsTab canAdmin={permissions.canDelete} />}
      </div>
    </>
  );
}
