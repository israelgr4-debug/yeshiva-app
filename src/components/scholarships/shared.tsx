'use client';

// Shared bits for the מלגות tabs: permissions, navigation between tabs, formatting.

import React from 'react';

export type ScholarshipTabId = 'overview' | 'yemot' | 'unmatched' | 'manual' | 'report' | 'payment' | 'types';

export interface ScholarshipPerms {
  canWrite: boolean;   // import / entry / mark payment — admin + secretary
  canReport: boolean;  // report & print — admin + secretary + manager
  canAdmin: boolean;   // delete batch / cancel payment / edit types — admin
}

/** Navigate to another tab, optionally with params (e.g. { batch: id } to open a batch). */
export type ScholarshipNav = (tab: ScholarshipTabId, params?: Record<string, string>) => void;

export interface ScholarshipTabProps {
  perms: ScholarshipPerms;
  nav: ScholarshipNav;
  params: Record<string, string>;
}

export const ils = (n: number) => '₪' + (Number(n) || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });
export const dmy = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function SectionCard({ title, accent = 'from-orange-500 to-red-600', actions, children, className = '' }: {
  title?: React.ReactNode; accent?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200/70 elevation-1 ${className}`}>
      {(title || actions) && (
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          {title && (
            <div className="flex items-center gap-2">
              <span className={`w-1 h-4 bg-gradient-to-b ${accent} rounded-full`} />
              <h3 className="font-bold text-slate-800" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>{title}</h3>
            </div>
          )}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, text, hint }: { icon: string; text: string; hint?: string }) {
  return (
    <div className="py-10 text-center">
      <div className="text-5xl mb-2">{icon}</div>
      <div className="text-slate-500 font-medium">{text}</div>
      {hint && <div className="text-slate-400 text-sm mt-1">{hint}</div>}
    </div>
  );
}

export function ComingSoon({ stage }: { stage: string }) {
  return <EmptyState icon="🚧" text="בבנייה" hint={`ייבנה ב${stage}`} />;
}
