// THROWAWAY #228 — never merge.
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from 'react';
import { DropdownMenuContent as FeedbackOpsDropdownMenuContent, DropdownMenuItem as FeedbackOpsDropdownMenuItem, DropdownMenuRadioItem as FeedbackOpsDropdownMenuRadioItem, DropdownMenuLabel as FeedbackOpsDropdownMenuLabel } from '@fops/ui';
import { usePrototype } from '../../proto/context';
import { protoClass } from '../../proto/shape';

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuGroup, DropdownMenuPortal, DropdownMenuSub, DropdownMenuRadioGroup, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuShortcut } from '@fops/ui';

export const DropdownMenuContent = forwardRef<ComponentRef<typeof FeedbackOpsDropdownMenuContent>, ComponentPropsWithoutRef<typeof FeedbackOpsDropdownMenuContent>>(
  ({ className, ...props }, ref) => {
    const variant = usePrototype();
    return <FeedbackOpsDropdownMenuContent {...props} ref={ref} className={protoClass(variant, className)} />;
  },
);
DropdownMenuContent.displayName = FeedbackOpsDropdownMenuContent.displayName;

export const DropdownMenuItem = forwardRef<ComponentRef<typeof FeedbackOpsDropdownMenuItem>, ComponentPropsWithoutRef<typeof FeedbackOpsDropdownMenuItem>>(
  ({ className, ...props }, ref) => {
    const variant = usePrototype();
    return <FeedbackOpsDropdownMenuItem {...props} ref={ref} className={protoClass(variant, className)} />;
  },
);
DropdownMenuItem.displayName = FeedbackOpsDropdownMenuItem.displayName;

export const DropdownMenuRadioItem = forwardRef<ComponentRef<typeof FeedbackOpsDropdownMenuRadioItem>, ComponentPropsWithoutRef<typeof FeedbackOpsDropdownMenuRadioItem>>(
  ({ className, ...props }, ref) => {
    const variant = usePrototype();
    return <FeedbackOpsDropdownMenuRadioItem {...props} ref={ref} className={protoClass(variant, className)} />;
  },
);
DropdownMenuRadioItem.displayName = FeedbackOpsDropdownMenuRadioItem.displayName;

export const DropdownMenuLabel = forwardRef<ComponentRef<typeof FeedbackOpsDropdownMenuLabel>, ComponentPropsWithoutRef<typeof FeedbackOpsDropdownMenuLabel>>(
  ({ className, ...props }, ref) => {
    const variant = usePrototype();
    return <FeedbackOpsDropdownMenuLabel {...props} ref={ref} className={protoClass(variant, className)} />;
  },
);
DropdownMenuLabel.displayName = FeedbackOpsDropdownMenuLabel.displayName;
