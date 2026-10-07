// THROWAWAY #228 — never merge.
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from 'react';
import { Checkbox as FeedbackOpsCheckbox } from '@fops/ui';
import { usePrototype } from '../../proto/context';
import { protoClass } from '../../proto/shape';

export const Checkbox = forwardRef<ComponentRef<typeof FeedbackOpsCheckbox>, ComponentPropsWithoutRef<typeof FeedbackOpsCheckbox>>(
  ({ className, ...props }, ref) => {
    const variant = usePrototype();
    return <FeedbackOpsCheckbox {...props} ref={ref} className={protoClass(variant, className)} />;
  },
);
Checkbox.displayName = FeedbackOpsCheckbox.displayName;
