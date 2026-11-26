import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useCallback, useEffect, useState } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { AnalysisChart } from '../../chart/AnalysisChart';
import { AnalysisChartFrame } from '../../chart/AnalysisChartFrame';
import { LaneTimeline } from '../../chart/LaneTimeline';
import { OrderedIntervalTrack } from '../../chart/OrderedIntervalTrack';
import { PanelOptions } from '../../workspace/PanelOptions';
import { WorkspaceGroupActions } from '../../workspace/WorkspaceGroupActions';
import { group, installResizeObserver, mountDock } from './harness';
import { DockLayoutBase } from '../DockLayout';
import { I18nProvider } from '@ap/kernel';

vi.mock('../../chart/EChartImpl', () => ({ default: () => <div role="img" aria-label="plot" /> }));

const series = [{ id: 's', name: 'Series', color: 'chart-blue', kind: 'bar', unit: 's', points: [['A', 1], ['B', 2]] }] as const;
let observer: ReturnType<typeof installResizeObserver>;
beforeEach(() => { observer = installResizeObserver(); });
afterEach(() => { cleanup(); observer.restore(); });

function mount(companion?: 'frame' | 'heatmap' | 'timeline' | 'track', onMaximize = vi.fn()) {
  mountDock({
    layout: group(['a']),
    mergeChartHead: true,
    inner: () => <>
      <AnalysisChartFrame chartId="first" title="Trend" description="Chart description" metricVersion="1"
        unit="s" series={series.map(item => ({ ...item, points: item.points.map(([key, value]): [string, number] => [key, value]) }))}
        xType="category" toolbarStart={<button>Stack mode</button>} />
      {companion === 'frame' && <AnalysisChartFrame chartId="first" title="Distribution" unit="s" series={[]} xType="category" />}
      {companion === 'heatmap' && <AnalysisChart chartId="second" title="Distribution" unit="s"
        spec={{ kind: 'heatmap', xLabels: ['A'], yLabels: ['B'], cells: [{ x: 'A', y: 'B', value: 1 }] }} />}
      {companion === 'timeline' && <LaneTimeline ariaLabel="Timeline" lanes={[]} />}
      {companion === 'track' && <OrderedIntervalTrack ariaLabel="Track" lanes={[]} items={[]} states={{}} domain={[0, 10]} />}
    </>,
    props: {
      renderGroupActions: () => <WorkspaceGroupActions title="패널 a" titleOf={id => id}
        closeFocus={{ current: null }} menu={{ maximized: false, split: null, moves: [] }}
        onMaximize={onMaximize} onSplit={vi.fn()} onMove={vi.fn()} />,
    },
  });
}

it('puts the title, view options and actions in a single pane head with a stable action tail', async () => {
  const user = userEvent.setup();
  mount();
  const tab = await screen.findByRole('tab', { name: '패널 a' });
  const head = tab.closest<HTMLElement>('.dv-tabs-and-actions-container')!;
  const tools = within(head);
  const table = await tools.findByRole('button', { name: '표로 보기' });
  const maximize = await tools.findByRole('button', { name: '패널 a 최대화' });
  const more = tools.getByRole('button', { name: '더보기' });
  const order = () => [table, maximize, more].map(button => Array.from(head.querySelectorAll<HTMLElement>('button')).indexOf(button));
  const before = order();
  expect(before[0]).toBeGreaterThanOrEqual(0);
  expect(before[1]).toBe(before[0] + 1);
  expect(before[2]).toBe(before[1] + 1);
  expect(tools.getByRole('button', { name: 'Stack mode' })).toBeVisible();
  expect(tools.getByRole('button', { name: '차트 설명' })).toBeVisible();
  const reveal = head.querySelector('[data-dock-chart-tools]')!;
  expect(reveal).toHaveClass('opacity-0');
  expect(reveal).toHaveClass('focus-within:opacity-100');
  tab.focus();
  for (let index = 0; index < 12 && document.activeElement !== tools.getByRole('button', { name: '구간 선택' }); index++) await user.tab();
  expect(tools.getByRole('button', { name: '구간 선택' })).toHaveFocus();
  expect(order()).toEqual(before);
  const chart = screen.getByRole('region', { name: 'Trend' });
  expect(chart.querySelector('footer')).toHaveTextContent('지표 버전 v1');
  expect(within(chart).queryByRole('toolbar')).toBeNull();
  const plot = (await within(chart).findByRole('img', { name: 'plot' })).parentElement!;
  const description = document.getElementById(plot.getAttribute('aria-describedby')!);
  expect(head).toContainElement(description);
  expect(plot).toHaveAccessibleDescription(/Chart description 클릭으로 선택.*구간 선택을 켠 뒤 끌기/);
  act(() => { plot.focus(); });
  expect(reveal).toHaveAttribute('data-revealed');
  act(() => { plot.blur(); });
  expect(reveal).not.toHaveAttribute('data-revealed');
  fireEvent.pointerOver(plot);
  expect(reveal).toHaveAttribute('data-revealed');
  fireEvent.pointerOut(plot);
  expect(reveal).not.toHaveAttribute('data-revealed');
});

it.each(['frame', 'heatmap'] as const)('keeps the body toolbars when another %s shares the pane', async companion => {
  mount(companion);
  await screen.findAllByRole('img', { name: 'plot' });
  for (const title of ['Trend', 'Distribution']) {
    expect(within(screen.getByRole('region', { name: title })).getByRole('toolbar')).toBeTruthy();
  }
  expect(screen.getByRole('tab', { name: '패널 a' }).closest('.dv-tabs-and-actions-container')?.querySelector('[data-dock-chart-tools]')).toBeNull();
});

it('opens the combined More from the pane tab and lets keyboard users select a layout action', async () => {
  const user = userEvent.setup();
  const onMaximize = vi.fn();
  mount(undefined, onMaximize);
  const tab = await screen.findByRole('tab', { name: '패널 a' });
  const head = within(tab.closest<HTMLElement>('.dv-tabs-and-actions-container')!);
  expect(await head.findAllByRole('button', { name: '더보기' })).toHaveLength(1);
  expect(head.queryByRole('button', { name: '패널 a 동작' })).toBeNull();
  expect(head.getByRole('button', { name: '차트 설명' })).toHaveAccessibleDescription(/Chart description 클릭으로 선택.*구간 선택을 켠 뒤 끌기/);
  act(() => { tab.focus(); });
  await user.keyboard('{Shift>}{F10}{/Shift}');
  const popup = await screen.findByRole('dialog', { name: '더보기' });
  const point = within(popup).getByRole('combobox', { name: '차트 지점 선택' });
  await waitFor(() => { expect(point).toHaveFocus(); });
  await user.keyboard('{Escape}');
  await waitFor(() => { expect(tab).toHaveFocus(); });
  await user.keyboard('{ContextMenu}');
  const reopened = await screen.findByRole('dialog', { name: '더보기' });
  const layout = within(reopened).getByRole('group', { name: '배치' });
  const maximize = within(layout).getByRole('button', { name: '패널 a 최대화' });
  await waitFor(() => { expect(within(reopened).getByRole('combobox')).toHaveFocus(); });
  for (let index = 0; index < 8 && document.activeElement !== maximize; index++) await user.tab();
  expect(maximize).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(onMaximize).toHaveBeenCalledWith(true);
  await waitFor(() => { expect(reopened).not.toBeInTheDocument(); });
});

it('keeps the pane action trigger when two frames share the pane', async () => {
  mount('frame');
  const tab = await screen.findByRole('tab', { name: '패널 a' });
  expect(within(tab.closest<HTMLElement>('.dv-tabs-and-actions-container')!).getByRole('button', { name: '패널 a 동작' })).toBeVisible();
});

it.each(['timeline', 'track'] as const)('counts a companion %s and keeps the Frame toolbar inline', async companion => {
  const context = {
    setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), save: vi.fn(), restore: vi.fn(),
    rect: vi.fn(), clip: vi.fn(), setLineDash: vi.fn(), measureText: () => ({ width: 10 }),
  };
  const canvas = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  onTestFinished(() => { canvas.mockRestore(); });
  mount(companion);
  const frame = await screen.findByRole('region', { name: 'Trend' });
  expect(within(frame).getByRole('toolbar')).toBeInTheDocument();
  const tab = screen.getByRole('tab', { name: '패널 a' });
  expect(tab.closest('.dv-tabs-and-actions-container')?.querySelector('[data-dock-chart-tools]')).toBeNull();
});

it('tracks the retained pane while its chart count moves between one and two', async () => {
  let setCompanion!: (show: boolean) => void;
  function Body() {
    const [companion, setShown] = useState(false);
    useEffect(() => { setCompanion = setShown; }, []);
    return <>
      <button>Pane tool outside the chart</button>
      <AnalysisChartFrame chartId="first" title="Trend" unit="s" series={[]} xType="category" />
      {companion && <AnalysisChartFrame chartId="second" title="Companion" unit="s" series={[]} xType="category" />}
    </>;
  }
  const view = mountDock({ layout: group(['a']), mergeChartHead: true, inner: () => <Body /> });
  const tab = await screen.findByRole('tab', { name: '패널 a' });
  const head = tab.closest('.dv-tabs-and-actions-container')!;
  const tools = () => head.querySelector('[data-dock-chart-tools]');
  const retained = screen.getByRole('region', { name: 'Trend' });
  const paneTool = screen.getByRole('button', { name: 'Pane tool outside the chart' });

  act(() => { paneTool.focus(); });
  expect(tools()).toHaveAttribute('data-revealed');
  act(() => { setCompanion(true); });
  expect(tools()).toBeNull();
  act(() => { tab.focus(); });
  act(() => { setCompanion(false); });
  expect(tools()).not.toHaveAttribute('data-revealed');

  act(() => { setCompanion(true); });
  act(() => { paneTool.focus(); });
  act(() => { setCompanion(false); });
  expect(tools()).toHaveAttribute('data-revealed');
  expect(screen.getByRole('region', { name: 'Trend' })).toBe(retained);

  view.controls.setLayout(group(['a', 'b'], 'b'));
  view.controls.setLayout(group(['a']));
  expect(screen.getByRole('region', { name: 'Trend' })).toBe(retained);
  expect(view.container.querySelector('[data-dock-chart-tools]')).not.toHaveAttribute('data-revealed');
});

it('refits the mounted chart options when the owning strip crosses 480px in both directions', async () => {
  let width = 700;
  const mounts = vi.fn();
  function Options() {
    useEffect(mounts, []);
    return <PanelOptions options={[{ id: 'stack', pageKey: 'stack', kind: 'toggle',
      label: { ko: '쌓기', en: 'Stack' }, on: { ko: '켬', en: 'On' }, off: { ko: '끔', en: 'Off' } }]}
      values={{ stack: true }} onChange={vi.fn()} />;
  }
  const measure = HTMLElement.prototype.getBoundingClientRect;
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.matches('.dv-tabs-and-actions-container') ? { ...measure.call(this), width } : measure.call(this);
  });
  try {
    mountDock({ layout: group(['a']), mergeChartHead: true, inner: () => <AnalysisChartFrame
      chartId="first" title="Trend" unit="s" series={[]} xType="category" toolbarStart={<Options />} /> });
    const tab = await screen.findByRole('tab', { name: '패널 a' });
    const strip = tab.closest('.dv-tabs-and-actions-container')!;
    const options = () => strip.querySelector('[data-panel-options]');
    expect(options()).toHaveAttribute('data-panel-options', 'inline');
    const mountedAtDesktopWidth = mounts.mock.calls.length;
    width = 479;
    observer.touch(target => target === strip, width);
    expect(options()).toHaveAttribute('data-panel-options', 'folded');
    width = 480;
    observer.touch(target => target === strip, width);
    expect(options()).toHaveAttribute('data-panel-options', 'inline');
    expect(mounts).toHaveBeenCalledTimes(mountedAtDesktopWidth);
  } finally {
    rect.mockRestore();
  }
});

it('keeps the table toggle accessible and focused as its docked slot switches between icon and text', async () => {
  let stripWidth = 194;
  const measure = HTMLElement.prototype.getBoundingClientRect;
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.matches('.dv-tabs-and-actions-container') ? { ...measure.call(this), width: stripWidth } : measure.call(this);
  });
  onTestFinished(() => rect.mockRestore());
  mount();
  const tab = await screen.findByRole('tab', { name: '패널 a' });
  const strip = tab.closest<HTMLElement>('.dv-tabs-and-actions-container')!;
  const toggle = await within(strip).findByRole('button', { name: '표로 보기' });
  const tableSlot = (target: Element) => target.matches('[data-dock-chart-table-slot]');
  const textProbe = (target: Element) => target.matches('[data-dock-chart-table-probe]');

  observer.touch(textProbe, 86);
  observer.touch(tableSlot, 28);
  expect(toggle).toHaveTextContent(/^$/);
  expect(toggle).toHaveAccessibleName('표로 보기');
  expect(toggle).toHaveAttribute('title', '표로 보기');
  expect(toggle).toHaveAttribute('aria-pressed', 'false');
  act(() => { toggle.focus(); });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-pressed', 'true');

  stripWidth = 500;
  observer.touch(target => target === strip, stripWidth);
  observer.touch(tableSlot, 86);
  expect(toggle).toHaveTextContent('표로 보기');
  expect(toggle).toHaveFocus();
  expect(toggle).toHaveAttribute('aria-pressed', 'true');
});

it('ellipsizes a plain tab title and keeps docked start controls focus-visible inside their scrollport', async () => {
  mount();
  const tab = await screen.findByRole('tab', { name: '패널 a' });
  // A bare text node in the flex tab label clips without an ellipsis; its own truncating span draws one.
  const title = within(tab).getByText('패널 a');
  expect(title.parentElement).toHaveAttribute('data-dock-tab', 'a');
  expect(title).toHaveClass('min-w-0', 'truncate');
  const strip = tab.closest<HTMLElement>('.dv-tabs-and-actions-container')!;
  // The start slot scrolls horizontally, which also clips vertically, so its buttons draw the ring inside.
  // Forced colors drop the ring's shadow; the fallback outline must sit inside the button too.
  for (const clip of [strip.querySelector('[data-chart-toolbar-start]'), strip.querySelector('[data-dock-chart-table-slot] > div:last-child')]) {
    expect(clip).toHaveClass('[&_button:focus-visible]:ring-inset', 'forced-colors:[&_button:focus-visible]:-outline-offset-2');
  }
});

describe('when the first chart replaces the pane action trigger (#3095)', () => {
  let setLoaded!: (loaded: boolean) => void;
  function Body() {
    const [loaded, setShown] = useState(false);
    useEffect(() => { setLoaded = setShown; }, []);
    return <>
      <button>Pane tool outside the chart</button>
      {loaded ? <AnalysisChartFrame chartId="first" title="Trend" unit="s" series={[]} xType="category" /> : <p>Loading</p>}
    </>;
  }
  async function mountLoading() {
    mountDock({
      layout: group(['a']), mergeChartHead: true, inner: () => <Body />,
      props: {
        renderGroupActions: () => <WorkspaceGroupActions title="패널 a" titleOf={id => id}
          closeFocus={{ current: null }} menu={{ maximized: false, split: null, moves: [] }}
          onMaximize={vi.fn()} onSplit={vi.fn()} onMove={vi.fn()} />,
      },
    });
    const tab = await screen.findByRole('tab', { name: '패널 a' });
    return within(tab.closest<HTMLElement>('.dv-tabs-and-actions-container')!);
  }

  it('moves focus from the pane trigger to the merged More', async () => {
    const head = await mountLoading();
    act(() => { head.getByRole('button', { name: '패널 a 동작' }).focus(); });
    act(() => { setLoaded(true); });
    await waitFor(() => expect(head.getByRole('button', { name: '더보기' })).toHaveFocus());
    expect(head.queryByRole('button', { name: '패널 a 동작' })).toBeNull();
  });

  it('moves focus from the open pane menu to the merged More', async () => {
    const user = userEvent.setup();
    const head = await mountLoading();
    act(() => { head.getByRole('button', { name: '패널 a 동작' }).focus(); });
    await user.keyboard('{Enter}');
    const item = await screen.findByRole('menuitem', { name: '패널 a 최대화' });
    await waitFor(() => expect(document.activeElement?.closest('[role="menu"]')).toContainElement(item));
    act(() => { setLoaded(true); });
    await waitFor(() => expect(head.getByRole('button', { name: '더보기' })).toHaveFocus());
  });

  it('leaves focus where the user moved it before the swap', async () => {
    const head = await mountLoading();
    const paneTool = await screen.findByRole('button', { name: 'Pane tool outside the chart' });
    act(() => { head.getByRole('button', { name: '패널 a 동작' }).focus(); });
    act(() => { paneTool.focus(); });
    act(() => { setLoaded(true); });
    await screen.findByRole('region', { name: 'Trend' });
    await waitFor(() => expect(head.getByRole('button', { name: '더보기' })).toBeInTheDocument());
    expect(paneTool).toHaveFocus();
  });
});

// #3148: the pane's hover/focus state (it reveals the merged head's tools) lived next to the panel's render call, so every pointer
// entering or leaving the pane re-ran the menu's render. A menu that builds its chart props inline then handed the Frame new arrays,
// the option was rebuilt and ECharts replayed its draw animation on each hover.
it('does not re-run the panel render when the pointer enters or leaves the pane', async () => {
  const renders = vi.fn();
  mountDock({
    layout: group(['a']),
    mergeChartHead: true,
    inner: () => { renders(); return <AnalysisChartFrame chartId="first" title="Trend" unit="s" series={[{ id: 's', name: 'Series', color: 'chart-blue', points: [['A', 1]] }]} xType="category" />; },
  });
  const plot = (await screen.findByRole('img', { name: 'plot' })).parentElement!;
  const reveal = screen.getByRole('tab', { name: '패널 a' }).closest('.dv-tabs-and-actions-container')!.querySelector('[data-dock-chart-tools]')!;
  const before = renders.mock.calls.length;
  fireEvent.pointerOver(plot);
  expect(reveal).toHaveAttribute('data-revealed');
  fireEvent.pointerOut(plot);
  act(() => { plot.focus(); });
  act(() => { plot.blur(); });
  expect(renders).toHaveBeenCalledTimes(before);
});

// #3148: the memo keys on `render`. A consumer whose content follows a value outside the panel (not a context) still updates, both when it
// builds `render` inline and when it memoizes it with that value as a dependency: the new value always arrives as a new `render`.
it.each(['inline', 'useCallback'] as const)('still re-renders a panel whose %s render reads parent state', async pattern => {
  let bump = () => {};
  function Host() {
    const [count, setCount] = useState(0);
    bump = () => { setCount(value => value + 1); };
    const memoized = useCallback(() => <p>count {count}</p>, [count]);
    const panelRender = pattern === 'inline' ? () => <p>count {count}</p> : memoized;
    return <DockLayoutBase mergeChartHead panels={[{ id: 'a', title: '패널 a', render: panelRender }]} layout={group(['a'])} maximizedPanelId={null}
      onLayoutChange={() => {}} onActivate={() => {}} onMaximizedChange={() => {}} label="테스트 배치" minPanelSize={{ width: 20, height: 20 }}
      separatorLabel={() => 'sep'} />;
  }
  render(<I18nProvider><Host /></I18nProvider>);
  expect(await screen.findByText('count 0')).toBeTruthy();
  act(() => { bump(); });
  expect(await screen.findByText('count 1')).toBeTruthy();
});
