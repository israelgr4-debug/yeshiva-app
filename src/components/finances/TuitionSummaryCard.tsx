'use client';

import { useState, useEffect } from 'react';
import { useTuitionPayments } from '@/hooks/useTuitionPayments';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';

export function TuitionSummaryCard() {
  const { getTuitionSummary } = useTuitionPayments();
  const [summary, setSummary] = useState({
    thisMonth: 0,
    collected: 0,
    pending: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSummary() {
      const data = await getTuitionSummary();
      setSummary(data);
      setLoading(false);
    }
    loadSummary();
  }, [getTuitionSummary]);

  if (loading) {
    return (
      <Card>
        <CardContent>
          <div className="text-center py-8 text-gray-500">טוען...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-gray-900">שכר לימוד - חודש זה</h3>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          {/* Total */}
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <p className="text-gray-600 text-sm mb-1">סה"כ חובה</p>
            <p className="text-2xl font-bold text-blue-700">₪{summary.thisMonth.toLocaleString('he-IL')}</p>
          </div>

          {/* Collected */}
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <p className="text-gray-600 text-sm mb-1">גבוה</p>
            <p className="text-2xl font-bold text-green-700">₪{summary.collected.toLocaleString('he-IL')}</p>
          </div>

          {/* Pending */}
          <div className="bg-orange-50 rounded-lg p-4 text-center">
            <p className="text-gray-600 text-sm mb-1">ממתין</p>
            <p className="text-2xl font-bold text-orange-700">₪{summary.pending.toLocaleString('he-IL')}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>התקדמות</span>
            <span>
              {summary.thisMonth > 0
                ? Math.round((summary.collected / summary.thisMonth) * 100)
                : 0}
              %
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{
                width:
                  summary.thisMonth > 0
                    ? `${(summary.collected / summary.thisMonth) * 100}%`
                    : '0%',
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
