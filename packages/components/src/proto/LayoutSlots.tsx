// THROWAWAY #156 — never merge.
import { Children, useLayoutEffect, useRef, type ReactNode } from 'react';
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
      <aside aria-label="필터" className="sticky top-[110px] hidden max-h-[calc(100dvh-126px)] self-start overflow-y-auto rounded-lg border border-border-subtle bg-surface-card @min-[960px]/management:block">
        <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-border-subtle p-3">
          <h2 className="t-card-title">필터</h2>
          {activeFilterCount != null && activeFilterCount > 0 && <span className="t-caption text-text-muted">{activeFilterCount}개 적용</span>}
        </div>
        {filter}
      </aside>
      <div className="min-w-0">
        {table(<div className="@min-[960px]/management:hidden"><Popover>
          <PopoverTrigger asChild><Button type="button" size="sm" variant="secondary">{activeFilterCount === undefined ? '필터' : `필터 · ${activeFilterCount}`}</Button></PopoverTrigger>
          <PopoverContent align="start" className="max-h-[70vh] w-[min(320px,calc(100vw-32px))] overflow-y-auto p-0 text-text-secondary">{filter}</PopoverContent>
        </Popover></div>)}
      </div>
    </div> : table(<div className="max-w-full [&_fieldset]:mb-0">{filter}</div>)}
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
  const chartGrid = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const grid = chartGrid.current;
    if (analysis !== 'B' || !grid || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const alignHeaders = () => {
      if (grid.clientWidth < 960) { grid.style.removeProperty('--proto-chart-header-height'); return; }
      const headers = Array.from(grid.querySelectorAll<HTMLElement>('section[role="region"] > header'));
      const height = Math.max(0, ...headers.map(header => {
        const style = getComputedStyle(header);
        return Array.from(header.children).reduce((sum, child) => sum + child.getBoundingClientRect().height, 0)
          + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.rowGap) * (header.children.length - 1);
      }));
      grid.style.setProperty('--proto-chart-header-height', `${Math.ceil(height)}px`);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(alignHeaders); };
    const resize = new ResizeObserver(schedule);
    const observeHeaders = () => {
      resize.disconnect();
      resize.observe(grid);
      grid.querySelectorAll('section[role="region"] > header > div').forEach(child => resize.observe(child));
      schedule();
    };
    const mutations = new MutationObserver(observeHeaders);
    mutations.observe(grid, { childList: true, subtree: true });
    observeHeaders();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect(); grid.style.removeProperty('--proto-chart-header-height'); };
  }, [analysis]);
  return <div className="@container/analysis min-w-0">
    {analysis === 'C' ? <div className="grid min-w-0 gap-4 @min-[960px]/analysis:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-4 self-start @min-[960px]/analysis:sticky @min-[960px]/analysis:top-[110px]">{kpi}</aside>
      <div className="min-w-0 space-y-4">{charts}{breakdown}</div>
    </div> : <div className="space-y-4">
      {kpi}
      <div ref={chartGrid} className="grid min-w-0 items-stretch gap-4 @min-[960px]/analysis:grid-cols-2 @min-[960px]/analysis:[&_section[role=region]>header]:min-h-[var(--proto-chart-header-height)] @min-[960px]/analysis:[&_section[role=region]>header]:flex-col @min-[960px]/analysis:[&_section[role=region]>header]:items-stretch [&_section[role=region]>footer]:mt-auto">{charts.map((item, index) => <div key={index} className="flex min-w-0 flex-col [&>div]:flex-1">{item}</div>)}</div>
      {breakdown}
    </div>}
  </div>;
}
