'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useSystemSettings } from '@/hooks/useSystemSettings';

/** Hard-coded total number of beds in the dorms */
const TOTAL_BEDS = 697;

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

function currentMonthLabel(): string {
  return new Date().toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
}

function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₪${(n / 1_000).toFixed(1)}K`;
  return `₪${n.toLocaleString('he-IL')}`;
}

interface StudentStats {
  active: number;
  chizuk: number;
  total: number;
  left: number; // inactive + graduated
  bedsOccupied: number;
}

interface Task {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  priority?: string | null;
}

interface MinistryStored {
  rows: Array<{ idNumber: string; entitlement?: string; validity?: string }>;
  uploadedAt: string;
  fileName: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { getSetting } = useSystemSettings();

  const [students, setStudents] = useState<StudentStats>({
    active: 0,
    chizuk: 0,
    total: 0,
    left: 0,
    bedsOccupied: 0,
  });
  const [monthCollected, setMonthCollected] = useState(0);
  const [monthPending, setMonthPending] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ministryIssues, setMinistryIssues] = useState<{
    dat: number;
    chinuch: number;
    hasDat: boolean;
    hasChinuch: boolean;
  }>({ dat: 0, chinuch: 0, hasDat: false, hasChinuch: false });
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // Students with pagination (PostgREST 1000 row cap)
      const allStudents: any[] = [];
      for (let p = 0; p < 20; p++) {
        const { data } = await supabase
          .from('students')
          .select('id,status,room_number')
          .range(p * 1000, p * 1000 + 999);
        if (!data || data.length === 0) break;
        allStudents.push(...data);
        if (data.length < 1000) break;
      }
      const active = allStudents.filter((s) => s.status === 'active').length;
      const chizuk = allStudents.filter((s) => s.status === 'chizuk').length;
      const left = allStudents.filter(
        (s) => s.status === 'inactive' || s.status === 'graduated'
      ).length;
      const bedsOccupied = allStudents.filter(
        (s) => s.status === 'active' && s.room_number != null
      ).length;
      setStudents({ active, chizuk, total: allStudents.length, left, bedsOccupied });

      // Monthly collection - sum all three sources: bank Hu"k + credit (Nedarim) + office
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const last = lastDay.toISOString().slice(0, 10);
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

      let collected = 0;
      let pending = 0;

      // 1. Bank Hu"k via payment_history (status_code: 2=success, 1=pending)
      for (let p = 0; p < 20; p++) {
        const { data } = await supabase
          .from('payment_history')
          .select('amount_ils,status_code,payment_date')
          .gte('payment_date', first)
          .lte('payment_date', last)
          .range(p * 1000, p * 1000 + 999);
        if (!data || data.length === 0) break;
        for (const r of data as any[]) {
          const a = Number(r.amount_ils) || 0;
          if (r.status_code === 2) collected += a;
          else if (r.status_code === 1) pending += a;
        }
        if (data.length < 1000) break;
      }

      // 2. Credit (Nedarim) successful transactions
      for (let p = 0; p < 10; p++) {
        const { data } = await supabase
          .from('nedarim_transactions')
          .select('amount,result,transaction_date')
          .eq('result', 'success')
          .gte('transaction_date', first)
          .lt('transaction_date', nextMonthStart)
          .range(p * 1000, p * 1000 + 999);
        if (!data || data.length === 0) break;
        for (const r of data as any[]) collected += Number(r.amount) || 0;
        if (data.length < 1000) break;
      }

      // 3. Office payments
      const { data: office } = await supabase
        .from('office_payments')
        .select('amount')
        .gte('payment_date', first)
        .lt('payment_date', nextMonthStart);
      for (const r of (office || []) as any[]) collected += Number(r.amount) || 0;

      setMonthCollected(collected);
      setMonthPending(pending);

      // Open tasks
      const { data: taskData } = await supabase
        .from('tasks')
        .select('id,title,status,due_date,priority')
        .eq('status', 'pending')
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(5);
      setTasks((taskData || []) as Task[]);

      // Ministry data (stored uploads)
      const [datData, chData] = await Promise.all([
        getSetting<MinistryStored | null>('ministry_dat_data', null),
        getSetting<MinistryStored | null>('ministry_chinuch_data', null),
      ]);
      const datIssues = datData
        ? datData.rows.filter((r) => r.entitlement && r.entitlement !== 'זכאי').length
        : 0;
      const chIssues = chData
        ? chData.rows.filter((r) => r.validity && r.validity !== 'תקין').length
        : 0;
      setMinistryIssues({
        dat: datIssues,
        chinuch: chIssues,
        hasDat: !!datData,
        hasChinuch: !!chData,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [getSetting]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const occupancyPct = Math.round((students.bedsOccupied / TOTAL_BEDS) * 100);
  const userName = (user?.full_name || user?.email || '').split(' ')[0];

  const quickActions = [
    { href: '/students', label: 'תלמיד חדש', icon: '👤', tint: 'from-sky-500 to-cyan-600' },
    { href: '/families', label: 'משפחה חדשה', icon: '👨‍👩‍👦', tint: 'from-violet-500 to-purple-600' },
    { href: '/finances', label: 'כספים', icon: '₪', tint: 'from-emerald-500 to-teal-600' },
    { href: '/reports', label: 'הפק אישור', icon: '📄', tint: 'from-amber-500 to-orange-600' },
    { href: '/actions', label: 'פעולות', icon: '⚡', tint: 'from-yellow-500 to-amber-600' },
    { href: '/lists', label: 'דוחות', icon: '📊', tint: 'from-fuchsia-500 to-pink-600' },
  ];

  return (
    <>
      <Header
        title="לוח בקרה"
        subtitle={hebDate()}
        action={
          <Button variant="secondary" size="sm" onClick={loadAll} disabled={loading}>
            {loading ? 'טוען...' : '🔄 רענן'}
          </Button>
        }
      />

      <div className="p-4 md:p-8 space-y-6 md:space-y-8 animate-fadeIn">
        {/* Hero - softer palette */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600 text-white p-6 md:p-8 shadow-xl">
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                'radial-gradient(circle at 15% 15%, rgba(251,191,36,0.35) 0%, transparent 45%), radial-gradient(circle at 85% 85%, rgba(255,255,255,0.25) 0%, transparent 50%)',
            }}
            aria-hidden
          />
          <div className="relative">
            <p className="text-amber-100 text-xs md:text-sm font-semibold tracking-widest uppercase mb-2">
              {hebGreeting()}{userName ? `, ${userName}` : ''}
            </p>
            <h2
              className="text-2xl md:text-4xl font-bold leading-tight mb-2"
              style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
            >
              ישיבת מיר מודיעין עילית
            </h2>
            <p className="text-white/80 text-sm md:text-base max-w-2xl">
              מבט אחד על התלמידים, הכספים והפעילות היומית - הכל במקום אחד, ברור ומדויק.
            </p>
          </div>
        </section>

        {/* KPI Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-5">
          {/* Students */}
          <KpiCard
            icon="👤"
            tint="from-sky-500 to-cyan-600"
            ring="ring-sky-100"
            title="תלמידים פעילים"
          >
            <div className="flex items-baseline gap-2">
              <p
                className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight tabular-nums"
                style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
              >
                {students.active.toLocaleString('he-IL')}
              </p>
              {students.chizuk > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-200">
                  +{students.chizuk} חיזוק
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              מתוך <span className="font-semibold text-slate-700">{students.total.toLocaleString('he-IL')}</span> תלמידים
              {students.left > 0 && (
                <> · <span className="text-slate-500">{students.left.toLocaleString('he-IL')} עזבו/סיימו</span></>
              )}
            </p>
          </KpiCard>

          {/* Collection */}
          <KpiCard
            icon="₪"
            tint="from-emerald-500 to-teal-600"
            ring="ring-emerald-100"
            title={`נגבה החודש · ${currentMonthLabel()}`}
          >
            <p
              className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight tabular-nums"
              style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
            >
              {formatCurrency(monthCollected)}
            </p>
            <p className="text-xs text-slate-500 mt-1.5">
              {monthPending > 0 ? (
                <Link
                  href="/finances/collection/history"
                  className="hover:underline"
                  title="הוק&quot;ת שנשלחו ל-MASAV וטרם התקבלה עליהן תשובה מהבנק"
                >
                  <span className="font-semibold text-amber-700">{formatCurrency(monthPending)}</span> בהוק&quot;ת ממתין לתשובת הבנק
                </Link>
              ) : (
                'הכל נגבה או לא נותרו ממתינים'
              )}
            </p>
          </KpiCard>

          {/* Beds */}
          <KpiCard
            icon="🏢"
            tint="from-violet-500 to-purple-600"
            ring="ring-violet-100"
            title="מיטות תפוסות"
          >
            <div className="flex items-baseline gap-1">
              <p
                className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight tabular-nums"
                style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
              >
                {students.bedsOccupied.toLocaleString('he-IL')}
              </p>
              <span className="text-slate-400 text-lg font-semibold">/ {TOTAL_BEDS}</span>
            </div>
            <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-l from-violet-500 to-purple-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(0, Math.min(100, occupancyPct))}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              {occupancyPct}% תפוסה · {(TOTAL_BEDS - students.bedsOccupied).toLocaleString('he-IL')} מיטות פנויות
            </p>
          </KpiCard>
        </section>

        {/* Quick actions + attention rail */}
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

          {/* Attention rail: tasks + ministry alerts */}
          <Card>
            <CardHeader>
              <h2
                className="text-lg md:text-xl font-bold text-slate-900"
                style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
              >
                ⚠️ דורש תשומת לב
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Ministry alerts */}
              {(ministryIssues.hasDat || ministryIssues.hasChinuch) && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    חריגות במשרדים
                  </p>
                  <div className="space-y-2">
                    {ministryIssues.hasDat && (
                      <AttentionRow
                        label="משרד הדתות · לא זכאים"
                        value={ministryIssues.dat}
                        tone={ministryIssues.dat > 0 ? 'amber' : 'emerald'}
                        href="/actions"
                      />
                    )}
                    {ministryIssues.hasChinuch && (
                      <AttentionRow
                        label="משרד החינוך · מצבת שגויה"
                        value={ministryIssues.chinuch}
                        tone={ministryIssues.chinuch > 0 ? 'amber' : 'emerald'}
                        href="/actions"
                      />
                    )}
                  </div>
                </div>
              )}
              {!ministryIssues.hasDat && !ministryIssues.hasChinuch && (
                <p className="text-xs text-slate-400 italic">
                  לא הועלו דוחות משרדים. <Link href="/actions" className="text-blue-600 hover:underline">פתח טאב פעולות</Link>
                </p>
              )}

              {/* Tasks */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    משימות פתוחות
                  </p>
                  <Link href="/tasks" className="text-[11px] text-blue-600 hover:underline">
                    הצג הכל ←
                  </Link>
                </div>
                {tasks.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">אין משימות פתוחות 🎉</p>
                ) : (
                  <ul className="space-y-1.5">
                    {tasks.map((t) => (
                      <li key={t.id}>
                        <Link
                          href="/tasks"
                          className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors group"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                          <span className="text-sm text-slate-700 truncate flex-1 group-hover:text-slate-900">
                            {t.title}
                          </span>
                          {t.due_date && (
                            <span className="text-[10px] text-slate-400 flex-shrink-0">
                              {new Date(t.due_date).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function KpiCard({
  icon,
  tint,
  ring,
  title,
  children,
}: {
  icon: string;
  tint: string;
  ring: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative bg-white rounded-2xl border border-slate-200/70 p-5 md:p-6 elevation-1 hover:elevation-2 card-hover ring-1 ${ring}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-11 h-11 rounded-xl bg-gradient-to-br ${tint} text-white flex items-center justify-center text-xl shadow-md`}
        >
          {icon}
        </div>
        <p className="text-sm text-slate-500 font-semibold">{title}</p>
      </div>
      {children}
    </div>
  );
}

function AttentionRow({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: number;
  tone: 'amber' | 'emerald' | 'red';
  href: string;
}) {
  const toneMap: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    red: 'bg-red-50 text-red-800 ring-red-200',
  };
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-slate-50 transition-colors"
    >
      <span className="text-sm text-slate-700">{label}</span>
      <span
        className={`text-sm font-bold px-2.5 py-0.5 rounded-full ring-1 ${toneMap[tone]} tabular-nums`}
      >
        {value}
      </span>
    </Link>
  );
}
