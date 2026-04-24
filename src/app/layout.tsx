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
    icon: '/logo.png?v=2',
    apple: '/logo.png?v=2',
    shortcut: '/logo.png?v=2',
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
        {/* Hebrew typography: Heebo for body, Frank Ruhl Libre for headlines */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&family=Frank+Ruhl+Libre:wght@500;700;900&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" type="image/png" sizes="32x32" href="/logo.png?v=2" />
        <link rel="icon" type="image/png" sizes="16x16" href="/logo.png?v=2" />
        <link rel="shortcut icon" href="/logo.png?v=2" />
        <link rel="apple-touch-icon" href="/logo.png?v=2" />
        <link rel="apple-touch-icon" sizes="180x180" href="/logo.png?v=2" />
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
