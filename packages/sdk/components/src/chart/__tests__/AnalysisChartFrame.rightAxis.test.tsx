import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartSeries } from '../AnalysisChartFrame';
import type { EChartProps } from '../EChart';
import { exportRegistry } from './test-support';

vi.mock('../EChartImpl', () => ({ default: FakePlot }));

type Plotted = { id?: string; yAxisIndex?: number; tooltip?: { valueFormatter: (v: number | null) => string } };
let plotProps: EChartProps | null = null;
const option = () => plotProps!.option as unknown as { series: Plotted[]; yAxis: unknown };
function FakePlot(props: EChartProps) { plotProps = props; return <div role="img" aria-label={props.ariaLabel} />; }

const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const points = (a: number, b: number): [string, number][] => [['2026-09-01T00:00:00', a], ['2026-09-02T00:00:00', b]];
const SERIES: ChartSeries[] = [
  { id: 'time', name: 'Time', color: 'chart-blue', points: points(10, 20) },
  { id: 'rate', name: 'Rate', color: 'chart-teal', axis: 'right', points: points(0.5, 0.75) },
];
function mount(extra: Partial<AnalysisChartFrameProps> = {}, canExport = false) {
  window.history.replaceState(null, '', '/?v=1');
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={exportRegistry(canExport)}>
    <AnalysisChartFrame chartId="dual" title="Dual" series={SERIES} unit="s" {...extra} />
  </PlatformProvider></I18nProvider>);
}
const rightAxis = { unit: '%', valueFormat: (v: number) => `${Math.round(v * 100)}` };
const text = (blob: Blob) => new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });

beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('AnalysisChartFrame right axis (#1657)', () => {
  it('names each point\'s own unit in the point selector while the right axis is active', async () => {
    mount({ rightAxis, pointActions: [{ id: 'a', label: 'Act', onSelect: () => {} }] });
    await screen.findByRole('img');
    const options = within(screen.getByRole('combobox', { name: '차트 지점 선택' })).getAllByRole('option').map(o => o.textContent);
    expect(options.some(t => t?.includes('Rate') && t.endsWith('50 %'))).toBe(true);
    expect(options.some(t => t?.includes('Time') && t.endsWith('10 s'))).toBe(true);
  });

  it('draws axis:right series on a second y axis with the right unit', async () => {
    mount({ rightAxis });
    await screen.findByRole('img');
    expect((option().yAxis as { name: string }[]).map(a => a.name)).toEqual(['s', '%']);
    expect(option().series.find(s => s.id === 'rate')!.yAxisIndex).toBe(1);
    expect(option().series.find(s => s.id === 'time')!.yAxisIndex).toBeUndefined();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('keeps one axis and no warning without the option', async () => {
    mount({ series: [SERIES[0]] });
    await screen.findByRole('img');
    expect(Array.isArray(option().yAxis)).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('draws on the left and warns when a series asks for the right axis but rightAxis is missing', async () => {
    mount();
    await screen.findByRole('img');
    expect(Array.isArray(option().yAxis)).toBe(false);
    expect(option().series.some(s => s.yAxisIndex === 1)).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('rightAxis is not given'));
  });

  it.each([
    ['stacked', { stacked: true }],
    ['horizontal', { xType: 'category' as const, orientation: 'horizontal' as const }],
  ])('ignores axis and warns for a %s chart', async (_name, extra) => {
    const bars = SERIES.map(s => ({ ...s, kind: 'bar' as const, points: s.points.map(([, y], n) => [`C${n}`, y] as [string, number]) }));
    mount({ rightAxis, series: bars, xType: 'category', ...extra });
    await screen.findByRole('img');
    expect(Array.isArray(option().yAxis)).toBe(false);
    expect(option().series.some(s => s.yAxisIndex === 1)).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('only to a vertical, unstacked chart'));
  });

  it('formats each tooltip value with its own axis format and unit', async () => {
    mount({ rightAxis, valueFormat: v => `${v}` });
    await screen.findByRole('img');
    expect(option().series.find(s => s.id === 'rate')!.tooltip!.valueFormatter(0.5)).toBe('50 %');
    expect((plotProps!.option as unknown as { tooltip: { valueFormatter: (v: number) => string } }).tooltip.valueFormatter(10)).toBe('10 s');
  });

  it('puts the unit in table headers and formats cells per series only while the right axis is active', async () => {
    const view = mount({ rightAxis });
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    fireEvent.click(await screen.findByText('같은 데이터를 표로 보기'));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['시각', 'Time (s)', 'Rate (%)']);
    expect(within(table).getAllByRole('row')[1].textContent).toContain('10');
    expect(within(table).getAllByRole('row')[1].textContent).toContain('50');
    view.unmount();
    mount({ series: [SERIES[0]] });
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    fireEvent.click(await screen.findByText('같은 데이터를 표로 보기'));
    expect(within(screen.getByRole('table')).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['시각', 'Time']);
  });

  it('exports CSV headers with units while active, and plain names when not', async () => {
    const blobs: Blob[] = [];
    const create = URL.createObjectURL; const revoke = URL.revokeObjectURL;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = (blob: Blob) => { blobs.push(blob); return 'blob:csv'; }; URL.revokeObjectURL = () => {};
    try {
      mount({ rightAxis }, true);
      fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
      cleanup();
      mount({}, true);
      fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
      const [withUnits, plain] = await Promise.all(blobs.map(text));
      expect(withUnits).toContain('x,Time (s),Rate (%)');
      expect(plain).toContain('x,Time,Rate');
    } finally { URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
  });

  it('keeps per-series summaries on their own unit and never adds across axes', async () => {
    mount({ rightAxis });
    fireEvent.click(await screen.findByRole('button', { name: '구간 선택' }));
    plotProps!.onEvents!.brushEnd({ areas: [{ coordRange: [Date.parse('2026-08-31T00:00:00Z'), Date.parse('2026-09-03T00:00:00Z')] }] }, { dispatchAction: () => {} } as never);
    const summary = await screen.findByRole('region', { name: '선택 요약' });
    expect(summary.textContent).toContain('Time: n=2 · avg 15 · max 20 s');
    expect(summary.textContent).toContain('Rate: n=2 · avg 63 · max 75 %');
    expect(summary.textContent).not.toMatch(/합계|total/i);
  });
});
