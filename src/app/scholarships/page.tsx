'use client';

import { useCallback, useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { useAuth } from '@/hooks/useAuth';
import { useScholarships } from '@/hooks/useScholarships';
import { ScholarshipTabId, ScholarshipPerms, ScholarshipTabProps } from '@/components/scholarships/shared';
import { WorkflowStatus, EMPTY_STATUS, loadWorkflowStatus } from '@/components/scholarships/workflow';
import { OverviewTab } from '@/components/scholarships/OverviewTab';
import { YemotImportTab } from '@/components/scholarships/YemotImportTab';
import { UnmatchedIdsTab } from '@/components/scholarships/UnmatchedIdsTab';
import { RecordingsTab } from '@/components/scholarships/RecordingsTab';
import { OneTimeTab } from '@/components/scholarships/OneTimeTab';
import { ManualEntryTab } from '@/components/scholarships/ManualEntryTab';
import { ReportTab } from '@/components/scholarships/ReportTab';
import { MarkPaymentTab } from '@/components/scholarships/MarkPaymentTab';
import { AnalysisTab } from '@/components/scholarships/AnalysisTab';
import { TypesTab } from '@/components/scholarships/TypesTab';
import { GuideTab } from '@/components/scholarships/GuideTab';

// The module follows the work order: ① קליטת זכאויות (ימות / ידני / חד פעמי) → ② הפקה לתשלום
// → ③ סימון תשלום. Around it: סקירה (what is waiting), דוחות (analysis, saves nothing),
// הגדרות, מדריך. Each section holds one or more tabs; the tab id stays the URL param.

type SectionId = 'overview' | 'intake' | 'report' | 'payment' | 'analysis' | 'types' | 'guide';

const SECTIONS: { id: SectionId; label: string; icon: string; step?: number; tabs: ScholarshipTabId[] }[] = [
  { id: 'overview', label: 'סקירה', icon: '📊', tabs: ['overview'] },
  { id: 'intake', label: 'קליטת זכאויות', icon: '📥', step: 1, tabs: ['yemot', 'unmatched', 'recordings', 'manual', 'onetime'] },
  { id: 'report', label: 'הפקה לתשלום', icon: '🖨️', step: 2, tabs: ['report'] },
  { id: 'payment', label: 'סימון תשלום', icon: '✅', step: 3, tabs: ['payment'] },
  { id: 'analysis', label: 'דוחות', icon: '📈', tabs: ['analysis'] },
  { id: 'types', label: 'סוגי מלגות', icon: '🏷️', tabs: ['types'] },
  { id: 'guide', label: 'מדריך', icon: '❓', tabs: ['guide'] },
];

const INTAKE_TABS: { id: ScholarshipTabId; label: string; icon: string }[] = [
  { id: 'yemot', label: 'יבוא ימות', icon: '📞' },
  { id: 'unmatched', label: 'ת"ז לא מזוהות', icon: '❓' },
  { id: 'recordings', label: 'הקלטות', icon: '🎙️' },
  { id: 'manual', label: 'חיובים · הזנה ידנית', icon: '⌨️' },
  { id: 'onetime', label: 'חד פעמיים', icon: '💳' },
];

const TAB_IDS = new Set(SECTIONS.flatMap((s) => s.tabs));
const sectionOf = (t: ScholarshipTabId) => SECTIONS.find((s) => s.tabs.includes(t))!;

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
  const sch = useScholarships();
  const perms: ScholarshipPerms = {
    canWrite: permissions.canWrite,
    canReport: permissions.canGenerateReports,
    canAdmin: permissions.canDelete,
  };
  const [tab, setTab] = useState<ScholarshipTabId>('overview');
  const [params, setParams] = useState<Record<string, string>>({});
  const [intakeTab, setIntakeTab] = useState<ScholarshipTabId>('yemot');   // last tab used inside "קליטת זכאויות"
  const [status, setStatus] = useState<WorkflowStatus>(EMPTY_STATUS);
  const [statusLoading, setStatusLoading] = useState(true);
  const [unmatchedCount, setUnmatchedCount] = useState<number | null>(null);   // live count from the tab itself

  const reloadStatus = useCallback(async () => {
    try { setStatus(await loadWorkflowStatus(sch)); setUnmatchedCount(null); } catch { /* badges are best-effort */ }
    setStatusLoading(false);
  }, [sch]);

  useEffect(() => {
    const u = readUrl();
    setTab(u.tab);
    setParams(u.params);
  }, []);

  // what is waiting: on entry and every time the user comes back to the overview
  useEffect(() => { if (tab === 'overview') reloadStatus(); }, [tab, reloadStatus]);
  useEffect(() => { if (sectionOf(tab).id === 'intake') setIntakeTab(tab); }, [tab]);

  // Tabs can send the user to another tab with params (e.g. open a batch for editing).
  const nav = useCallback((t: ScholarshipTabId, p: Record<string, string> = {}) => {
    setTab(t);
    setParams(p);
    const sp = new URLSearchParams({ tab: t, ...p });
    try { window.history.replaceState(null, '', `/scholarships?${sp.toString()}`); } catch { /* ignore */ }
    window.scrollTo({ top: 0 });
  }, []);

  const tabProps: ScholarshipTabProps = { perms, nav, params };
  const active = sectionOf(tab);
  const unmatched = unmatchedCount ?? status.unmatchedIds;
  const badges: Partial<Record<SectionId | ScholarshipTabId, number>> = {
    intake: status.pendingCalls + unmatched,
    yemot: status.pendingCalls,
    unmatched,
    onetime: status.oneTimeOpen.entries,
    payment: status.awaitingRuns,
  };
  const badge = (n: number | undefined, on: boolean, tone = 'bg-red-100 text-red-700') => (n ? (
    <span className={`ms-1 px-1.5 rounded-full text-[11px] font-bold tabular-nums ${on ? 'bg-white/25 text-white' : tone}`}>{n}</span>
  ) : null);

  const pill = (s: (typeof SECTIONS)[number]) => {
    const on = active.id === s.id;
    return (
      <button key={s.id} type="button" onClick={() => nav(s.id === 'intake' ? intakeTab : s.tabs[0])}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-all ${
          on
            ? 'bg-gradient-to-r from-orange-500 to-red-600 text-white border-transparent shadow-sm'
            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
        }`}>
        {s.step
          ? <span className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center ${on ? 'bg-white/25' : 'bg-orange-100 text-orange-700'}`}>{s.step}</span>
          : <span>{s.icon}</span>}
        <span>{s.label}</span>
        {badge(badges[s.id], on, s.id === 'payment' ? 'bg-amber-100 text-amber-800' : undefined)}
      </button>
    );
  };
  const steps = SECTIONS.filter((s) => s.step);

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

        <div className="no-print flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
          {pill(SECTIONS[0])}
          {/* the three work steps, in order */}
          <div className="flex items-center gap-1 rounded-full bg-orange-50/70 border border-orange-100 p-1">
            {steps.map((s, i) => (
              <span key={s.id} className="flex items-center gap-1">
                {i > 0 && <span className="text-orange-300 text-xs" aria-hidden="true">◀</span>}
                {pill(s)}
              </span>
            ))}
          </div>
          {SECTIONS.filter((s) => !s.step && s.id !== 'overview').map(pill)}
        </div>

        {active.id === 'intake' && (
          <div className="no-print flex gap-1 overflow-x-auto whitespace-nowrap border-b border-slate-200">
            {INTAKE_TABS.map((t) => {
              const on = tab === t.id;
              return (
                <button key={t.id} type="button" onClick={() => nav(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    on ? 'border-orange-600 text-orange-700' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}>
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                  {badge(badges[t.id], false, t.id === 'unmatched' ? undefined : 'bg-blue-100 text-blue-700')}
                </button>
              );
            })}
          </div>
        )}

        {tab === 'overview' && <OverviewTab {...tabProps} status={status} loading={statusLoading} />}
        {tab === 'yemot' && <YemotImportTab {...tabProps} />}
        {tab === 'unmatched' && <UnmatchedIdsTab {...tabProps} onCount={setUnmatchedCount} />}
        {tab === 'recordings' && <RecordingsTab {...tabProps} />}
        {tab === 'manual' && <ManualEntryTab {...tabProps} />}
        {tab === 'onetime' && <OneTimeTab {...tabProps} />}
        {tab === 'report' && <ReportTab {...tabProps} />}
        {tab === 'payment' && <MarkPaymentTab {...tabProps} />}
        {tab === 'analysis' && <AnalysisTab {...tabProps} />}
        {tab === 'types' && <TypesTab {...tabProps} />}
        {tab === 'guide' && <GuideTab {...tabProps} />}
      </div>
    </>
  );
}
