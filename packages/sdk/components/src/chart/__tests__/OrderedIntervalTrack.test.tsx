import { I18nProvider } from '@ap/kernel';
import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OrderedIntervalTrack } from '../OrderedIntervalTrack';
import { ORDERED_TRACK_RESPONSE_LIMIT, type OrderedTrackItem } from '../orderedIntervalTypes';
const lanes = [
  { laneKey: 'a', label: 'Lane A' },
  { laneKey: 'b', label: 'Lane B' },
];
const states = { ok: { label: '완료', colorToken: 'chart-series-1' as const } };
const items: OrderedTrackItem[] = Array.from({ length: 25 }, (_, i) => ({
  id: String(i),
  laneKey: i === 24 ? 'b' : 'a',
  orderStart: i * 3,
  orderEnd: i * 3 + 2,
  state: 'ok',
  label: `항목 ${i}`,
}));
const base = { ariaLabel: 'Track', lanes, states, items, domain: [0, 100] as [number, number] };
const context = {
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  strokeRect: vi.fn(),
  fillText: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  setLineDash: vi.fn(),
  measureText: () => ({ width: 30 }),
  closePath: vi.fn(),
  fill: vi.fn(),
};
const mount = (props = {}) =>
  render(
    <I18nProvider>
      <OrderedIntervalTrack {...base} {...props} />
    </I18nProvider>,
  );
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerId = 1;
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('aborts superseded requests and ignores stale successes, even when the loader ignores abort', async () => {
  const pending: { signal: AbortSignal; resolve: (items: readonly OrderedTrackItem[]) => void }[] =
    [];
  const loader = vi.fn(
    (_from, _to, signal: AbortSignal) =>
      new Promise<readonly OrderedTrackItem[]>((resolve) => pending.push({ signal, resolve })),
  );
  const { unmount } = mount({ onRangeRequest: loader });
  fireEvent.click(screen.getByRole('button', { name: '확대' }));
  expect(pending[0].signal.aborted).toBe(true);
  await act(async () =>
    pending[1].resolve([
      { ...items[0], kind: 'interval', orderStart: 30, orderEnd: 40, label: 'Fresh' },
    ]),
  );
  await act(async () =>
    pending[0].resolve([
      { ...items[0], kind: 'interval', orderStart: 30, orderEnd: 40, label: 'Stale' },
    ]),
  );
  fireEvent.click(screen.getByRole('button', { name: '항목 목록' }));
  expect(screen.getByRole('list')).toHaveTextContent('Fresh');
  expect(screen.getByRole('list')).not.toHaveTextContent('Stale');
  unmount();
  expect(pending[1].signal.aborted).toBe(true);
});
it('retains dimmed items and aria-busy while requesting a range', () => {
  mount({ onRangeRequest: () => new Promise(() => {}) });
  expect(screen.getByRole('region', { name: 'Track' })).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByRole('img', { name: 'Track' }).closest('.opacity-50')).toHaveClass(
    'opacity-50',
  );
});
it('rejects responses above the documented performance limit and allows retry', async () => {
  const loader = vi.fn(async () =>
    Array.from({ length: ORDERED_TRACK_RESPONSE_LIMIT + 1 }, (_, i) => ({
      ...items[0],
      kind: 'interval',
      id: `too-${i}`,
    })),
  );
  mount({
    onRangeRequest: loader,
    state: { kind: 'ready', title: 'Range failed', body: 'Retry range', retryLabel: 'Retry' },
  });
  await screen.findByText('Range failed');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
});
it('moves by item and lane with keys, selects and clears, and supplies paged text with state names', () => {
  const onSelect = vi.fn();
  mount({ onSelect });
  const root = screen.getByRole('region', { name: 'Track' });
  fireEvent.keyDown(root, { key: 'ArrowRight' });
  fireEvent.keyDown(root, { key: 'Enter' });
  expect(onSelect).toHaveBeenLastCalledWith(items[1]);
  fireEvent.keyDown(root, { key: 'ArrowDown' });
  fireEvent.keyDown(root, { key: 'Enter' });
  expect(onSelect).toHaveBeenLastCalledWith(items[24]);
  fireEvent.keyDown(root, { key: 'Escape' });
  expect(onSelect).toHaveBeenLastCalledWith(null);
  fireEvent.click(screen.getByRole('button', { name: '항목 목록' }));
  expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(20);
  expect(screen.getByRole('list')).toHaveTextContent('완료');
  fireEvent.click(screen.getByRole('button', { name: '다음 쪽' }));
  expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(5);
});
it.each(['loading', 'empty', 'error', 'partial', 'forbidden', 'unsupported'] as const)(
  'frames consumer copy for %s and hides restricted content',
  (kind) => {
    mount({
      state: {
        kind,
        title: `State ${kind}`,
        body: 'Consumer reason',
        onRetry: vi.fn(),
        retryLabel: 'Retry',
      },
      trust: { source: 'Private source', updated: 'Now', coverage: 'All' },
    });
    expect(screen.getByText(`State ${kind}`)).toBeVisible();
    if (kind === 'forbidden' || kind === 'unsupported' || kind === 'empty')
      expect(screen.queryByRole('img')).toBeNull();
    if (kind === 'forbidden') expect(screen.queryByText('Private source')).toBeNull();
  },
);
it('uses pointer-following max-w-xs tooltip, dashed open cap, and no narrow-bar border', () => {
  mount({
    items: [{ ...items[0], kind: 'interval', orderStart: 0, orderEnd: undefined, carryover: true }],
  });
  const canvas = screen.getByRole('img');
  fireEvent.pointerMove(canvas, { clientX: 200, clientY: 12 });
  const tooltip = screen.getByRole('tooltip');
  expect(tooltip).toHaveClass('max-w-xs');
  expect(tooltip.style.width).toBe('');
  expect(tooltip).toHaveTextContent('종료 미확인');
  fireEvent.pointerMove(canvas, { clientX: 240, clientY: 12 });
  expect(tooltip.style.left).toBe('252px');
  expect(context.setLineDash).toHaveBeenCalledWith([2, 2]);
  cleanup();
  context.strokeRect.mockClear();
  mount({ items: [{ ...items[0], kind: 'interval', orderStart: 0, orderEnd: 0.1 }] });
  expect(context.strokeRect).not.toHaveBeenCalled();
});
it('supports keyboard brush and zoom while leaving unmodified wheel to native scrolling', () => {
  mount();
  const root = screen.getByRole('region', { name: 'Track' });
  fireEvent.keyDown(root, { key: 'ArrowRight', shiftKey: true });
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('선택 구간');
  fireEvent.click(screen.getByRole('button', { name: '선택 구간 확대' }));
  const wheel = new WheelEvent('wheel', { deltaY: 10, cancelable: true });
  screen.getByRole('img').dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(false);
});
it('draws only viewport lanes and scrolls without creating per-item DOM', () => {
  const manyLanes = Array.from({ length: 40 }, (_, i) => ({
    laneKey: `lane-${i}`,
    label: `Row ${i}`,
  }));
  const manyItems: OrderedTrackItem[] = manyLanes.map((lane) => ({
    id: lane.laneKey,
    laneKey: lane.laneKey,
    orderStart: 0,
    orderEnd: 100,
    state: 'ok',
    label: lane.label,
  }));
  mount({ lanes: manyLanes, items: manyItems, height: 48 });
  expect(context.fillRect.mock.calls.filter((call) => call[3] === 24)).toHaveLength(2);
  expect(context.fillText).toHaveBeenCalledWith('Row 0', 8, 16, 96);
  expect(context.fillText.mock.calls.some((call) => call[0] === 'Row 39')).toBe(false);
  context.fillRect.mockClear();
  const scroll = screen.getByRole('img').closest('[data-ordered-scroll]');
  if (!scroll) throw new Error('Missing chart scroll viewport');
  scroll.scrollTop = 888;
  fireEvent.scroll(scroll);
  expect(context.fillRect.mock.calls.filter((call) => call[3] === 24)).toHaveLength(2);
  expect(document.querySelectorAll('canvas')).toHaveLength(2);
});
it('merges dense points into the axis row and reveals state-coloured points after zoom', () => {
  const points: OrderedTrackItem[] = Array.from({ length: 100 }, (_, i) => ({
    id: `p${i}`,
    kind: 'point',
    laneKey: 'a',
    orderStart: i,
    state: 'ok',
    label: `Point ${i}`,
  }));
  mount({ items: points });
  // Only the keyboard focus point survives the density merge.
  expect(context.fill).toHaveBeenCalledTimes(1);
  context.fill.mockClear();
  for (let i = 0; i < 12; i++) fireEvent.click(screen.getByRole('button', { name: '확대' }));
  expect(context.fill.mock.calls.length).toBeGreaterThan(1);
});
it('selects a hit, cancels pointer drags, and offers pointer brush alongside keyboard brush', () => {
  const onSelect = vi.fn();
  mount({ onSelect });
  const canvas = screen.getByRole('img');
  fireEvent.pointerDown(canvas, { clientX: 205, clientY: 12, button: 0 });
  fireEvent.pointerUp(canvas, { clientX: 205, clientY: 12 });
  expect(onSelect).toHaveBeenLastCalledWith(items[6]);
  onSelect.mockClear();
  fireEvent.pointerDown(canvas, { clientX: 205, clientY: 12, button: 0 });
  fireEvent.pointerCancel(canvas);
  fireEvent.pointerUp(canvas, { clientX: 205, clientY: 12 });
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '구간 선택' }));
  fireEvent.pointerDown(canvas, { clientX: 205, clientY: 12, button: 0 });
  fireEvent.pointerUp(canvas, { clientX: 350, clientY: 12 });
  expect(screen.getByRole('button', { name: '선택 구간 확대' })).toBeVisible();
});
it('retries a consumer error with the current range without an onRetry callback', async () => {
  const loader = vi.fn(async () => items);
  mount({ state: { kind: 'error', title: 'Consumer failure' }, onRangeRequest: loader });
  expect(loader).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '확대' }));
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  await waitFor(() => expect(loader).toHaveBeenCalledWith(10, 90, expect.any(AbortSignal)));
  await waitFor(() => expect(screen.queryByText('Consumer failure')).toBeNull());
  expect(screen.getByRole('region', { name: 'Track' })).toHaveAttribute('aria-busy', 'false');
});
it('clears cancelled loading when a consumer error interrupts a request and retries it', async () => {
  const pending: {
    signal: AbortSignal;
    resolve: (value: readonly OrderedTrackItem[]) => void;
  }[] = [];
  const loader = vi.fn(
    (_from, _to, signal: AbortSignal) =>
      new Promise<readonly OrderedTrackItem[]>((resolve) => pending.push({ signal, resolve })),
  );
  const { rerender } = mount({ onRangeRequest: loader });
  rerender(
    <I18nProvider>
      <OrderedIntervalTrack
        {...base}
        onRangeRequest={loader}
        state={{ kind: 'error', title: 'Interrupted' }}
      />
    </I18nProvider>,
  );
  expect(pending[0].signal.aborted).toBe(true);
  expect(screen.getByRole('region', { name: 'Track' })).toHaveAttribute('aria-busy', 'false');
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  expect(loader).toHaveBeenCalledTimes(2);
  await act(async () => pending[1].resolve(items));
  expect(screen.queryByText('Interrupted')).toBeNull();
});
it('never submits the containing form from toolbar, help, retry, list, paging or brush buttons', () => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
  render(
    <I18nProvider>
      <form onSubmit={submit}>
        <OrderedIntervalTrack
          {...base}
          formatTime={String}
          state={{ kind: 'error', title: 'Failed', onRetry: vi.fn() }}
        />
      </form>
    </I18nProvider>,
  );
  for (const name of [
    '조작 방법',
    '다시 시도',
    '시간 라벨',
    '확대',
    '축소',
    '확대 초기화',
    '구간 선택',
    '항목 목록',
    '다음 쪽',
    '이전 쪽',
  ]) {
    const button = screen.getByRole('button', { name });
    fireEvent.click(button);
    expect(submit, name).not.toHaveBeenCalled();
    expect(button, name).toHaveAttribute('type', 'button');
  }
  const item = within(screen.getByRole('list')).getAllByRole('button')[0];
  fireEvent.click(item);
  expect(item).toHaveAttribute('type', 'button');
  fireEvent.keyDown(screen.getByRole('region', { name: 'Track' }), {
    key: 'ArrowRight',
    shiftKey: true,
  });
  const zoom = screen.getByRole('button', { name: '선택 구간 확대' });
  fireEvent.click(zoom);
  expect(zoom).toHaveAttribute('type', 'button');
  expect(submit).not.toHaveBeenCalled();
});
it('redraws both canvases when DPR changes at fixed CSS width and cleans the resolution listener', () => {
  const subscriptions: { callback?: () => void; remove: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal('devicePixelRatio', 1);
  const matchMedia = vi.fn(() => {
    const subscription = { callback: undefined as (() => void) | undefined, remove: vi.fn() };
    subscriptions.push(subscription);
    return {
      addEventListener: (_event: string, callback: () => void) => {
        subscription.callback = callback;
      },
      removeEventListener: subscription.remove,
    };
  });
  vi.stubGlobal('matchMedia', matchMedia);
  const { unmount } = mount();
  expect(Array.from(document.querySelectorAll('canvas'), (canvas) => canvas.width)).toEqual([
    600, 600,
  ]);
  vi.stubGlobal('devicePixelRatio', 2);
  act(() => subscriptions[0]?.callback?.());
  expect(Array.from(document.querySelectorAll('canvas'), (canvas) => canvas.width)).toEqual([
    1200, 1200,
  ]);
  expect(matchMedia).toHaveBeenLastCalledWith('(resolution: 2dppx)');
  expect(subscriptions[0].remove).toHaveBeenCalledWith('change', expect.any(Function));
  unmount();
  expect(subscriptions[1].remove).toHaveBeenCalledWith('change', expect.any(Function));
});
it('shades only declared visible partial gaps and describes their ranges in the text alternative', () => {
  mount({
    partialGaps: [
      { orderStart: 60, orderEnd: 120 },
      { orderStart: -30, orderEnd: -10 },
      { orderStart: 30, orderEnd: 20 },
    ],
    state: { kind: 'partial', title: 'Partial' },
  });
  expect(context.fillRect).toHaveBeenCalledWith(404.8, 0, 195.2, 288);
  expect(context.fillText.mock.calls.some((call) => call[0] === '미수신')).toBe(true);
  expect(document.querySelector('output')).toHaveTextContent('미수신: 60–100');
  expect(document.querySelector('output')).not.toHaveTextContent('-30');
  fireEvent.click(screen.getByRole('button', { name: '항목 목록' }));
  expect(screen.getByRole('list')).toHaveAccessibleDescription(
    expect.stringContaining('미수신: 60–100'),
  );
});
it('includes declared marker labels, kinds and order positions for only the current range', () => {
  mount({
    initialView: [20, 80],
    markers: [
      { kind: 'boundary', label: 'File B', order: 40 },
      { kind: 'inversion', label: 'Clock reversal', order: 45 },
      { kind: 'boundary', label: 'Outside', order: 90 },
    ],
  });
  expect(screen.getByRole('status')).toHaveTextContent('파일 경계 · File B · 40');
  expect(screen.getByRole('status')).toHaveTextContent('시간 역전 · Clock reversal · 45');
  expect(screen.getByRole('status')).not.toHaveTextContent('Outside');
  fireEvent.click(screen.getByRole('button', { name: '항목 목록' }));
  expect(screen.getByRole('list')).toHaveAccessibleDescription(
    expect.stringContaining('Clock reversal · 45'),
  );
});
it('shows visible loading text next to the range summary while retaining busy items', () => {
  mount({ onRangeRequest: () => new Promise(() => {}) });
  expect(screen.getByRole('region', { name: 'Track' })).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByText('불러오는 중')).toBeVisible();
  expect(screen.getByText('불러오는 중').parentElement).toHaveTextContent('0–100');
});
it('keeps the item tooltip outside paint containment with a stable token width', () => {
  render(
    <I18nProvider>
      <div style={{ contain: 'paint' }} data-testid="paint">
        <OrderedIntervalTrack {...base} />
      </div>
    </I18nProvider>,
  );
  fireEvent.pointerMove(screen.getByRole('img'), { clientX: 115, clientY: 12 });
  const tooltip = screen.getByRole('tooltip');
  expect(screen.getByTestId('paint')).not.toContainElement(tooltip);
  expect(tooltip).toHaveClass('w-80', 'max-w-xs');
});
it.each(['interval', 'point'] as const)(
  'separates the selected %s outline from the state fill with a wider neutral halo',
  (kind) => {
    const strokes: { color: string | CanvasGradient | CanvasPattern; width: number }[] = [];
    const record = () =>
      strokes.push({
        color: (context as unknown as CanvasRenderingContext2D).strokeStyle,
        width: (context as unknown as CanvasRenderingContext2D).lineWidth,
      });
    context.stroke.mockImplementation(record);
    context.strokeRect.mockImplementation(record);
    mount({
      items: [{ ...items[0], kind, orderEnd: kind === 'point' ? undefined : 30 }],
      selectedId: '0',
    });
    const index = strokes.findIndex(
      (stroke) => stroke.width === 6 && stroke.color === 'rgb(251,253,255)',
    );
    expect(index).toBeGreaterThanOrEqual(0);
    expect(strokes[index + 1]).toEqual({ color: 'rgb(20,40,160)', width: 2 });
  },
);
it('draws the same distinct keyboard focus marker for points and intervals independently of selection', () => {
  mount({
    items: [
      { ...items[0], orderEnd: 30 },
      { ...items[1], kind: 'point', orderEnd: undefined },
    ],
  });
  expect(context.fillText.mock.calls.some((call) => call[0] === '▾' && call[2] === 8)).toBe(
    true,
  );
  context.fillText.mockClear();
  fireEvent.keyDown(screen.getByRole('region', { name: 'Track' }), { key: 'ArrowRight' });
  expect(context.fillText.mock.calls.some((call) => call[0] === '▾' && call[2] === 8)).toBe(
    true,
  );
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('선택 없음');
});
it('does not suppress a new consumer error after retrying an internal loader failure', async () => {
  const loader = vi.fn().mockRejectedValueOnce(new Error('Failed')).mockResolvedValue(items);
  const { rerender } = mount({ onRangeRequest: loader });
  await screen.findByText('구간 불러오기 실패');
  fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Track' })).toHaveAttribute('aria-busy', 'false'),
  );
  rerender(
    <I18nProvider>
      <OrderedIntervalTrack
        {...base}
        onRangeRequest={loader}
        state={{ kind: 'error', title: 'New failure' }}
      />
    </I18nProvider>,
  );
  expect(screen.getByText('New failure')).toBeVisible();
  expect(loader).toHaveBeenCalledTimes(2);
});
