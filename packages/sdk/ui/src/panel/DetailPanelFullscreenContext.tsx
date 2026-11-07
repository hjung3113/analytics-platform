import { Slot } from '@radix-ui/react-slot';
import { Maximize2, Minimize2 } from 'lucide-react';
import { createContext, useContext } from 'react';
import type * as React from 'react';
import { Button } from '../components/Button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/shadcn/tooltip';
import { cn } from '../utils/cn.js';

export interface DetailPanelFullscreenValue {
  expanded: boolean;
  toggle: () => void;
}

export const DetailPanelFullscreenContext = createContext<DetailPanelFullscreenValue | null>(null);

export function DetailPanelReadingColumn({
  children,
  asChild = false,
  ...dataAttrs
}: React.PropsWithChildren<{ 'data-testid'?: string; asChild?: boolean }>): React.ReactElement {
  const fullscreen = useContext(DetailPanelFullscreenContext);
  const expanded = fullscreen?.expanded === true;

  const readingClass = expanded ? cn('mx-auto', !asChild && 'h-full', 'w-full max-w-[48rem]') : undefined;
  // The footer can keep its original DOM and flex sizing while sharing the reading width.
  if (asChild) return <Slot {...dataAttrs} className={readingClass}>{children}</Slot>;
  return (
    // Expanded drawers render as a centred reading column. The wrapper is always
    // present (`contents` when collapsed, or when there is no fullscreen context,
    // so layout is unchanged): a conditional wrapper would remount the panel on
    // toggle and drop unsaved input.
    <div
      {...dataAttrs}
      data-detail-reading-column=""
      className={cn(
        expanded ? readingClass : 'contents',
      )}
    >
      {children}
    </div>
  );
}

/** Labels are supplied by the host's i18n; defaults keep existing Korean-only feature consumers compatible. */
export function DetailPanelFullscreenToggle({ expandLabel = '크게 보기', collapseLabel = '원래 크기로' }: { expandLabel?: string; collapseLabel?: string } = {}): React.ReactElement | null {
  const fullscreen = useContext(DetailPanelFullscreenContext);
  if (fullscreen === null) return null;
  const label = fullscreen.expanded ? collapseLabel : expandLabel;
  return <TooltipProvider><Tooltip><TooltipTrigger asChild>
    <Button type="button" variant="ghost" size="icon-sm" data-detail-expand-toggle aria-label={label} aria-pressed={fullscreen.expanded} onFocus={event => { if (event.currentTarget.hasAttribute('data-collapse-focus')) event.preventDefault(); }} onClick={fullscreen.toggle}>
      {fullscreen.expanded ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
    </Button>
  </TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip></TooltipProvider>;
}

// An Escape belongs to the popup that was open when it started, even if that popup unmounts during document capture.
const popupEscapes = new WeakSet<Event>();
export function rememberPopupEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  const popup = Array.from(document.querySelectorAll<HTMLElement>('[role="alertdialog"], [role="dialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]'))
    .some(node => !node.closest('[hidden], [inert], [aria-hidden="true"]'));
  if (popup) popupEscapes.add(event);
}
export function popupOwnsEscape(event: Event) { return popupEscapes.has(event); }

/** Escape restores focus without opening a tooltip that would consume the next Escape before the close path. */
export function focusDetailPanelToggle(root: HTMLElement | null) {
  const toggle = root?.querySelector<HTMLElement>('[data-detail-expand-toggle]');
  if (!toggle) return;
  toggle.setAttribute('data-collapse-focus', '');
  toggle.focus({ preventScroll: true });
  toggle.removeAttribute('data-collapse-focus');
}

/** Shared Escape order for a panel: popup, collapse, then the existing close/guard path. */
export function useDetailPanelEscape(onClose: () => void) {
  const fullscreen = useContext(DetailPanelFullscreenContext);
  return (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || event.defaultPrevented || popupOwnsEscape(event.nativeEvent) || !event.currentTarget.contains(event.target as Node)) return;
    event.preventDefault(); event.stopPropagation();
    if (fullscreen?.expanded) {
      fullscreen.toggle();
      focusDetailPanelToggle(event.currentTarget);
    } else onClose();
  };
}
