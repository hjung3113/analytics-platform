import { downloadChartCsv } from '../analysisChartCsv';
import { readColorToken } from '@ap/ui/theme';
import { mount } from './test-support';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { House } from 'lucide-react';
import { testAdapter, testSpace, noContext } from '@ap/kernel/testing';
import { AnalysisChart } from '../AnalysisChart';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { EChartProps } from '../EChart';
import { topNData } from '../topNBar';
import { groupId, spaceId } from '@ap/contracts';

vi.mock('../analysisChartCsv', () => ({ downloadChartCsv: vi.fn() }));
let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" aria-label={props.ariaLabel} />; } }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const items = [2, 5, 5, 0, 1, 4, 3, 8, 7, 9].map((value, i) => ({ id: String(i), label: `Item ${i}`, value, colorToken: 'chart-series-1' as const }));
it('stably sorts a copy, limits to eight, preserves zero and shares the table projection', () => {
  const data = topNData({ kind: 'topNBar', items }, false, 'ea');
  expect(data.rows.map(row => row.label)).toEqual(['Item 9', 'Item 7', 'Item 8', 'Item 1', 'Item 2', 'Item 5', 'Item 6', 'Item 0']);
  expect(items[0].value).toBe(2);
  expect(data.tableValues.map(row => row[0])).toEqual(data.rows.map(row => row.label));
  expect(topNData({ kind: 'topNBar', items: [items[3]] }, false, '').empty).toBe(false);
});
it('caps bar thickness at 24px while the row-height projection stays unchanged', () => {
  const series = topNData({ kind: 'topNBar', items }, false, 'ea').option([]).series as { barMaxWidth: number }[];
  expect(series[0].barMaxWidth).toBe(24);
});
it('starts collapsed, exposes the controlled plot and uses computed height', async () => {
  mount({ kind: 'topNBar', items });
  const toggle = screen.getByRole('button', { name: '표시' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('img')).toBeNull();
  fireEvent.click(toggle);
  await screen.findByRole('img');
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBeVisible();
  expect(plot.height).toBe(248);
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  expect(screen.getByRole('table').textContent).toContain('Item 9');
});
it.each([0, -1, 1.2, NaN, Infinity])('diagnoses invalid N %s and falls back to eight', topN => {
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(topNData({ kind: 'topNBar', items, topN }, false, '').rows).toHaveLength(8);
  expect(diagnostic).toHaveBeenCalled();
});
it.each([-1, NaN, Infinity])('drops invalid value %s', value => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(topNData({ kind: 'topNBar', items: [{ ...items[0], value }] }, false, '').rows).toHaveLength(0);
});
it('drops raw colors and duplicate IDs, filters legends by displayed tokens in caller order', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const data = topNData({ kind: 'topNBar', topN: 1, items: [items[0], { ...items[0], value: 30 }, { ...items[1], colorToken: '#000' as never }], legend: [
    { label: 'Unused', colorToken: 'chart-series-2' }, { label: 'Used', colorToken: 'chart-series-1' }, { label: 'Duplicate', colorToken: 'chart-series-1' }, { label: 'Invalid', colorToken: 'rgb(1,2,3)' as never },
  ] }, false, 'ea');
  expect(data.rows.map(row => row.value)).toEqual([2]);
  expect(data.legend.map(row => row.label)).toEqual(['Used']);
});
it('requests controlled collapse without changing the accepted value; carries it into uncontrolled mode', async () => {
  const onExpandedChange = vi.fn();
  const view = mount({ kind: 'topNBar', items, expanded: true, onExpandedChange });
  await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '숨기기' }));
  expect(onExpandedChange).toHaveBeenCalledWith(false);
  expect(screen.getByRole('button', { name: '숨기기' })).toHaveAttribute('aria-expanded', 'true');
  view.update({ kind: 'topNBar', items });
  expect(screen.getByRole('button', { name: '숨기기' })).toHaveAttribute('aria-expanded', 'true');
  view.update({ kind: 'topNBar', items, expanded: false });
  expect(screen.getByRole('button', { name: '표시' })).toHaveAttribute('aria-expanded', 'false');
});
it('keeps an empty header by default and hides the whole empty frame only when requested', () => {
  const view = mount({ kind: 'topNBar', items: [], defaultExpanded: true });
  expect(screen.getByText('데이터 없음')).toBeVisible();
  view.update({ kind: 'topNBar', items: [], hideWhenEmpty: true });
  expect(screen.queryByRole('region', { name: 'Chart' })).toBeNull();
});
it('keeps item activation explicit and provides keyboard selection/details', async () => {
  const onItemClick = vi.fn();
  mount({ kind: 'topNBar', items: [items[0]], defaultExpanded: true, onItemClick });
  await screen.findByRole('img');
  plot.onEvents?.click?.({ componentType: 'series', seriesIndex: 0, dataIndex: 0 } as never, {} as never);
  expect(onItemClick).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  const checkbox = screen.getByRole('checkbox', { name: '선택 Item 0' });
  checkbox.focus(); fireEvent.click(checkbox);
  fireEvent.click(screen.getAllByRole('button', { name: '상세' }).at(-1)!);
  expect(onItemClick).toHaveBeenCalledWith('0');
});
it('exports exactly the visible table projection under the manifest gate and preserves option identity', async () => {
  const spec = { kind: 'topNBar' as const, items, topN: 2, defaultExpanded: true };
  const view = mount(spec, true); await screen.findByRole('img');
  const option = plot.option;
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  expect(plot.option).toBe(option);
  fireEvent.click(screen.getByRole('button', { name: '내보내기' }));
  expect(downloadChartCsv).toHaveBeenLastCalledWith(expect.anything(), ['이름', '값'], [['Item 9', '9 ea'], ['Item 7', '8 ea']]);
  const bars = (plot.option as { series: { barMaxWidth: number; data: { itemStyle: { color: string } }[] }[] }).series;
  expect(bars[0].barMaxWidth).toBe(24);
  expect(bars[0].data[0].itemStyle.color).toBe(readColorToken('chart-series-1'));
  view.unmount(); mount(spec, false); expect(screen.queryByRole('button', { name: '내보내기' })).toBeNull();
});
it('returns focus to the toggle when a controlled collapse hides a focused table control', async () => {
  const view = mount({ kind: 'topNBar', items, expanded: true }); await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  screen.getAllByRole('checkbox')[0].focus();
  view.update({ kind: 'topNBar', items, expanded: false });
  expect(screen.getByRole('button', { name: '표시' })).toHaveFocus();
});
it('grows for explicit N and applies the minimum height for a single zero-valued item', async () => {
  const view = mount({ kind: 'topNBar', items, topN: 10, defaultExpanded: true }); await screen.findByRole('img');
  expect(plot.height).toBe(304);
  view.update({ kind: 'topNBar', items: [items[3]], defaultExpanded: true });
  expect(plot.height).toBe(120);
  expect(screen.queryByText('데이터 없음')).toBeNull();
});

it('gives an explicit AnalysisChart height precedence over the TopN row height', async () => {
  render(<I18nProvider><PlatformProvider adapter={testAdapter()} registry={createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: 'G', en: 'G' }, icon: House, space: spaceId('analytics') }], menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: false, compare: false, annotate: false, savedView: false }, pageKeys: [] }] })}>
    <AnalysisChart chartId="height" title="Height" unit="ea" height={444} spec={{ kind: 'topNBar', items, defaultExpanded: true }} />
  </PlatformProvider></I18nProvider>);
  await screen.findByRole('img'); expect(plot.height).toBe(444);
});
