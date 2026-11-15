import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { mount } from './test-support';
import type { HeatmapSpec } from '../AnalysisChart';
import type { EChartProps } from '../EChart';

let plot: EChartProps;
vi.mock('../EChartImpl', () => ({ default: (props: EChartProps) => { plot = props; return <div role="img" />; } }));
afterEach(cleanup);
const heat: HeatmapSpec = { kind: 'heatmap', xLabels: ['X', 'empty'], yLabels: ['Y'], cells: [{ x: 'X', y: 'Y', value: 0, status: { tone: 'danger', label: 'High' } }] };
const gesture = (name: 'click' | 'dblclick', params = { componentType: 'series', seriesIndex: 0, dataIndex: 0 }) => act(() => plot.onEvents?.[name]?.(params, {} as never));

it('activates on click while keeping selection and Details separate', async () => {
  const onActivate = vi.fn(); const onCellClick = vi.fn();
  mount({ ...heat, cellActivation: { on: 'click', onActivate }, onCellClick });
  await screen.findByRole('img'); gesture('click');
  expect(onActivate).toHaveBeenCalledExactlyOnceWith('X', 'Y');
  const selection = screen.getByRole('region', { name: '선택 요약' });
  expect(selection).toHaveTextContent('1칸 선택'); expect(onCellClick).not.toHaveBeenCalled();
  fireEvent.click(within(selection).getByRole('button', { name: '상세' }));
  expect(onCellClick).toHaveBeenCalledExactlyOnceWith('X', 'Y'); expect(onActivate).toHaveBeenCalledTimes(1);
});
it('selects on single click and activates only on double click', async () => {
  const onActivate = vi.fn(); mount({ ...heat, cellActivation: { on: 'dblclick', onActivate } });
  await screen.findByRole('img'); gesture('click');
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('1칸 선택');
  expect(onActivate).not.toHaveBeenCalled(); gesture('dblclick');
  expect(onActivate).toHaveBeenCalledExactlyOnceWith('X', 'Y');
});
it('keeps Details-only behavior without cellActivation', async () => {
  const onCellClick = vi.fn(); mount({ ...heat, onCellClick }); await screen.findByRole('img');
  gesture('click'); gesture('dblclick'); expect(onCellClick).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: '선택 지점 실행' })).toBeNull();
});
it.each(['click', 'dblclick'] as const)('ignores empty coordinates and silent status series for %s', async on => {
  const onActivate = vi.fn(); mount({ ...heat, cellActivation: { on, onActivate } }); await screen.findByRole('img');
  gesture(on, { componentType: 'grid', seriesIndex: 0, dataIndex: 0 });
  gesture(on, { componentType: 'series', seriesIndex: 0, dataIndex: 20 });
  gesture(on, { componentType: 'series', seriesIndex: 1, dataIndex: 0 });
  gesture(on, { componentType: 'series', seriesIndex: 2, dataIndex: 0 });
  expect(onActivate).not.toHaveBeenCalled();
});
it.each(['click', 'dblclick'] as const)('activates a table-selected cell with Enter for %s', async on => {
  const user = userEvent.setup(); const onActivate = vi.fn();
  mount({ ...heat, cellActivation: { on, onActivate } }); await screen.findByRole('img');
  const activate = screen.getByRole('button', { name: '선택 지점 실행' }); expect(activate).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '표로 보기' }));
  await user.tab(); expect(screen.getByRole('checkbox')).toHaveFocus(); await user.keyboard(' ');
  expect(activate).toBeEnabled(); activate.focus(); await user.keyboard('{Enter}');
  expect(onActivate).toHaveBeenCalledExactlyOnceWith('X', 'Y');
});
it('does not activate while rectangle selection is enabled', async () => {
  const onActivate = vi.fn(); mount({ ...heat, cellActivation: { on: 'click', onActivate } }); await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '끌어서 선택' })); gesture('click');
  expect(onActivate).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: '선택 지점 실행' })).toBeDisabled();
});
