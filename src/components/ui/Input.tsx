import { cn } from '@/lib/utils';
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</label>}
        <input
          ref={ref}
          className={cn(
            'w-full px-4 py-2.5 bg-white border rounded-xl text-slate-900 placeholder:text-slate-400 transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            error
              ? 'border-red-400 focus:ring-red-400/40 focus:border-red-500'
              : 'border-slate-200 hover:border-slate-300 focus:ring-blue-500/30 focus:border-blue-600',
            className
          )}
          {...props}
        />
        {error && <p className="text-red-600 text-xs font-medium mt-1.5">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
