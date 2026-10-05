// THROWAWAY #156 — never merge.
import { Children, type ReactNode } from 'react';
import { Button, Popover, PopoverContent, PopoverTrigger, usePrototype } from '@ap/ui';

export function ManagementLayout({ filter, activeFilterCount, table, drawer }: {
  filter?: ReactNode;
  activeFilterCount?: number;
  table: (filterInTable: ReactNode | undefined) => ReactNode;
  drawer?: ReactNode;
}) {
  const { management } = usePrototype();
  return <div className="@container/management min-w-0">
    {management === 'C' ? <div className="grid min-w-0 gap-4 @min-[960px]/management:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="sticky top-[110px] hidden self-start @min-[960px]/management:block">{filter}</aside>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="@min-[960px]/management:hidden"><Popover>
          <PopoverTrigger asChild><Button type="button" size="sm" variant="secondary">{activeFilterCount === undefined ? '필터' : `필터 · ${activeFilterCount}`}</Button></PopoverTrigger>
          <PopoverContent align="start" className="max-h-[70vh] w-[min(320px,calc(100vw-32px))] overflow-y-auto text-text-secondary">{filter}</PopoverContent>
        </Popover></div>
        {table(undefined)}
      </div>
    </div> : table(filter)}
    {drawer}
  </div>;
}

export function AnalysisLayout({ kpi, chart, breakdown }: {
  kpi: ReactNode;
  chart: ReactNode | ReactNode[];
  breakdown: ReactNode;
}) {
  const { analysis } = usePrototype();
  const charts = Children.toArray(chart);
  return <div className="@container/analysis min-w-0">
    {analysis === 'C' ? <div className="grid min-w-0 gap-4 @min-[960px]/analysis:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-4 self-start @min-[960px]/analysis:sticky @min-[960px]/analysis:top-[110px]">{kpi}</aside>
      <div className="min-w-0 space-y-4">{charts}{breakdown}</div>
    </div> : <div className="space-y-4">
      {kpi}
      <div className="grid min-w-0 gap-4 @min-[960px]/analysis:grid-cols-2">{charts.map((item, index) => <div key={index} className="min-w-0">{item}</div>)}</div>
      {breakdown}
    </div>}
  </div>;
}
