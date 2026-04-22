'use client';

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
