'use client';

import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = 'install_prompt_dismissed_at';
const DISMISS_COOLDOWN_DAYS = 7;

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Detect if already installed
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);
    if (standalone) return;

    // Detect iOS (iOS doesn't fire beforeinstallprompt, need manual instructions)
    const ua = window.navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(iOS);

    // Only show on mobile
    const isMobile = window.innerWidth <= 900 || /Mobi|Android/i.test(ua);
    if (!isMobile) return;

    // Check dismiss cooldown
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const daysSince = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (daysSince < DISMISS_COOLDOWN_DAYS) return;
    }

    // Android / Chrome: listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS: show instructions after a small delay
    if (iOS) {
      const timer = setTimeout(() => setVisible(true), 3000);
      return () => {
        window.removeEventListener('beforeinstallprompt', handler);
        clearTimeout(timer);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  if (!visible || isStandalone) return null;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[60] bg-white border-t border-gray-200 shadow-2xl p-4 pb-safe"
      dir="rtl"
    >
      <div className="max-w-lg mx-auto flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png?v=2" alt="אפליקציה" className="w-14 h-14 flex-shrink-0 object-contain" />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 text-sm">ישיבת מיר מודיעין עילית</p>
          {isIOS ? (
            <p className="text-xs text-gray-600 mt-0.5">
              כדי להתקין: לחץ על <span className="inline-block mx-1">⬆️</span> ואז על &quot;הוסף למסך הבית&quot;
            </p>
          ) : (
            <p className="text-xs text-gray-600 mt-0.5">התקן את האפליקציה במכשיר לגישה מהירה</p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {!isIOS && deferredPrompt && (
            <button
              type="button"
              onClick={handleInstall}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg"
            >
              התקן
            </button>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 text-xs px-3 py-1"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
