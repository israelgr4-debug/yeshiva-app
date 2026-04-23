'use client';

import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { NedarimSummaryCard } from '@/components/finances/NedarimSummaryCard';
import { TuitionByMethodCard } from '@/components/finances/TuitionByMethodCard';
import { InactivePayersCard } from '@/components/finances/InactivePayersCard';

export default function FinancesPage() {
  return (
    <>
      <Header title="כספים" subtitle="ניהול שכר לימוד וגביות" />

      <div className="p-4 md:p-8 space-y-6">
        {/* Primary actions - tuition */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-2">שכר לימוד</h3>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/finances/tuition/setup"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2 shadow-md"
            >
              🎓 הגדרת שכר לימוד פר תלמיד
            </Link>
            <Link
              href="/finances/tuition/masav"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2 shadow-md"
            >
              🏦 ייצוא קובץ מס״ב
            </Link>
            <Link
              href="/finances/tuition/split"
              className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2 shadow-md"
            >
              ✂️ חלוקת הוקים משותפות
            </Link>
          </div>
        </div>

        {/* Nedarim actions */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 mb-2">נדרים פלוס</h3>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/finances/nedarim"
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2 shadow-md"
            >
              🔗 הוראות קבע
            </Link>
            <Link
              href="/finances/nedarim/match"
              className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2 shadow-md"
            >
              🧩 שיוך למשפחות
            </Link>
            <Link
              href="/finances/nedarim/groups"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2 shadow-md"
            >
              🏷️ קטגוריות
            </Link>
            <Link
              href="/finances/nedarim/transactions"
              className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2 shadow-md"
            >
              📊 עסקאות היסטוריות
            </Link>
          </div>
        </div>

        {/* Main forecast - student tuition breakdown by method */}
        <TuitionByMethodCard />

        {/* Nedarim subscriptions summary */}
        <NedarimSummaryCard />

        {/* Red flag - inactive students still paying */}
        <InactivePayersCard />
      </div>
    </>
  );
}
