// ADR-0023 개정(#340): 목록·트리거만 플랫폼 선택 표식을 정의한다.
// 역할·선택·키보드 동작은 FeedbackOps 탭을 그대로 사용한다.
import * as React from 'react';
import { TabsList as FeedbackOpsTabsList, TabsTrigger as FeedbackOpsTabsTrigger, cn } from '@fops/ui';

export { Tabs, TabsContent } from '@fops/ui';

export const TabsList = React.forwardRef<
  React.ElementRef<typeof FeedbackOpsTabsList>,
  React.ComponentPropsWithoutRef<typeof FeedbackOpsTabsList>
>(({ className, ...props }, ref) => (
  <FeedbackOpsTabsList
    ref={ref}
    className={cn(
      'flex h-auto w-full items-end justify-start overflow-x-auto rounded-none bg-transparent p-0 text-text-secondary',
      // eslint-disable-next-line shadcn/no-arbitrary-values -- 기준선을 inset shadow로 그려 선택 막대가 덮고 스크롤 목록에 1px 세로 넘침이 없게, #340
      'shadow-[inset_0_-1px_0_var(--color-border-subtle)]',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = FeedbackOpsTabsList.displayName;

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof FeedbackOpsTabsTrigger>,
  React.ComponentPropsWithoutRef<typeof FeedbackOpsTabsTrigger>
>(({ className, children, ...props }, ref) => (
  <FeedbackOpsTabsTrigger
    ref={ref}
    className={cn(
      'group relative shrink-0 rounded-none text-text-secondary hover:text-text-primary focus-visible:ring-inset focus-visible:ring-offset-0 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-text-primary data-[state=active]:shadow-none',
      className,
    )}
    {...props}
  >
    {typeof children === 'string' || typeof children === 'number' ? (
      <span className="grid">
        <span aria-hidden className="invisible col-start-1 row-start-1 font-semibold whitespace-nowrap">{children}</span>
        <span className="col-start-1 row-start-1">{children}</span>
      </span>
    ) : children}
    <span data-current-marker aria-hidden className="absolute inset-x-3 bottom-0 hidden h-0.5 rounded-pill bg-accent-primary forced-colors:bg-transparent forced-colors:border-b-2 forced-colors:border-current group-data-[state=active]:block" />
  </FeedbackOpsTabsTrigger>
));
TabsTrigger.displayName = FeedbackOpsTabsTrigger.displayName;
