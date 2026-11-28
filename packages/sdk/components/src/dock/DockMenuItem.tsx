import { useContext, useLayoutEffect, type ReactNode, type RefObject } from 'react';
import { Button, DropdownMenuItem, DropdownMenuSeparator } from '@ap/ui';
import { DockChartCloseMore, type DockChartLayoutActions } from './DockChartHead';

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

/** Registers layout actions in the merged chart menu until the owning header unmounts. */
export function MergedLayoutActions({ register, takeCloseFocus, claimFocus, wrapGroup = false, children }: {
  register: (actions: DockChartLayoutActions | undefined) => void;
  takeCloseFocus: DockChartLayoutActions['takeCloseFocus'];
  claimFocus: NonNullable<DockChartLayoutActions['claimFocus']>;
  wrapGroup?: boolean;
  children: ReactNode;
}) {
  useLayoutEffect(() => () => { register(undefined); }, [register]);
  useLayoutEffect(() => {
    const content = wrapGroup ? <div role="group" className="w-full border-t border-border-subtle pt-2">{children}</div> : children;
    register({ content, takeCloseFocus, claimFocus });
  }, [register, children, takeCloseFocus, claimFocus, wrapGroup]);
  return null;
}

/** Records whether the departing trigger or menu held focus so its replacement can take it (#3095). */
export function FocusOnUnmount({ trigger, menu, held }: { trigger: RefObject<HTMLElement | null>; menu: RefObject<HTMLElement | null>; held: RefObject<boolean> }) {
  useLayoutEffect(() => () => {
    const active = document.activeElement;
    held.current = !!active && (!!trigger.current?.contains(active) || !!menu.current?.contains(active));
  }, [trigger, menu, held]);
  return null;
}
