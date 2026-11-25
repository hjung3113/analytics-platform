import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnalysisChart } from '../../chart/AnalysisChart';
import { AnalysisChartFrame } from '../../chart/AnalysisChartFrame';
import { WorkspaceGroupActions } from '../../workspace/WorkspaceGroupActions';
import { group, installResizeObserver, mountDock } from './harness';

vi.mock('../../chart/EChartImpl', () => ({ default: () => <div role="img" aria-label="plot" /> }));

const series = [{ id: 's', name: 'Series', color: 'chart-blue', kind: 'bar', unit: 's', points: [['A', 1], ['B', 2]] }] as const;
let observer: ReturnType<typeof installResizeObserver>;
beforeEach(() => { observer = installResizeObserver(); });
afterEach(() => { cleanup(); observer.restore(); });

function mount(companion?: 'frame' | 'heatmap', onMaximize = vi.fn()) {
  mountDock({
    layout: group(['a']),
    inner: () => <>
      <AnalysisChartFrame chartId="first" title="Trend" description="Chart description" metricVersion="1"
        unit="s" series={series.map(item => ({ ...item, points: item.points.map(([key, value]): [string, number] => [key, value]) }))}
        xType="category" toolbarStart={<button>Stack mode</button>} />
      {companion === 'frame' && <AnalysisChartFrame chartId="first" title="Distribution" unit="s" series={[]} xType="category" />}
      {companion === 'heatmap' && <AnalysisChart chartId="second" title="Distribution" unit="s"
        spec={{ kind: 'heatmap', xLabels: ['A'], yLabels: ['B'], cells: [{ x: 'A', y: 'B', value: 1 }] }} />}
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
