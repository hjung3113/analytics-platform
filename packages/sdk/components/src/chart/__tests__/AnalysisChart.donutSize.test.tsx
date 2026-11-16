// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { installResizeObserver } from '../../dock/__tests__/harness';
import { AnalysisChart } from '../AnalysisChart';
import type { EChartProps } from '../EChart';
import * as echarts from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
echarts.use([PieChart, TooltipComponent, SVGRenderer]);
let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" />; } }));
const observer = installResizeObserver();
afterEach(() => { cleanup(); observer.restore(); vi.restoreAllMocks(); });
it('fits a short wide donut and scrolls below the readable centre-label minimum', async () => {
  observer.resize(1000, 140);
  render(<I18nProvider><AnalysisChart chartId="d" title="Share" unit="ea" size="fill" chrome="standard"
    spec={{ kind: 'donut', centerLabel: 'Total', slices: [{ id: 'a', label: 'A', value: 8 }] }} /></I18nProvider>);
  await screen.findByRole('img');
  await waitFor(() => expect(plot.height).toBe(140));
  expect((plot.option as { series: { radius: string[] }[] }).series[0].radius).toEqual(['55%', '80%']);
  // SVG geometry is real; jsdom only needs a text-measurement context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: () => ({ width: 10 }) } as never);
  const engine = echarts.init(null, undefined, { renderer: 'svg', ssr: true, width: 1000, height: plot.height });
  try {
    engine.setOption({ ...plot.option, animation: false });
    const layout = (engine as unknown as { getModel: () => { getSeriesByIndex: (index: number) => { getData: () => { getItemLayout: (index: number) => { cx: number; cy: number; r: number } } } } }).getModel().getSeriesByIndex(0).getData().getItemLayout(0);
    expect(layout).toMatchObject({ cx: 500, cy: 70, r: 56 });
  } finally { engine.dispose(); }
  observer.resize(1000, 60);
  await waitFor(() => expect(plot.height).toBe(112));
  expect(screen.getAllByRole('region')[0]).toHaveClass('overflow-y-auto');
  expect(screen.getByText('Total')).toBeTruthy();
});
