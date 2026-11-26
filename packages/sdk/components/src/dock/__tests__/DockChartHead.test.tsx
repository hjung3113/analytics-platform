import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useEffect, useState } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest';
import { AnalysisChart } from '../../chart/AnalysisChart';
import { AnalysisChartFrame } from '../../chart/AnalysisChartFrame';
import { LaneTimeline } from '../../chart/LaneTimeline';
import { OrderedIntervalTrack } from '../../chart/OrderedIntervalTrack';
import { PanelOptions } from '../../workspace/PanelOptions';
import { WorkspaceGroupActions } from '../../workspace/WorkspaceGroupActions';
import { group, installResizeObserver, mountDock } from './harness';

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
