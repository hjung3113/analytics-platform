import * as React from 'react';
import { cn } from '../../utils/cn.js';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shape?: 'default' | 'rounded';
  appearance?: 'default' | 'panel';
}

export function Skeleton({ className, shape = 'default', appearance = 'default', ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        appearance === 'panel' ? 'rounded-md bg-border-row' : 'animate-pulse rounded-md bg-surface-blocked',
        shape === 'rounded' && 'rounded',
        className,
      )}
      {...props}
    />
  );
}
Skeleton.displayName = 'Skeleton';
