import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

  it.each([
    ['a reconcile to a new layout', (controls: ReturnType<typeof mountDock>['controls']) => { controls.setLayout(row([30, 70], group(['a']), group(['b']))); }],
    ['a window resize', () => { observer.resize(700, 500); }],
  ])('does not report %s', async (_name, change) => {
    const { calls, controls } = mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'] });
    await ready();
    change(controls);
    await flush();
    expect(calls.layout).toHaveLength(0);
    observer.resize(900, 600);
  });

  it('does not report a layout change after the drag has ended (the flag does not outlive it)', async () => {
    const { calls, controls } = mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'] });
    await ready();
    pointer('pointerdown', document.querySelector<HTMLElement>('.dv-sash')!, 450);
    pointer('pointermove', document, 550);
    pointer('pointerup', document, 550);
    await flush();
    expect(calls.layout).toHaveLength(1);
    calls.layout.length = 0;
    observer.resize(700, 500);
    controls.setLayout(row([30, 70], group(['a']), group(['b'])));
    await flush();
    expect(calls.layout).toHaveLength(0);
    observer.resize(900, 600);
  });
});
