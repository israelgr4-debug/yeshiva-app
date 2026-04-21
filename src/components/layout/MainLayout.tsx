'use client';

import React from 'react';
import { Sidebar } from './Sidebar';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      {/* On mobile: no sidebar margin (hamburger opens drawer). lg+: ms-64 for sidebar */}
      <main className="flex-1 lg:ms-64 overflow-auto min-h-screen">
        {children}
      </main>
    </div>
  );
}
