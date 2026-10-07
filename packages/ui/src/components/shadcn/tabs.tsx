// THROWAWAY #228 — never merge.
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from 'react';
import { TabsList as FeedbackOpsTabsList, TabsTrigger as FeedbackOpsTabsTrigger, TabsContent as FeedbackOpsTabsContent } from '@fops/ui';
import { usePrototype } from '../../proto/context';
import { protoClass } from '../../proto/shape';

export { Tabs } from '@fops/ui';

export const TabsList = forwardRef<ComponentRef<typeof FeedbackOpsTabsList>, ComponentPropsWithoutRef<typeof FeedbackOpsTabsList>>(
  ({ className, ...props }, ref) => {
    const variant = usePrototype();
    return <FeedbackOpsTabsList {...props} ref={ref} className={protoClass(variant, className)} />;
  },
);
TabsList.displayName = FeedbackOpsTabsList.displayName;

export const TabsTrigger = forwardRef<ComponentRef<typeof FeedbackOpsTabsTrigger>, ComponentPropsWithoutRef<typeof FeedbackOpsTabsTrigger>>(
  ({ className, ...props }, ref) => {
    const variant = usePrototype();
    return <FeedbackOpsTabsTrigger {...props} ref={ref} className={protoClass(variant, className)} />;
  },
);
TabsTrigger.displayName = FeedbackOpsTabsTrigger.displayName;

export const TabsContent = forwardRef<ComponentRef<typeof FeedbackOpsTabsContent>, ComponentPropsWithoutRef<typeof FeedbackOpsTabsContent>>(
  ({ className, ...props }, ref) => {
    const variant = usePrototype();
    return <FeedbackOpsTabsContent {...props} ref={ref} className={protoClass(variant, className, { spacing: true })} />;
  },
);
TabsContent.displayName = FeedbackOpsTabsContent.displayName;
