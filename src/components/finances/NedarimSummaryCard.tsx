'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Stats {
  totalActive: number;
  totalFrozen: number;
  monthlyTuition: number;
  monthlyDonation: number;
  monthlyOther: number;
  monthlyUnclassified: number;
  unmatched: number;
  lastSync: string | null;
}

export function NedarimSummaryCard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: subs }, { data: groups }, { data: log }] = await Promise.all([
        supabase
          .from('nedarim_subscriptions')
          .select('status, amount_per_charge, groupe, family_id')
          .neq('status', 'deleted'),
        supabase.from('nedarim_groups').select('name, category_type'),
        supabase
          .from('nedarim_sync_log')
          .select('finished_at')
          .eq('result', 'success')
          .order('started_at', { ascending: false })
          .limit(1),
      ]);

      const typeByName: Record<string, string> = {};
      for (const g of groups || []) typeByName[g.name] = g.category_type;

      const s: Stats = {
        totalActive: 0,
        totalFrozen: 0,
        monthlyTuition: 0,
        monthlyDonation: 0,
        monthlyOther: 0,
        monthlyUnclassified: 0,
        unmatched: 0,
        lastSync: log?.[0]?.finished_at || null,
      };

      for (const sub of subs || []) {
        const amount = Number(sub.amount_per_charge) || 0;
        if (sub.status === 'active') {
          s.totalActive++;
          const type = (sub.groupe && typeByName[sub.groupe]) || 'unclassified';
          if (type === 'tuition') s.monthlyTuition += amount;
          else if (type === 'donation') s.monthlyDonation += amount;
          else if (type === 'other') s.monthlyOther += amount;
          else s.monthlyUnclassified += amount;
        } else {
          s.totalFrozen++;
        }
        if (!sub.family_id) s.unmatched++;
      }

      setStats(s);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 text-center text-gray-500">
        טוען נתוני נדרים...
      </div>
    );
  }

  if (!stats || stats.totalActive + stats.totalFrozen === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
        <p className="text-amber-800 text-sm">
          עדיין לא סונכרנו נתונים מנדרים פלוס.
        </p>
        <Link
          href="/finances/nedarim"
          className="inline-block mt-2 text-sm bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded"
        >
          כנס לסנכרון
        </Link>
      </div>
    );
  }

  const formatCurrency = (n: number) => `₪${Number(n).toLocaleString('he-IL')}`;
  const totalMonthly = stats.monthlyTuition + stats.monthlyDonation + stats.monthlyOther + stats.monthlyUnclassified;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-lg font-bold text-gray-900">💳 נדרים פלוס - סיכום גביות</h3>
        <div className="flex gap-2 items-center">
          {stats.unmatched > 0 && (
            <Link
              href="/finances/nedarim/match"
              className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded hover:bg-orange-200"
            >
              ⚠ {stats.unmatched} לא משויכות
            </Link>
          )}
          <Link
            href="/finances/nedarim"
            className="text-xs text-blue-600 hover:underline"
          >
            לעמוד המלא →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-50 rounded p-3 text-center">
          <p className="text-xs text-gray-600">שכר לימוד חודשי</p>
          <p className="text-xl font-bold text-blue-700">{formatCurrency(stats.monthlyTuition)}</p>
        </div>
        <div className="bg-purple-50 rounded p-3 text-center">
          <p className="text-xs text-gray-600">תרומות חודשיות</p>
          <p className="text-xl font-bold text-purple-700">{formatCurrency(stats.monthlyDonation)}</p>
        </div>
        <div className="bg-gray-50 rounded p-3 text-center">
          <p className="text-xs text-gray-600">אחר</p>
          <p className="text-xl font-bold text-gray-700">{formatCurrency(stats.monthlyOther)}</p>
        </div>
        <div className="bg-amber-50 rounded p-3 text-center">
          <p className="text-xs text-gray-600">לא מסווג</p>
          <p className="text-xl font-bold text-amber-700">{formatCurrency(stats.monthlyUnclassified)}</p>
          {stats.monthlyUnclassified > 0 && (
            <Link href="/finances/nedarim/groups" className="text-xs text-amber-600 hover:underline">
              סווג עכשיו
            </Link>
          )}
        </div>
      </div>

      <div className="mt-3 flex justify-between text-sm text-gray-600 flex-wrap gap-2">
        <span>
          סה"כ חודשי: <b className="text-gray-900">{formatCurrency(totalMonthly)}</b>
        </span>
        <span>
          {stats.totalActive} פעילות · {stats.totalFrozen} מוקפאות
        </span>
        {stats.lastSync && (
          <span className="text-xs">
            סונכרן לאחרונה: {new Date(stats.lastSync).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        )}
      </div>
    </div>
  );
}
