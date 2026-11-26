import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useAnalysisSelectionChips } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { DockChartToolbarWidth } from '../../dock/DockChartHead';
import { SmallMultiplesGrid, type SmallMultiplesGridProps } from '../SmallMultiplesGrid';
import type { SmallMultiplesSeries } from '../smallMultiplesPlot';
import { QueryPanelContentContext } from '../../workspace/panelContext';

const from = '2026-09-25T00:00:00';
const to = '2026-09-26T00:00:00';
const output = { panelId: 'trend', key: 'asset' };
const label = { ko: '추세', en: 'Trend' };
const registry = createRegistry({
  spaces: [testSpace()], groups: [{ id: groupId('overview'), label, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label, description: label, path: '/', icon: House,
    permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', query: { mode: 'live' },
    features: { export: false, savedView: false, annotate: false, compare: false },
    pageKeys: [output.key], repeatedPageKeys: [output.key], contextResetKeys: [output.key],
    panels: [{ id: output.panelId, title: label, grain: 'asset', queryInputs: {}, displayInputs: {}, endpoints: [],
      outputs: [{ key: output.key, action: 'select', selection: { dimension: 'asset', shape: 'set' } }] }] }],
});
const session = testSession(['platform:view', 'analytics:view']);
const adapter = testAdapter({ session: () => session });
const series: SmallMultiplesSeries[] = Array.from({ length: 120 }, (_, i) => ({
  id: `series-${i}`, label: `Asset ${i}`, selectionValue: `asset-${i}`, points: [{ x: from, y: i }, { x: to, y: i + 1 }],
}));
const view = (props?: Partial<SmallMultiplesGridProps>) => <I18nProvider>
  <PlatformProvider registry={registry} adapter={adapter}>
    <SmallMultiplesGrid title="Trend" unit="ms" series={series} analysisSelectionOutput={output} {...props} />
  </PlatformProvider>
</I18nProvider>;
const tile = (index: number) => screen.getByRole('button', { name: `Asset ${index}` });
const selection = () => new URLSearchParams(window.location.search).getAll(output.key);
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

it.each(['click', 'Enter'] as const)('preserves URL selection and withdraws candidates after a prior result receives %s', async gesture => {
  function Candidates() {
    const { editor } = useAnalysisSelectionChips();
    return <output>{JSON.stringify(editor?.availability.get(output.key) ?? null)}</output>;
  }
  const ui = (state: 'current' | 'prior') => <I18nProvider><PlatformProvider registry={registry} adapter={adapter}>
    <QueryPanelContentContext.Provider value={state}>
      <SmallMultiplesGrid title="Trend" unit="ms" series={series.slice(0, 2)} analysisSelectionOutput={output} />
    </QueryPanelContentContext.Provider>
    <Candidates />
  </PlatformProvider></I18nProvider>;
  window.history.replaceState(null, '', '/?v=1&asset=asset-1');
  const user = userEvent.setup();
  const { rerender } = render(ui('current'));
  expect(await screen.findByText('["asset-0","asset-1"]')).toBeInTheDocument();
  rerender(ui('prior'));
  if (gesture === 'Enter') { tile(0).focus(); await user.keyboard('{Enter}'); }
  else await user.click(tile(0));
  expect({ selection: selection(), candidates: screen.getByRole('status').textContent }).toEqual({
    selection: ['asset-1'], candidates: 'null',
  });
  expect(tile(1)).toHaveAttribute('aria-pressed', 'true');
});

it.each(['regular', 'compact'] as const)('fills the %s shared-axis tiles below their headers', async density => {
  const empty = { ...series[1], points: [] };
  render(view({ series: [series[0], empty], density }));
  await screen.findByRole('button', { name: 'Asset 0' });

  for (const button of [tile(0), tile(1)]) {
    // jsdom does not lay out flex boxes. The plot must consume the remaining space after the header.
    const plot = button.querySelector(':scope > svg');
    expect(plot).toHaveClass('flex-1');
    expect(button.lastElementChild).toBe(plot);
  }
});

it.each(['regular', 'compact'] as const)('keeps the %s shared-axis empty notice clear of bounds in an aligned plot with blank labels', async density => {
  const bounds = new Map([[from, { lower: 0, upper: 2 }]]);
  const empty = { ...series[0], label: '', bounds, points: series[0].points.map(point => ({ ...point, y: null })) };
  render(view({ series: [empty, { ...series[1], label: '', bounds }], density }));
  const grid = await screen.findByRole('grid', { name: 'Trend' });
  const [emptyTile, populatedTile] = within(grid).getAllByRole('button');
  const plots = [emptyTile, populatedTile].map(button => button.querySelector('svg')!);
  expect(plots[0].querySelector('[data-small-multiple-band]')?.getAttribute('d')).toBe(
    plots[1].querySelector('[data-small-multiple-band]')?.getAttribute('d'),
  );
  expect(plots[0].classList.value).toBe(plots[1].classList.value);
  const header = plots[0].previousElementSibling;
  expect(header).toContainElement(within(emptyTile).getByText('결과 없음'));
  // jsdom cannot measure the header. Require one reserved line even on the populated tile with no header text.
  expect(header).toHaveClass('h-lh', 'shrink-0');
  expect(header?.className).toBe(plots[1].previousElementSibling?.className);
  expect(emptyTile).toHaveAccessibleDescription('결과 없음');
});

it.each(['regular', 'compact'] as const)('bounds the %s shared-axis empty notice so the series label has room', async density => {
  const label = 'Asset with a long series label';
  render(view({ series: [{ ...series[0], label, points: [] }], density }));
  const button = await screen.findByRole('button', { name: label });
  const notice = within(button).getByText('결과 없음');

  expect(notice).toHaveClass('max-w-1/2', 'shrink-0', 'truncate');
  expect(within(button).getByText(label)).toHaveClass('min-w-0', 'truncate');
  expect(button).toHaveAccessibleName(label);
  expect(button).toHaveAccessibleDescription('결과 없음');
});

it('recovers grid-owned focus by tile ID and clears the tab stop of a removed tile', async () => {
  const data = series.slice(0, 8);
  const ui = (columns: number, rows = data) => view({ series: rows, columns, actions: <button type="button">Outside grid</button> });
  const { rerender } = render(ui(3));
  (await screen.findByRole('button', { name: 'Asset 3' })).focus();
  rerender(ui(4));
  expect(tile(3)).toHaveFocus();
  rerender(ui(4, [...data.slice(4), ...data.slice(0, 4)]));
  expect(tile(3)).toHaveFocus();
  rerender(ui(4, data.filter(item => item.id !== data[3].id)));
  expect(tile(0)).toHaveFocus();
  tile(2).focus();
  const outside = screen.getByRole('button', { name: 'Outside grid' });
  outside.focus();
  rerender(ui(2, data.filter(item => item.id !== data[2].id)));
  rerender(ui(4));
  expect(outside).toHaveFocus();
  expect(tile(0)).toHaveAttribute('tabindex', '0');
});

it('recovers focus after the same tile is blurred and refocused before the blur clears ownership', async () => {
  const data = series.slice(0, 4);
  const { rerender } = render(view({ series: data, columns: 3 }));
  const button = await screen.findByRole('button', { name: 'Asset 3' });
  await act(async () => {
    button.focus();
    button.blur();
    button.focus();
  });
  rerender(view({ series: data, columns: 4 }));
  expect(tile(3)).toHaveFocus();
});

it.each([0, 1.5, Number.MAX_SAFE_INTEGER + 1])('diagnoses invalid columns (%s) and uses six', async columns => {
  const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(view({ columns, series: series.slice(0, 8) }));
    const rows = await screen.findAllByRole('row');
    expect(within(rows[0]).getAllByRole('gridcell')).toHaveLength(6);
    expect(diagnostic).toHaveBeenCalledWith(expect.stringMatching(/^AnalysisChart: .*columns/));
  } finally {
    diagnostic.mockRestore();
  }
});

it('pages by the distance between row starts and clamps to the partial last row', async () => {
  render(view({ series: series.slice(0, 8), columns: 3 }));
  const grid = await screen.findByRole('grid');
  Object.defineProperty(grid.parentElement, 'clientHeight', { value: 244 });
  within(grid).getAllByRole('row').forEach((row, index) =>
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, index * 128, 0, 120)));
  within(grid).getAllByRole('button').forEach(button => Object.defineProperty(button, 'offsetHeight', { value: 120 }));
  tile(2).focus();
  for (const [key, index] of [['PageDown', 5], ['PageDown', 7], ['PageUp', 4]] as const) {
    fireEvent.keyDown(document.activeElement!, { key });
    expect(tile(index)).toHaveFocus();
  }
});

it.each([
  [to, '2026-09-25 00:00 – 2026-09-26 00:00'],
  ['2026-09-26T00:00:05', '2026-09-25 00:00:00 – 2026-09-26 00:00:05'],
])('formats the period with the precision required by %s', async (end, period) => {
  render(view({ series: [{ ...series[0], points: [{ x: from, y: 0 }, { x: end, y: 1 }] }] }));
  expect(await screen.findByRole('button', { name: '공유 축 정보' })).toHaveAccessibleDescription(`${period} 0–1 ms`);
});

it('keeps all 120 tiles in input order with one scroll region and six columns by default', async () => {
  render(view());
  const grid = await screen.findByRole('grid', { name: 'Trend' });
  expect(grid.parentElement).toHaveClass('overflow-y-auto');
  const rows = within(grid).getAllByRole('row');
  expect(rows).toHaveLength(20);
  expect(within(rows[0]).getAllByRole('gridcell')).toHaveLength(6);
  expect(within(grid).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(series.map(row => row.label));
});

it.each(['click', 'Enter'] as const)('publishes the declared selection value on %s and restores the URL selection', async gesture => {
  window.history.replaceState(null, '', '/?v=1&asset=asset-1');
  const user = userEvent.setup();
  const { rerender } = render(view({ series: series.slice(0, 2) }));
  expect(await screen.findByRole('button', { name: 'Asset 1', pressed: true })).toBeTruthy();
  if (gesture === 'Enter') { tile(0).focus(); await user.keyboard('{Enter}'); }
  else await user.click(tile(0));
  expect(selection()).toEqual(['asset-0']);
  expect(tile(0)).toHaveAttribute('aria-pressed', 'true');
  rerender(view({ series: series.slice(0, 2), selectionDisabled: true }));
  await user.click(tile(1));
  expect(selection()).toEqual(['asset-0']);
});

it('moves the roving tab stop without selecting, including a partial final row', async () => {
  render(view({ series: series.slice(0, 8), columns: 3 }));
  (await screen.findByRole('button', { name: 'Asset 0' })).focus();
  for (const [key, index] of [['ArrowDown', 3], ['ArrowRight', 4], ['PageDown', 7], ['ArrowUp', 4],
    ['ArrowLeft', 3], ['PageUp', 0], ['End', 7], ['Home', 0]] as const) {
    fireEvent.keyDown(document.activeElement!, { key });
    expect(tile(index)).toHaveFocus();
    expect(tile(index)).toHaveAttribute('tabindex', '0');
  }
  expect(within(screen.getByRole('grid')).getAllByRole('button').filter(button => button.tabIndex === 0)).toEqual([tile(0)]);
  expect(selection()).toEqual([]);
});

it('shares the measured period and range, draws the stepped band, and uses the worst supplied status', async () => {
  const warn = { tone: 'warning', label: 'Below' } as const;
  const danger = { tone: 'danger', label: 'Above' } as const;
  const middle = '2026-09-25T12:00:00';
  const first: SmallMultiplesSeries = { ...series[0], points: [
    { x: to, y: 8, status: danger }, { x: middle, y: null, status: danger }, { x: from, y: 1, status: warn },
  ], bounds: new Map([[from, { lower: 2, upper: 6 }], [middle, { upper: 10 }]]) };
  const second = { ...series[1], points: [{ x: from, y: 1 }, { x: to, y: 4 }] };
  const { rerender } = render(view({ series: [first, second] }));
  const button = await screen.findByRole('button', { name: 'Asset 0' });
  expect(button).toHaveAccessibleDescription(/Above/);
  expect(button).toHaveClass('h-30');
  expect(button.querySelector('[data-small-multiple-line]')?.getAttribute('d')?.match(/M/g)).toHaveLength(2);
  const start = (index: number) => tile(index).querySelector('[data-small-multiple-line]')?.getAttribute('d')?.match(/^M[^h]+/)?.[0];
  expect(start(0)).toBeTruthy();
  expect(start(0)).toBe(start(1));
  expect(button.querySelector('[data-small-multiple-band]')).toBeInTheDocument();
  expect(button.querySelectorAll('svg text')).toHaveLength(2);
  const bandInfo = screen.getByRole('button', { name: '공유 축 정보' });
  expect(bandInfo).toHaveAccessibleDescription(/2026-09-25.*2026-09-26.*1–10 ms/);
  expect(within(screen.getByRole('grid')).queryByText('1–10 ms')).toBeNull();
  rerender(view({ series: [first, second], density: 'compact' }));
  expect(button).toHaveClass('h-18');
});

const withToolbar = (props: Partial<SmallMultiplesGridProps>) =>
  <DockChartToolbarWidth.Provider value={800}>{view(props)}</DockChartToolbarWidth.Provider>;
const tileOrder = () => within(screen.getByRole('grid')).getAllByRole('button').map(button => button.getAttribute('aria-label'));
const sortOptions = [{
  id: 'odd-first', label: { ko: '홀수 우선', en: 'Odd first' },
  compare: (a: SmallMultiplesSeries, b: SmallMultiplesSeries) => (b.points[0].y! % 2) - (a.points[0].y! % 2),
}];

it.each(['radio', 'menuitemradio'] as const)('shows original order first and preserves input order on ties using %s', async role => {
  const user = userEvent.setup();
  const data = [series[2], series[3], series[0], series[1]];
  const options = role === 'radio' ? sortOptions : [...sortOptions, {
    id: 'reverse', label: { ko: '역순', en: 'Reverse' },
    compare: (a: SmallMultiplesSeries, b: SmallMultiplesSeries) => b.label.localeCompare(a.label),
  }];
  render(withToolbar({ series: data, sortOptions: options }));
  expect(tileOrder()).toEqual(data.map(item => item.label));
  const open = async (current: string) => {
    if (role === 'menuitemradio') await user.click(screen.getByRole('button', { name: `정렬: ${current}` }));
  };
  await open('원래 순서');
  expect(screen.getAllByRole(role)[0]).toHaveAccessibleName('원래 순서');
  expect(screen.getByRole(role, { name: '원래 순서', checked: true })).toBeInTheDocument();
  await user.click(screen.getByRole(role, { name: '홀수 우선' }));
  expect(tileOrder()).toEqual(['Asset 3', 'Asset 1', 'Asset 2', 'Asset 0']);
  await open('홀수 우선');
  await user.click(screen.getByRole(role, { name: '원래 순서' }));
  expect(tileOrder()).toEqual(data.map(item => item.label));
});

it.each([2, 4])('keeps focus and URL selection on the same series after a controlled sort with %i columns', async columns => {
  window.history.replaceState(null, '', '/?v=1&asset=asset-0');
  const reverse = [{ id: 'reverse', label: { ko: '역순', en: 'Reverse' },
    compare: (a: SmallMultiplesSeries, b: SmallMultiplesSeries) => b.label.localeCompare(a.label) }];
  const props = { series: series.slice(0, 4), columns, sortOptions: reverse, onSortChange: vi.fn() };
  const { rerender } = render(withToolbar({ ...props, sortId: 'original' }));
  const focused = await screen.findByRole('button', { name: 'Asset 0', pressed: true });
  fireEvent.click(screen.getByRole('radio', { name: '역순' }));
  expect(props.onSortChange).toHaveBeenCalledWith('reverse');
  expect(tileOrder()[0]).toBe('Asset 0');
  focused.focus();
  rerender(withToolbar({ ...props, sortId: 'reverse' }));
  expect(tileOrder().at(-1)).toBe('Asset 0');
  expect(tile(0)).toHaveFocus();
  expect(tile(0)).toHaveAttribute('tabindex', '0');
  expect(tile(0)).toHaveAttribute('aria-pressed', 'true');
  expect(selection()).toEqual(['asset-0']);
});

it('uses finite per-tile values and bounds for independent scales and labels only that mode', async () => {
  const user = userEvent.setup();
  const data = [
    { ...series[0], points: [{ x: from, y: 1002 }, { x: to, y: 1006 }], bounds: new Map([[from, { lower: 1000.4, upper: 1007.6 }]]) },
    { ...series[1], points: [{ x: from, y: 2004 }, { x: '2026-09-25T12:00:00', y: Infinity }, { x: to, y: 2012 }],
      bounds: new Map([[from, { lower: 2000.4, upper: 2015.6 }]]) },
    { ...series[2], points: [{ x: from, y: 5 }, { x: to, y: 5 }] },
  ];
  render(withToolbar({ series: data, showAxisControl: true }));
  const path = (index: number) => tile(index).querySelector('[data-small-multiple-line]')?.getAttribute('d');
  const line = (index: number) => path(index)?.match(/^M[^h]+/)?.[0];
  const firstRange = '1,000–1,008 ms';
  const secondRange = '2,000–2,016 ms';
  expect(screen.getByRole('radio', { name: '축 공유', checked: true })).toBeInTheDocument();
  expect(line(0)).not.toBe(line(1));
  expect(within(tile(0)).queryByText(firstRange)).toBeNull();
  expect(within(tile(1)).queryByText(secondRange)).toBeNull();
  await user.click(screen.getByRole('radio', { name: '칸마다 축' }));
  expect(line(0)).toBe('M5 70');
  expect(line(1)).toBe(line(0));
  expect(path(1)).toMatch(/^M5 70h0\.01\s+M95 30h0\.01$/);
  expect(path(2)).toBe('M5 50h0.01 L95 50');
  expect(within(tile(0)).getByText(firstRange)).toBeInTheDocument();
  expect(within(tile(1)).getByText(secondRange)).toBeInTheDocument();
  expect(within(tile(2)).getByText('5–5 ms')).toBeInTheDocument();
  expect(tile(0)).toHaveAccessibleDescription(firstRange);
  expect(screen.getByRole('button', { name: '칸마다 축 정보' })).toHaveAccessibleDescription(/칸마다 다른 눈금/);
});

it.each(['hover', 'keyboard'] as const)('reveals the full independent range on %s', async gesture => {
  const user = userEvent.setup();
  const status = { tone: 'warning', label: 'High' } as const;
  const data = [{ ...series[0], points: [{ x: from, y: 1000 }, { x: to, y: 1008, status }] }];
  render(withToolbar({ series: data, showAxisControl: true }));
  await user.click(screen.getByRole('radio', { name: '칸마다 축' }));
  if (gesture === 'hover') await user.hover(tile(0));
  else {
    await user.tab();
    expect(tile(0)).toHaveFocus();
  }
  expect(await screen.findByRole('tooltip')).toHaveTextContent('1,000–1,008 ms');
  expect(tile(0)).toHaveAccessibleDescription(/High.*1,000–1,008 ms/);
  expect(selection()).toEqual([]);
});

it('keeps the focused range tooltip open when keyboard navigation scrolls the grid (#3078)', async () => {
  const user = userEvent.setup();
  render(withToolbar({ series: series.slice(0, 2), columns: 1, showAxisControl: true }));
  await user.click(screen.getByRole('radio', { name: '칸마다 축' }));
  await user.tab();
  expect(tile(0)).toHaveFocus();
  expect(await screen.findByRole('tooltip')).toHaveTextContent('0–1 ms');

  const scroll = screen.getByRole('grid').parentElement!;
  Object.defineProperty(scroll, 'clientHeight', { value: 120 });
  vi.spyOn(tile(1), 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 128, 0, 120));
  await user.keyboard('{End}');
  expect(scroll.scrollTop).toBe(128);
  const tooltip = await screen.findByRole('tooltip');
  expect(tooltip).toHaveTextContent('1–2 ms');

  // jsdom does not dispatch a scroll event when scrollTop changes.
  fireEvent.scroll(scroll);
  expect(tile(1)).toHaveFocus();
  expect(screen.getByRole('tooltip')).toBe(tooltip);

  await user.keyboard('{Escape}');
  expect(tile(1)).toHaveFocus();
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  await user.keyboard('{Home}');
  expect(await screen.findByRole('tooltip')).toHaveTextContent('0–1 ms');
  await user.tab({ shift: true });
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

  await user.hover(tile(1));
  expect(await screen.findByRole('tooltip')).toHaveTextContent('1–2 ms');
  fireEvent.scroll(scroll);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

it('ties the grid scroll listener to its scroll element: gone with the tiles, and a new grid keeps the focused tooltip (#3078)', async () => {
  const user = userEvent.setup();
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  const captures = (spy: typeof add) => spy.mock.calls
    .filter(([type, , options]) => type === 'scroll' && typeof options === 'object' && options.capture === true).map(([, listener]) => listener);
  const props = { columns: 1, showAxisControl: true } as const;
  const { rerender } = render(withToolbar({ ...props, series: series.slice(0, 2) }));
  await user.click(screen.getByRole('radio', { name: '칸마다 축' }));
  const first = captures(add);
  expect(first.length).toBeGreaterThan(0);

  rerender(withToolbar({ ...props, series: [] }));
  expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  expect(first.every(listener => captures(remove).includes(listener))).toBe(true);

  rerender(withToolbar({ ...props, series: series.slice(0, 2) }));
  await user.click(screen.getByRole('radio', { name: '칸마다 축' }));
  await user.tab();
  expect(tile(0)).toHaveFocus();
  const tooltip = await screen.findByRole('tooltip');
  fireEvent.scroll(screen.getByRole('grid').parentElement!);
  expect(screen.getByRole('tooltip')).toBe(tooltip);
  add.mockRestore();
  remove.mockRestore();
});

it('reserves at least 24 px for the plot in compact density', async () => {
  render(view({ series: series.slice(0, 1), density: 'compact' }));
  const button = await screen.findByRole('button', { name: 'Asset 0' });
  // jsdom does not lay out flex boxes. Check the 24 px minimum-height utility.
  expect(button.querySelector('svg')).toHaveClass('min-h-6');
});

it('keeps a range row and a 24 px minimum plot in compact independent-axis tiles', async () => {
  render(withToolbar({ series: series.slice(0, 1), density: 'compact', showAxisControl: true }));
  await userEvent.click(screen.getByRole('radio', { name: '칸마다 축' }));

  const plot = tile(0).querySelector(':scope > svg');
  const range = within(tile(0)).getByText('0–1 ms');
  expect(plot).toHaveClass('min-h-6');
  expect(plot?.nextElementSibling).toBe(range);
  expect(range).toHaveClass('h-lh', 'shrink-0');
});

it('shows the density choice only when requested and keeps the choice out of the URL', async () => {
  const props = { series: series.slice(0, 1) };
  const { rerender } = render(withToolbar(props));
  expect(screen.queryByRole('radiogroup', { name: '표시 크기' })).toBeNull();
  expect(screen.queryByRole('radiogroup', { name: '세로축' })).toBeNull();
  const before = window.location.href;
  rerender(withToolbar({ ...props, showDensityControl: true }));
  expect(screen.getByRole('radio', { name: '보통', checked: true })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('radio', { name: '작게' }));
  expect(tile(0)).toHaveClass('h-18');
  expect(window.location.href).toBe(before);
});
