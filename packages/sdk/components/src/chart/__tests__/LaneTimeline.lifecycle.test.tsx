import { I18nProvider } from '@ap/kernel';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LaneTimeline, type TimelineOverlay } from '../LaneTimeline';
import { resolveOverlays, validateOverlays } from '../laneTimelineOverlays';
import { prepareLanes } from '../laneTimelineGeometry';
import { createLaneRenderer } from '../laneTimelineRenderer';
import { recordingContext, type Op } from './laneTimelineLod.helpers';

// One renderer per mount: observers are constructed once, a selection or overlay change touches only the overlay canvas, and a model change resets the view.
const logs = new Map<HTMLCanvasElement, Op[]>();
let queue: Map<number, FrameRequestCallback>; let counter: number;
let resizeCallbacks: ResizeObserverCallback[]; let mutationCount: number;
const lane = { id: 'a', label: 'A', segments: [{ id: 'x', start: 0, end: 40 }, { id: 'y', start: 50, end: 90, depth: 1 }, { id: 'z', start: 100, end: 140 }] };
const lanesA = [lane]; const lanesB = [{ id: 'b', label: 'B', segments: [{ id: 'q', start: 1000, end: 2000 }] }];
function flush() { act(() => { const tasks = [...queue.values()]; queue.clear(); tasks.forEach(cb => cb(0)); }); }
beforeEach(() => {
  logs.clear(); counter = 0; queue = new Map(); resizeCallbacks = []; mutationCount = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queue.set(++counter, cb); return counter; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id));
  vi.stubGlobal('ResizeObserver', class { constructor(cb: ResizeObserverCallback) { resizeCallbacks.push(cb); } observe() {} disconnect() {} });
  vi.stubGlobal('MutationObserver', class { constructor() { mutationCount++; } observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    if (!logs.has(this)) logs.set(this, []);
    return recordingContext(logs.get(this)!) as never;
  } as never);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
type Extra = Partial<React.ComponentProps<typeof LaneTimeline>>;
const tree = (extra: Extra = {}) => <I18nProvider><LaneTimeline lanes={lanesA} ariaLabel="Timeline" {...extra} /></I18nProvider>;
const dataCanvas = () => screen.getByRole('img') as HTMLCanvasElement;
const overlayCanvas = () => dataCanvas().parentElement!.querySelector<HTMLCanvasElement>('canvas:not([role])')!;
const ops = (canvas: HTMLCanvasElement) => logs.get(canvas)!.map(op => op.join('|'));
const named = (canvas: HTMLCanvasElement, name: string) => logs.get(canvas)!.filter(op => op[0] === name);

it('creates the renderer and its observers once across selection, props, overlay and callback changes', () => {
  const { rerender } = render(tree()); flush();
  expect(resizeCallbacks).toHaveLength(1); expect(mutationCount).toBe(1);
  const addSpy = vi.spyOn(dataCanvas(), 'addEventListener');
  rerender(tree({ selectedId: 'x' })); flush();
  rerender(tree({ selectedId: 'y', paletteTokens: ['chart-series-2'], formatTooltip: () => 'a', onSelectedChange: () => {} })); flush();
  rerender(tree({ selectedId: 'y', paletteTokens: ['chart-series-2'], formatTooltip: () => 'b', overlays: [{ kind: 'instant', id: 'i', time: 10 }] })); flush();
  expect(resizeCallbacks).toHaveLength(1); expect(mutationCount).toBe(1); expect(addSpy).not.toHaveBeenCalled();
});

it('a selection change draws only the overlay layer, once, and leaves the data canvas untouched', () => {
  const { rerender } = render(tree()); flush();
  const dataBefore = ops(dataCanvas()); const overlayBefore = named(overlayCanvas(), 'clearRect').length;
  rerender(tree({ selectedId: 'x' })); flush();
  expect(ops(dataCanvas())).toEqual(dataBefore);
  expect(named(overlayCanvas(), 'clearRect').length - overlayBefore).toBe(1);
  expect(named(overlayCanvas(), 'strokeRect')).toHaveLength(1);
  rerender(tree({ selectedId: 'y' })); flush();
  expect(ops(dataCanvas())).toEqual(dataBefore);
  expect(named(overlayCanvas(), 'strokeRect')).toHaveLength(2);
});

it('an overlays change draws only the overlay layer, once', () => {
  const { rerender } = render(tree()); flush();
  const dataBefore = ops(dataCanvas()); const before = named(overlayCanvas(), 'clearRect').length;
  rerender(tree({ overlays: [{ kind: 'instant', id: 'i', time: 20 }] })); flush();
  expect(ops(dataCanvas())).toEqual(dataBefore);
  expect(named(overlayCanvas(), 'clearRect').length - before).toBe(1);
  expect(named(overlayCanvas(), 'moveTo')).toHaveLength(1);
});

it('inline callbacks and unchanged-by-value props cause no draw', () => {
  const { rerender } = render(tree({ paletteTokens: ['chart-series-2'], outlineWidthsByRank: { high: 3, low: 1 }, outlineMode: 'weak', height: 300 })); flush();
  const data = ops(dataCanvas()).length; const over = ops(overlayCanvas()).length;
  for (let i = 0; i < 3; i++) {
    rerender(tree({ paletteTokens: ['chart-series-2'], outlineWidthsByRank: i === 1 ? { low: 1, high: 3 } : { high: 3, low: 1 }, outlineMode: 'weak', height: 300, formatTick: t => String(t), formatTooltip: () => `t${i}`, onSelectedChange: () => {} }));
  }
  expect(queue.size).toBe(0); flush();
  expect(ops(dataCanvas()).length).toBe(data); expect(ops(overlayCanvas()).length).toBe(over);
});

it('a changed palette redraws the data layer', () => {
  const { rerender } = render(tree()); flush();
  const before = named(dataCanvas(), 'clearRect').length;
  rerender(tree({ paletteTokens: ['chart-series-3'] })); flush();
  expect(named(dataCanvas(), 'clearRect').length).toBeGreaterThan(before);
});

it('keeps the zoomed view on a non-model update and resets it to the new model domain on a model change', () => {
  const selectedRect = (id: string, lanes = lanesA) => {
    cleanup(); logs.clear(); queue.clear();
    render(tree({ lanes, selectedId: id })); flush();
    return named(overlayCanvas(), 'strokeRect').at(-1)!.slice(1);
  };
  const fresh = selectedRect('x');
  cleanup(); logs.clear(); queue.clear();
  const { rerender } = render(tree()); flush();
  fireEvent.wheel(dataCanvas(), { deltaY: -400, ctrlKey: true, clientX: 300 }); flush();
  rerender(tree({ selectedId: 'x' })); flush();
  const zoomed = named(overlayCanvas(), 'strokeRect').at(-1)!.slice(1);
  expect(zoomed).not.toEqual(fresh);
  rerender(tree({ selectedId: 'x', lanes: [{ ...lane }] })); flush();
  expect(named(overlayCanvas(), 'strokeRect').at(-1)!.slice(1)).toEqual(fresh);
  rerender(tree({ lanes: lanesB })); flush();
  expect(named(dataCanvas(), 'fillRect').length).toBeGreaterThan(0);
});

it('a model change redraws the data layer', () => {
  const { rerender } = render(tree()); flush();
  const before = named(dataCanvas(), 'clearRect').length;
  rerender(tree({ lanes: lanesB })); flush();
  expect(named(dataCanvas(), 'clearRect').length).toBeGreaterThan(before);
});

it('the ResizeObserver initial callback adds no second draw; a real size change draws once', () => {
  render(tree()); flush();
  const first = named(dataCanvas(), 'clearRect').length;
  act(() => resizeCallbacks[0]([], {} as ResizeObserver)); expect(queue.size).toBe(0); flush();
  expect(named(dataCanvas(), 'clearRect').length).toBe(first);
  Object.defineProperty(dataCanvas().closest('[data-lane-scroll]')!, 'clientWidth', { configurable: true, value: 500 });
  act(() => resizeCallbacks[0]([], {} as ResizeObserver)); expect(queue.size).toBe(1); flush();
  expect(named(dataCanvas(), 'clearRect').length).toBe(first + 1);
});

it('draws range, then instant, then segment overlays, and the selection outline last', () => {
  const overlays: TimelineOverlay[] = [
    { kind: 'range', id: 'r', start: 10, end: 30 },
    { kind: 'instant', id: 'i', time: 60, dash: true },
    { kind: 'segments', id: 's', segmentIds: ['y', 'missing'], style: 'outline' },
  ];
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(tree({ overlays, selectedId: 'z' })); flush();
  const all = logs.get(overlayCanvas())!;
  const index = (name: string) => all.findIndex(op => op[0] === name);
  const fill = index('fillRect'); const line = index('moveTo');
  const strokes = all.map((op, i) => [op[0], i] as const).filter(([name]) => name === 'strokeRect').map(([, i]) => i);
  expect(strokes).toHaveLength(3); // range edge, segments overlay, selection
  expect(fill).toBeLessThan(line); expect(line).toBeLessThan(strokes[1]); expect(strokes[1]).toBeLessThan(strokes[2]);
  expect(all.some(op => op[0] === 'setLineDash' && Array.isArray(op[1]) && op[1].length === 2)).toBe(true);
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining('unknown lane or segment'));
});

it('limits an instant to its lane row', () => {
  render(tree({ overlays: [{ kind: 'instant', id: 'i', time: 20, laneId: 'a' }] })); flush();
  const [, , y0] = named(overlayCanvas(), 'moveTo')[0]; const [, , y1] = named(overlayCanvas(), 'lineTo')[0];
  expect(Number(y1) - Number(y0)).toBe(24);
});

it('lists labelled overlays in the screen-reader summary only', () => {
  render(tree({ overlays: [{ kind: 'instant', id: 'i', time: 0, label: 'Alarm' }, { kind: 'range', id: 'r', start: 0, end: 1000, label: 'Repair' }, { kind: 'instant', id: 'n', time: 5 }] }));
  const list = screen.getByRole('list', { hidden: true });
  expect(list).toHaveClass('sr-only');
  expect(list.querySelectorAll('li')).toHaveLength(2);
  expect(list).toHaveTextContent('Alarm · 1970-01-01 00:00:00'); expect(list).toHaveTextContent('Repair');
});

it('drops malformed overlays with a diagnostic each and keeps the valid ones', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const valid = validateOverlays([
    { kind: 'instant', id: 'a', time: 1 }, { kind: 'instant', id: 'b', time: Number.NaN },
    { kind: 'range', id: 'c', start: 5, end: 1 }, { kind: 'range', id: 'd', start: 1, end: Infinity },
    { kind: 'instant', id: 'a', time: 2 }, { kind: 'range', id: 'e', start: 1, end: 5, colorToken: '#fff' as never },
  ]);
  expect(valid.map(o => o.id)).toEqual(['a', 'e']);
  expect(error).toHaveBeenCalledTimes(5);
  expect(valid[1]).toMatchObject({ colorToken: undefined });
});

it('resolves segment overlays through the id table and reports unknown ids once', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const model = prepareLanes([lane], []);
  const resolved = resolveOverlays([{ kind: 'segments', id: 's', segmentIds: ['x', 'nope', 'z', 'nada'], style: 'fill' }], model);
  expect(resolved.items[0].flats).toEqual([0, 2]);
  expect(error).toHaveBeenCalledTimes(1);
});

it('paints range < instant < segments < selection whatever the array order, keeping input order within a kind', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const overlays: TimelineOverlay[] = [
    { kind: 'segments', id: 's', segmentIds: ['x'], style: 'outline' },
    { kind: 'instant', id: 'i', time: 20 },
    { kind: 'range', id: 'r', start: 0, end: 40 },
  ];
  render(tree({ overlays, selectedId: 'z' })); flush();
  const all = logs.get(overlayCanvas())!;
  const fill = all.findIndex(op => op[0] === 'fillRect'); const line = all.findIndex(op => op[0] === 'moveTo');
  const strokes = all.map((op, i) => [op[0], i] as const).filter(([name]) => name === 'strokeRect').map(([, i]) => i);
  expect(strokes).toHaveLength(3); expect(fill).toBeLessThan(line); expect(line).toBeLessThan(strokes[1]); expect(strokes[1]).toBeLessThan(strokes[2]);
  const model = prepareLanes([lane], []);
  const resolved = resolveOverlays([
    { kind: 'instant', id: 'i1', time: 1 }, { kind: 'range', id: 'r1', start: 0, end: 1 }, { kind: 'instant', id: 'i2', time: 2 }, { kind: 'range', id: 'r2', start: 0, end: 1 },
  ], model);
  expect(resolved.items.map(item => item.overlay.id)).toEqual(['r1', 'r2', 'i1', 'i2']);
});

it('drops instants and range endpoints outside the Date range and accepts the boundary', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const valid = validateOverlays([
    { kind: 'instant', id: 'big', time: 1e20 }, { kind: 'range', id: 'rbig', start: 0, end: 1e20 }, { kind: 'range', id: 'rneg', start: -1e20, end: 0 },
    { kind: 'instant', id: 'edge', time: 8.64e15 }, { kind: 'range', id: 'redge', start: -8.64e15, end: 8.64e15 },
  ]);
  expect(valid.map(o => o.id)).toEqual(['edge', 'redge']); expect(error).toHaveBeenCalledTimes(3);
  render(tree({ overlays: [{ kind: 'instant', id: 'bad', time: 1e20, label: 'Bad' }] })); flush();
  expect(screen.queryByText(/Bad/)).toBeNull();
});

it('closes the hit gate on a model change until the new model is painted', () => {
  const onSelectedChange = vi.fn();
  vi.stubGlobal('PointerEvent', class extends MouseEvent { pointerId: number; constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 0; } });
  const { rerender } = render(tree({ onSelectedChange })); flush();
  fireEvent.wheel(dataCanvas(), { deltaY: -400, ctrlKey: true, clientX: 300 }); flush();
  const next = [{ id: 'n', label: 'N', segments: [{ id: 'e', start: 0, end: 100 }, { id: 'q', start: 40, end: 50, depth: 1 }] }];
  rerender(tree({ lanes: next, onSelectedChange }));
  const click = () => { fireEvent.pointerDown(dataCanvas(), { clientX: 150, clientY: 12, pointerId: 1, button: 0 }); fireEvent.pointerUp(dataCanvas(), { clientX: 150, clientY: 12, pointerId: 1 }); };
  fireEvent.pointerMove(dataCanvas(), { clientX: 150, clientY: 12 });
  click(); expect(onSelectedChange).not.toHaveBeenCalledWith('q'); expect(onSelectedChange.mock.calls.filter(([id]) => id !== null)).toHaveLength(0);
  flush();
  click(); expect(onSelectedChange).toHaveBeenLastCalledWith('e'); expect(onSelectedChange).not.toHaveBeenCalledWith('q');
});

it('the renderer drops its overlay cache on a model or overlays change, including an empty array', () => {
  const el = (tag = 'div') => document.createElement(tag);
  const modelA = prepareLanes([lane], []); const modelB = prepareLanes(lanesB, []);
  const base = { props: { lanes: lanesA, ariaLabel: 't' } as never, selectedId: null, lang: 'en' as const, onSelect: () => {}, onHover: () => {} };
  const overlays: TimelineOverlay[] = [{ kind: 'instant', id: 'i', time: 10 }];
  const engine = createLaneRenderer({ root: el(), scroll: el() as HTMLDivElement, canvas: el('canvas') as HTMLCanvasElement, overlay: el('canvas') as HTMLCanvasElement, axis: el('canvas') as HTMLCanvasElement, spacer: el() as HTMLDivElement, tooltip: el() as HTMLDivElement, ...base, model: modelA, overlays });
  act(() => { [...queue.values()].forEach(cb => cb(0)); queue.clear(); });
  expect(engine.overlayCacheModel()).toBe(modelA);
  engine.update({ ...base, model: modelB, overlays: [] });
  expect(engine.overlayCacheModel()).toBeNull();
  act(() => { [...queue.values()].forEach(cb => cb(0)); queue.clear(); });
  expect(engine.overlayCacheModel()).toBeNull();
  engine.destroy();
});
