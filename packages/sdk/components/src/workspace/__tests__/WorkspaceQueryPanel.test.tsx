import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { I18nProvider, type QueryState } from '@ap/kernel';
import type { ApiResponse } from '@ap/contracts';
import { AnalysisChartFrame } from '../../chart/AnalysisChartFrame';
import { group, installResizeObserver } from '../../dock/__tests__/harness';
import { QueryBarStatusContext } from '../../filters/QueryBarStatus';
import { QueryView } from '../../StateView';
import { PanelWorkspace } from '../PanelWorkspace';

vi.mock('../../chart/EChartImpl', () => ({ default: () => <div role="img" aria-label="plot" /> }));

let observer: ReturnType<typeof installResizeObserver>;
beforeEach(() => { observer = installResizeObserver(); observer.resize(1200, 600); });
afterEach(() => { cleanup(); vi.useRealTimers(); observer.restore(); });

const title = { ko: '추세', en: 'Trend' };
const panel = { title: title.ko, kind: 'chart', height: 800 } as const;
const presets = [{ id: 'fit', label: title, layout: group(['trend']) }];
const ok: ApiResponse<string> = { outcome: 'ok', data: '결과 A', assessments: [], trust: null, correlationId: 'ok' };
const error: ApiResponse<string> = { ...ok, outcome: 'error', data: null, correlationId: 'error', recovery: { retryable: true } };
const query = (status: QueryState<string>['status'], response: ApiResponse<string> | null = null): QueryState<string> =>
  ({ status, response, refetch: vi.fn(), missing: [], completedAt: null });

async function mount(initial: QueryState<string>, { chart = false } = {}) {
  const editorFocus = vi.fn();
  const editor = { report: vi.fn(), status: null, editorFocus };
  const view = (value: QueryState<string>) => <I18nProvider><QueryBarStatusContext.Provider value={editor}>
    <PanelWorkspace panels={[{ id: 'trend', title, primary: true, render: () => <QueryView query={value} panel={panel}>
      {data => <><button type="button">{data}</button>{chart && <AnalysisChartFrame chartId="trend" title="차트" unit="s" series={[]} xType="category"
        extraActions={<button type="button">선택 적용</button>} />}</>}
    </QueryView> }]} presets={presets} initialPreset="fit" initialMode="fit" persistKey="query-panel" label={title} />
  </QueryBarStatusContext.Provider></I18nProvider>;
  const mounted = render(view(initial));
  const tab = await screen.findByRole('tab', { name: title.ko });
  const dockPanel = (await screen.findByRole('button', { name: '결과 A' })).closest<HTMLElement>('[data-dock-panel]')!;
  const head = within(tab.closest('.dv-tabs-and-actions-container') as HTMLElement);
  const more = () => head.getByRole('button', { name: '추세 동작' });
  const narrow = () => observer.touch(target => dockPanel.contains(target), 320);
  return { dockPanel, head, more, narrow, editorFocus, update: (value: QueryState<string>) => mounted.rerender(view(value)) };
}

it('draws the chart skeleton in the retained dock body and moves focus there if the result leaves', async () => {
  const { dockPanel, update } = await mount(query('done', ok));
  const result = within(dockPanel).getByRole('button', { name: '결과 A' });
  act(() => result.focus());
  update(query('loading'));
  const skeleton = within(dockPanel).getByRole('status', { name: '불러오는 중…' });
  expect(skeleton.querySelectorAll('.bg-border-row')).toHaveLength(6);
  const plot = skeleton.parentElement;
  expect(plot).toHaveClass('flex-1', 'min-h-0');
  expect(plot?.style.minHeight).toBe('');
  expect(within(dockPanel).getByRole('region', { name: title.ko })).toHaveFocus();
  update(query('done', ok));
  expect(plot).toContainElement(within(dockPanel).getByRole('button', { name: '결과 A' }));
});

it('dims the retained result of a refetch and announces it from the existing dock head', async () => {
  const { dockPanel, head, update } = await mount(query('done', ok));
  const result = within(dockPanel).getByRole('button', { name: '결과 A' });
  act(() => result.focus());
  update(query('refreshing', ok));
  expect(result.parentElement).toHaveClass('opacity-40', 'grayscale');
  expect(result).toHaveFocus();
  expect(head.getByRole('status')).toHaveTextContent('같은 조건으로 갱신 중');
  expect(within(dockPanel).queryByRole('button', { name: '추세 더보기' })).toBeNull();
});

it('shows elapsed and slow notices at 3s and 10s and puts both actions in the narrow dock menu', async () => {
  const { head, more, narrow, editorFocus, update } = await mount(query('done', ok));
  narrow();
  vi.useFakeTimers();
  const cancel = vi.fn();
  update({ ...query('refreshing', ok), cancel });
  act(() => vi.advanceTimersByTime(2999));
  expect(head.queryByText('조회 중 · 3초')).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(head.getByText('조회 중 · 3초')).toBeVisible();
  act(() => vi.advanceTimersByTime(6999));
  expect(head.queryByText('오래 걸립니다')).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(head.getByRole('status')).toHaveTextContent('오래 걸립니다');
  expect(head.queryByRole('button', { name: '취소' })).toBeNull();
  vi.useRealTimers();
  const user = userEvent.setup();
  for (const [label, action] of [['조건 좁히기', editorFocus], ['취소', cancel]] as const) {
    act(() => more().focus());
    await user.keyboard('{Enter}');
    const item = screen.getByRole('menuitem', { name: label });
    act(() => item.focus());
    await user.keyboard('{Enter}');
    expect(action).toHaveBeenCalledOnce();
  }
});

it.each([1200, 320])('keeps first-error details in the head and keyboard recovery reachable at %i px', async width => {
  const { dockPanel, head, more, narrow, update } = await mount(query('done', ok));
  if (width === 320) narrow();
  const failure = query('done', error);
  update(failure);
  expect(head.getByRole('button', { name: '불러오지 못함' })).toBeVisible();
  const user = userEvent.setup();
  if (width === 320) {
    expect(head.queryByRole('button', { name: '다시 시도' })).toBeNull();
    act(() => more().focus());
    await user.keyboard('{Enter}');
    act(() => screen.getByRole('menuitem', { name: '다시 시도' }).focus());
  } else {
    act(() => head.getByRole('button', { name: '다시 시도' }).focus());
  }
  await user.keyboard('{Enter}');
  expect(failure.refetch).toHaveBeenCalledOnce();
  expect(within(dockPanel).getByRole('region', { name: title.ko })).toHaveFocus();
});

it('keeps the merged chart More usable while the previous selection is inert', async () => {
  const { dockPanel, head, narrow, update } = await mount(query('done', ok), { chart: true });
  const more = await head.findByRole('button', { name: '더보기' });
  const cancel = vi.fn();
  narrow();
  vi.useFakeTimers();
  update({ ...query('refreshing', ok), showingPrevious: true, cancel });
  act(() => vi.advanceTimersByTime(10_000));
  vi.useRealTimers();
  const user = userEvent.setup();
  expect(head.getByRole('button', { name: '더보기' })).toBe(more);
  act(() => more.focus());
  await user.keyboard('{Enter}');
  const menu = within(screen.getByRole('dialog', { name: '더보기' }));
  expect(menu.queryByRole('button', { name: '선택 적용' })).toBeNull();
  act(() => menu.getByRole('button', { name: '취소' }).focus());
  await user.keyboard('{Enter}');
  expect(cancel).toHaveBeenCalledOnce();
  expect(within(dockPanel).getByRole('region', { name: title.ko })).toHaveFocus();
});
