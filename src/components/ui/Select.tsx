import { cn } from '@/lib/utils';
import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && <label className="block text-sm font-semibold text-slate-700 mb-1.5">{label}</label>}
        <select
          ref={ref}
          className={cn(
            'w-full px-3 py-2.5 bg-white border rounded-xl text-slate-900 transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            error
              ? 'border-red-400 focus:ring-red-400/40 focus:border-red-500'
              : 'border-slate-200 hover:border-slate-300 focus:ring-blue-500/30 focus:border-blue-600',
            className
          )}
          {...props}
        >
          {/* Only show placeholder when no options include an empty value */}
          {options.some((o) => o.value === '') ? null : <option value="">בחר אפשרות</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && <p className="text-red-600 text-xs font-medium mt-1.5">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
