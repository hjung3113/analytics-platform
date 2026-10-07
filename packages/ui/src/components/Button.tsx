// THROWAWAY #228 — never merge.
import { forwardRef } from 'react';
import { Button as FeedbackOpsButton, type ButtonProps } from '@fops/ui';
import { usePrototype } from '../proto/context';
import { protoClass } from '../proto/shape';

export { buttonVariants, type ButtonProps } from '@fops/ui';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size, variant, ...props }, ref) => {
    const prototype = usePrototype();
    let nextSize = size;
    let nextVariant = variant;
    let nextClassName = protoClass(prototype, className);
    if (prototype !== 'A') {
      const tokens = new Set(className?.split(/\s+/));
      if (tokens.has('p-0')) {
        if (tokens.has('size-7') || (tokens.has('h-7') && tokens.has('w-7'))) nextSize = 'icon-xs';
        else if (tokens.has('size-8') || (tokens.has('h-8') && tokens.has('w-8'))) nextSize = 'icon-sm';
      }
      if (tokens.has('bg-accent-primary-soft')) nextVariant = 'secondary';
      if (prototype === 'C') {
        nextClassName = nextClassName?.split(/\s+/).filter((token) => {
          const body = token.slice(token.lastIndexOf(':') + 1);
          return !body.startsWith('h-') && !body.startsWith('size-');
        }).join(' ');
        if (nextSize !== 'icon-xs' && nextSize !== 'icon-sm' && tokens.has('px-2')) nextSize = 'toolbar';
      }
    }
    return <FeedbackOpsButton {...props} ref={ref} className={nextClassName} size={nextSize} variant={nextVariant} />;
  },
);
Button.displayName = FeedbackOpsButton.displayName;
