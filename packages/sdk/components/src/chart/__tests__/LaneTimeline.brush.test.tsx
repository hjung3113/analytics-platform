import { I18nProvider } from '@ap/kernel';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LaneTimeline, type LaneTimelineProps } from '../LaneTimeline';

// #1860: the opt-in range brush. Default width 600px, gutter 112px → plot 488px; the domain is [0, 488 min] so 1px = 1 minute (U).
const U = 60_000;
const lanes = [{ id: 'a', label: 'A', segments: [{ id: 'x', start: 0, end: 200 * U }, { id: 'y', start: 300 * U, end: 488 * U }] }];
let queue: Map<number, FrameRequestCallback>; let counter: number;
const context = { setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), save: vi.fn(), restore: vi.fn(), rect: vi.fn(), clip: vi.fn(), setLineDash: vi.fn(), measureText: vi.fn(() => ({ width: 40 })) };
function flush() { act(() => { const tasks = [...queue.values()]; queue.clear(); tasks.forEach(cb => cb(0)); }); }
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('PointerEvent', class extends MouseEvent { pointerId: number; constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; } });
  counter = 0; queue = new Map();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queue.set(++counter, cb); return counter; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = (props: Partial<LaneTimelineProps> = {}) => {
  const view = render(<I18nProvider><LaneTimeline lanes={lanes} ariaLabel="Timeline" formatTick={t => `t${Math.round(t / U)}`} formatTooltip={segment => `item-${segment.id}`} {...props} /></I18nProvider>);
  flush();
  return view;
};
const canvas = () => screen.getByRole('img', { name: 'Timeline' });
const region = () => screen.getByRole('region', { name: 'Timeline' });
const toggle = () => screen.getByRole('button', { name: '구간 선택' });
const drag = (from: number, to: number) => {
  fireEvent.pointerDown(canvas(), { clientX: from, clientY: 12, pointerId: 1, button: 0 });
  fireEvent.pointerMove(canvas(), { clientX: to, clientY: 12, pointerId: 1 }); flush();
  fireEvent.pointerUp(canvas(), { clientX: to, clientY: 12, pointerId: 1 }); flush();
};

it('changes nothing without rangeBrush: no toggle, Shift+→ moves the item focus, a drag pans', () => {
  const onSelectedChange = vi.fn();
  mount({ onSelectedChange });
  expect(screen.queryByRole('button', { name: '구간 선택' })).toBeNull();
  fireEvent.keyDown(region(), { key: 'ArrowRight', shiftKey: true });
  expect(screen.getByRole('status').textContent).toContain('item-y');
  drag(300, 200);
  expect(screen.queryByText(/선택 구간/)).toBeNull();
});

it('a drag in brush mode picks the time range under the pointer, in either direction, and a click selects nothing', () => {
  const onChange = vi.fn(); const onSelectedChange = vi.fn();
  mount({ rangeBrush: { onChange }, onSelectedChange });
  expect(toggle().getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(toggle());
  expect(toggle().getAttribute('aria-pressed')).toBe('true');
  drag(412, 162);
  expect(onChange).toHaveBeenLastCalledWith([50 * U, 300 * U]);
  expect(screen.getByRole('region', { name: '선택 요약' }).textContent).toContain('선택 구간: t50–t300');
  // The range is drawn on the overlay as the 2px selection outline across the plot.
  expect(context.strokeRect).toHaveBeenCalledWith(162, 1, 250, expect.any(Number));
  fireEvent.pointerDown(canvas(), { clientX: 150, clientY: 12, pointerId: 2, button: 0 });
  fireEvent.pointerUp(canvas(), { clientX: 150, clientY: 12, pointerId: 2 });
  expect(onSelectedChange).not.toHaveBeenCalled();
  expect(onChange).toHaveBeenCalledTimes(1);
});

it('Shift+←/→ moves the range end by a twentieth of the view and turns brush mode on; Escape and 초기화 clear it', () => {
  const onChange = vi.fn();
  mount({ rangeBrush: { onChange } });
  fireEvent.keyDown(region(), { key: 'ArrowRight', shiftKey: true });
  expect(onChange).toHaveBeenLastCalledWith([0, 24.4 * U]);
  expect(toggle().getAttribute('aria-pressed')).toBe('true');
  fireEvent.keyDown(region(), { key: 'ArrowRight', shiftKey: true });
  expect(onChange).toHaveBeenLastCalledWith([0, 48.8 * U]);
  fireEvent.keyDown(region(), { key: 'Escape' });
  expect(onChange).toHaveBeenLastCalledWith(null);
  expect(toggle().getAttribute('aria-pressed')).toBe('false');
  fireEvent.keyDown(region(), { key: 'ArrowRight', shiftKey: true });
  fireEvent.click(screen.getByRole('button', { name: '확대 초기화' }));
  expect(onChange).toHaveBeenLastCalledWith(null);
  expect(screen.getByRole('region', { name: '선택 요약' }).textContent).not.toContain('선택 구간');
});

it('a controlled value is drawn and summarised; 선택 구간 확대 shows that window', () => {
  mount({ rangeBrush: { value: [100 * U, 200 * U] } });
  expect(screen.getByRole('region', { name: '선택 요약' }).textContent).toContain('선택 구간: t100–t200');
  context.fillText.mockClear();
  fireEvent.click(screen.getByRole('button', { name: '선택 구간 확대' })); flush();
  // The axis now spans the selected window: every drawn tick label lies inside [100, 200].
  const ticks = context.fillText.mock.calls.map(([text]) => String(text)).filter(text => /^t\d+$/.test(text)).map(text => Number(text.slice(1)));
  expect(ticks.length).toBeGreaterThan(0);
  expect(ticks.every(tick => tick >= 100 && tick <= 200)).toBe(true);
});
