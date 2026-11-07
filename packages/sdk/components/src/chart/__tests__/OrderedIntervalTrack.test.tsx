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
