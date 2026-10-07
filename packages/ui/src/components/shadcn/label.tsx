// THROWAWAY #228 — never merge.
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from 'react';
import { Label as FeedbackOpsLabel } from '@fops/ui';
import { usePrototype } from '../../proto/context';
import { protoClass } from '../../proto/shape';

export const Label = forwardRef<ComponentRef<typeof FeedbackOpsLabel>, ComponentPropsWithoutRef<typeof FeedbackOpsLabel>>(
  ({ className, ...props }, ref) => {
    const variant = usePrototype();
    // The real fix moves the checkbox/text gap to a plain wrapper, which renders the same; keep it so B/C read fairly.
    const gap = variant === 'A' ? '' : (className ?? '').split(/\s+/).filter(token => token.startsWith('gap-')).join(' ');
    return <FeedbackOpsLabel {...props} ref={ref} className={[protoClass(variant, className), gap].filter(Boolean).join(' ')} />;
  },
);
Label.displayName = FeedbackOpsLabel.displayName;
