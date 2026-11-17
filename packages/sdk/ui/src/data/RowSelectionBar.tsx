import * as React from 'react';
import { cn } from '../utils/cn.js';

/**
 * The 2px `border-selected` bar on the left edge of a selected list row (DESIGN.md: selected surface plus bar, #2482).
 * Render it only while the row is selected; the row must be `relative`. Decorative: the row states the selection itself
 * (`aria-selected`, `aria-current`).
 */
export function RowSelectionBar({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span aria-hidden="true" {...props} className={cn('absolute inset-y-0 left-0 w-0.5 bg-border-selected', className)} />;
}
