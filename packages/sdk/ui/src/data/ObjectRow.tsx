import * as React from 'react';
import { Checkbox } from '../components/shadcn/checkbox.js';
import { cn } from '../utils/cn.js';

export type ObjectRowSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ObjectRowDensity = 'compact' | 'default' | 'expanded';

export interface ObjectRowProps {
  id?: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  badges?: React.ReactNode;
  trailing?: React.ReactNode;
  icon?: React.ReactNode;
  /** Keep the leading cell by default; auto omits it when no leading content is set. */
  leadingCell?: 'always' | 'auto';
  severity?: ObjectRowSeverity;
  selected?: boolean;
  density?: ObjectRowDensity;
  selectable?: boolean;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  className?: string;
  children?: React.ReactNode;
}

const densityClassName: Record<ObjectRowDensity, string> = {
  compact:  'min-h-row-compact px-5 py-1.5',
  default:  'min-h-row-default px-5 py-2.5',
  expanded: 'min-h-row-expanded px-5 py-3.5',
};

const severityClassName: Record<ObjectRowSeverity, string> = {
  low: 'bg-severity-low',
  medium: 'bg-severity-medium',
  high: 'bg-severity-high',
  critical: 'bg-severity-critical',
};

const INTERACTIVE_CHILD_SELECTOR =
  'a[href], button, input, select, textarea, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="checkbox"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="radio"], [role="switch"], [role="tab"], [tabindex]:not([tabindex="-1"])';

function isNestedInteractiveTarget(target: EventTarget | null, row: HTMLElement): boolean {
  if (!(target instanceof Element)) return false;
  const interactive = target.closest(INTERACTIVE_CHILD_SELECTOR);
  return interactive !== null && interactive !== row && row.contains(interactive);
}

export const ObjectRow = React.forwardRef<HTMLDivElement, ObjectRowProps>(
  (
    {
      id,
      title,
      meta,
      badges,
      trailing,
      icon,
      leadingCell = 'always',
      severity,
      selected = false,
      density = 'default',
      selectable = false,
      checked = false,
      onCheckedChange,
      onClick,
      className,
      children,
    },
    ref,
  ) => {
    const showLeadingCell = leadingCell === 'always' || !!(severity || selectable || icon);
    const clickableProps = onClick
      ? {
          role: 'button' as const,
          tabIndex: 0,
          onClick(event: React.MouseEvent<HTMLDivElement>) {
            if (isNestedInteractiveTarget(event.target, event.currentTarget)) return;
            onClick(event);
          },
          onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              event.currentTarget.click();
            }
          },
        }
      : {};

    return (
      <div
        ref={ref}
        className={cn(
          'relative grid items-center gap-3 border-b border-border-subtle transition-colors duration-75',
          showLeadingCell ? 'grid-cols-[auto_1fr_auto]' : 'grid-cols-[1fr_auto]',
          selected ? 'bg-surface-row-selected' : 'hover:bg-surface-row-hover',
          onClick && 'cursor-pointer',
          densityClassName[density],
          className,
        )}
        {...clickableProps}
      >
        {selected && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-0.5 bg-border-selected"
            data-testid="object-row-selected-bar"
          />
        )}

        {showLeadingCell && <div className="flex shrink-0 items-center gap-2.5">
          {severity && (
            <span
              aria-hidden="true"
              className={cn('h-4 w-row-accent shrink-0 rounded-pill', severityClassName[severity])}
              data-token={`--severity-${severity}`}
            />
          )}
          {selectable && (
            <Checkbox
              aria-label={id ? `${id} 선택` : '행 선택'}
              checked={checked}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={(nextChecked) => onCheckedChange?.(nextChecked === true)}
            />
          )}
          {icon && <span className="flex shrink-0 text-text-muted">{icon}</span>}
        </div>}

        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            {id && <span className="shrink-0 font-mono text-xs text-text-muted">{id}</span>}
            <span className="truncate text-sm font-medium text-text-primary">{title}</span>
          </div>

          {(badges || meta) && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
              {badges}
              {meta}
            </div>
          )}

          {children}
        </div>

        {trailing && (
          <div className="flex shrink-0 items-center gap-2">
            {trailing}
          </div>
        )}
      </div>
    );
  },
);
ObjectRow.displayName = 'ObjectRow';
