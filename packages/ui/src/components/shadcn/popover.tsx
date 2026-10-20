import { useOverlayVisible, useScopedAutofocus, useScopedOverlay } from '../TransientOverlayScope';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';
import { cn } from '../../utils/cn.js';
import { POPPER_CONTENT_MOTION } from '../../utils/motion.js';

export const Popover: React.FC<PopoverPrimitive.PopoverProps> = (props) => {
  const scoped = useScopedOverlay(props);
  return <PopoverPrimitive.Root {...props} {...scoped} />;
};
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

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(({ className, align = 'center', sideOffset = 4, padding = 'default', ...props }, ref) => {
  const visible = useOverlayVisible();
  const onCloseAutoFocus = useScopedAutofocus(props.onCloseAutoFocus);
  return visible ? (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
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
