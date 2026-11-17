import { useOverlayVisible, useScopedAutofocus, withScopedOverlay } from '../TransientOverlayScope';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';
import { cn } from '../../utils/cn.js';
import { POPPER_CONTENT_MOTION } from '../../utils/motion.js';

export const Popover: React.FC<PopoverPrimitive.PopoverProps> = withScopedOverlay(PopoverPrimitive.Root);
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

type PopoverContentPadding = 'default' | 'compact' | 'none';

interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  padding?: PopoverContentPadding;
}

const POPOVER_CONTENT_PADDING_CLASSES: Record<PopoverContentPadding, string> = {
  default: 'p-4',
  compact: 'p-1',
  none: 'p-0',
};

// #2494: a modal Dialog/Sheet locks scrolling with react-remove-scroll, which Radix attaches to the overlay and to the
// dialog content's DOM only. This popover is portaled to <body>, so the lock's document listener cancels every wheel
// over it and an overflowing popover cannot scroll. While a lock is active (`data-scroll-locked` on <body>), keep wheel
// and touch moves from bubbling past the popover: the browser then scrolls the popover itself, and the locked page
// behind it still cannot scroll. Native listeners inside the popover run first and are unaffected.
const SCROLL_LOCK_ATTRIBUTE = 'data-scroll-locked';
const MODAL_SCROLL_EVENTS = ['wheel', 'touchmove'] as const;
function keepScrollInside(event: Event) {
  if (document.body.hasAttribute(SCROLL_LOCK_ATTRIBUTE)) event.stopPropagation();
}
// The returned ref uses React 19 cleanup semantics, like Radix's composed refs: a forwarded callback ref that returns a
// cleanup gets that cleanup called on detach, any other callback ref gets `null`, an object ref is cleared.
function useModalScrollPassThrough<T extends HTMLElement>(forwarded: React.ForwardedRef<T>) {
  return React.useCallback((node: T) => {
    for (const type of MODAL_SCROLL_EVENTS) node.addEventListener(type, keepScrollInside, { passive: true });
    let forwardedCleanup: unknown;
    if (typeof forwarded === 'function') forwardedCleanup = (forwarded as (instance: T | null) => unknown)(node);
    else if (forwarded) forwarded.current = node;
    return () => {
      for (const type of MODAL_SCROLL_EVENTS) node.removeEventListener(type, keepScrollInside);
      if (typeof forwarded === 'function') {
        if (typeof forwardedCleanup === 'function') forwardedCleanup();
        else forwarded(null);
      } else if (forwarded) forwarded.current = null;
    };
  }, [forwarded]);
}

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, align = 'center', sideOffset = 4, padding = 'default', ...props }, ref) => {
  const visible = useOverlayVisible();
  const onCloseAutoFocus = useScopedAutofocus(props.onCloseAutoFocus);
  const contentRef = useModalScrollPassThrough(ref);
  return visible ? (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={contentRef}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-72 rounded-md border border-border-subtle bg-surface-popover text-text-primary shadow-md outline-hidden',
        POPPER_CONTENT_MOTION,
        POPOVER_CONTENT_PADDING_CLASSES[padding],
        className,
      )}
      {...props}
      onCloseAutoFocus={onCloseAutoFocus}
    />
  </PopoverPrimitive.Portal>
) : null;
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;
