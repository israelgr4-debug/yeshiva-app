'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

const menuItems = [
  { href: '/', label: 'לוח בקרה', icon: '▦' },
  { href: '/students', label: 'תלמידים', icon: '👤' },
  { href: '/families', label: 'משפחות', icon: '👨‍👩‍👦' },
  { href: '/finances', label: 'כספים', icon: '₪' },
  { href: '/dormitory', label: 'פנימיה', icon: '🏢' },
  { href: '/reports', label: 'אישורים', icon: '📄' },
  { href: '/tasks', label: 'משימות', icon: '✅' },
  { href: '/lists', label: 'דוחות', icon: '📊' },
  { href: '/actions', label: 'פעולות', icon: '⚡' },
  { href: '/settings', label: 'הגדרות', icon: '⚙' },
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
          'w-64 bg-slate-800 text-white flex flex-col h-screen fixed inset-y-0 start-0 shadow-lg z-50 transition-transform',
          // On mobile: drawer (slide in/out). On lg+: always visible
          isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
          'rtl:translate-x-0', // fix: we are already RTL, the drawer should slide from start (right in RTL)
        )}
        style={{
          transform: isOpen
            ? 'translateX(0)'
            : 'translateX(100%)', // slide out to the right (RTL start)
        }}
      >
        <div className="p-3 border-b border-slate-700 flex flex-col items-center text-center gap-1 relative">
          {/* Zoom in visually to cut the transparent padding around the logo */}
          <div className="w-36 h-36 overflow-hidden flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="לוגו"
              className="w-full h-full object-contain"
              style={{ transform: 'scale(1.45)' }}
            />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">ישיבת מיר</h1>
            <p className="text-xs text-slate-400 mt-0.5 leading-tight">מודיעין עילית</p>
          </div>
          {/* Close button for mobile - absolute top-end */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="lg:hidden absolute top-2 end-2 text-slate-400 hover:text-white p-1"
            aria-label="סגור תפריט"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-2">
            {menuItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                    (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href))
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-700'
                  )}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="font-medium">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-slate-700 space-y-2">
          {user && (
            <>
              <div className="text-xs text-slate-300">
                <p className="font-semibold truncate">{user.full_name || user.email}</p>
                <p className="text-slate-400 mt-0.5">{roleLabels[user.role] || user.role}</p>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="w-full text-xs text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-2 py-1.5 rounded transition-colors"
              >
                יציאה
              </button>
            </>
          )}
          {permissions.canManageUsers && (
            <div className="flex flex-col gap-1 pt-1 border-t border-slate-700">
              <Link
                href="/settings/users"
                className="block text-xs text-slate-400 hover:text-white text-center py-1"
              >
                👤 ניהול משתמשים
              </Link>
              <Link
                href="/settings/audit"
                className="block text-xs text-slate-400 hover:text-white text-center py-1"
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
