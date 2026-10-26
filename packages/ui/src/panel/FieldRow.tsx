import * as React from 'react';
import { cn } from '../utils/cn.js';
import { FieldListContext } from './FieldList.js';

export interface FieldRowProps {
  label: string;
  children: React.ReactNode;
  inset?: 'default' | 'none';
  layout?: 'default' | 'property';
  className?: string;
}

const INSET_CLASSES = {
  default: '',
  none: 'px-0',
} as const;

const LAYOUT_CLASSES = {
  default: '',
  property: 'grid grid-cols-[120px_1fr] items-start gap-3 px-0 text-sm [&>div]:text-left',
} as const;

export function FieldRow({
  label,
  children,
  inset = 'default',
  layout = 'default',
  className,
}: FieldRowProps) {
  const inList = React.useContext(FieldListContext);
  const Label = inList ? 'dt' : 'span';
  const Value = inList ? 'dd' : 'div';
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-2 text-sm',
        INSET_CLASSES[inset],
        LAYOUT_CLASSES[layout],
        className,
      )}
    >
      <Label className="text-text-muted shrink-0">{label}</Label>
      <Value className={cn('text-text-primary text-right', inList && 'm-0')}>{children}</Value>
    </div>
  );
}
