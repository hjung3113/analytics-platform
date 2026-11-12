import { I18nProvider } from '@ap/kernel';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LaneTimeline } from '../LaneTimeline';
import { recordingContext, type Op } from './laneTimelineLod.helpers';

// Two canvases, two logs: the data canvas (role=img) and the overlay canvas (aria-hidden, no role).
const logs = new Map<HTMLCanvasElement, Op[]>();
let queue: Map<number, FrameRequestCallback>; let counter: number;
const lane = { id: 'a', label: 'A', segments: [{ id: 'x', start: 0, end: 40 }, { id: 'y', start: 50, end: 90, depth: 1 }] };
function flush() { act(() => { const tasks = [...queue.values()]; queue.clear(); tasks.forEach(cb => cb(0)); }); }
beforeEach(() => {
  logs.clear(); counter = 0; queue = new Map();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queue.set(++counter, cb); return counter; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queue.delete(id));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    if (!logs.has(this)) logs.set(this, []);
    return Object.assign(recordingContext(logs.get(this)!), {}) as never;
  } as never);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = (selectedId: string | null) => render(<I18nProvider><LaneTimeline lanes={[lane]} ariaLabel="Timeline" selectedId={selectedId} /></I18nProvider>);
const dataCanvas = () => screen.getByRole('img') as HTMLCanvasElement;
const overlayCanvas = () => dataCanvas().parentElement!.querySelector<HTMLCanvasElement>('canvas:not([role])')!;

it('adds an aria-hidden, pointer-events-none overlay canvas in the same sticky wrapper; only the data canvas has the img role', () => {
  mount(null);
  const data = dataCanvas(); const overlay = overlayCanvas();
  expect(screen.getAllByRole('img')).toHaveLength(1);
  expect(overlay).not.toBe(data);
  expect(overlay.getAttribute('aria-hidden')).toBe('true');
  expect(overlay.className).toContain('pointer-events-none');
  expect(overlay.parentElement).toBe(data.parentElement);
  expect(data.parentElement!.className).toContain('sticky');
});
it('keeps pointer targets on the data canvas: only the data canvas takes pointer events', () => {
  mount(null);
  expect(overlayCanvas().className).toContain('pointer-events-none');
  expect(dataCanvas().className).not.toContain('pointer-events-none');
});
it('draws the selection outline on the overlay canvas only, and a selection change leaves the data canvas op sequence unchanged', () => {
  const run = (id: string | null) => {
    cleanup(); logs.clear(); mount(id); flush();
    return { data: logs.get(dataCanvas())!.map(op => op.join('|')), overlay: logs.get(overlayCanvas())!.map(op => op.join('|')) };
  };
  const none = run(null); const x = run('x'); const y = run('y');
  expect(x.data).toEqual(none.data); expect(y.data).toEqual(none.data);
  expect(none.overlay.filter(op => op.startsWith('strokeRect'))).toHaveLength(0);
  const outline = (ops: string[]) => ops.filter(op => op.startsWith('strokeRect'));
  expect(outline(x.overlay)).toHaveLength(1); expect(outline(y.overlay)).toHaveLength(1);
  expect(outline(x.overlay)).not.toEqual(outline(y.overlay));
  expect(x.overlay.findIndex(op => op.startsWith('=lineWidth|2'))).toBeGreaterThan(-1);
});
