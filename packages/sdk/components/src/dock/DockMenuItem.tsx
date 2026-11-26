import { useContext, type ReactNode } from 'react';
import { Button, DropdownMenuItem, DropdownMenuSeparator } from '@ap/ui';
import { DockChartCloseMore } from './DockChartHead';

/** True while the content renders inside a merged chart head's `⋯` (a popover of buttons) rather than a dropdown menu. */
export function useDockMenuInline() {
  return useContext(DockChartCloseMore) !== undefined;
}

/**
 * One item of a group `⋯` menu that may be merged into a Chart Frame's `⋯` (`DockLayout` `mergeChartHead`): a `DropdownMenuItem` in a dropdown,
 * a full-width button that closes the merged `⋯` after `onSelect` otherwise. `disabled` keeps the dropdown's native disabled item; in the merged
 * `⋯` it is `aria-disabled` and does nothing, so its described reason stays reachable.
 */
export function DockMenuItem({ onSelect, children, disabled, pressed, 'aria-label': label, 'aria-disabled': ariaDisabled, 'aria-describedby': describedBy }: {
  onSelect?: () => void;
  children: ReactNode;
  disabled?: boolean;
  /** Merged `⋯` only: the pressed state of a choice the dropdown draws as a radio item. */
  pressed?: boolean;
  'aria-label'?: string;
  'aria-disabled'?: boolean;
  'aria-describedby'?: string | undefined;
}) {
  const closeMore = useContext(DockChartCloseMore);
  const off = disabled || ariaDisabled;
  if (!closeMore) return <DropdownMenuItem disabled={disabled} aria-label={label} aria-disabled={off || undefined} aria-describedby={describedBy} onSelect={event => {
    if (off) event.preventDefault();
    else onSelect?.();
  }}>{children}</DropdownMenuItem>;
  return <Button type="button" variant="ghost" size="toolbar" className="h-auto min-h-8 w-full justify-start whitespace-normal text-start"
    aria-label={label} aria-disabled={off || undefined} aria-describedby={describedBy} aria-pressed={pressed} onClick={() => {
      if (off) return;
      onSelect?.();
      closeMore();
    }}>{children}</Button>;
}

/** The separator between item groups, in the dropdown or the merged `⋯`. */
export function DockMenuSeparator() {
  return useDockMenuInline() ? <div aria-hidden className="my-1 w-full border-t border-border-subtle" /> : <DropdownMenuSeparator />;
}
