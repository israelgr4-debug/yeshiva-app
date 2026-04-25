'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const menuItems = [
  { href: '/', label: 'לוח בקרה', sub: 'סקירה כללית', icon: '▦', tint: 'from-blue-500 to-indigo-600' },
  { href: '/directory', label: 'אלפון', sub: 'חיפוש מהיר', icon: '📒', tint: 'from-teal-500 to-emerald-600' },
  { href: '/students', label: 'תלמידים', sub: 'ניהול רשומות', icon: '👤', tint: 'from-sky-500 to-cyan-600' },
  { href: '/reports', label: 'אישורים', sub: 'הפקת מסמכים', icon: '📄', tint: 'from-amber-500 to-orange-600' },
  { href: '/lists', label: 'דוחות', sub: 'דוחות מותאמים', icon: '📊', tint: 'from-fuchsia-500 to-pink-600' },
  { href: '/finances', label: 'כספים', sub: 'מס"ב, צ\'קים וגביה', icon: '₪', tint: 'from-emerald-500 to-teal-600' },
  { href: '/dormitory', label: 'פנימיה', sub: 'חדרים ושיבוץ', icon: '🏢', tint: 'from-rose-500 to-pink-600' },
  { href: '/actions', label: 'פעולות', sub: 'כלי ניהול', icon: '⚡', tint: 'from-yellow-500 to-amber-600' },
  { href: '/tasks', label: 'משימות', sub: 'מעקב פעולות', icon: '✅', tint: 'from-lime-500 to-emerald-600' },
  { href: '/registration', label: 'רישום', sub: 'מועמדים ומבחנים', icon: '📝', tint: 'from-cyan-500 to-blue-600' },
  { href: '/families', label: 'משפחות', sub: 'הורים ופרטי קשר', icon: '👨‍👩‍👦', tint: 'from-violet-500 to-purple-600' },
  { href: '/graduates', label: 'בוגרים', sub: 'בוגרי הישיבה', icon: '🎓', tint: 'from-indigo-500 to-blue-700' },
  { href: '/settings', label: 'הגדרות', sub: 'הגדרות מערכת', icon: '⚙', tint: 'from-slate-500 to-slate-700' },
];

const roleLabels: Record<string, string> = {
  admin: 'מנהל ראשי',
  manager: 'מנהל',
  secretary: 'מזכירה',
  viewer: 'צפיה בלבד',
};

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const { user, signOut, permissions } = useAuth();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Lock scroll when mobile drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <>
      {/* Hamburger button - visible on mobile only */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="lg:hidden fixed top-3 start-3 z-40 bg-slate-800 text-white rounded-lg p-2 shadow-lg"
        aria-label="פתח תפריט"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={cn(
          'w-64 flex flex-col h-screen fixed inset-y-0 start-0 z-50 transition-transform',
          'bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white',
          'shadow-2xl border-s border-slate-950/30',
          isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        )}
        style={{
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {/* Brand / logo area */}
        <div className="px-4 pt-5 pb-4 border-b border-slate-700/60 flex flex-col items-center text-center gap-1 relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png?v=2"
            alt="לוגו"
            className="w-28 h-28 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]"
          />
          <div className="mt-1">
            <h1 className="text-lg font-bold leading-tight tracking-wide" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>
              ישיבת מיר
            </h1>
            <p className="text-[11px] text-amber-300/80 mt-1 tracking-widest uppercase font-semibold">
              מודיעין עילית
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="lg:hidden absolute top-2 end-2 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700/50"
            aria-label="סגור תפריט"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 px-2.5 py-3 overflow-y-auto">
          <ul className="space-y-0.5">
            {menuItems.filter((item) => {
              // Graduates-only role: only see /graduates and signs out from anywhere else
              if (permissions.isGraduatesOnly) return item.href === '/graduates';
              return true;
            }).map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      'relative flex items-center gap-3 px-2.5 py-2 rounded-xl transition-all duration-150 group',
                      active
                        ? 'bg-white/10 text-white'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    )}
                  >
                    {active && (
                      <span
                        className="absolute inset-y-1.5 end-0 w-[3px] rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]"
                        aria-hidden
                      />
                    )}
                    <span
                      className={cn(
                        'w-9 h-9 flex items-center justify-center rounded-lg text-base shrink-0 shadow-md',
                        'bg-gradient-to-br',
                        item.tint,
                        active ? 'ring-2 ring-white/30' : 'opacity-90 group-hover:opacity-100'
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold leading-tight">{item.label}</span>
                      <span className="block text-[10.5px] text-slate-400 truncate leading-tight mt-0.5">{item.sub}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="px-4 py-3 border-t border-slate-700/60 space-y-2">
          {user && (
            <>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-slate-900 font-bold flex items-center justify-center text-sm shadow-md">
                  {(user.full_name || user.email)[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">{user.full_name || user.email}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{roleLabels[user.role] || user.role}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="w-full text-xs font-medium text-slate-300 hover:text-white bg-slate-700/50 hover:bg-slate-700 px-2 py-2 rounded-lg transition-colors"
              >
                יציאה
              </button>
            </>
          )}
          {permissions.canManageUsers && (
            <div className="flex flex-col gap-0.5 pt-2 border-t border-slate-700/60">
              <Link
                href="/settings/users"
                className="block text-[11px] text-slate-400 hover:text-white text-center py-1 rounded hover:bg-slate-700/30 transition-colors"
              >
                👤 ניהול משתמשים
              </Link>
              <Link
                href="/settings/audit"
                className="block text-[11px] text-slate-400 hover:text-white text-center py-1 rounded hover:bg-slate-700/30 transition-colors"
              >
                📋 יומן פעולות
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Style override - lg+ always show, mobile use isOpen */}
      <style jsx>{`
        @media (min-width: 1024px) {
          aside {
            transform: translateX(0) !important;
          }
        }
      `}</style>
    </>
  );
}
