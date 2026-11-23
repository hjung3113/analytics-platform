import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { readColorToken } from '@ap/ui/theme';
import { StatusBadge } from '@ap/ui';
import { AnalysisChart, type HeatmapSpec } from '../AnalysisChart';
import type { EChartProps } from '../EChart';
import { downloadChartCsv } from '../analysisChartCsv';

let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" aria-label={props.ariaLabel} />; } }));
vi.mock('../analysisChartCsv', () => ({ downloadChartCsv: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const heat: HeatmapSpec = { kind: 'heatmap', xLabels: ['A', 'B'], yLabels: ['Row'], scale: { type: 'threshold', breaks: [10, 20], labels: ['Low', 'Medium', 'High'] }, cells: [{ x: 'A', y: 'Row', value: 15 }, { x: 'B', y: 'Row', value: null }] };
function mount(spec: HeatmapSpec, chrome?: 'standard') {
  const wrap = (next: HeatmapSpec) => <I18nProvider><AnalysisChart chartId="heat" title="Heat" unit="s" spec={next} chrome={chrome} exportActions={{ exportAllowed: true }} /></I18nProvider>;
  const view = render(wrap(spec));
  return { ...view, update: (next: HeatmapSpec) => view.rerender(wrap(next)) };
}
type Datum = { itemStyle: { color: string }; label?: { show: boolean; color: string; formatter: string; rich?: unknown } };
const option = () => plot.option as { series: { id?: string; data: Datum[] }[]; tooltip: { formatter: (params: { dataIndex: number }) => string } };

it('names held values in the legend, tooltip, accessible description and table', async () => {
  mount({ ...heat, nullLabel: '비교 보류' });
  await screen.findByRole('img');
  const region = await screen.findByRole('region', { name: 'Heat' });
  expect(within(region).getByText('비교 보류')).toBeVisible();
  expect(region).toHaveAccessibleDescription(/1칸 비교 보류/);
  expect(option().tooltip.formatter({ dataIndex: 1 })).toBe('B · Row: 비교 보류');
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  expect(within(screen.getByRole('table')).getByRole('cell', { name: '비교 보류' })).toBeVisible();
});

it('follows the controlled cell coordinates across updates and clears the border on null', async () => {
  const view = mount({ ...heat, selectedCell: { x: 'A', y: 'Row' } });
  await screen.findByRole('img');
  const borders = () => option().series[0].data.map(d => d.itemStyle);
  expect(borders()).toMatchObject([{ borderWidth: 1.5, borderType: 'solid' }, { borderType: 'dashed' }]);
  view.update({ ...heat, selectedCell: { x: 'B', y: 'Row' } });
  expect(borders()).toMatchObject([{ borderWidth: 0 }, { borderWidth: 1.5, borderType: 'solid' }]);
  view.update({ ...heat, selectedCell: null });
  expect(borders()).toMatchObject([{ borderWidth: 0 }, { borderWidth: 1, borderType: 'dashed' }]);
});

it('uses the highlighted cell in the selection summary on initial render, update and clear', async () => {
  const spec = { ...heat, xLabels: ['008', '009'], yLabels: ['Step 20 / Seq 3'], cells: [
    { x: '008', y: 'Step 20 / Seq 3', value: 15 },
    { x: '009', y: 'Step 20 / Seq 3', value: 17 },
  ] };
  const selectedCell = { x: '008', y: 'Step 20 / Seq 3', label: 'Step 20 / Seq 3 · EQ-008' };
  const view = mount({ ...spec, selectedCell });
  await screen.findByRole('img');
  const summary = screen.getByRole('region', { name: '선택 요약' });
  expect(summary).toHaveTextContent('Step 20 / Seq 3 · EQ-008 · 1칸 선택');
  view.update({ ...spec, selectedCell: { x: '009', y: 'Step 20 / Seq 3' } });
  expect(summary).toHaveTextContent('Step 20 / Seq 3 · 009 · 1칸 선택');
  view.update({ ...spec, selectedCell: null });
  expect(summary).toHaveTextContent('선택 없음');
});

it('keeps controlled heatmap summary and actions on the controlled cell after a local selection', async () => {
  const user = userEvent.setup(); const activate = vi.fn(); const details = vi.fn();
  mount({ ...heat, selectedCell: { x: 'A', y: 'Row', label: 'Controlled A' }, cellActivation: { on: 'dblclick', onActivate: activate }, onCellClick: details });
  await screen.findByRole('img');
  act(() => plot.onEvents?.click?.({ componentType: 'series', seriesIndex: 0, dataIndex: 1 }, {} as never));
  const selection = screen.getByRole('region', { name: '선택 요약' });
  expect(selection).toHaveTextContent('Controlled A · 1칸 선택');
  expect(selection).not.toHaveTextContent('B');

  const activateButton = screen.getByRole('button', { name: '선택 지점 실행' });
  activateButton.focus(); await user.keyboard('{Enter}');
  expect(activate).toHaveBeenCalledExactlyOnceWith('A', 'Row');
  await user.click(within(selection).getByRole('button', { name: '상세' }));
  expect(details).toHaveBeenCalledExactlyOnceWith('A', 'Row');
});

it('treats controlled null as no heatmap selection and disables cell actions despite a local selection', async () => {
  const user = userEvent.setup(); const activate = vi.fn(); const details = vi.fn();
  mount({ ...heat, selectedCell: null, cellActivation: { on: 'dblclick', onActivate: activate }, onCellClick: details });
  await screen.findByRole('img');
  act(() => plot.onEvents?.click?.({ componentType: 'series', seriesIndex: 0, dataIndex: 1 }, {} as never));
  const selection = screen.getByRole('region', { name: '선택 요약' });
  expect(selection).toHaveTextContent('선택 없음');
  const activateButton = screen.getByRole('button', { name: '선택 지점 실행' });
  expect(activateButton).toBeDisabled();
  const detailsButton = within(selection).getByRole('button', { name: '상세' });
  expect(detailsButton).toBeDisabled();
  await user.click(activateButton); await user.click(detailsButton);
  expect(activate).not.toHaveBeenCalled(); expect(details).not.toHaveBeenCalled();
});

it.each([null, { x: 'B', y: 'Row', label: 'Controlled B' }])('activates the heatmap cell checked with Space ahead of controlled selection %j', async selectedCell => {
  const user = userEvent.setup();
  const onActivate = vi.fn();
  mount({ ...heat, selectedCell, cellActivation: { on: 'click', onActivate } });
  await screen.findByRole('img');
  const summary = screen.getByRole('region', { name: '선택 요약' });
  const activate = within(summary).getByRole('button', { name: '선택 지점 실행' });
  const fallback = selectedCell ? 'Controlled B · 1칸 선택' : '선택 없음';
  expect(summary).toHaveTextContent(fallback);

  await user.click(screen.getByRole('button', { name: '표로 보기' }));
  const checkbox = screen.getByRole('checkbox', { name: '선택 Row · A' });
  checkbox.focus();
  await user.keyboard(' ');
  expect(checkbox).toBeChecked();
  expect(summary).toHaveTextContent('Row · A · 1칸 선택');
  expect(activate).toBeEnabled();
  expect(onActivate).not.toHaveBeenCalled();
  await user.click(activate);
  expect(onActivate).toHaveBeenCalledExactlyOnceWith('A', 'Row');

  await user.click(checkbox);
  expect(summary).toHaveTextContent(fallback);
});

it('rejects a held cell or multiple checked cells as the controlled heatmap action target', async () => {
  const user = userEvent.setup();
  const onActivate = vi.fn();
  mount({ ...heat, nullLabel: '보류', selectedCell: null, cellActivation: { on: 'click', onActivate } });
  await screen.findByRole('img');
  await user.click(screen.getByRole('button', { name: '표로 보기' }));

  const summary = screen.getByRole('region', { name: '선택 요약' });
  const activate = within(summary).getByRole('button', { name: '선택 지점 실행' });
  await user.click(screen.getByRole('checkbox', { name: '선택 Row · B · 보류' }));
  expect(summary).toHaveTextContent('선택 없음');
  expect(activate).toBeDisabled();
  await user.click(screen.getByRole('checkbox', { name: '선택 Row · A' }));
  expect(summary).toHaveTextContent('선택 없음');
  expect(activate).toBeDisabled();
});

it('keeps canvas clicks on the controlled summary path even when the heatmap table is open', async () => {
  const onActivate = vi.fn();
  mount({ ...heat, selectedCell: null, cellActivation: { on: 'click', onActivate } });
  await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  act(() => plot.onEvents?.click?.({ componentType: 'series', seriesIndex: 0, dataIndex: 0 }, {} as never));
  expect(onActivate).toHaveBeenCalledExactlyOnceWith('A', 'Row');
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('선택 없음');
});

it('default heatmap keeps numeric rendering, events, tooltip, table and CSV unchanged', async () => {
  const view = mount(heat); await screen.findByRole('img');
  expect(option().tooltip.formatter({ dataIndex: 0 })).toBe('A · Row: 15 s');
  expect(option().series[0].data.map(d => d.itemStyle.color)).toEqual([readColorToken('chart-status-warn'), readColorToken('chart-no-data')]);
  act(() => plot.onEvents?.click?.({ componentType: 'series', seriesIndex: 0, dataIndex: 0 }, {} as never));
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
  const baseline = { html: view.container.innerHTML.replace(/_r_[^_]+_/g, '_id_'), option: JSON.parse(JSON.stringify(plot.option)), events: Object.keys(plot.onEvents ?? {}), csv: vi.mocked(downloadChartCsv).mock.calls[0].slice(1) };
  expect(baseline).toMatchSnapshot();
  view.update({ ...heat, cells: heat.cells.map(c => ({ ...c, category: 'ignored-without-categories' })) });
  expect(view.container.innerHTML.replace(/_r_[^_]+_/g, '_id_')).toBe(baseline.html);
  expect(JSON.parse(JSON.stringify(plot.option))).toEqual(baseline.option);
});

const categories: NonNullable<HeatmapSpec['categories']> = [
  { id: 'ok', label: { ko: '정상', en: 'Normal' }, tone: 'success' },
  { id: 'over', label: { ko: '초과', en: 'Over' }, tone: 'danger' },
];
it.each([undefined, 'standard'] as const)('uses category fills and legend with %s chrome; carries labels to tooltip, table, CSV and accessible selection', async chrome => {
  const status = { tone: 'warning' as const, label: 'Check', reason: 'Review' };
  mount({ ...heat, categories, cells: [{ ...heat.cells[0], category: 'ok', status }, { ...heat.cells[1], category: 'over' }] }, chrome);
  await screen.findByRole('img');
  expect(option().series[0].data.map(d => d.itemStyle.color)).toEqual([readColorToken('accent-success-soft'), readColorToken('accent-danger-soft')]);
  expect(screen.getByText('정상')).toBeVisible(); expect(screen.getByText('초과')).toBeVisible();
  expect(screen.queryByText('Medium')).toBeNull(); expect(screen.queryByText('Low')).toBeNull();
  expect(option().series.some(s => s.id === '__statusOutline')).toBe(true);
  expect(option().series[0].data[0].label?.formatter).toContain('15 s');
  expect(option().series[0].data[0].label?.formatter).toContain('◆');
  expect(option().tooltip.formatter({ dataIndex: 0 })).toBe('A · Row: 15 s · 정상 · ◆ Check · Review');
  expect(option().tooltip.formatter({ dataIndex: 1 })).toBe('B · Row: 미확인 · 초과');
  if (chrome === 'standard') fireEvent.click(screen.getByRole('button', { name: '더보기' }));
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  expect(within(screen.getByRole('table')).getAllByRole('columnheader').map(c => c.textContent)).toEqual(['x', 'y', '값', '범주', '상태', '선택']);
  fireEvent.click(screen.getByRole('checkbox', { name: '선택 Row · A · 정상' }));
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('Row · A · 정상');
  if (chrome === 'standard') fireEvent.click(screen.getByRole('button', { name: '더보기' }));
  fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
  expect(downloadChartCsv).toHaveBeenCalledWith(expect.anything(), ['x', 'y', '값 (s)', '범주', '상태', '사유'], [['A', 'Row', 15, '정상', 'Check', 'Review'], ['B', 'Row', '미확인', '초과', '', '']]);
});

it('uses translated category labels and treats missing or unknown category ids as unknown, preserving values', async () => {
  vi.stubGlobal('localStorage', { getItem: () => 'en', setItem: () => undefined });
  mount({ ...heat, categories, cells: [{ ...heat.cells[0], category: 'missing' }, heat.cells[1]] });
  await screen.findByRole('img');
  expect(screen.getByText('Normal')).toBeVisible();
  expect(option().series[0].data.map(d => d.itemStyle.color)).toEqual([readColorToken('chart-no-data'), readColorToken('chart-no-data')]);
  expect(option().tooltip.formatter({ dataIndex: 0 })).toBe('A · Row: 15 s · Unknown');
  fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
  expect(screen.getByRole('checkbox', { name: 'Select Row · A · Unknown' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));
  expect(downloadChartCsv).toHaveBeenCalledWith(expect.anything(), ['x', 'y', 'Value (s)', 'Category'], [['A', 'Row', 15, 'Unknown'], ['B', 'Row', 'Unknown', 'Unknown']]);
});

it.each([
  ['success', 'accent-success-soft', 'text-text-success-label'],
  ['warning', 'accent-warn-soft', 'text-text-warning-label'],
  ['danger', 'accent-danger-soft', 'text-text-danger-label'],
  ['neutral', 'accent-neutral-soft', 'text-text-secondary'],
  ['info', 'accent-primary-soft', 'text-text-info-label'],
] as const)('uses existing paired tokens with at least 4.5:1 value text contrast for %s', async (tone, fill, text) => {
  mount({ ...heat, categories: [{ id: 'c', label: { ko: '범주', en: 'Category' }, tone }], cells: [{ ...heat.cells[0], category: 'c' }] });
  await screen.findByRole('img');
  const cell = option().series[0].data[0];
  expect(cell.itemStyle.color).toBe(readColorToken(fill));
  expect(cell.label).toMatchObject({ show: true, color: readColorToken(text.slice('text-'.length) as Parameters<typeof readColorToken>[0]), formatter: '15 s' });
  render(<StatusBadge tone={tone}>Badge pair</StatusBadge>);
  expect(screen.getByText('Badge pair')).toHaveClass(`bg-${fill}`, text);
  const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const a = luminance(cell.itemStyle.color); const b = luminance(cell.label!.color);
  expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
