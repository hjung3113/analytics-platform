import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '../utils/cn';

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  /** `compact` matches PlatformDataTable table size 작게: 28px rows and 12px font. Side padding is 12px instead of 16px so six-column summaries fit a side panel. */
  density?: 'default' | 'compact';
}

export const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, density = 'default', ...props }, ref) => <table ref={ref} className={cn('w-full border-separate border-spacing-0 break-keep text-sm text-text-primary pointer-coarse:[&_th]:h-11 pointer-coarse:[&_td]:h-11', density === 'compact' && 'text-xs [&_th]:h-7 [&_td]:h-7 [&_th]:px-3 [&_td]:px-3', className)} {...props} />,
);
Table.displayName = 'Table';

interface TableCaptionProps extends React.HTMLAttributes<HTMLTableCaptionElement> {
  srOnly?: boolean;
}

export const TableCaption = React.forwardRef<HTMLTableCaptionElement, TableCaptionProps>(
  ({ className, srOnly, ...props }, ref) => <caption ref={ref} className={cn('t-caption text-text-muted', srOnly && 'sr-only', className)} {...props} />,
);
TableCaption.displayName = 'TableCaption';

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn('bg-surface-sunken', className)} {...props} />,
);
TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <tbody ref={ref} className={cn('[&_tr:last-child>td]:border-b-0', className)} {...props} />,
);
TableBody.displayName = 'TableBody';

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /** The row the screen is on (a drill target, the open item): accent surface and `aria-current`. Shape and weight for the row's own text stay with the consumer (06 §26). */
  current?: boolean;
}

export const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, current, ...props }, ref) => <tr ref={ref} className={cn(current && 'bg-accent-primary-soft', className)} {...props} aria-current={current ? 'true' : props['aria-current']} />,
);
TableRow.displayName = 'TableRow';

interface TableHeadProps extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'align'> {
  align?: 'start' | 'end';
  sort?: { direction: 'ascending' | 'descending' | 'none'; onSort: () => void };
}

export const TableHead = React.forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, align, sort, children, ...props }, ref) => {
    const SortIcon = sort?.direction === 'ascending' ? ArrowUp : ArrowUpDown;
    const Icon = sort?.direction === 'descending' ? ArrowDown : SortIcon;
    return <th ref={ref} className={cn('border-b border-border-subtle h-8 whitespace-nowrap bg-surface-sunken px-4 py-1 text-left align-middle t-table-header text-text-secondary', align === 'end' && 'text-right tabular', className)} {...props} aria-sort={sort?.direction ?? props['aria-sort']}>
      {sort ? <button type="button" onClick={sort.onSort} className="-mx-1 inline-flex min-h-6 min-w-0 items-center gap-1 rounded-xs px-1 uppercase hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
        <span className="min-w-0 truncate">{children}</span><Icon className={cn('size-3 shrink-0', sort.direction === 'none' && 'opacity-40')} aria-hidden />
      </button> : children}
    </th>;
  },
);
TableHead.displayName = 'TableHead';

interface TableCellProps extends Omit<React.TdHTMLAttributes<HTMLTableCellElement>, 'align'> {
  align?: 'start' | 'end';
}

export const TableCell = React.forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, align, ...props }, ref) => <td ref={ref} className={cn('border-b border-border-subtle h-8 whitespace-normal px-4 py-1 align-middle [overflow-wrap:anywhere]', align === 'end' && 'text-right tabular', align === 'start' && 'text-left', className)} {...props} />,
);
TableCell.displayName = 'TableCell';
