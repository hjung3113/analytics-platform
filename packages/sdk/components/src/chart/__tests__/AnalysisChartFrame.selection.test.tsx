import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartSeries } from '../AnalysisChartFrame';
import type { EChartProps } from '../EChart';

let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" aria-label={props.ariaLabel} />; } }));
const registry = createRegistry({
  spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: false, savedView: false, annotate: true, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const none = async () => ({ data: null, assessments: [], trust: null, correlationId: 'fixture', outcome: 'empty' as const });
const adapter = testAdapter({ session: () => session, getEntity: none, listAnnotations: none, saveAnnotation: none });
const tree = (props: Partial<AnalysisChartFrameProps>) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
  <AnalysisChartFrame chartId="sel" title="Sel" series={[]} unit="s" {...props} /></PlatformProvider></I18nProvider>;
const summary = () => screen.getByRole('region', { name: '선택 요약' });
const brush = (range: [number, number]) => act(() => plot.onEvents?.brushEnd?.({ areas: [{ coordRange: range }] }, { dispatchAction: () => {} } as never));
const dataOf = (id: string) => (plot.option as unknown as { series: { id: string; data: unknown[] }[] }).series.find(s => s.id === id)!.data;
beforeAll(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);

const A: ChartSeries = { id: 'a', name: 'A', color: 'chart-blue', kind: 'bar', points: [['a', 1], ['b', 2], ['c', 3]] };
const B: ChartSeries = { id: 'b', name: 'B', color: 'chart-purple', kind: 'bar', points: [['a', 1], ['c', 3]] };

describe('category projection (#2020)', () => {
  it('draws, tabulates and summarizes a vertical category series by category name, missing = null', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    render(tree({ series: [A, B], xType: 'category' }));
    await screen.findByRole('img');
    const values = (dataOf('b') as unknown[]).map(d => (Array.isArray(d) ? d[1] : (d as { value?: unknown })?.value ?? d));
    expect(values.map(v => (Array.isArray(v) ? v[1] : v))).toEqual([1, null, 3]);
    fireEvent.click(screen.getByRole('button', { name: '더보기' }));
    fireEvent.click(await screen.findByRole('button', { name: /표로 보기/ }));
    const row = screen.getByRole('cell', { name: 'b' }).closest('tr')!;
    expect(within(row).getAllByRole('cell').map(c => c.textContent)).toEqual(['b', '2', '—']);
    brush([1, 1]);
    expect(summary().textContent).toContain('B: n=0');
  });
  it('collapses duplicate categories on the vertical axis', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    const dup: ChartSeries = { ...A, points: [['a', 1], ['b', 2], ['a', 9]] };
    render(tree({ series: [dup], xType: 'category' }));
    await screen.findByRole('img');
    expect((plot.option as unknown as { xAxis: { data: string[] } }).xAxis.data).toEqual(['a', 'b']);
  });
});

describe('category keyboard selection (#2024)', () => {
  it('selects a range with the start/end selects and enables the page actions', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    render(tree({ series: [A], xType: 'category', selectionActions: s => <button type="button">act {s.from}-{s.to}</button> }));
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
    fireEvent.click(screen.getByRole('combobox', { name: '구간 시작' }));
    fireEvent.click(await screen.findByRole('option', { name: 'b' }));
    fireEvent.click(within(summary()).getByRole('button', { name: '선택' }));
    expect(summary().textContent).toContain('선택 구간: b – c');
    expect(within(summary()).getByRole('button', { name: 'act b-c' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '주석' }).hasAttribute('disabled')).toBe(false);
  });
  it('offers no start/end selects on a time axis without a query end', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    const t: ChartSeries = { ...A, points: [['2026-09-01T00:00:00', 1], ['2026-09-02T00:00:00', 2]] };
    render(tree({ series: [t] }));
    await screen.findByRole('img');
    expect(screen.queryByRole('combobox', { name: '구간 시작' })).toBeNull();
  });
});

describe('selection follows the data (#2064)', () => {
  const hour = (h: number) => `2026-10-0${1 + Math.floor(h / 24)}T${String(h % 24).padStart(2, '0')}:00:00`;
  const bars = (points: [string, number][]): ChartSeries => ({ id: 's', name: 'S', color: 'chart-blue', kind: 'bar', points });
  const url = '/?v=1&scopeId=MEM&from=2026-10-01T00:00:00&to=2026-10-04T00:00:00';
  it('re-fits a time selection to the new bar boundaries and closes the editor', async () => {
    window.history.replaceState(null, '', url);
    const hourly = bars(Array.from({ length: 72 }, (_, h) => [hour(h), 1]));
    const view = render(tree({ series: [hourly] }));
    await screen.findByRole('img');
    const ms = (s: string) => new Date(s).getTime();
    brush([ms('2026-10-01T10:00:00'), ms('2026-10-03T10:00:00')]);
    fireEvent.click(screen.getByRole('button', { name: '주석' }));
    expect(screen.getByRole('textbox', { name: '주석 내용' })).toBeTruthy();
    view.rerender(tree({ series: [bars([['2026-10-01T00:00:00', 1], ['2026-10-02T00:00:00', 1], ['2026-10-03T00:00:00', 1]])] }));
    // Start floors to the day bar that holds 10:00, end ceils to the next boundary; the open editor stays while the selection survives.
    expect(summary().textContent).toContain('선택 구간: 2026-10-01 00:00 – 2026-10-04 00:00');
    expect(screen.getByRole('textbox', { name: '주석 내용' })).toBeTruthy();
  });
  it('clears a category selection whose end is no longer drawn', async () => {
    window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
    const view = render(tree({ series: [A], xType: 'category' }));
    await screen.findByRole('img');
    brush([0, 2]);
    expect(summary().textContent).toContain('선택 구간: a – c');
    fireEvent.click(screen.getByRole('button', { name: '주석' }));
    expect(screen.getByRole('textbox', { name: '주석 내용' })).toBeTruthy();
    view.rerender(tree({ series: [{ ...A, points: [['a', 1], ['b', 2]] }], xType: 'category' }));
    expect(screen.queryByText(/선택 구간: a/)).toBeNull();
    expect(screen.queryByRole('textbox', { name: '주석 내용' })).toBeNull();
  });
});
