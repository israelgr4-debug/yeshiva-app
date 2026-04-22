// Authentication + authorization helpers
import { supabase } from './supabase';

export type UserRole = 'admin' | 'manager' | 'secretary' | 'viewer';

export interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PermissionSet {
  canRead: boolean; // all authenticated
  canWrite: boolean; // admin + secretary
  canDelete: boolean; // admin only
  canGenerateReports: boolean; // admin + manager + secretary
  canExportCertificates: boolean; // admin + manager + secretary
  canGenerateMasav: boolean; // admin + secretary
  canManageUsers: boolean; // admin only
  isAdmin: boolean;
  isManager: boolean;
  isSecretary: boolean;
  isViewer: boolean;
}

export function permissionsForRole(role: UserRole | null): PermissionSet {
  const r = role;
  return {
    canRead: r !== null,
    canWrite: r === 'admin' || r === 'secretary',
    canDelete: r === 'admin',
    canGenerateReports: r === 'admin' || r === 'manager' || r === 'secretary',
    canExportCertificates: r === 'admin' || r === 'manager' || r === 'secretary',
    canGenerateMasav: r === 'admin' || r === 'secretary',
    canManageUsers: r === 'admin',
    isAdmin: r === 'admin',
    isManager: r === 'manager',
    isSecretary: r === 'secretary',
    isViewer: r === 'viewer',
  };
}

export async function signIn(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as AppUser;
}
