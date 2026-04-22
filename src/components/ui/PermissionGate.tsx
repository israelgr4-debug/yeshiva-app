'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  require: 'write' | 'delete' | 'admin' | 'manageUsers' | 'generateReports' | 'exportCertificates' | 'generateMasav';
  children: ReactNode;
  fallback?: ReactNode;
}

// Renders children only if the current user has the required permission
export function PermissionGate({ require, children, fallback = null }: Props) {
  const { permissions } = useAuth();
  const allowed =
    (require === 'write' && permissions.canWrite) ||
    (require === 'delete' && permissions.canDelete) ||
    (require === 'admin' && permissions.isAdmin) ||
    (require === 'manageUsers' && permissions.canManageUsers) ||
    (require === 'generateReports' && permissions.canGenerateReports) ||
    (require === 'exportCertificates' && permissions.canExportCertificates) ||
    (require === 'generateMasav' && permissions.canGenerateMasav);

  return <>{allowed ? children : fallback}</>;
}
