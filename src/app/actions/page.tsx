'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/Header';
import { MachzorTab } from '@/components/actions/MachzorTab';
import { EquivalentClassTab } from '@/components/actions/EquivalentClassTab';
import { BanksTab } from '@/components/actions/BanksTab';
import { ChinuchTab } from '@/components/actions/ChinuchTab';
import { MinistryCompareTab } from '@/components/actions/MinistryCompareTab';

type TabId = 'machzor' | 'equivalent' | 'chinuch' | 'ministry' | 'banks';

interface TabDef {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: 'machzor', label: 'מחזור', icon: '🎓' },
  { id: 'equivalent', label: 'כתה מקבילה', icon: '🏫' },
  { id: 'chinuch', label: 'חינוך', icon: '📘' },
  { id: 'ministry', label: 'השוואת משרדים', icon: '📊' },
  { id: 'banks', label: 'בנקים וסניפים', icon: '🏦' },
];

export default function ActionsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('machzor');

  return (
    <>
      <Header title="פעולות" subtitle="פעולות ניהול מערכתיות" />

      <div className="p-4 md:p-8">
        {/* Tab navigation */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-2" aria-label="Tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        {activeTab === 'machzor' && <MachzorTab />}
        {activeTab === 'equivalent' && <EquivalentClassTab />}
        {activeTab === 'chinuch' && <ChinuchTab />}
        {activeTab === 'ministry' && <MinistryCompareTab />}
        {activeTab === 'banks' && <BanksTab />}
      </div>
    </>
  );
}
