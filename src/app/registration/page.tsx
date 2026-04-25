'use client';

import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { useRegistrations } from '@/hooks/useRegistrations';
import { useAuth } from '@/hooks/useAuth';
import { Registration } from '@/lib/types';
import { RegistrationsListTab } from '@/components/registration/RegistrationsListTab';
import { TestSchedulingTab } from '@/components/registration/TestSchedulingTab';
import { TestDayReportTab } from '@/components/registration/TestDayReportTab';
import { AcceptanceTab } from '@/components/registration/AcceptanceTab';
import { RegistrationFormDialog } from '@/components/registration/RegistrationFormDialog';
import { RegistrationImportButtons } from '@/components/registration/RegistrationImportButtons';

type TabId = 'list' | 'tests' | 'testday' | 'acceptance';

const TABS: { id: TabId; label: string; icon: string; tint: string }[] = [
  { id: 'list', label: 'רישום', icon: '📝', tint: 'from-sky-500 to-cyan-600' },
  { id: 'tests', label: 'מועדי מבחן', icon: '📅', tint: 'from-violet-500 to-purple-600' },
  { id: 'testday', label: 'יום המבחן', icon: '📸', tint: 'from-amber-500 to-orange-600' },
  { id: 'acceptance', label: 'קבלות', icon: '✓', tint: 'from-emerald-500 to-teal-600' },
];

export default function RegistrationPage() {
  const { permissions } = useAuth();
  const { list } = useRegistrations();

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>('list');
  const [editing, setEditing] = useState<Registration | null>(null);
  const [showNew, setShowNew] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const data = await list();
      setRegistrations(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    return {
      list: registrations.filter((r) => r.status !== 'converted').length,
      tests: registrations.filter((r) =>
        r.status === 'registered' || r.status === 'tested'
      ).length,
      testday: registrations.filter((r) => r.test_date).length,
      acceptance: registrations.filter((r) => r.status === 'tested' || r.status === 'accepted').length,
    };
  }, [registrations]);

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
              <Button size="sm" onClick={handleAdd}>＋ רישום חדש</Button>
            </div>
          ) : undefined
        }
      />

      <div className="p-4 md:p-8 space-y-4 animate-fadeIn">
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
            registrations={registrations}
            onEdit={(r) => { setEditing(r); setShowNew(true); }}
            onChanged={reload}
          />
        )}
        {!loading && tab === 'tests' && (
          <TestSchedulingTab registrations={registrations} onChanged={reload} />
        )}
        {!loading && tab === 'testday' && (
          <TestDayReportTab registrations={registrations} onChanged={reload} />
        )}
        {!loading && tab === 'acceptance' && (
          <AcceptanceTab
            registrations={registrations}
            onChanged={reload}
            canDecide={!!permissions.canManageUsers || !!(permissions as any).isAdmin}
          />
        )}
      </div>

      {showNew && (
        <RegistrationFormDialog
          registration={editing}
          onClose={() => { setShowNew(false); setEditing(null); }}
          onSaved={async () => { setShowNew(false); setEditing(null); await reload(); }}
        />
      )}
    </>
  );
}
