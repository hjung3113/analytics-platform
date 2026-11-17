import * as React from 'react';
import { cn } from '../utils/cn';

export interface ShellHeaderProps {
  /** Primary title — usually the route or workspace context. */
  title?: React.ReactNode;
  /** Optional subtitle / breadcrumb / managed-system pill. */
  subtitle?: React.ReactNode;
  /** Toolbar slot — filters, actions, search. Right-aligned. */
  actions?: React.ReactNode;
  /** Variant: 'default' = white bg + subtle border; 'toolbar' = list/workbench toolbar above content; 'drawer' = detail-panel header. */
  variant?: 'default' | 'toolbar' | 'drawer';
  className?: string;
}

/**
 * Shared 50px header used by all three shells + detail panel + sidebar system header.
 * Locks the visual rhythm per ADR-0020 §50px Header Rhythm. Height is non-negotiable.
 */
export function ShellHeader({ title, subtitle, actions, variant = 'default', className }: ShellHeaderProps) {
  // A toolbar holding only actions takes no row when they all render elsewhere (a host-owned primary action portals
  // into the page header), and an entirely empty toolbar is not drawn (#2455). Other variants keep their 50px rhythm.
  const actionsOnlyToolbar = variant === 'toolbar' && !title && !subtitle;
  if (actionsOnlyToolbar && !actions) return null;
  return (
    <header
      className={cn(
        'flex items-center justify-between gap-3 px-4 h-toolbar border-b border-border-subtle bg-surface-canvas',
        variant === 'drawer' && 'bg-surface-detail',
        variant === 'toolbar' && 'bg-surface-canvas',
        actionsOnlyToolbar && 'has-[[data-shell-header-actions]:empty]:hidden',
        className,
      )}
      data-shell-header={variant}
      data-toolbar-height="50"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Page identity never yields to the subtitle: the title keeps its natural
            width (capped at the container) and the subtitle absorbs the remainder. */}
        {title && (
          <h2 className="max-w-full shrink-0 text-sm font-semibold text-text-primary truncate">
            {title}
          </h2>
        )}
        {subtitle && <div className="min-w-0 flex-1 text-xs text-text-muted truncate">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0" data-shell-header-actions="">{actions}</div>}
    </header>
  );
}
