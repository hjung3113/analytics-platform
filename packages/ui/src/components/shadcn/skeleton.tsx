// THROWAWAY #228 — never merge.
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { Skeleton as FeedbackOpsSkeleton } from '@fops/ui';
import { usePrototype } from '../../proto/context';
import { protoClass } from '../../proto/shape';

export const Skeleton = forwardRef<HTMLDivElement, ComponentPropsWithoutRef<typeof FeedbackOpsSkeleton>>(
  ({ className, ...props }, ref) => {
    const variant = usePrototype();
    return <FeedbackOpsSkeleton {...props} {...{ ref }} className={protoClass(variant, className)} />;
  },
);
Skeleton.displayName = FeedbackOpsSkeleton.displayName;
