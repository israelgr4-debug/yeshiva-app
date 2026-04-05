'use client';

import { Card, CardContent } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';

interface DonationsSummaryProps {
  totalCommitted: number;
  totalCollected: number;
  totalPending: number;
}

export function DonationsSummary({
  totalCommitted,
  totalCollected,
  totalPending,
}: DonationsSummaryProps) {
  const stats = [
    {
      label: 'סה״כ התחייבויות',
      value: totalCommitted,
      color: 'bg-blue-50 text-blue-700',
    },
    {
      label: 'סה״כ גבוי',
      value: totalCollected,
      color: 'bg-green-50 text-green-700',
    },
    {
      label: 'סה״כ ממתין',
      value: totalPending,
      color: 'bg-yellow-50 text-yellow-700',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {stats.map((stat, index) => (
        <Card key={index} className={stat.color}>
          <CardContent>
            <p className="text-sm font-medium opacity-75 mt-4">{stat.label}</p>
            <p className="text-2xl font-bold mt-2">{formatCurrency(stat.value)}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
