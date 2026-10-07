// THROWAWAY #228 — never merge.
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from 'react';
import { SelectTrigger as FeedbackOpsSelectTrigger, SelectContent as FeedbackOpsSelectContent } from '@fops/ui';
import { usePrototype } from '../../proto/context';
import { protoClass } from '../../proto/shape';

export { Select, SelectGroup, SelectValue, SelectScrollUpButton, SelectScrollDownButton, SelectLabel, SelectItem, SelectSeparator } from '@fops/ui';

export const SelectTrigger = forwardRef<ComponentRef<typeof FeedbackOpsSelectTrigger>, ComponentPropsWithoutRef<typeof FeedbackOpsSelectTrigger>>(
  ({ className, ...props }, ref) => {
    const variant = usePrototype();
    return <FeedbackOpsSelectTrigger {...props} ref={ref} className={protoClass(variant, className)} />;
  },
);
SelectTrigger.displayName = FeedbackOpsSelectTrigger.displayName;

export const SelectContent = forwardRef<ComponentRef<typeof FeedbackOpsSelectContent>, ComponentPropsWithoutRef<typeof FeedbackOpsSelectContent>>(
  ({ className, ...props }, ref) => {
    const variant = usePrototype();
    return <FeedbackOpsSelectContent {...props} ref={ref} className={protoClass(variant, className)} />;
  },
);
SelectContent.displayName = FeedbackOpsSelectContent.displayName;
