'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

type Requires = 'write' | 'delete' | 'admin' | 'manageUsers' | 'generateReports' | 'exportCertificates' | 'generateMasav' | 'manageGraduates';

interface Props {
  /** Permission keyword the user must have to see the page. */
  requires: Requires;
  /** Optional explanation shown to blocked users. */
  message?: string;
  children: ReactNode;
}

const REQUIRES_LABEL: Record<Requires, string> = {
  write:            'כתיבה / עריכת נתונים',
  delete:           'מחיקת נתונים',
  admin:            'מנהל ראשי',
  manageUsers:      'ניהול משתמשים',
  generateReports:  'הפקת דוחות',
  exportCertificates: 'ייצוא אישורים',
  generateMasav:    'הפקת מס״ב',
  manageGraduates:  'ניהול בוגרים',
};

/**
 * Page-level access guard. Blocks the entire page when the active user lacks
 * the required permission. Use for routes whose content is meaningless / unsafe
 * for the role (e.g. admin actions, write-only flows).
 */
export function PageGuard({ requires, message, children }: Props) {
  const { permissions, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-slate-500">טוען...</div>
      </div>
    );
  }

  if (!user) return null; // AuthProvider will redirect to /login

  const allowed =
    (requires === 'write' && permissions.canWrite) ||
    (requires === 'delete' && permissions.canDelete) ||
    (requires === 'admin' && permissions.isAdmin) ||
    (requires === 'manageUsers' && permissions.canManageUsers) ||
    (requires === 'generateReports' && permissions.canGenerateReports) ||
    (requires === 'exportCertificates' && permissions.canExportCertificates) ||
    (requires === 'generateMasav' && permissions.canGenerateMasav) ||
    (requires === 'manageGraduates' && permissions.canManageGraduates);

  if (allowed) return <>{children}</>;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl border border-slate-200 elevation-1 max-w-md w-full p-8 text-center">
        <div className="text-6xl mb-4 opacity-40">🔒</div>
        <h2 className="text-xl font-bold text-slate-900 mb-2" style={{ fontFamily: "'Frank Ruhl Libre', serif" }}>
          אין לך גישה לעמוד זה
        </h2>
        <p className="text-sm text-slate-600 mb-1">
          {message || `העמוד דורש הרשאת ${REQUIRES_LABEL[requires]}.`}
        </p>
        <p className="text-xs text-slate-500 mb-6">
          פנה למנהל המערכת אם אתה זקוק לגישה.
        </p>
        <Link
          href="/"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-medium"
        >
          חזרה לדף הבית
        </Link>
      </div>
    </div>
  );
}
