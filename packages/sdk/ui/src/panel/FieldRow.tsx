import * as React from 'react';
import { cn } from '../utils/cn.js';
import { FieldListContext } from './FieldList.js';

export interface FieldRowProps {
  label: React.ReactNode;
  children: React.ReactNode;
  inset?: 'default' | 'none';
  /** `detail`: the detail-panel property list — 9rem label column, divided rows, string labels fold at camelCase, tabular values (#891). */
  layout?: 'default' | 'property' | 'detail';
  /** The value is an identifier or code: monospace instead of tabular figures. */
  mono?: boolean;
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

// A long technical key folds at camelCase word boundaries instead of dropping its last character. <wbr> is a break opportunity only —
// textContent and the accessible name stay the original string.
function foldedLabel(label: string): React.ReactNode {
  return label.split(/(?<=[a-z])(?=[A-Z])/).map((part, i) => (
    <React.Fragment key={i}>{i > 0 && <wbr />}{part}</React.Fragment>
  ));
}

export function FieldRow({
  label,
  children,
  inset = 'default',
  layout = 'default',
  mono = false,
  className,
}: FieldRowProps) {
  const inList = React.useContext(FieldListContext);
  const Label = inList ? 'dt' : 'span';
  const Value = inList ? 'dd' : 'div';
  if (layout === 'detail') {
    return (
      <div className={cn('grid grid-cols-[9rem_1fr] gap-3 border-b border-border-subtle py-1.5 text-sm last:border-0', className)}>
        <Label className="min-w-0 break-words text-text-muted">{typeof label === 'string' ? foldedLabel(label) : label}</Label>
        <Value className={mono ? 't-mono' : 'tabular'}>{children}</Value>
      </div>
    );
  }
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 px-4 py-2 text-sm',
        INSET_CLASSES[inset],
        LAYOUT_CLASSES[layout],
        // The property layout left-aligns a div value; inside a FieldList the value is a dd.
        inList && layout === 'property' && '[&>dd]:text-left',
        className,
      )}
    >
      <Label className="text-text-muted shrink-0">{label}</Label>
      <Value className={cn('text-text-primary text-right', mono && 't-mono', inList && 'm-0')}>{children}</Value>
    </div>
  );
}
