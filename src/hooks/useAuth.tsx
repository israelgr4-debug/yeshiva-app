'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AppUser, PermissionSet, permissionsForRole } from '@/lib/auth';

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  permissions: PermissionSet;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PUBLIC_PATHS = ['/login'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const loadUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setUser(null);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (data && (data as AppUser).is_active) {
      setUser(data as AppUser);
    } else {
      setUser(null);
      await supabase.auth.signOut();
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, _session) => {
      loadUser();
    });

    return () => subscription.unsubscribe();
  }, [loadUser]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (loading) return;
    if (!user && !PUBLIC_PATHS.includes(pathname)) {
      router.push('/login');
    }
    if (user && pathname === '/login') {
      router.push('/');
    }
  }, [user, loading, pathname, router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    router.push('/login');
  };

  const permissions = permissionsForRole(user?.role || null);

  return (
    <AuthContext.Provider value={{ user, loading, permissions, refresh: loadUser, signOut: handleSignOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
