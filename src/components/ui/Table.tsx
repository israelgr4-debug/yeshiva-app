import { cn } from '@/lib/utils';
import React from 'react';

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  children: React.ReactNode;
}

export const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-x-auto border border-gray-200 rounded-lg">
      <table
        ref={ref}
        className={cn('w-full border-collapse', className)}
        {...props}
      />
    </div>
  )
);

Table.displayName = 'Table';

interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode;
}

export const TableHeader = React.forwardRef<HTMLTableSectionElement, TableHeaderProps>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('bg-gray-50 border-b border-gray-200', className)} {...props} />
  )
);

TableHeader.displayName = 'TableHeader';

interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode;
}

export const TableBody = React.forwardRef<HTMLTableSectionElement, TableBodyProps>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn('', className)} {...props} />
);

TableBody.displayName = 'TableBody';

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode;
  isClickable?: boolean;
}

export const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, isClickable, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-gray-200 hover:bg-gray-50 transition-colors',
        isClickable && 'cursor-pointer',
        className
      )}
      {...props}
    />
  )
);

TableRow.displayName = 'TableRow';

interface TableCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
  isHeader?: boolean;
}

export const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, isHeader, ...props }, ref) =>
    isHeader ? (
      <th
        ref={ref as React.ForwardedRef<HTMLTableHeaderCellElement>}
        className={cn('px-6 py-3 text-right font-semibold text-gray-700 text-sm', className)}
        {...(props as React.ThHTMLAttributes<HTMLTableHeaderCellElement>)}
      />
    ) : (
      <td
        ref={ref as React.ForwardedRef<HTMLTableDataCellElement>}
        className={cn('px-6 py-4 text-gray-900', className)}
        {...(props as React.TdHTMLAttributes<HTMLTableDataCellElement>)}
      />
    )
);

TableCell.displayName = 'TableCell';
