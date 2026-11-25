import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartSeries } from '../AnalysisChartFrame';
import type { EChartProps } from '../EChart';

let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" aria-label="plot" />; } }));
const registry = createRegistry({
  spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: 'G', en: 'G' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', query: { mode: 'live' as const }, features: { export: false, savedView: false, annotate: true, compare: false }, pageKeys: [] }],
});
const none = async () => ({ data: null, assessments: [], trust: null, correlationId: 'fixture', outcome: 'empty' as const });
const session = testSession(['platform:view', 'analytics:view']);
const adapter = testAdapter({ session: () => session, listAnnotations: none, getEntity: none, saveAnnotation: none });
const series: ChartSeries[] = [{ id: 's', name: 'Series', color: 'chart-blue', kind: 'bar', points: [['A', 1], ['B', 3]] }];
async function mount(props: Partial<AnalysisChartFrameProps> = {}) {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM&from=2026-10-01T00:00:00&to=2026-10-03T00:00:00');
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <AnalysisChartFrame chartId="quiet" title="Quiet" unit="s" series={series} xType="category" orientation="horizontal" chrome="standard" {...props} />
  </PlatformProvider></I18nProvider>);
  await screen.findByRole('img', { name: 'plot' });
}
const summary = () => screen.getByRole('region', { name: '선택 요약' });
const brush = (range: [number, number]) => act(() => plot.onEvents?.brushEnd?.({ areas: [{ coordRange: range }] }, { dispatchAction: () => {} } as never));
afterEach(cleanup);

it('keeps the default hint visually present', async () => {
  await mount();
  expect(within(summary()).getByText(/선택 구간 없음/)).not.toHaveClass('sr-only');
  expect(summary()).not.toHaveClass('sr-only');
});
it.each(['standard', 'minimal'] as const)('quiet %s keeps live hint, active row and point accessible at rest', async chrome => {
  await mount({ chrome, summary: 'quiet', activeCategory: 'A', pointStatus: () => ({ tone: 'warning', label: 'Check' }) });
  expect(summary()).toHaveAttribute('aria-live', 'polite');
  expect(summary()).toHaveClass('sr-only');
  expect(within(summary()).getByText(/선택 구간 없음/)).toHaveClass('sr-only');
  expect(within(summary()).getByText('활성 행: A')).toHaveClass('sr-only');
  expect(within(summary()).getByText(/A · Series/)).toHaveClass('sr-only');
  expect(within(summary()).queryByRole('combobox')).toBeNull();
});
it('shows a compact committed range with counts, existing actions and clear', async () => {
  await mount({ summary: 'quiet', activeCategory: 'A', selectionActions: () => <button>Range action</button> });
  brush([0, 1]);
  expect(summary()).not.toHaveClass('sr-only');
  const line = within(summary()).getByText('선택 구간: A – B').parentElement!;
  expect(line).toHaveClass('flex', 'flex-wrap');
  expect(line).toHaveTextContent('Series: n=2 · avg 2 · max 3');
  expect(within(line).getByRole('button', { name: 'Range action' })).toBeTruthy();
  expect(within(summary()).getByText('활성 행: A')).toHaveClass('sr-only');
  expect(within(summary()).queryByRole('combobox')).toBeNull();
  fireEvent.click(within(line).getByRole('button', { name: '지우기' }));
  expect(summary()).toHaveClass('sr-only');
});
it('keeps selected-point bounds accessible but visually hidden', async () => {
  await mount({ summary: 'quiet', orientation: 'vertical', bounds: new Map([['A', { lower: 0, upper: 2 }]]) });
  act(() => plot.onEvents?.click?.({ seriesId: 's', dataIndex: 0 }, {} as never));
  expect(within(summary()).getByText(/현재 기간 기준/)).toHaveClass('sr-only');
  expect(summary()).toHaveClass('sr-only');
});
it('shows the keyboard form only while brush mode is on', async () => {
  await mount({ summary: 'quiet' });
  fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
  expect(summary()).not.toHaveClass('sr-only');
  expect(within(summary()).getByRole('combobox', { name: '구간 시작' })).toBeTruthy();
  fireEvent.click(within(summary()).getByRole('button', { name: '선택' }));
  fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
  expect(within(summary()).queryByRole('combobox')).toBeNull();
  expect(summary()).toHaveTextContent('선택 구간: A – B');
});
it('keeps apply preview and the note editor visually present', async () => {
  await mount({ summary: 'quiet', xType: 'time', orientation: 'vertical', series: [{ ...series[0], points: [['2026-10-01T00:00:00', 1], ['2026-10-02T00:00:00', 3]] }] });
  brush([new Date('2026-10-01T00:00:00').getTime(), new Date('2026-10-02T00:00:00').getTime()]);
  fireEvent.click(screen.getByRole('button', { name: '분석 구간으로 적용' }));
  expect(within(summary()).getByRole('group', { name: '구간 적용 확인' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '주석' }));
  expect(within(summary()).getByRole('textbox', { name: '주석 내용' })).toBeVisible();
  expect(summary()).not.toHaveClass('sr-only');
});
it('ignores quiet in full chrome', async () => {
  await mount({ chrome: 'full', summary: 'quiet', activeCategory: 'A' });
  expect(summary()).not.toHaveClass('sr-only');
  expect(within(summary()).getByText('활성 행: A')).not.toHaveClass('sr-only');
});

it('shows a titled zoom-only header with the legend below the title and working zoom controls', async () => {
  await mount({ zoomOnly: true, summary: 'quiet', legendCaption: 'Trend legend' });
  const title = screen.getByRole('heading', { name: 'Quiet' });
  const header = title.closest('header')!;
  expect(title).not.toHaveClass('sr-only');
  expect(title.nextElementSibling).toHaveTextContent('Trend legend');
  const buttons = within(within(header).getByRole('toolbar')).getAllByRole('button');
  expect(buttons).toHaveLength(4);
  ['조작 방법', '확대', '축소', '확대 초기화'].forEach((name, index) => {
    expect(buttons[index]).toHaveAccessibleName(name);
  });
  expect(screen.queryByRole('button', { name: '더보기' })).toBeNull();
  expect(summary()).toHaveClass('sr-only');

  const zoom = () => (plot.option as { dataZoom: { start: number; end: number }[] }).dataZoom[0];
  fireEvent.click(buttons[1]);
  expect(zoom()).toMatchObject({ start: 25, end: 75 });
  fireEvent.click(buttons[2]);
  expect(zoom()).toMatchObject({ start: 0, end: 100 });
  fireEvent.click(buttons[1]);
  fireEvent.click(buttons[3]);
  expect(zoom()).toMatchObject({ start: 0, end: 100 });
});
it('reveals the start/end form when a keyboard 구간 선택 moves focus into it on a fill chart (#3006)', async () => {
  const reveal = vi.fn();
  const original = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, options?: boolean | ScrollIntoViewOptions) { reveal(this, options); };
  try {
    await mount({ summary: 'quiet', size: 'fill' });
    // A keyboard activation (`detail: 0`) opens the form and moves focus to its first field.
    fireEvent.click(screen.getByRole('button', { name: '구간 선택' }), { detail: 0 });
    const group = screen.getByRole('group', { name: '시작과 끝으로 구간 선택' });
    expect(within(group).getByRole('combobox', { name: '구간 시작' })).toHaveFocus();
    expect(reveal).toHaveBeenCalledWith(group, { block: 'nearest', inline: 'nearest' });
  } finally {
    HTMLElement.prototype.scrollIntoView = original;
  }
});
