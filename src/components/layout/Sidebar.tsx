'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const menuItems = [
  { href: '/', label: 'לוח בקרה', icon: '▦' },
  { href: '/students', label: 'תלמידים', icon: '👤' },
  { href: '/finances', label: 'כספים', icon: '₪' },
  { href: '/dormitory', label: 'פנימיה', icon: '🏢' },
  { href: '/reports', label: 'אישורים', icon: '📄' },
  { href: '/settings', label: 'הגדרות', icon: '⚙' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-800 text-white flex flex-col h-screen fixed inset-y-0 start-0 shadow-lg z-50">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold">ישיבת מיר</h1>
        <p className="text-sm text-slate-400 mt-1">מודיעין עילית</p>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                  pathname === item.href
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

      <div className="p-4 border-t border-slate-700">
        <div className="text-xs text-slate-400">
          <p className="truncate">משתמש: מנהל</p>
          <p className="text-slate-500 mt-2 text-center">ישיבת מיר מודיעין עילית</p>
        </div>
      </div>
    </aside>
  );
}
