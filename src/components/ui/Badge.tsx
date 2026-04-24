import { cn } from '@/lib/utils';
import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'gray';
  children: React.ReactNode;
}

export const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'primary', ...props }, ref) => {
    const variantStyles = {
      primary: 'bg-blue-50 text-blue-800 ring-1 ring-blue-200/60',
      success: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60',
      warning: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200/60',
      danger: 'bg-red-50 text-red-800 ring-1 ring-red-200/60',
      gray: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200/60',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide',
          variantStyles[variant],
          className
        )}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';
