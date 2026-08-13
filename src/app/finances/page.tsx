'use client';

import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { MonthlyCollectionGauge } from '@/components/finances/MonthlyCollectionGauge';
import { OverdueDebtorsCard } from '@/components/finances/OverdueDebtorsCard';
import { InactivePayersCard } from '@/components/finances/InactivePayersCard';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="w-1 h-5 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full" />
      <h3 className="text-lg font-bold text-slate-800" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>{children}</h3>
    </div>
  );
}

function ActionCard({ href, icon, title, desc, primary }: { href: string; icon: string; title: string; desc: string; primary?: boolean }) {
  return (
    <Link href={href}
      className={`group flex items-start gap-3 rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${
        primary ? 'bg-gradient-to-br from-indigo-600 to-blue-700 border-transparent text-white shadow-md'
                 : 'bg-white border-slate-200/70 elevation-1 hover:border-slate-300'}`}>
      <span className={`text-2xl leading-none ${primary ? '' : 'grayscale-0'}`}>{icon}</span>
      <span className="min-w-0">
        <span className={`block font-bold ${primary ? 'text-white' : 'text-slate-800'}`}>{title}</span>
        <span className={`block text-sm mt-0.5 ${primary ? 'text-indigo-100' : 'text-slate-500'}`}>{desc}</span>
      </span>
    </Link>
  );
}

export default function FinancesPage() {
  return (
    <>
      <Header title="כספים" subtitle="ניהול שכר לימוד וגביות" />

      <div className="p-4 md:p-8 space-y-8 max-w-6xl">
        {/* ===== גבייה — the monthly workflow ===== */}
        <section>
          <SectionTitle>גבייה חודשית</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ActionCard primary href="/finances/monthly" icon="📅" title="הרצת גבייה חודשית"
              desc="כמה כל תלמיד משלם החודש, תוספות ושינויים" />
            <ActionCard href="/finances/tuition/masav" icon="🏦" title="ייצוא קובץ מס״ב"
              desc="הפקת קובץ החיוב לבנק" />
            <ActionCard href="/finances/returns" icon="↩️" title="חזרות הו״ק"
              desc="סימון וטיפול בהו״ק שחזרו" />
            <ActionCard href="/finances/collection/onetime" icon="💳" title="חיוב לתאריך"
              desc="חיוב חד-פעמי בתאריך שתבחר" />
            <ActionCard href="/finances/collection/history" icon="📋" title="היסטוריית גביות"
              desc="מה נגבה ומתי" />
          </div>
        </section>

        {/* ===== הגדרות ותלמידים ===== */}
        <section>
          <SectionTitle>הגדרות תלמידים</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ActionCard href="/finances/tuition/setup" icon="🎓" title="הגדרת שכר לימוד"
              desc="אופן תשלום וסכום לכל תלמיד" />
            <ActionCard href="/finances/nedarim" icon="🔗" title="נדרים — הוראות קבע"
              desc="ניהול הוראות קבע באשראי" />
            <ActionCard href="/finances/nedarim/match" icon="🧩" title="שיוך נדרים"
              desc="קישור הו״ק נדרים לתלמידים" />
            <ActionCard href="/finances/nedarim/transactions" icon="📊" title="עסקאות נדרים"
              desc="היסטוריית עסקאות אשראי" />
          </div>
        </section>

        {/* ===== מבט חודשי — clean dashboard (3) ===== */}
        <section>
          <SectionTitle>מבט חודשי</SectionTitle>
          <div className="space-y-4">
            <MonthlyCollectionGauge />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <OverdueDebtorsCard />
              <InactivePayersCard />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
