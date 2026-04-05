import type { Metadata } from 'next';
import './globals.css';
import { MainLayout } from '@/components/layout/MainLayout';

export const metadata: Metadata = {
  title: 'ישיבת מיר מודיעין עילית',
  description: 'מערכת ניהול לישיבה',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html dir="rtl" lang="he">
      <body>
        <MainLayout>{children}</MainLayout>
      </body>
    </html>
  );
}
