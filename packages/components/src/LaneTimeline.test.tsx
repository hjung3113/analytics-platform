import { readColorToken } from '@ap/ui/theme';
import { I18nProvider } from '@ap/kernel';
import { Profiler, createRef, type ReactElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LaneTimeline, type LaneTimelineHandle } from './LaneTimeline';
const lanes = Array.from({ length: 40 }, (_, i) => ({ id: `lane-${i}`, label: `Lane ${i}`, segments: [{ id: `segment-${i}`, start: i * 10, end: i * 10 + 100 }] }));
function mountLane(element: ReactElement) { return render(<I18nProvider>{element}</I18nProvider>); }
let queue: Map<number, FrameRequestCallback>; let counter: number;
let resize: ResizeObserverCallback;
const disconnect = vi.fn();
const context = { setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), save: vi.fn(), restore: vi.fn(), rect: vi.fn(), clip: vi.fn(), setLineDash: vi.fn(), measureText: vi.fn(() => ({ width: 100 })) };
function flush() { act(() => { const tasks = [...queue.values()]; queue.clear(); tasks.forEach(cb => cb(0)); }); }
beforeEach(() => {
  vi.clearAllMocks(); context.fillRect.mockReset(); context.strokeRect.mockReset();
  vi.stubGlobal('PointerEvent', class extends MouseEvent { pointerId: number; constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; } });
  counter = 0; queue = new Map(); disconnect.mockClear();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queue.set(++counter, cb); return counter; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id));
  vi.stubGlobal('ResizeObserver', class { constructor(cb: ResizeObserverCallback) { resize = cb; } observe() {} disconnect = disconnect; });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('adds zero React commits during twenty wheel events and twenty pan moves', () => {
  const commits = vi.fn();
  mountLane(<Profiler id="lane" onRender={commits}><LaneTimeline lanes={lanes} ariaLabel="Timeline" /></Profiler>);
  flush(); const initial = commits.mock.calls.length;
  const canvas = screen.getByRole('img', { name: 'Timeline' });
  for (let i = 0; i < 20; i++) { fireEvent.wheel(canvas, { deltaY: -10, ctrlKey: true, clientX: 300 }); expect(queue.size).toBe(1); flush(); }
  fireEvent.pointerDown(canvas, { clientX: 300, pointerId: 1, button: 0 });
  for (let i = 0; i < 20; i++) { fireEvent.pointerMove(canvas, { clientX: 320 + i * 2, pointerId: 1 }); expect(queue.size).toBe(1); flush(); }
  fireEvent.pointerUp(canvas, { pointerId: 1 });
  expect(commits.mock.calls.length).toBe(initial);
});
it.each([1, 2])('scales backing canvas at DPR %i, responds to resize, and cleans up', dpr => {
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: dpr });
  const { unmount } = mountLane(<LaneTimeline lanes={lanes} ariaLabel="Timeline" />); flush();
  const canvas = screen.getByRole('img') as HTMLCanvasElement;
  expect(canvas.width).toBe(600 * dpr);
  expect(context.setTransform).toHaveBeenCalledWith(dpr, 0, 0, dpr, 0, 0);
  act(() => resize([], {} as ResizeObserver)); flush();
  unmount(); expect(disconnect).toHaveBeenCalled(); expect(queue.size).toBe(0);
});
it('keeps its handle stable, reveals by index/ID, resets and offers keyboard selection and summaries', () => {
  const ref = createRef<LaneTimelineHandle>(); const onSelectedChange = vi.fn();
  const { rerender } = mountLane(<LaneTimeline ref={ref} lanes={lanes} ariaLabel="Timeline" onSelectedChange={onSelectedChange} />); flush();
  const handle = ref.current!;
  act(() => handle.reveal(39)); flush();
  expect(screen.getByRole('region', { name: 'Timeline' }).querySelector('[data-lane-scroll]')!.scrollTop).toBeGreaterThan(0);
  act(() => { handle.reveal(-1); handle.revealById('missing'); handle.resetZoom(); }); flush();
  const region = screen.getByRole('region', { name: 'Timeline' });
  fireEvent.keyDown(region, { key: 'ArrowRight' }); fireEvent.keyDown(region, { key: 'Enter' });
  expect(onSelectedChange).toHaveBeenLastCalledWith('segment-1');
  expect(screen.getByRole('status')).toHaveTextContent('segment-1');
  fireEvent.keyDown(region, { key: 'Escape' }); expect(onSelectedChange).toHaveBeenLastCalledWith(null);
  rerender(<I18nProvider><LaneTimeline ref={ref} lanes={[...lanes].reverse()} ariaLabel="Timeline" /></I18nProvider>); flush();
  expect(ref.current).toBe(handle);
  act(() => handle.revealById('segment-0')); flush();
});
it('selects and clears on pointer click, exposes semantic hover text and clamps the DOM tooltip', () => {
  const onSelectedChange = vi.fn();
  mountLane(<LaneTimeline lanes={[{ id: 'a', label: 'Long lane', segments: [{ id: 'a', start: 0, end: 100, startBoundary: 'orphan', endBoundary: 'open' }] }]} ariaLabel="Timeline" onSelectedChange={onSelectedChange} />); flush();
  const canvas = screen.getByRole('img');
  fireEvent.pointerMove(canvas, { clientX: 300, clientY: 12 });
  const tooltip = screen.getByRole('tooltip');
  expect(tooltip).toHaveTextContent('orphan'); expect(tooltip).toHaveTextContent('open');
  expect(parseFloat(tooltip.style.left)).toBeGreaterThanOrEqual(8);
  expect(parseFloat(tooltip.style.top)).toBeGreaterThanOrEqual(8);
  fireEvent.pointerDown(canvas, { clientX: 300, clientY: 12, pointerId: 1, button: 0 });
  fireEvent.pointerUp(canvas, { clientX: 300, clientY: 12, pointerId: 1 });
  expect(onSelectedChange).toHaveBeenLastCalledWith('a'); flush();
  fireEvent.pointerDown(canvas, { clientX: 300, clientY: 100, pointerId: 1, button: 0 });
  fireEvent.pointerUp(canvas, { clientX: 300, clientY: 100, pointerId: 1 });
  expect(onSelectedChange).toHaveBeenLastCalledWith(null);
});
it('respects controlled selection, exposes formatter text, and cancels a drag without selecting', () => {
  const onSelectedChange = vi.fn();
  mountLane(<LaneTimeline lanes={lanes} ariaLabel="Timeline" selectedId="segment-0" onSelectedChange={onSelectedChange} formatTooltip={segment => `Custom ${segment.id}`} formatTick={() => 'Tick'} />); flush();
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('Custom segment-0');
  fireEvent.keyDown(screen.getByRole('region', { name: 'Timeline' }), { key: 'ArrowRight' });
  fireEvent.keyDown(screen.getByRole('region', { name: 'Timeline' }), { key: 'Enter' });
  expect(onSelectedChange).toHaveBeenLastCalledWith('segment-1');
  expect(screen.getByRole('region', { name: '선택 요약' })).toHaveTextContent('Custom segment-0');
  const canvas = screen.getByRole('img');
  fireEvent.pointerDown(canvas, { clientX: 300, pointerId: 1, button: 0 });
  fireEvent.pointerCancel(canvas, { pointerId: 1 });
  expect(onSelectedChange).toHaveBeenCalledTimes(1);
  expect(context.fillText).toHaveBeenCalledWith('Tick', expect.any(Number), 14, expect.any(Number));
});
it('preserves native scrolling for plain wheel and coalesces dirty zoom frames', () => {
  mountLane(<LaneTimeline lanes={lanes} ariaLabel="Timeline" />); flush();
  const canvas = screen.getByRole('img');
  const plain = new WheelEvent('wheel', { deltaY: 10, cancelable: true }); canvas.dispatchEvent(plain);
  expect(plain.defaultPrevented).toBe(false); expect(queue.size).toBe(0);
  for (let i = 0; i < 20; i++) fireEvent.wheel(canvas, { deltaY: -20, ctrlKey: true, clientX: 400 });
  expect(queue.size).toBe(1); flush();
});
it('resolves explicit/neutral/palette tokens with safe empty and raw-color fallback', () => {
  const fills: string[] = [];
  context.fillRect.mockImplementation(() => { fills.push((context as unknown as CanvasRenderingContext2D).fillStyle as string); });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const custom = [{ id: 'lane', label: 'Lane', segments: [{ id: 'neutral', start: 0, end: 2, neutral: true }, { id: 'explicit', start: 2, end: 4, colorToken: 'chart-series-4' as const }, { id: 'invalid', start: 4, end: 6, colorToken: '#000' as never }] }];
  mountLane(<LaneTimeline lanes={custom} ariaLabel="Timeline" paletteTokens={[]} neutralColorToken={'rgb(1,2,3)' as never} />); flush();
  expect(fills).toContain(readColorToken('chart-no-data'));
  expect(fills).toContain(readColorToken('chart-series-4'));
  expect(fills).toContain(readColorToken('chart-series-1'));
});
it('recomputes canvas dimensions on resize and redraws a changed theme without a React commit', async () => {
  const commits = vi.fn();
  mountLane(<Profiler id="lane" onRender={commits}><LaneTimeline lanes={lanes} ariaLabel="Timeline" /></Profiler>); flush();
  const count = commits.mock.calls.length;
  const canvas = screen.getByRole('img') as HTMLCanvasElement;
  const scroll = canvas.closest('[data-lane-scroll]')!;
  Object.defineProperty(scroll, 'clientWidth', { configurable: true, value: 380 });
  act(() => resize([], {} as ResizeObserver)); flush();
  expect(canvas.width).toBe(380 * window.devicePixelRatio);
  await act(async () => { document.documentElement.setAttribute('data-theme', 'test'); });
  expect(queue.size).toBe(1); flush();
  expect(commits.mock.calls.length).toBe(count);
  document.documentElement.removeAttribute('data-theme');
});
it('uses custom palettes and neutral colors while keeping explicit segment tokens first', () => {
  const fills: string[] = [];
  context.fillRect.mockImplementation(() => { fills.push((context as unknown as CanvasRenderingContext2D).fillStyle as string); });
  mountLane(<LaneTimeline ariaLabel="Timeline" paletteTokens={['chart-series-3']} neutralColorToken="chart-remainder" lanes={[{ id: 'a', label: 'A', segments: [{ id: 'a', start: 0, end: 10 }, { id: 'b', start: 10, end: 20, neutral: true }, { id: 'c', start: 20, end: 30, neutral: true, colorToken: 'chart-series-4' }] }]} />); flush();
  expect(fills).toContain(readColorToken('chart-series-3'));
  expect(fills).toContain(readColorToken('chart-remainder'));
  expect(fills).toContain(readColorToken('chart-series-4'));
});
it('keeps rank outlines independent of the selected outline and semantic boundary strokes', () => {
  const strokes: { width: number; alpha: number }[] = [];
  context.strokeRect.mockImplementation(() => { const ctx = context as unknown as CanvasRenderingContext2D; strokes.push({ width: ctx.lineWidth, alpha: ctx.globalAlpha }); });
  mountLane(<LaneTimeline ariaLabel="Timeline" selectedId="a" outlineMode="weak" outlineWidthsByRank={{ high: 3 }} lanes={[{ id: 'lane', label: 'Lane', segments: [{ id: 'a', start: 0, end: 100, rank: 'high', startBoundary: 'orphan', endBoundary: 'open' }] }]} />); flush();
  expect(strokes).toContainEqual({ width: 1.5, alpha: 0.5 });
  expect(strokes).toContainEqual({ width: 2, alpha: 1 });
  expect(context.setLineDash).toHaveBeenCalledWith([3, 2]);
  expect(context.setLineDash).toHaveBeenCalledWith([2, 2]);
});
it('keeps scroll-only interactions outside React and reset/reveal preserve a stable handle', () => {
  const commits = vi.fn(); const ref = createRef<LaneTimelineHandle>();
  mountLane(<Profiler id="lane" onRender={commits}><LaneTimeline ref={ref} ariaLabel="Timeline" lanes={lanes} /></Profiler>); flush();
  const before = commits.mock.calls.length;
  const canvas = screen.getByRole('img'); const scroll = canvas.closest('[data-lane-scroll]')!;
  scroll.scrollTop = 480; fireEvent.scroll(scroll); flush();
  expect(commits.mock.calls.length).toBe(before);
  fireEvent.wheel(canvas, { deltaY: -200, ctrlKey: true, clientX: 400 }); flush();
  const beforeReset = context.fillText.mock.calls.length;
  act(() => ref.current!.resetZoom()); flush();
  expect(context.fillText.mock.calls.length).toBeGreaterThan(beforeReset);
});
it('shares the standard source/updated/coverage footer and exposes a consumer description', () => {
  mountLane(<LaneTimeline ariaLabel="Timeline" lanes={lanes} description="Intervals in UTC" trust={{ source: 'Sample source', updated: '2026-10-21', coverage: 'Complete' }} />);
  expect(screen.getByText('Intervals in UTC')).toBeVisible();
  expect(screen.getByText('Sample source')).toBeVisible();
  expect(screen.getByText(/Complete/)).toBeVisible();
});
it('restores the same-segment tooltip after Escape clears the hover', () => {
  mountLane(<LaneTimeline lanes={[{ id: 'a', label: 'Lane', segments: [{ id: 's', start: 0, end: 100 }] }]} ariaLabel="Timeline" />); flush();
  const region = screen.getByRole('region', { name: 'Timeline' });
  const canvas = screen.getByRole('img');
  fireEvent.pointerMove(canvas, { clientX: 300, clientY: 12 });
  const tooltip = screen.getByRole('tooltip');
  expect(tooltip).toHaveTextContent('depth 0');
  fireEvent.keyDown(region, { key: 'Escape' });
  fireEvent.pointerMove(canvas, { clientX: 300, clientY: 12 });
  expect(tooltip).toBeVisible();
  expect(tooltip).toHaveTextContent('depth 0');
});
it('keeps the tooltip at full width and flips left of the cursor near the right edge', () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 600 });
  try {
    mountLane(<LaneTimeline lanes={[{ id: 'a', label: 'Lane', segments: [{ id: 's', start: 0, end: 100 }] }]} ariaLabel="Timeline" />); flush();
    const canvas = screen.getByRole('img');
    fireEvent.pointerMove(canvas, { clientX: 560, clientY: 12 });
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.style.width.replace(/[\s*]/g, '')).toBe('min(320px,calc(100vw-16px))');
    expect(tooltip.style.left).toBe('228px');
    fireEvent.pointerMove(canvas, { clientX: 200, clientY: 12 });
    expect(tooltip.style.left).toBe('212px');
  } finally {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  }
});
it('packs title, subtitle and controls into one header row and keeps only boundary semantics above the plot', async () => {
  mountLane(<LaneTimeline ariaLabel="Timeline" lanes={lanes} description="Intervals in UTC" />); flush();
  const header = screen.getByRole('region', { name: 'Timeline' }).querySelector('header')!;
  expect(header.querySelector('h3')!.textContent).toBe('Timeline');
  expect(header.querySelector('p')!.textContent).toBe('Intervals in UTC');
  expect(header).toContainElement(screen.getByRole('button', { name: '확대' }).closest('[role=toolbar]'));
  expect(screen.getByText(/^UTC · orphan: 시작 미확인 · open: 종료 미확인$/)).toBeVisible();
  expect(screen.getByText(/Ctrl\/⌘ \+ 휠: 확대/)).toHaveClass('sr-only');
  fireEvent.focus(screen.getByRole('button', { name: '조작 방법' }));
  expect(await screen.findByRole('tooltip')).toHaveTextContent('끌기: 이동');
});
