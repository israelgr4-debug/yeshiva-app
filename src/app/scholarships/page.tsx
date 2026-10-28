'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { ScholarshipTabId, ScholarshipPerms, ScholarshipTabProps } from '@/components/scholarships/shared';
import { OverviewTab } from '@/components/scholarships/OverviewTab';
import { YemotImportTab } from '@/components/scholarships/YemotImportTab';
import { UnmatchedIdsTab } from '@/components/scholarships/UnmatchedIdsTab';
import { RecordingsTab } from '@/components/scholarships/RecordingsTab';
import { OneTimeTab } from '@/components/scholarships/OneTimeTab';
import { ManualEntryTab } from '@/components/scholarships/ManualEntryTab';
import { ReportTab } from '@/components/scholarships/ReportTab';
import { MarkPaymentTab } from '@/components/scholarships/MarkPaymentTab';
import { TypesTab } from '@/components/scholarships/TypesTab';

const TABS: { id: ScholarshipTabId; label: string; icon: string }[] = [
  { id: 'overview', label: 'סקירה', icon: '📊' },
  { id: 'yemot', label: 'יבוא ימות', icon: '📞' },
  { id: 'unmatched', label: 'ת"ז לא מזוהות', icon: '❓' },
  { id: 'recordings', label: 'הקלטות', icon: '🎙️' },
  { id: 'manual', label: 'הזנה ידנית', icon: '⌨️' },
  { id: 'onetime', label: 'חד פעמיים', icon: '💳' },
  { id: 'report', label: 'דוח והדפסה', icon: '🖨️' },
  { id: 'payment', label: 'סימון תשלום', icon: '✅' },
  { id: 'types', label: 'סוגי מלגות', icon: '🏷️' },
];
const TAB_IDS = new Set(TABS.map((t) => t.id));

function readUrl(): { tab: ScholarshipTabId; params: Record<string, string> } {
  if (typeof window === 'undefined') return { tab: 'overview', params: {} };
  const sp = new URLSearchParams(window.location.search);
  const t = sp.get('tab') as ScholarshipTabId | null;
  const params: Record<string, string> = {};
  sp.forEach((v, k) => { if (k !== 'tab') params[k] = v; });
  return { tab: t && TAB_IDS.has(t) ? t : 'overview', params };
}

export default function ScholarshipsPage() {
  const { permissions } = useAuth();
  const perms: ScholarshipPerms = {
    canWrite: permissions.canWrite,
    canReport: permissions.canGenerateReports,
    canAdmin: permissions.canDelete,
  };
  const [tab, setTab] = useState<ScholarshipTabId>('overview');
  const [params, setParams] = useState<Record<string, string>>({});
  const [unmatchedCount, setUnmatchedCount] = useState(0);

  // badge on the "ת"ז לא מזוהות" tab: distinct unmatched ID numbers
  useEffect(() => {
    supabase.from('scholarship_yemot_calls').select('id, raw_id_number').eq('status', 'unmatched').limit(5000)
      .then(({ data }) => setUnmatchedCount(new Set((data || []).map((r: any) => r.raw_id_number || r.id)).size));
  }, []);

  useEffect(() => {
    const u = readUrl();
    setTab(u.tab);
    setParams(u.params);
  }, []);

  // Tabs can send the user to another tab with params (e.g. open a batch for editing).
  const nav = useCallback((t: ScholarshipTabId, p: Record<string, string> = {}) => {
    setTab(t);
    setParams(p);
    const sp = new URLSearchParams({ tab: t, ...p });
    try { window.history.replaceState(null, '', `/scholarships?${sp.toString()}`); } catch { /* ignore */ }
    window.scrollTo({ top: 0 });
  }, []);

  const tabProps: ScholarshipTabProps = { perms, nav, params };

  return (
    <>
      <Header title="מלגות" subtitle="זכאויות ותשלומים" />

      <div className="p-4 md:p-8 space-y-4">
        {!perms.canWrite && (
          <div className="no-print bg-blue-50 border border-blue-200 text-blue-900 rounded-lg p-3 text-sm flex items-center gap-2">
            <span className="text-lg">👁️</span>
            <span>
              <strong>מצב צפייה בלבד.</strong> פעולות כתיבה (יבוא, הזנה, סימון תשלום) מוסתרות.
              {perms.canReport ? ' דוחות והדפסה זמינים.' : ''}
            </span>
          </div>
        )}

        <div className="no-print flex gap-2 overflow-x-auto whitespace-nowrap pb-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button key={t.id} type="button" onClick={() => nav(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                  active
                    ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white border-transparent shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}>
                <span>{t.icon}</span>
                <span>{t.label}</span>
                {t.id === 'unmatched' && unmatchedCount > 0 && (
                  <span className={`ms-1 px-1.5 rounded-full text-[11px] font-bold ${active ? 'bg-white/25' : 'bg-red-100 text-red-700'}`}>{unmatchedCount}</span>
                )}
              </button>
            );
          })}
        </div>

        {tab === 'overview' && <OverviewTab {...tabProps} />}
        {tab === 'yemot' && <YemotImportTab {...tabProps} />}
        {tab === 'unmatched' && <UnmatchedIdsTab {...tabProps} onCount={setUnmatchedCount} />}
        {tab === 'recordings' && <RecordingsTab {...tabProps} />}
        {tab === 'manual' && <ManualEntryTab {...tabProps} />}
        {tab === 'onetime' && <OneTimeTab {...tabProps} />}
        {tab === 'report' && <ReportTab {...tabProps} />}
        {tab === 'payment' && <MarkPaymentTab {...tabProps} />}
        {tab === 'types' && <TypesTab {...tabProps} />}
      </div>
    </>
  );
}
