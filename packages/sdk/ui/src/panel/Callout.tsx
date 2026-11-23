import type * as React from 'react';
import { cn } from '../utils/cn.js';

export type CalloutTone = 'amber' | 'red' | 'blue' | 'cyan' | 'emerald';

export interface CalloutProps {
  tone: CalloutTone;
  icon?: React.ReactNode;
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  /** `compact`: a thin one-line notice inside a content card — smaller padding and text only; tone, icon, title and action are unchanged. Default `default`. */
  size?: 'default' | 'compact';
  className?: string;
}

const TONE_STYLES: Record<
  CalloutTone,
  {
    colorVar: string;
    backgroundAlpha: string;
    ringAlpha: string;
    colorClass: string;
    titleClass: string;
  }
> = {
  amber: {
    colorVar: '--color-amber',
    backgroundAlpha: '0.08',
    ringAlpha: '0.3',
    colorClass: 'text-accent-warn',
    titleClass: 'text-text-warning-label', // #750: AA label color departs from the prototype mapping.
  },
  red: {
    colorVar: '--color-warning-red',
    backgroundAlpha: '0.06',
    ringAlpha: '0.2',
    colorClass: 'text-accent-danger',
    titleClass: 'text-text-danger-label', // #750: AA label color departs from the prototype mapping.
  },
  blue: {
    colorVar: '--accent-primary', // the accent family, so an accent theme reaches the tint (#2723)
    backgroundAlpha: '0.04',
    ringAlpha: '0.2',
    colorClass: 'text-accent-primary',
    titleClass: 'text-text-secondary',
  },
  cyan: {
    colorVar: '--color-cyan-spark',
    backgroundAlpha: '0.06',
    ringAlpha: '0.2',
    colorClass: 'text-accent-info',
    titleClass: 'text-text-secondary',
  },
  emerald: {
    colorVar: '--color-emerald',
    backgroundAlpha: '0.06',
    ringAlpha: '0.2',
    colorClass: 'text-accent-success',
    titleClass: 'text-text-secondary',
  },
};

export function Callout({ tone, icon, title, children, action, size = 'default', className }: CalloutProps) {
  const toneStyle = TONE_STYLES[tone];
  const compact = size === 'compact';
  const style = {
    // eslint-disable-next-line shadcn/no-inline-styles -- exact-alpha tone tint stays a custom property per #784
    '--callout-background': `rgb(var(${toneStyle.colorVar}) / ${toneStyle.backgroundAlpha})`,
    // eslint-disable-next-line shadcn/no-inline-styles -- exact-alpha inset ring stays a custom property per #784
    '--callout-ring': `rgb(var(${toneStyle.colorVar}) / ${toneStyle.ringAlpha}) 0 0 0 1px inset`,
  } as React.CSSProperties;

  // The approved prototype uses a tint and inset ring instead of the issue's initial left border.
  return (
    <div
      data-tone={tone}
      className={cn(
        // compact keeps the 12px floor and tightens padding and line height; its title drops to 12px.
        compact
          ? 'rounded-md px-2.5 py-1.5 text-xs leading-normal text-text-secondary bg-(--callout-background) shadow-(--callout-ring)'
          : 'rounded-md p-3 text-xs leading-note text-text-secondary bg-(--callout-background) shadow-(--callout-ring)',
        className,
      )}
      style={style}
    >
      {title !== undefined ? (
        <>
          <div className={cn('flex items-center gap-2', compact ? 'mb-1' : 'mb-1.5')}>
            {icon !== undefined && (
              <span className={cn('shrink-0', toneStyle.colorClass)}>{icon}</span>
            )}
            <strong className={cn(compact ? 'text-xs' : 'text-sm', 'font-semibold', toneStyle.titleClass)}>{title}</strong>
          </div>
          <div>{children}</div>
          {action !== undefined && <div className="mt-2">{action}</div>}
        </>
      ) : (
        <div className="flex items-start gap-2">
          {icon !== undefined && (
            <span className={cn('mt-0.5 shrink-0', toneStyle.colorClass)}>{icon}</span>
          )}
          <span className="flex-1">{children}</span>
          {action !== undefined && <div className="ml-auto">{action}</div>}
        </div>
      )}
    </div>
  );
}
