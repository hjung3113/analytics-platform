import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cn } from '@ap/ui';
import { useInWorkspacePanel } from '../workspace/panelContext';

export function Panel({ title, subtitle, actions, badge, footer, children, className, bodyClassName, id, ...section }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string;
  /** A status signal next to the title. A defined slot keeps the title row on one line. */
  badge?: ReactNode;
  footer?: ReactNode;
} & Pick<ComponentPropsWithRef<'section'>, 'ref' | 'tabIndex' | 'aria-describedby'>) {
  // The workspace tab already shows this title.
  const inPanel = useInWorkspacePanel();
  const hasBadgeSlot = badge !== undefined;
  const regionName = hasBadgeSlot && typeof title === 'string' ? title : undefined;
  const heading = title && <h2 id={id} title={hasBadgeSlot && typeof title === 'string' ? title : undefined}
    className={cn('t-card-title', hasBadgeSlot && 'min-w-16 truncate', inPanel && 'sr-only')}>{title}</h2>;
  return <section {...section} aria-label={regionName} aria-labelledby={!regionName && title && id ? id : undefined} className={cn('rounded-lg border border-border-subtle bg-surface-card', inPanel ? 'elevation-flat' : 'elevation-panel', className)}>
    {(title || actions) && <header className={cn('flex justify-between gap-2 px-4', hasBadgeSlot ? ['flex-nowrap items-center', subtitle ? 'h-16' : 'h-12'] : 'flex-wrap items-start pb-2 pt-3')}>
      <div className={hasBadgeSlot ? 'min-w-0 flex-1' : undefined}>
        {hasBadgeSlot ? <div className="flex min-w-0 items-center gap-2">{heading}{badge}</div> : heading}
        {subtitle && <p className={cn('text-xs text-text-muted', hasBadgeSlot && 'truncate')}>{subtitle}</p>}
      </div>
      {actions && <div className={cn('flex items-center gap-2', hasBadgeSlot ? 'shrink-0 whitespace-nowrap' : 'flex-wrap')}>{actions}</div>}
    </header>}
    <div className={cn('px-4 pb-4', !title && !actions && 'pt-4', bodyClassName)}>{children}</div>
    {footer}
  </section>;
}
