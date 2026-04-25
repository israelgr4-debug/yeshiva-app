'use client';

import React, { useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, className }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose}></div>
      <div
        className={cn(
          'relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-2 sm:mx-4 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto elevation-4 animate-scaleIn',
          className
        )}
      >
        {title && (
          <div className="sticky top-0 bg-white border-b border-slate-100 px-4 sm:px-6 py-3 sm:py-4 z-10 flex items-center justify-between gap-2">
            <h2
              className="text-base sm:text-lg font-bold text-slate-900"
              style={{ fontFamily: "'Frank Ruhl Libre', serif" }}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 w-8 h-8 rounded-lg flex items-center justify-center text-xl transition-colors"
              aria-label="סגור"
            >
              ×
            </button>
          </div>
        )}
        <div className="p-4 sm:p-6">{children}</div>
        {!title && (
          <button
            onClick={onClose}
            className="absolute top-3 start-3 text-slate-400 hover:text-slate-700 hover:bg-slate-100 w-8 h-8 rounded-lg flex items-center justify-center text-xl transition-colors"
            aria-label="סגור"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};
