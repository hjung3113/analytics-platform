// THROWAWAY #207: periods as groups (B), quantiles as rows (C).
import type { ChartSeries } from '../AnalysisChartFrame';
import { token, strokeToken } from '../EChart';
import type { ProtoVariant } from '@ap/ui';
export function protoLine(s: ChartSeries, previous: boolean, variant: ProtoVariant): 'solid' | 'dashed' | 'dotted' | number[] {
  if (variant === 'B' && previous) return s.dashed ? [8, 3, 2, 3] : 'dotted';
  return s.dashed ? 'dashed' : 'solid';
}
export function protoStroke(s: ChartSeries, previous: boolean, variant: ProtoVariant) {
  if ((s.kind ?? 'line') === 'bar' && s.color === 'chart-remainder') return token('border-control');
  return token(variant !== 'A' && previous && s.color === 'cat-amber' ? 'proto-amber-stroke' : strokeToken(s.color));
}
export function PrototypeChartLegend({ series, previousIds, hidden, toggle, variant, currentLabel, previousLabel }: { series: ChartSeries[]; previousIds: Set<string>; hidden: Set<string>; toggle: (id: string) => void; variant: ProtoVariant; currentLabel: string; previousLabel: string }) {
  const item = (s: ChartSeries) => {
    const previous = previousIds.has(s.id);
    const color = protoStroke(s, previous, variant);
    const pattern = protoLine(s, previous, variant);
    const dash = Array.isArray(pattern) ? pattern.join(' ') : pattern === 'dashed' ? '8 4' : pattern === 'dotted' ? '2 4' : undefined;
    return <label key={s.id} className="inline-flex cursor-pointer items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={!hidden.has(s.id)} onChange={() => toggle(s.id)} className="size-3.5 accent-[rgb(var(--accent-primary))]" />
      {(s.kind ?? 'line') === 'bar' ? <span aria-hidden className="inline-block size-3 border-2" style={{ background: token(s.color), borderColor: color }} /> : <svg aria-hidden width="32" height="14"><line x1="0" y1="7" x2="32" y2="7" stroke={color} strokeWidth="2" strokeDasharray={dash} />{variant === 'C' && previous && (s.dashed ? <path d="M16 2 L21 11 L11 11 Z" fill={color} /> : <circle cx="16" cy="7" r="3" fill={color} />)}</svg>}{s.name}</label>;
  };
  if (previousIds.size === 0) return <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{series.map(item)}</div>;
  return variant === 'B' ? <div className="grid gap-2">{[false, true].map(prev => {
    const group = series.filter(s => previousIds.has(s.id) === prev);
    return group.length > 0 && <div key={String(prev)} className="flex flex-wrap items-center gap-x-4 gap-y-2"><strong className="min-w-20 text-xs text-text-secondary">{prev ? previousLabel : currentLabel}</strong>{group.map(item)}</div>;
  })}</div> : <table className="text-left text-xs text-text-secondary">
    <thead><tr><th scope="col" className="px-2 py-1">{currentLabel}</th>{previousIds.size > 0 && <th scope="col" className="px-2 py-1">{previousLabel}</th>}</tr></thead>
    <tbody>{series.filter(s => !previousIds.has(s.id)).map((s, i) => <tr key={s.id} className="border-t border-border-subtle"><td className="px-2 py-1">{item(s)}</td>{previousIds.size > 0 && <td className="px-2 py-1">{series.filter(p => previousIds.has(p.id))[i] && item(series.filter(p => previousIds.has(p.id))[i])}</td>}</tr>)}</tbody>
  </table>;
}
