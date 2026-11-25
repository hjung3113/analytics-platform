import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invalidChartConfig, type ChartConfig } from '@ap/contracts';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { AnalysisChartFrame } from '../AnalysisChartFrame';
import type { EChartProps } from '../EChart';
import { resolveChartConfig, type ChartFieldMeta } from '../resolveChartConfig';
import { exportRegistry } from './test-support';

vi.mock('../EChartImpl', () => ({ default: FakePlot }));
let plotProps: EChartProps | null = null;
function FakePlot(props: EChartProps) { plotProps = props; return <div role="img" aria-label={props.ariaLabel} />; }
type Plotted = { id?: string; type?: string; stack?: string; data?: unknown[]; areaStyle?: unknown };
const plotted = () => (plotProps!.option as unknown as { series: Plotted[] }).series.filter(s => s.id && !s.id.startsWith('__'));
const ys = (s: Plotted | undefined) => (s?.data ?? []).map(d => { const v = (Array.isArray(d) ? d : (d as { value?: unknown }).value) as unknown[] | undefined; return v?.[1] ?? null; });

const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const meta: Record<string, ChartFieldMeta> = {
  time: { label: '시각' },
  eqp: { label: '설비' },
  count: { label: '건수', unit: '건', reaggregation: 'sum' },
  yield: { label: '수율', unit: 'ratio', reaggregation: 'ratioOfSums' },
};
const splitRows = [
  { time: '2026-11-01T00:00:00', eqp: 'E1', count: 3 },
  { time: '2026-11-01T00:00:00', eqp: 'E2', count: 4 },
  { time: '2026-11-01T01:00:00', eqp: 'E1', count: 2 },
];
const lineRows = [
  { time: '2026-11-01T00:00:00', count: 3 },
  { time: '2026-11-01T01:00:00', count: 2 },
];

/** The stored JSON is the only input besides the rows and field meta: no data, function, hex or px in it. */
function draw(json: string, rows: Record<string, string | number>[]) {
  window.history.replaceState(null, '', '/?v=1');
  const config: unknown = JSON.parse(json);
  expect(invalidChartConfig(config)).toBeNull();
  const resolved = resolveChartConfig(config as ChartConfig, rows, meta);
  if (resolved.status !== 'ok') throw new Error(resolved.problem.code);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={exportRegistry(false)}>
    <AnalysisChartFrame chartId="configured" title="설정 차트" {...resolved.frame} />
  </PlatformProvider></I18nProvider>);
}

beforeEach(() => { plotProps = null; vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('a stored ChartConfig draws through the Chart Frame (#2745)', () => {
  it('draws a line from one JSON config without frame warnings', async () => {
    draw('{"version":1,"kind":"line","x":{"field":"time","type":"time"},"measures":[{"field":"count","color":"chart-series-2"}],"areaFill":false}', lineRows);
    await screen.findByRole('img');
    expect(plotted().map(s => [s.id, s.type])).toEqual([['count', 'line']]);
    expect(ys(plotted()[0])).toEqual([3, 2]);
    expect(plotted()[0]?.areaStyle).toBeUndefined();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('draws stacked bars split by a dimension without frame warnings', async () => {
    draw('{"version":1,"kind":"bar","x":{"field":"time","type":"time"},"measures":[{"field":"count"}],"split":{"field":"eqp"},"stack":"stack"}', splitRows);
    await screen.findByRole('img');
    const series = plotted();
    expect(series.map(s => [s.id, s.type])).toEqual([['E1', 'bar'], ['E2', 'bar']]);
    expect(series.map(ys)).toEqual([[3, 2], [4, null]]);
    expect(new Set(series.map(s => s.stack)).size).toBe(1);
    expect(series[0]?.stack).toBeTruthy();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('draws a percent format on the percent scale the axis and tooltip label', async () => {
    draw('{"version":1,"kind":"line","x":{"field":"time","type":"time"},"measures":[{"field":"yield"}],"valueFormat":{"kind":"percent","decimals":1}}',
      [{ time: '2026-11-01T00:00:00', yield: 0.5 }, { time: '2026-11-01T01:00:00', yield: 0.25 }]);
    await screen.findByRole('img');
    expect(ys(plotted()[0])).toEqual([50, 25]);
    const axis = (plotProps!.option as unknown as { yAxis: { name?: string } | { name?: string }[] }).yAxis;
    expect(JSON.stringify(axis)).toContain('%');
    expect(console.warn).not.toHaveBeenCalled();
  });
});
