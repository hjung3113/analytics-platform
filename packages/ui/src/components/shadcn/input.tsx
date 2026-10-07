// THROWAWAY #228 — never merge.
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from 'react';
import { Input as FeedbackOpsInput } from '@fops/ui';
import { usePrototype } from '../../proto/context';
import { protoClass } from '../../proto/shape';
export type { InputProps } from '@fops/ui';

export const Input = forwardRef<ComponentRef<typeof FeedbackOpsInput>, ComponentPropsWithoutRef<typeof FeedbackOpsInput>>(
  ({ className, ...props }, ref) => {
    const variant = usePrototype();
    // Padding that reserves an overlaid icon is functional (the real fix uses FeedbackOps SearchInput); keep it.
    const inset = variant === 'A' ? '' : (className ?? '').split(/\s+/).filter(token => /^p[lr]-/.test(token)).join(' ');
    return <FeedbackOpsInput {...props} ref={ref} className={[protoClass(variant, className), inset].filter(Boolean).join(' ')} />;
  },
);
Input.displayName = FeedbackOpsInput.displayName;
