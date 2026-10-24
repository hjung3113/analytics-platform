import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DockNode } from './schema';
import { group, installResizeObserver, mountDock, resetMounts, row } from './__tests__/harness';

const observer = installResizeObserver();
beforeAll(() => { observer.resize(900, 600); });
afterAll(() => { observer.restore(); });
beforeEach(() => { resetMounts(); });
afterEach(() => { cleanup(); });

const ready = async () => {
  await screen.findAllByRole('tab');
  await waitFor(() => { expect(document.querySelector('.dv-sash')).not.toBeNull(); });
};
/** jsdom has no PointerEvent: a plain event carries the coordinate the engine reads. */
const pointer = (type: string, target: EventTarget, clientX: number) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX, clientY: 0, pointerId: 1 });
  act(() => { target.dispatchEvent(event); });
};
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
/** Microtasks only: the engine announces a drag's sizes from one, and the release timer must not have run yet. */
const microtasks = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
/** Holds back the drag's release fallback (the zero-delay timer whose callback lowers `released`) so the interval before it can be tested; the returned function releases them. */
const holdZeroTimers = () => {
  const real = globalThis.setTimeout;
  const held: Array<() => void> = [];
  const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, delay?: number, ...rest: unknown[]) => {
    if (delay === 0 && String(callback).includes('released')) { held.push(callback); return 0; }
    return (real as (...args: unknown[]) => unknown)(callback, delay, ...rest);
  }) as unknown as typeof setTimeout);
  return () => { spy.mockRestore(); held.forEach(callback => { callback(); }); };
};
const groupWidths = () => Array.from(document.querySelectorAll<HTMLElement>('.dv-view')).filter(view => view.querySelector(':scope > .dv-groupview')).map(view => parseFloat(view.style.width));
/** jsdom has no layout parent, and the engine ignores a resize of an element without one; scoped so the other tests keep the default. */
const withLayoutParent = async (run: () => Promise<void>) => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentNode; } });
  try { await run(); } finally { delete (HTMLElement.prototype as { offsetParent?: unknown }).offsetParent; }
};
const sizesOf = (node: DockNode | undefined) => (node?.type === 'branch' ? node.sizes : []);

describe('DockLayout sash drag reports the final sizes (#754)', () => {
  it('reports the sizes once, when a real sash drag ends (the engine announces them after the window pointerup)', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'] });
    await ready();
    const sash = document.querySelector<HTMLElement>('.dv-sash')!;
    pointer('pointerdown', sash, 450);
    pointer('pointermove', document, 550);
    pointer('pointermove', document, 650);
    expect(calls.layout).toHaveLength(0);
    pointer('pointerup', document, 650);
    await flush();
    expect(calls.layout).toHaveLength(1);
    const [first, second] = sizesOf(calls.layout[0]);
    expect(first!).toBeGreaterThan(second!);
  });

  it('reports a pointercancel-ended drag the same way, once', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'] });
    await ready();
    pointer('pointerdown', document.querySelector<HTMLElement>('.dv-sash')!, 450);
    pointer('pointermove', document, 350);
    pointer('pointercancel', document, 350);
    await flush();
    expect(calls.layout).toHaveLength(1);
    const [first, second] = sizesOf(calls.layout[0]);
    expect(first!).toBeLessThan(second!);
  });

  it('does not report a reconcile to a new layout', async () => {
    const { calls, controls } = mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'] });
    await ready();
    controls.setLayout(row([30, 70], group(['a']), group(['b'])));
    await flush();
    expect(calls.layout).toHaveLength(0);
  });

  it('does not report a window resize (the engine does resize)', async () => {
    await withLayoutParent(async () => {
      const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'] });
      await ready();
      await flush();
      const before = groupWidths();
      observer.resize(700, 500);
      await waitFor(() => { expect(groupWidths()[0]).not.toBe(before[0]); });
      await flush();
      expect(calls.layout).toHaveLength(0);
      observer.resize(900, 600);
      await flush();
    });
  });

  it('does not report a layout change after the drag has ended (the flag does not outlive it)', async () => {
    await withLayoutParent(async () => {
      const { calls, controls } = mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'] });
      await ready();
      pointer('pointerdown', document.querySelector<HTMLElement>('.dv-sash')!, 450);
      pointer('pointermove', document, 550);
      pointer('pointerup', document, 550);
      await flush();
      expect(calls.layout).toHaveLength(1);
      calls.layout.length = 0;
      const before = groupWidths();
      observer.resize(700, 500);
      await waitFor(() => { expect(groupWidths()[0]).not.toBe(before[0]); });
      controls.setLayout(row([30, 70], group(['a']), group(['b'])));
      await flush();
      expect(calls.layout).toHaveLength(0);
      observer.resize(900, 600);
      await flush();
    });
  });

  it('does not report an engine-only change that arrives after the drag\'s final notification but before the release timer', async () => {
    await withLayoutParent(async () => {
      const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'] });
      await ready();
      await flush();
      const release = holdZeroTimers();
      pointer('pointerdown', document.querySelector<HTMLElement>('.dv-sash')!, 450);
      pointer('pointermove', document, 550);
      pointer('pointerup', document, 550);
      await microtasks();
      expect(calls.layout).toHaveLength(1);
      const before = groupWidths();
      observer.resize(700, 500);
      await waitFor(() => { expect(groupWidths()[0]).not.toBe(before[0]); });
      expect(calls.layout).toHaveLength(1);
      release();
      await flush();
      expect(calls.layout).toHaveLength(1);
      observer.resize(900, 600);
      await flush();
    });
  });

  it('does not report the sizes of a minimum-clamped reconcile applied after the drag ended, before the release timer', async () => {
    await withLayoutParent(async () => {
      const { calls, controls } = mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'], props: { minPanelSize: { width: 300, height: 20 } } });
      await ready();
      await flush();
      const release = holdZeroTimers();
      pointer('pointerdown', document.querySelector<HTMLElement>('.dv-sash')!, 450);
      pointer('pointermove', document, 550);
      pointer('pointerup', document, 550);
      await microtasks();
      expect(calls.layout).toHaveLength(1);
      controls.setLayout(row([10, 90], group(['a']), group(['b'])));
      await microtasks();
      expect(calls.layout).toHaveLength(1);
      release();
      await flush();
      expect(calls.layout).toHaveLength(1);
    });
  });

  it('reports each of two drags in quick succession once', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'] });
    await ready();
    const drag = async (from: number, to: number) => {
      pointer('pointerdown', document.querySelector<HTMLElement>('.dv-sash')!, from);
      pointer('pointermove', document, to);
      pointer('pointerup', document, to);
      await microtasks();
    };
    await drag(450, 550);
    expect(calls.layout).toHaveLength(1);
    await drag(550, 400);
    expect(calls.layout).toHaveLength(2);
    const [first, second] = sizesOf(calls.layout[1]);
    expect(first!).toBeLessThan(second!);
    await flush();
    expect(calls.layout).toHaveLength(2);
  });
});
