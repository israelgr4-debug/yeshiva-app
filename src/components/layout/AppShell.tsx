'use client';

import { usePathname } from 'next/navigation';
import { MainLayout } from './MainLayout';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  children: React.ReactNode;
}

// Wraps pages: shows raw content on /login, else wraps with MainLayout (sidebar + header).
// Also blocks rendering until auth state is known.
export function AppShell({ children }: Props) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  // Public routes - render as-is
  if (pathname === '/login') {
    return <>{children}</>;
  }

  // While checking auth - show simple loader to avoid flashing unauthenticated content
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  // Not authenticated - AuthProvider will redirect us to /login via its own effect,
  // but show placeholder meanwhile
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-gray-500">מפנה להתחברות...</div>
      </div>
    );
  }

  // Authenticated - wrap with main layout (sidebar, header)
  return <MainLayout>{children}</MainLayout>;
}
