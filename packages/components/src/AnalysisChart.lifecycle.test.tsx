import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import type { EChartProps } from './EChart';
import { AnalysisChart } from './AnalysisChart';

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
function mount() {
  window.history.replaceState(null, '', '/?v=1&scopeId=MEM');
  const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: 'overview', label: { ko: 'G', en: 'G' }, icon: House, space: 'analytics' }], menus: [{ id: 'home', group: 'overview', primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: false, compare: false, annotate: false, savedView: false }, pageKeys: [] }] });
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })}>
    <AnalysisChart chartId="test" title="Chart" unit="ea" spec={{ kind: 'heatmap', xLabels: ['09', '10'], yLabels: ['A', 'B'], cells: [{ x: '09', y: 'A', value: 1 }, { x: '10', y: 'B', value: 2 }] }} />
  </PlatformProvider></I18nProvider>);
}
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
