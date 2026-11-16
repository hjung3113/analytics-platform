// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { AnalysisChart, type HeatmapSpec } from '../AnalysisChart';
import type { EChartProps } from '../EChart';
let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" />; } }));
afterEach(cleanup);
it('keeps all 24 row labels readable in a scrolling heatmap with border-only status', async () => {
  const spec: HeatmapSpec = { kind: 'heatmap', minRowHeight: 24, statusDisplay: 'border', xLabels: ['M'],
    yLabels: Array.from({ length: 24 }, (_, i) => `E${i}`),
    cells: [{ x: 'M', y: 'E0', value: 2, status: { tone: 'danger', label: 'Over' } }] };
  render(<I18nProvider><AnalysisChart chartId="h" title="Heat" unit="s" size="fill" chrome="standard" height={140} spec={spec} /></I18nProvider>);
  const img = await screen.findByRole('img');
  expect(plot.height).toBeGreaterThanOrEqual(24 * 24 + 64);
  const scroll = screen.getAllByRole('region', { name: 'Heat' }).find(region => region.tabIndex === 0);
  expect(scroll).toBe(img.parentElement);
  expect(scroll).toHaveClass('overflow-y-auto');
  const option = plot.option as { yAxis: { axisLabel: { interval: number; hideOverlap: boolean } }; series: { data: { label?: unknown }[] }[] };
  expect(option.yAxis.axisLabel).toMatchObject({ interval: 0, hideOverlap: false });
  expect(option.series[0].data[0].label).toBeUndefined();
  expect(option.series.length).toBeGreaterThan(1);
  expect(screen.getByText('Over')).toBeTruthy();
});

it('leaves the plot without a scroll region when minRowHeight is omitted', async () => {
  render(<I18nProvider><AnalysisChart chartId="plain" title="Plain heat" unit="s" spec={{ kind: 'heatmap', xLabels: ['M'], yLabels: ['E'], cells: [{ x: 'M', y: 'E', value: 2 }] }} /></I18nProvider>);
  const img = await screen.findByRole('img');
  expect(img.parentElement).not.toHaveAttribute('role');
  expect(img.parentElement).not.toHaveAttribute('aria-labelledby');
  expect(img.parentElement).not.toHaveAttribute('tabindex');
});
