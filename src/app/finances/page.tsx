'use client';

import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { TuitionSummaryCard } from '@/components/finances/TuitionSummaryCard';
import { TuitionSetupForm } from '@/components/finances/TuitionSetupForm';
import { TuitionPaymentsTable } from '@/components/finances/TuitionPaymentsTable';
import { ActiveChargesTable } from '@/components/finances/ActiveChargesTable';

export default function FinancesPage() {
  return (
    <>
      <Header title="כספים" subtitle="ניהול שכר לימוד ותרומות" />

      <div className="p-4 md:p-8 space-y-6">
        {/* Quick actions */}
        <div className="flex flex-wrap gap-3">
          <Link
            href="/finances/nedarim"
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2 shadow-md"
          >
            🔗 נדרים פלוס (גביות פעילות)
          </Link>
          <Link
            href="/finances/collection"
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2 shadow-md"
          >
            💰 צור קובץ מס"ב (גביה חודשית)
          </Link>
          <Link
            href="/finances/collection/history"
            className="bg-gray-700 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2 shadow-md"
          >
            📜 היסטוריית גביות
          </Link>
        </div>

        {/* Tuition summary */}
        <TuitionSummaryCard />

        {/* Setup new tuition */}
        <TuitionSetupForm onSuccess={() => {}} />

        {/* All charges - with search, sort, filter, pagination */}
        <Card>
          <CardHeader>
            <h3 className="text-xl font-bold">כל הגביות</h3>
          </CardHeader>
          <CardContent>
            <ActiveChargesTable />
          </CardContent>
        </Card>

        {/* Monthly payments */}
        <Card>
          <CardHeader>
            <h3 className="text-xl font-bold">ניהול תשלומים חודשיים</h3>
          </CardHeader>
          <CardContent>
            <TuitionPaymentsTable />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
