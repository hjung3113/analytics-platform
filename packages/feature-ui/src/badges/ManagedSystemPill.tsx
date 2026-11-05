import { cn } from '@ap/ui';
/**
 * ManagedSystemPill — outline pill: border + rounded-full + name + 6 px round color dot.
 *
 * C1 design contract: this component takes the RESOLVED data directly.
 * Callers resolve `mark` from the Managed System slug with
 * `managedSystemMarkColor`, keeping this package primitive free of data fetching.
 * This keeps `@ap/feature-ui` free of domain data-fetching per AGENTS.md.
 *
 * A known record with an unsupported slug gets the neutral default token.
 * A missing record can omit `mark`; its name retains the same readable contrast.
 */
import type * as React from 'react';

export interface ManagedSystemPillProps {
  name: string;
  /** CSS color string for the 6 px round "mark" dot, resolved by slug in the caller. */
  mark?: string;
  /** When true, distinguishes the archived system with a dashed outline. */
  archived?: boolean;
  className?: string;
}

/**
 * Outline pill for a Managed System reference.
 * Renders a small 6 px round colored dot prefix ("mark") when `mark` is provided.
 * Passes `archived` as a data attribute for testability.
 */
export function ManagedSystemPill({ name, mark, archived, className }: ManagedSystemPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border-subtle px-2.5 py-0.5 text-xs font-medium text-text-secondary',
        archived === true && 'border-dashed',
        className,
      )}
      data-archived={archived === true ? 'true' : 'false'}
      {...(mark !== undefined
        ? { style: { '--managed-system-pill-mark-color': mark } as React.CSSProperties }
        : {})}
    >
      {mark !== undefined && (
        <span
          className="inline-block size-1.5 shrink-0 rounded-pill bg-(--managed-system-pill-mark-color)"
          aria-hidden="true"
          data-mark={mark}
        />
      )}
      {name}
    </span>
  );
}
