// THROWAWAY #228 — never merge.
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from 'react';
import { TooltipContent as FeedbackOpsTooltipContent } from '@fops/ui';
import { usePrototype } from '../../proto/context';
import { protoClass } from '../../proto/shape';

export { TooltipProvider, Tooltip, TooltipTrigger } from '@fops/ui';

export const TooltipContent = forwardRef<ComponentRef<typeof FeedbackOpsTooltipContent>, ComponentPropsWithoutRef<typeof FeedbackOpsTooltipContent>>(
  ({ className, ...props }, ref) => {
    const variant = usePrototype();
    return <FeedbackOpsTooltipContent {...props} ref={ref} className={protoClass(variant, className)} />;
  },
);
TooltipContent.displayName = FeedbackOpsTooltipContent.displayName;
