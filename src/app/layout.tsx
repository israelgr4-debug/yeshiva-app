import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/hooks/useAuth';
import { InstallPrompt } from '@/components/layout/InstallPrompt';

export const metadata: Metadata = {
  title: 'ישיבת מיר מודיעין עילית',
  description: 'מערכת ניהול ישיבת מיר מודיעין עילית',
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
    shortcut: '/logo.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ישיבת מיר מודיעין עילית',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html dir="rtl" lang="he">
      <head>
        <link rel="apple-touch-icon" href="/logo.png" />
        <meta name="apple-mobile-web-app-title" content="ישיבת מיר מודיעין עילית" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
          <InstallPrompt />
        </AuthProvider>
      </body>
    </html>
  );
}
