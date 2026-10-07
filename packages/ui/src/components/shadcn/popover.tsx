// THROWAWAY #228 — never merge.
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from 'react';
import { PopoverContent as FeedbackOpsPopoverContent } from '@fops/ui';
import { usePrototype } from '../../proto/context';
import { protoClass } from '../../proto/shape';

export { Popover, PopoverTrigger, PopoverAnchor } from '@fops/ui';

export const PopoverContent = forwardRef<ComponentRef<typeof FeedbackOpsPopoverContent>, ComponentPropsWithoutRef<typeof FeedbackOpsPopoverContent>>(
  ({ className, ...props }, ref) => {
    const variant = usePrototype();
    return <FeedbackOpsPopoverContent {...props} ref={ref} className={protoClass(variant, className)} />;
  },
);
PopoverContent.displayName = FeedbackOpsPopoverContent.displayName;
