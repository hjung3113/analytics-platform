import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { readColorToken } from '@ap/ui/theme';
import { AnalysisChart, type HeatmapSpec } from '../AnalysisChart';
import { downloadChartCsv } from '../analysisChartCsv';
import type { EChartProps } from '../EChart';
let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" />; } }));
vi.mock('../analysisChartCsv', () => ({ downloadChartCsv: vi.fn() }));
const status = { tone: 'neutral' as const, label: '판정 불가', reason: 'Recipe 미구분' };
const heat: HeatmapSpec = { kind: 'heatmap', xLabels: ['PM1', 'PM2'], yLabels: ['EQ1'], scale: { type: 'threshold', breaks: [10, 20], labels: ['양호', '주의', '위험'] }, cells: [{ x: 'PM1', y: 'EQ1', value: 15 }, { x: 'PM2', y: 'EQ1', value: null }] };
type Datum = { value: unknown[]; itemStyle: { color: string; borderColor: string; shadowColor?: string }; label?: { show: boolean; formatter: string } };
const option = () => plot.option as { series: { data: Datum[] }[]; tooltip: { formatter: (params: { dataIndex: number }) => string } };
function mount(spec: HeatmapSpec) {
  const wrap = (spec: HeatmapSpec) => <I18nProvider><AnalysisChart chartId="heat" title="Heat" unit="s" spec={spec} exportActions={{ exportAllowed: true }} /></I18nProvider>;
  const view = render(wrap(spec));
  return { ...view, update: (next: HeatmapSpec) => view.rerender(wrap(next)) };
}
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });
describe('heatmap cell statuses (#2326)', () => {
  it('keeps threshold value colours and marks known and null cells, with deduplicated legend and text everywhere', async () => {
    mount({ ...heat, cells: heat.cells.map(c => ({ ...c, status })) }); await screen.findByRole('img');
    const data = option().series[0].data;
    expect(data.map(c => c.itemStyle.color)).toEqual(['chart-status-warn', 'chart-no-data'].map(name => readColorToken(name as 'chart-status-warn' | 'chart-no-data')));
    expect(data.every(c => c.label?.show && c.label.formatter.includes('○'))).toBe(true);
    expect(data[1].itemStyle.borderColor).toBe(readColorToken('chart-no-data-pattern'));
    expect(screen.getAllByText('판정 불가')).toHaveLength(1);
    expect(option().tooltip.formatter({ dataIndex: 1 })).toContain('○ 판정 불가 · Recipe 미구분');
    act(() => plot.onEvents?.click?.({ componentType: 'series', seriesIndex: 0, dataIndex: 1 }, {} as never));
    expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('판정 불가 · Recipe 미구분');
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(c => c.textContent)).toEqual(['x', 'y', '값', '상태', '선택']);
    expect(within(table).getAllByRole('row')[2]).toHaveTextContent('미확인○ 판정 불가 · Recipe 미구분');
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
    expect(downloadChartCsv).toHaveBeenCalledWith(expect.anything(), ['x', 'y', '값 (s)', '상태', '사유'], [['PM1', 'EQ1', 15, '판정 불가', 'Recipe 미구분'], ['PM2', 'EQ1', '미확인', '판정 불가', 'Recipe 미구분']]);
  });
  it('without statuses keeps option data, tooltip, table, summary and CSV unchanged', async () => {
    const view = mount(heat); await screen.findByRole('img');
    const plain = JSON.parse(JSON.stringify(option()));
    view.update({ ...heat, cells: heat.cells.map(c => ({ ...c, status: undefined })) });
    expect(JSON.parse(JSON.stringify(option()))).toEqual(plain);
    expect(option().tooltip.formatter({ dataIndex: 1 })).toBe('PM2 · EQ1: 미확인');
    expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('선택 없음');
    fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
    expect(within(screen.getByRole('table')).getAllByRole('columnheader').map(c => c.textContent)).toEqual(['x', 'y', '값', '선택']);
    fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
    fireEvent.click(screen.getByRole('button', { name: '내보내기 CSV' }));
    expect(downloadChartCsv).toHaveBeenCalledWith(expect.anything(), ['x', 'y', '값 (s)'], [['PM1', 'EQ1', 15], ['PM2', 'EQ1', '미확인']]);
  });
});

it.each([
  ['warning', 15, 'chart-status-warn'], ['neutral', null, 'chart-no-data'], ['danger', 25, 'chart-status-critical'],
] as const)('draws an opaque contrasting %s outline without altering the heatmap fill', async (tone, value, fill) => {
  mount({ ...heat, cells: [{ x: 'PM1', y: 'EQ1', value, status: { tone, label: 'Status' } }] });
  await screen.findByRole('img');
  const series = plot.option.series as { z?: number; itemStyle?: { opacity?: number; borderColor?: string; borderWidth?: number }; data: Datum[] }[];
  expect(series[0].data[0].itemStyle.color).toBe(readColorToken(fill));
  expect(series[0].itemStyle?.opacity).toBeUndefined(); // value scatter keeps its actual 0.8 default
  type Ring = { renderItem: (params: unknown, api: unknown) => { style: { stroke: string; opacity?: number } }; data: unknown[][] };
  const stroke0 = (s: unknown) => { const ring = s as Ring; return ring.renderItem({}, { value: (d: number) => ring.data[0][d], coord: () => [0, 0] }).style; };
  const outline = series.find(s => s.z === 4)!;
  expect(outline).toBeDefined();
  expect(stroke0(outline).opacity).toBeUndefined(); // opaque
  const rgb = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
  const surface = readColorToken('surface-card');
  const effective = `rgb(${rgb(readColorToken(fill)).map((v, n) => v * 0.8 + rgb(surface)[n] * 0.2).join(',')})`;
  const luminance = (color: string) => rgb(color).map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, n) => sum + v * [0.2126, 0.7152, 0.0722][n], 0);
  const ratio = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  const stroke = stroke0(outline).stroke;
  const backing = series.find(s => s.z === 3);
  const background = backing ? stroke0(backing).stroke : effective;
  expect(ratio(stroke, background)).toBeGreaterThanOrEqual(3);
  if (backing) expect(ratio(background, effective)).toBeGreaterThanOrEqual(3);
});
