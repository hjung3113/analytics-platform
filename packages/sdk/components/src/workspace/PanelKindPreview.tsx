import { ChartBar, ChartLine, ChartNoAxesColumn, ChartPie, ChartScatter, Grid3X3, History, PanelsTopLeft, Table2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PanelAddItem } from './PanelAdd';

type Kind = NonNullable<PanelAddItem['kind']>;
const icons: Record<Kind, typeof ChartBar> = {
  bar: ChartBar, line: ChartLine, histogram: ChartNoAxesColumn, scatter: ChartScatter, donut: ChartPie,
  heatmap: Grid3X3, history: History, pareto: ChartNoAxesColumn, table: Table2,
};

export function PanelKindIcon({ kind }: { kind?: Kind }) {
  const Icon = kind ? icons[kind] : PanelsTopLeft;
  return <Icon className="size-4 shrink-0" aria-hidden />;
}

const marks: Record<Kind, ReactNode> = {
  line: <path d="M5 17 12 12 20 15 28 6 36 8" fill="none" stroke="rgb(var(--chart-series-1-stroke))" strokeWidth="1.5" />,
  bar: <path d="M5 4h18v4H5zm0 6h28v4H5zm0 6h12v4H5z" className="fill-chart-series-1" />,
  heatmap: <><path d="M4 4h9v7H4zm10 8h10v7H14zm11-8h9v7h-9z" fill="rgb(var(--chart-heat-seq-1))" />
    <path d="M14 4h10v7H14zm11 8h9v7h-9z" fill="rgb(var(--chart-heat-seq-3))" /><path d="M4 12h9v7H4z" fill="rgb(var(--chart-heat-seq-2))" /></>,
  histogram: <path d="M6 17h5v3H6zm6-6h5v9h-5zm6-6h5v15h-5zm6 4h5v11h-5zm6 6h5v5h-5z" className="fill-chart-series-1" />,
  scatter: <g className="fill-chart-series-1">{[[8, 16], [14, 13], [19, 15], [25, 9], [30, 11], [35, 6]].map(([x, y]) =>
    <circle key={x} cx={x} cy={y} r="1.4" />)}</g>,
  table: <><path d="M4 4h32v5H4z" className="fill-chart-grid" /><path d="M4 4h32v16H4zM4 9h32M4 14h32M18 4v16M27 4v16" fill="none" className="stroke-border-control" strokeWidth=".6" /></>,
  donut: <g fill="none" strokeWidth="4"><circle cx="20" cy="12" r="7" className="stroke-chart-series-1" />
    <circle cx="20" cy="12" r="7" className="stroke-chart-series-2" strokeDasharray="14 44" transform="rotate(-90 20 12)" />
    <circle cx="20" cy="12" r="7" className="stroke-chart-series-3" strokeDasharray="8 44" transform="rotate(25 20 12)" /></g>,
  pareto: <><path d="M6 6h6v14H6zm8 4h6v10h-6zm8 4h6v6h-6zm8 3h6v3h-6z" className="fill-chart-series-1" />
    <path d="m9 14 8-5 8-3 8-2" fill="none" stroke="rgb(var(--chart-series-2-stroke))" /></>,
  history: <><path d="M8 5v14m5-14h15m-15 7h20m-20 7h11" className="stroke-border-control" />
    <g className="fill-chart-series-1">{[5, 12, 19].map(y => <circle key={y} cx="8" cy={y} r="2" />)}</g></>,
};

const withAxes: readonly Kind[] = ['line', 'bar', 'histogram', 'scatter', 'pareto'];
export function PanelKindPreview({ kind }: { kind?: Kind }) {
  if (!kind) return null;
  return <svg aria-hidden viewBox="0 0 40 24" className="w-full">
    {withAxes.includes(kind) && <><path d="M4 4h33M4 12h33" className="stroke-chart-grid" strokeWidth=".6" />
      <path d="M4 3v17h33" fill="none" className="stroke-border-control" strokeWidth=".6" /></>}
    {marks[kind]}
  </svg>;
}
