import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../../utils/cn.js';
import { POPPER_CONTENT_MOTION } from '../../utils/motion.js';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

interface TooltipContentProps
  extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {
  size?: 'default' | 'sm';
  /** Render in a portal on `document.body` so an `overflow-hidden` ancestor (a narrow panel) cannot clip it. Off by default: existing tooltips keep their place in the DOM. */
  portal?: boolean;
}

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(({ className, size = 'default', sideOffset = 4, portal = false, collisionPadding = 8, ...props }, ref) => {
  const content = (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    collisionPadding={collisionPadding}
    className={cn(
      'z-50 overflow-hidden rounded-md border border-border-subtle bg-surface-popover px-3 py-1.5 text-sm text-text-primary shadow-md',
      POPPER_CONTENT_MOTION,
      size === 'sm' && 'text-xs',
      className,
    )}
    {...props}
  />
  );
  return portal ? <TooltipPrimitive.Portal>{content}</TooltipPrimitive.Portal> : content;
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;
