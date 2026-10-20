import { mount as mountChart } from './__tests__/test-support';
import { useEffect } from 'react';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { EChartProps } from './EChart';

let props: EChartProps;
let armed = false;
let rect = { width: 600, height: 240 };
let currentOption: EChartProps['option'];
const selected = (indices: number[]) => props.onEvents?.brushselected?.({ batch: [{ selected: [{ seriesIndex: 0, dataIndex: indices }] }] }, instance as never);
const instance = {
  isDisposed: () => false,
  getModel: () => ({ getComponent: () => ({ coordinateSystem: { getRect: () => rect } }) }),
  dispatchAction: vi.fn((action: { type: string; key?: string; brushOption?: { brushType: string | false } }, options?: { silent?: boolean }) => {
    if (action.type === 'takeGlobalCursor') {
      armed = action.key === 'brush' && action.brushOption?.brushType === 'rect';
      if (!options?.silent) {
        props.onEvents?.takeglobalcursor?.(action, instance as never);
        selected([]);
      }
    }
  }),
};
vi.mock('./EChartImpl', () => ({ default: MockImpl }));
function MockImpl(next: EChartProps) {
  props = next;
  useEffect(() => { next.onReady?.(instance as never); }, []);
  useEffect(() => {
    // Model replacement resets ECharts' brush cursor, then finishes layout.
    currentOption = next.option;
    armed = false;
    next.onEvents?.finished?.({}, instance as never);
  }, [next.option]);
  return <div role="img" aria-label={next.ariaLabel} />;
}
afterEach(() => { cleanup(); vi.clearAllMocks(); armed = false; rect = { width: 600, height: 240 }; });
const mount = () => mountChart({ kind: 'heatmap', xLabels: ['09', '10'], yLabels: ['A', 'B'], cells: [{ x: '09', y: 'A', value: 1 }, { x: '10', y: 'B', value: 2 }] }, false, true, false, false);
it('keeps rectangle mode across empty activation events, option replacement and repeated drags', async () => {
  mount(); await screen.findByRole('img');
  act(() => instance.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'rect' } }));
  await waitFor(() => expect(armed).toBe(true));
  const before = props.option;
  act(() => selected([]));
  expect(props.option).toBe(before);
  act(() => { if (armed) selected([0]); });
  act(() => props.onEvents?.brushEnd?.({}, instance as never));
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('1칸 선택');
  expect(armed).toBe(true);
  const after = props.option;
  act(() => selected([0]));
  expect(props.option).toBe(after);
  act(() => { if (armed) selected([0, 1]); });
  act(() => props.onEvents?.brushEnd?.({}, instance as never));
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('2칸 선택');
  fireEvent.click(screen.getByRole('button', { name: '표로 보기' }));
  expect(armed).toBe(true);
  act(() => instance.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: false } }));
  expect(armed).toBe(false);
});
it('sizes cells from the laid-out grid and recomputes after resize', async () => {
  mount(); await screen.findByRole('img');
  const size = () => (currentOption as { series: { symbolSize: number[] }[] }).series[0].symbolSize;
  await waitFor(() => expect(size()).toEqual([298, 118]));
  act(() => { rect = { width: 300, height: 120 }; props.onResize?.(400); });
  expect(size()).toEqual([148, 58]);
});

it('keeps the option unchanged during a drag and commits only the final selection on brushEnd', async () => {
  mount(); await screen.findByRole('img');
  const summary = screen.getByRole('region', { name: '선택 요약' });
  const before = props.option;
  for (const indices of [[0], [1], [0, 1]]) {
    act(() => selected(indices));
    expect(summary).toHaveTextContent('선택 없음');
    expect(props.option).toBe(before);
  }
  act(() => props.onEvents?.brushEnd?.({}, instance as never));
  expect(summary).toHaveTextContent('2칸 선택');
  const committed = props.option;
  act(() => selected([1, 0]));
  expect(props.option).toBe(committed);
  act(() => props.onEvents?.brushEnd?.({}, instance as never));
  expect(props.option).toBe(committed);
});

const mountScatter = () => mountChart({ kind: 'scatter', xUnit: 's', xLabel: 'X', yLabel: 'Y', points: [{ id: 'a', group: 'A', x: 1, y: 2 }, { id: 'null', group: 'A', x: null, y: 4 }, { id: 'b', group: 'B', x: 3, y: 4 }] }, false, true, false, false);
it('restores scatter rectangle cursor after lazy readiness, replacement and repeated grouped drags', async () => {
  mountScatter(); await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: '끌어서 선택' }));
  await waitFor(() => expect(armed).toBe(true));
  const before = props.option;
  act(() => selected([0]));
  expect(props.option).toBe(before);
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('선택 없음');
  act(() => props.onEvents?.brushEnd?.({}, instance as never));
  expect(armed).toBe(true);
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('a · 1개 선택');
  const committed = props.option;
  act(() => props.onEvents?.brushselected?.({ batch: [{ selected: [{ seriesIndex: 0, dataIndex: [0] }, { seriesIndex: 1, dataIndex: [0] }] }] }, instance as never));
  expect(props.option).toBe(committed);
  act(() => props.onEvents?.brushEnd?.({}, instance as never));
  expect(armed).toBe(true);
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('2개 선택');
  const final = props.option;
  act(() => props.onEvents?.brushselected?.({ batch: [{ selected: [{ seriesIndex: 1, dataIndex: [0] }, { seriesIndex: 0, dataIndex: [0] }] }] }, instance as never));
  act(() => props.onEvents?.brushEnd?.({}, instance as never));
  expect(props.option).toBe(final);
  act(() => instance.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: false } }));
  expect(armed).toBe(false);
});
