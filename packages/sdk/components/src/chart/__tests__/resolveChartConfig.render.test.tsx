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
const plotted = () => (plotProps!.option as unknown as { series: { id?: string; type?: string; stack?: string }[] }).series.filter(s => s.id && !s.id.startsWith('__'));

const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const meta: Record<string, ChartFieldMeta> = {
  time: { label: '시각' },
  eqp: { label: '설비' },
  count: { label: '건수', unit: '건', reaggregation: 'sum' },
};
const rows = [
  { time: '2026-11-01T00:00:00', eqp: 'E1', count: 3 },
  { time: '2026-11-01T00:00:00', eqp: 'E2', count: 4 },
  { time: '2026-11-01T01:00:00', eqp: 'E1', count: 2 },
];

/** The stored JSON is the only input besides the rows and field meta: no data, function, hex or px in it. */
function draw(json: string) {
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
    draw('{"version":1,"kind":"line","x":{"field":"time","type":"time"},"measures":[{"field":"count","color":"chart-series-2"}]}');
    await screen.findByRole('img');
    expect(plotted().map(s => [s.id, s.type])).toEqual([['count', 'line']]);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('draws stacked bars split by a dimension without frame warnings', async () => {
    draw('{"version":1,"kind":"bar","x":{"field":"time","type":"time"},"measures":[{"field":"count"}],"split":{"field":"eqp"},"stack":"stack"}');
    await screen.findByRole('img');
    const series = plotted();
    expect(series.map(s => [s.id, s.type])).toEqual([['E1', 'bar'], ['E2', 'bar']]);
    expect(new Set(series.map(s => s.stack)).size).toBe(1);
    expect(series[0]?.stack).toBeTruthy();
    expect(console.warn).not.toHaveBeenCalled();
  });
});
