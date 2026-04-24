'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { useAuth } from '@/hooks/useAuth';
import { DashboardStats } from '@/lib/types';

function hebGreeting(): string {
  const h = new Date().getHours();
  if (h < 4) return 'לילה טוב';
  if (h < 12) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  if (h < 21) return 'ערב טוב';
  return 'לילה טוב';
}

function hebDate(): string {
  try {
    return new Date().toLocaleDateString('he-IL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return new Date().toLocaleDateString('he-IL');
  }
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₪${(n / 1_000).toFixed(1)}K`;
  return `₪${n.toLocaleString('he-IL')}`;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    total_students: 0,
    active_students: 0,
    total_donations_committed: 0,
    total_donations_collected: 0,
    rooms_occupied: 0,
    total_rooms: 0,
    staff_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const { fetchData } = useSupabase();
  const { user } = useAuth();

  const loadStats = async () => {
    setLoading(true);
    try {
      const students = await fetchData<any>('students');
      const donations = await fetchData<any>('donations');
      const rooms = await fetchData<any>('rooms');
      const staff = await fetchData<any>('staff');

      const activeStudents = students.filter((s: any) => s.status === 'active').length;
      const committedDonations = donations
        .filter((d: any) => d.status === 'committed')
        .reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
      const collectedDonations = donations
        .filter((d: any) => d.status === 'collected')
        .reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
      const occupiedRooms = rooms.filter((r: any) => r.status === 'occupied').length;

      setStats({
        total_students: students.length,
        active_students: activeStudents,
        total_donations_committed: committedDonations,
        total_donations_collected: collectedDonations,
        rooms_occupied: occupiedRooms,
        total_rooms: rooms.length,
        staff_count: staff.length,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const occupancyPct = stats.total_rooms
    ? Math.round((stats.rooms_occupied / stats.total_rooms) * 100)
    : 0;
  const collectedPct = stats.total_donations_committed
    ? Math.round((stats.total_donations_collected / stats.total_donations_committed) * 100)
    : 0;

  const kpiCards = [
    {
      title: 'סה״כ תלמידים',
      value: stats.total_students.toLocaleString('he-IL'),
      sub: `${stats.active_students.toLocaleString('he-IL')} פעילים`,
      icon: '👤',
      tint: 'from-sky-500 to-cyan-600',
      ring: 'ring-sky-100',
    },
    {
      title: 'התחייבויות',
      value: formatCurrency(stats.total_donations_committed),
      sub: 'סך הסכומים המוצהרים',
      icon: '₪',
      tint: 'from-indigo-500 to-blue-600',
      ring: 'ring-indigo-100',
    },
    {
      title: 'נגבה בפועל',
      value: formatCurrency(stats.total_donations_collected),
      sub: `${collectedPct}% מההתחייבויות`,
      icon: '✓',
      tint: 'from-emerald-500 to-teal-600',
      ring: 'ring-emerald-100',
    },
    {
      title: 'תפוסת פנימיה',
      value: `${stats.rooms_occupied}/${stats.total_rooms}`,
      sub: `${occupancyPct}% תפוסה`,
      icon: '🏢',
      tint: 'from-violet-500 to-purple-600',
      ring: 'ring-violet-100',
    },
  ];

  const quickActions = [
    { href: '/students', label: 'תלמיד חדש', icon: '👤', tint: 'from-sky-500 to-cyan-600' },
    { href: '/families', label: 'משפחה חדשה', icon: '👨‍👩‍👦', tint: 'from-violet-500 to-purple-600' },
    { href: '/finances', label: 'כספים', icon: '₪', tint: 'from-emerald-500 to-teal-600' },
    { href: '/reports', label: 'הפק אישור', icon: '📄', tint: 'from-amber-500 to-orange-600' },
    { href: '/actions', label: 'פעולות', icon: '⚡', tint: 'from-yellow-500 to-amber-600' },
    { href: '/lists', label: 'דוחות', icon: '📊', tint: 'from-fuchsia-500 to-pink-600' },
  ];

  const userName = (user?.full_name || user?.email || '').split(' ')[0];

  return (
    <>
      <Header
        title="לוח בקרה"
        subtitle={hebDate()}
        action={
          <Button variant="secondary" size="sm" onClick={loadStats} disabled={loading}>
            {loading ? 'טוען...' : '🔄 רענן'}
          </Button>
        }
      />

      <div className="p-4 md:p-8 space-y-6 md:space-y-8 animate-fadeIn">
        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white p-6 md:p-8 shadow-xl">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(251,191,36,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(59,130,246,0.3) 0%, transparent 50%)',
            }}
            aria-hidden
          />
          <div className="relative">
            <p className="text-amber-300/90 text-xs md:text-sm font-semibold tracking-widest uppercase mb-2">
              {hebGreeting()}{userName ? `, ${userName}` : ''}
            </p>
            <h2
              className="text-2xl md:text-4xl font-bold leading-tight mb-2"
              style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
            >
              ברוכים הבאים לישיבת מיר מודיעין עילית
            </h2>
            <p className="text-slate-300 text-sm md:text-base max-w-2xl">
              מבט אחד על התלמידים, הכספים והפעילות היומית - הכל במקום אחד, ברור ומדויק.
            </p>
          </div>
        </section>

        {/* KPI Cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
          {kpiCards.map((k, i) => (
            <div
              key={i}
              className={`relative bg-white rounded-2xl border border-slate-200/70 p-4 md:p-5 elevation-1 hover:elevation-2 card-hover ring-1 ${k.ring}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className={`w-10 h-10 md:w-11 md:h-11 rounded-xl bg-gradient-to-br ${k.tint} text-white flex items-center justify-center text-lg md:text-xl shadow-md`}
                >
                  {k.icon}
                </div>
              </div>
              <p className="text-xs md:text-sm text-slate-500 font-medium">{k.title}</p>
              <p
                className="text-2xl md:text-3xl font-bold text-slate-900 mt-1 tracking-tight"
                style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
              >
                {k.value}
              </p>
              {k.sub && <p className="text-xs text-slate-500 mt-1.5">{k.sub}</p>}
            </div>
          ))}
        </section>

        {/* Quick actions + Recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2
                  className="text-lg md:text-xl font-bold text-slate-900"
                  style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
                >
                  פעולות מהירות
                </h2>
                <span className="text-xs text-slate-400">גישה מהירה למסכים הנפוצים</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {quickActions.map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    className="group relative flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span
                      className={`w-10 h-10 rounded-lg bg-gradient-to-br ${a.tint} text-white flex items-center justify-center text-lg shadow-sm group-hover:shadow-md transition-shadow`}
                    >
                      {a.icon}
                    </span>
                    <span className="text-sm font-semibold text-slate-800">{a.label}</span>
                    <svg
                      className="w-4 h-4 text-slate-300 ms-auto rtl:rotate-180 group-hover:text-slate-500 transition-colors"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Summary rail */}
          <Card>
            <CardHeader>
              <h2
                className="text-lg md:text-xl font-bold text-slate-900"
                style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
              >
                סיכום היום
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <SummaryRow
                label="אחוז גביה"
                value={`${collectedPct}%`}
                hint="מתוך סך ההתחייבויות"
                progress={collectedPct}
                color="emerald"
              />
              <SummaryRow
                label="תפוסת פנימיה"
                value={`${occupancyPct}%`}
                hint={`${stats.rooms_occupied} מתוך ${stats.total_rooms} חדרים`}
                progress={occupancyPct}
                color="violet"
              />
              <SummaryRow
                label="תלמידים פעילים"
                value={`${stats.total_students ? Math.round((stats.active_students / stats.total_students) * 100) : 0}%`}
                hint={`${stats.active_students} פעילים`}
                progress={stats.total_students ? (stats.active_students / stats.total_students) * 100 : 0}
                color="sky"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function SummaryRow({
  label,
  value,
  hint,
  progress,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  progress: number;
  color: 'sky' | 'emerald' | 'violet';
}) {
  const colorMap: Record<string, string> = {
    sky: 'bg-gradient-to-l from-sky-500 to-cyan-500',
    emerald: 'bg-gradient-to-l from-emerald-500 to-teal-500',
    violet: 'bg-gradient-to-l from-violet-500 to-purple-500',
  };
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        <span className="text-lg font-bold text-slate-900 tabular-nums">{value}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorMap[color]}`}
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}
