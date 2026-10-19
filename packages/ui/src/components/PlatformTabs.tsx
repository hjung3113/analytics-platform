// ADR-0023 개정(#340): 목록·트리거만 플랫폼 선택 표식을 정의한다.
// 역할·선택·키보드 동작은 같은 패키지의 shadcn 탭(원래 FeedbackOps 원본)을 그대로 사용한다.
import * as React from 'react';
import { cn } from '../utils/cn.js';
import { TabsList as BaseTabsList, TabsTrigger as BaseTabsTrigger } from './shadcn/tabs.js';

export const TabsList = React.forwardRef<
  React.ElementRef<typeof BaseTabsList>,
  React.ComponentPropsWithoutRef<typeof BaseTabsList>
>(({ className, ...props }, ref) => (
  <BaseTabsList
    ref={ref}
    className={cn(
      'flex h-auto w-full items-end justify-start overflow-x-auto rounded-none bg-transparent p-0 text-text-secondary',
      // eslint-disable-next-line shadcn/no-arbitrary-values -- 기준선을 inset shadow로 그려 선택 막대가 덮고 스크롤 목록에 1px 세로 넘침이 없게, #340
      'shadow-[inset_0_-1px_0_var(--color-border-subtle)]',
      // 고대비(forced-colors)에서 inset shadow가 지워지므로 1px 전경색 아래 테두리로 기준선을 남긴다. #340
      'forced-colors:border-b forced-colors:border-current',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = BaseTabsList.displayName;

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof BaseTabsTrigger>,
  React.ComponentPropsWithoutRef<typeof BaseTabsTrigger>
>(({ className, children, ...props }, ref) => (
  <BaseTabsTrigger
    ref={ref}
    className={cn(
      'relative shrink-0 rounded-none text-text-secondary hover:text-text-primary focus-visible:ring-inset focus-visible:ring-offset-0 focus-visible:-outline-offset-2 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-text-primary data-[state=active]:shadow-none',
      // 선택 막대는 트리거 자신의 ::after로 그린다. 자식 형제 요소를 두면 Radix asChild 슬롯이
      // 단일 요소 자식을 요구해 렌더가 깨진다(#340 F1). 고대비에서는 막대를 전경색 테두리로 남긴다.
      'after:absolute after:inset-x-3 after:bottom-0 after:hidden after:h-0.5 after:rounded-pill after:bg-accent-primary data-[state=active]:after:block forced-colors:after:bg-transparent forced-colors:after:border-b-2 forced-colors:after:border-current',
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
  </BaseTabsTrigger>
));
TabsTrigger.displayName = BaseTabsTrigger.displayName;
