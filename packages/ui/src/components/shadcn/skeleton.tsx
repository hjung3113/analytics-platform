// Copied from products/feedbackops/packages/ui/src (6a0c7f8); import suffixes adjusted only.
import * as React from 'react';
import { cn } from '../../utils/cn';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-surface-raised', className)}
      {...props}
    />
  );
}
Skeleton.displayName = 'Skeleton';
