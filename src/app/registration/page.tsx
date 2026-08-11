'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { useRegistrations } from '@/hooks/useRegistrations';
import { useSystemSettings } from '@/hooks/useSystemSettings';
import { useAuth } from '@/hooks/useAuth';
import { Registration } from '@/lib/types';
import { RegistrationsListTab } from '@/components/registration/RegistrationsListTab';
import { TestSchedulingTab } from '@/components/registration/TestSchedulingTab';
import { TestDayReportTab } from '@/components/registration/TestDayReportTab';
import { TestReportsTab } from '@/components/registration/TestReportsTab';
import { AcceptanceTab } from '@/components/registration/AcceptanceTab';
import { RegistrationFormDialog } from '@/components/registration/RegistrationFormDialog';
import { RegistrationImportButtons } from '@/components/registration/RegistrationImportButtons';
import { SendRegistrationFormsDialog } from '@/components/registration/SendRegistrationFormsDialog';

type TabId = 'list' | 'tests' | 'testday' | 'reports' | 'acceptance';

const TABS: { id: TabId; label: string; icon: string; tint: string }[] = [
  { id: 'list', label: 'רישום', icon: '📝', tint: 'from-sky-500 to-cyan-600' },
  { id: 'tests', label: 'מועדי מבחן', icon: '📅', tint: 'from-violet-500 to-purple-600' },
  { id: 'testday', label: 'יום המבחן', icon: '📸', tint: 'from-amber-500 to-orange-600' },
  { id: 'reports', label: 'דוחות מבחן', icon: '📄', tint: 'from-rose-500 to-pink-600' },
  { id: 'acceptance', label: 'קבלות', icon: '✓', tint: 'from-emerald-500 to-teal-600' },
];

const NO_YEAR = '(ללא שנה)';
const ALL_YEARS = '__all__';

export default function RegistrationPage() {
  const { permissions } = useAuth();
  const { list } = useRegistrations();
  const { getSetting, setSetting } = useSystemSettings();

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('list');
  const [editing, setEditing] = useState<Registration | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showSendForms, setShowSendForms] = useState(false);
  const [activeYear, setActiveYear] = useState('');   // year new registrations get
  const [viewYear, setViewYear] = useState('');       // year currently filtered/shown

  const reload = async () => {
    setLoading(true);
    try {
      const data = await list();
      setRegistrations(data);
    } finally {
      setLoading(false);
    }
  };

  const loadYear = useCallback(async () => {
    const y = await getSetting<string>('current_registration_year', 'תשפ"ז');
    setActiveYear(y);
    setViewYear((prev) => prev || y); // default the view to the active year
  }, [getSetting]);

  useEffect(() => {
    reload();
    loadYear();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // All years present in the data (+ the active year), newest-ish first.
  const years = useMemo(() => {
    const set = new Set<string>();
    for (const r of registrations) set.add((r.registration_year || '').trim() || NO_YEAR);
    if (activeYear) set.add(activeYear);
    const arr = Array.from(set);
    arr.sort((a, b) => (a === NO_YEAR ? 1 : b === NO_YEAR ? -1 : b.localeCompare(a, 'he')));
    return arr;
  }, [registrations, activeYear]);

  // Registrations filtered to the selected view year.
  const shown = useMemo(() => {
    if (viewYear === ALL_YEARS || !viewYear) return registrations;
    return registrations.filter((r) => ((r.registration_year || '').trim() || NO_YEAR) === viewYear);
  }, [registrations, viewYear]);

  const changeActiveYear = async () => {
    const next = prompt('שנת הרישום הפעילה (נרשמים חדשים יתויגו אליה):', activeYear);
    if (next === null) return;
    const v = next.trim();
    if (!v || v === activeYear) return;
    const ok = await setSetting('current_registration_year', v);
    if (ok) { setActiveYear(v); setViewYear(v); }
    else alert('שגיאה בשמירה');
  };

  const counts = useMemo(() => {
    return {
      list: shown.filter((r) => r.status !== 'converted').length,
      tests: shown.filter((r) =>
        r.status === 'registered' || r.status === 'tested'
      ).length,
      testday: shown.filter((r) => r.test_date).length,
      reports: shown.filter((r) => r.test_date).length,
      acceptance: shown.filter((r) => r.status === 'tested' || r.status === 'accepted').length,
    };
  }, [shown]);

  const handleAdd = () => {
    setEditing(null);
    setShowNew(true);
  };

  return (
    <>
      <Header
        title="רישום לשנת הלימודים הבאה"
        subtitle="ניהול תהליך הרישום, המבחנים והקבלות"
        action={
          permissions.canWrite ? (
            <div className="flex gap-2 flex-wrap">
              <RegistrationImportButtons onImported={reload} />
              <Button size="sm" variant="secondary" onClick={() => setShowSendForms(true)}>📧 שלח טפסי רישום</Button>
              <Button size="sm" onClick={handleAdd}>＋ רישום חדש</Button>
            </div>
          ) : undefined
        }
      />

      <div className="p-4 md:p-8 space-y-4 animate-fadeIn">
        {/* Registration-year bar */}
        <div className="flex flex-wrap items-center gap-3 bg-white rounded-2xl border border-slate-200 px-4 py-2.5">
          <label className="text-sm font-semibold text-slate-700">שנת רישום:</label>
          <select
            value={viewYear || activeYear}
            onChange={(e) => setViewYear(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm bg-white"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}{y === activeYear ? ' · פעילה' : ''}</option>
            ))}
            <option value={ALL_YEARS}>כל השנים</option>
          </select>
          <span className="text-xs text-slate-500">{shown.length} רישומים</span>
          {permissions.canWrite && (
            <button
              type="button"
              onClick={changeActiveYear}
              className="ms-auto text-xs text-blue-600 hover:underline"
              title="שינוי שנת הרישום שאליה מתויגים נרשמים חדשים"
            >
              ⚙️ שנה פעילה: {activeYear || '—'}
            </button>
          )}
        </div>

        {/* Tab pills */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                  active
                    ? `bg-gradient-to-l ${t.tint} text-white shadow-md`
                    : 'bg-white border border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
                <span
                  className={`text-xs font-bold px-1.5 py-0 rounded-md tabular-nums ${
                    active ? 'bg-white/20' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {counts[t.id]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
            <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 text-sm mt-3">טוען...</p>
          </div>
        )}

        {!loading && tab === 'list' && (
          <RegistrationsListTab
            registrations={shown}
            onEdit={(r) => { setEditing(r); setShowNew(true); }}
            onChanged={reload}
          />
        )}
        {!loading && tab === 'tests' && (
          <TestSchedulingTab registrations={shown} onChanged={reload} />
        )}
        {!loading && tab === 'testday' && (
          <TestDayReportTab registrations={shown} onChanged={reload} />
        )}
        {!loading && tab === 'reports' && (
          <TestReportsTab registrations={shown} />
        )}
        {!loading && tab === 'acceptance' && (
          <AcceptanceTab
            registrations={shown}
            onChanged={reload}
            canDecide={!!permissions.canManageUsers || !!(permissions as any).isAdmin}
            canWrite={!!permissions.canWrite}
          />
        )}
      </div>

      {showNew && (
        <RegistrationFormDialog
          registration={editing}
          defaultYear={activeYear}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={async () => { setShowNew(false); setEditing(null); await reload(); }}
        />
      )}

      {showSendForms && (
        <SendRegistrationFormsDialog
          registrations={shown}
          onClose={() => setShowSendForms(false)}
        />
      )}
    </>
  );
}
