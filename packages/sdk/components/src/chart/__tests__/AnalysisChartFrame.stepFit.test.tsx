import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartSeries } from '../AnalysisChartFrame';
import type { EChartProps } from '../EChart';

vi.mock('../EChartImpl', () => ({ default: FakePlot }));
let plot: EChartProps;
function FakePlot(props: EChartProps) { plot = props; return <div role="img" aria-label={props.ariaLabel} />; }
const series: ChartSeries[] = [{ id: 'pressure', name: 'Pressure', color: 'chart-series-1', points: [['2026-11-01T00:00:00', 120], ['2026-11-02T00:00:00', null], ['2026-11-03T00:00:00', 135]] }];
const frame = (props: Partial<AnalysisChartFrameProps> = {}) => <I18nProvider><AnalysisChartFrame chartId="step-fit" title="Pressure" unit="" series={series} {...props} /></I18nProvider>;
const option = () => plot.option as unknown as { yAxis: { min?: number; scale?: boolean }; series: { id: string; step?: string; connectNulls: boolean; data: unknown[] }[] };
afterEach(cleanup);

describe('opt-in line step and Y fit', () => {
  it.each(['end', 'start', 'middle'] as const)('passes step=%s to the real line without connecting missing spans', async step => {
    render(frame({ series: [{ ...series[0], step }] }));
    await screen.findByRole('img');
    expect(option().series.find(s => s.id === 'pressure')).toMatchObject({ step, connectNulls: false });
    expect(option().series.find(s => s.id === 'pressure')!.data[1]).toEqual([Date.parse('2026-11-02T00:00:00Z'), null]);
  });
  it('keeps the zero baseline and ordinary line when omitted; updates Y fit on the same frame', async () => {
    const view = render(frame());
    await screen.findByRole('img');
    expect(option().yAxis.min).toBe(0);
    expect(option().yAxis.scale).toBeUndefined();
    expect(option().series.find(s => s.id === 'pressure')!.step).toBeUndefined();
    view.rerender(frame({ yFit: true }));
    expect(option().yAxis.scale).toBe(true);
    expect(option().yAxis.min).toBeUndefined();
    view.rerender(frame({ yFit: false }));
    expect(option().yAxis.min).toBe(0);
    expect(option().yAxis.scale).toBeUndefined();
  });
  it('does not apply step to bar series', async () => {
    render(frame({ series: [{ ...series[0], kind: 'bar', step: 'end' }] }));
    await screen.findByRole('img');
    expect(option().series.find(s => s.id === 'pressure')!.step).toBeUndefined();
  });
});
