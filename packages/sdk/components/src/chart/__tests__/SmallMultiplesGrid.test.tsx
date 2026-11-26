import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { House } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useAnalysisSelectionChips } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
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

it.each(['regular', 'compact'] as const)('gives an all-null tile the same %s plot slot as a populated tile', async density => {
  const bounds = new Map([[from, { lower: 0, upper: 2 }]]);
  const empty = { ...series[0], bounds, points: series[0].points.map(point => ({ ...point, y: null })) };
  render(view({ series: [empty, { ...series[1], bounds }], density }));
  await screen.findByRole('button', { name: 'Asset 0' });
  const plots = [tile(0), tile(1)].map(button => button.querySelector('svg')!);
  expect(plots[0].querySelector('[data-small-multiple-band]')?.getAttribute('d')).toBe(
    plots[1].querySelector('[data-small-multiple-band]')?.getAttribute('d'),
  );
  expect(plots[0].parentElement?.className).toBe(plots[1].parentElement?.className);
  const caption = within(tile(0)).getByText('결과 없음');
  const spacer = plots[1].nextElementSibling;
  expect(plots[0].nextElementSibling).toBe(caption);
  expect(caption).not.toHaveClass('absolute');
  expect(caption).toHaveClass('h-lh', 'shrink-0');
  expect(spacer?.className).toBe(caption.className);
  expect(spacer).toBeEmptyDOMElement();
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
