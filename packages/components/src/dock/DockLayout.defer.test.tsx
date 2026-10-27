import { act, cleanup, screen, waitFor } from '@testing-library/react';
import type { DockviewApi } from 'dockview-react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DockNode } from './schema';
import { group, installResizeObserver, mountDock, resetMounts, row } from './__tests__/harness';

/** The engine's api, taken from its ready event: a test forces the layout notification a browser sends on every frame of a drag. */
const engine: { api: DockviewApi | null } = { api: null };
vi.mock('dockview-react', async importOriginal => {
  const actual = await importOriginal<typeof import('dockview-react')>();
  return { ...actual, DockviewReact: (props: Parameters<typeof actual.DockviewReact>[0]) => <actual.DockviewReact {...props} onReady={event => { engine.api = event.api; props.onReady(event); }} /> };
});

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
const groupWidths = () => Array.from(document.querySelectorAll<HTMLElement>('.dv-view')).filter(view => view.querySelector(':scope > .dv-groupview')).map(view => parseFloat(view.style.width));
/** jsdom has no layout parent, and the engine ignores a resize of an element without one. */
const withLayoutParent = async (run: () => Promise<void>) => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get() { return this.parentNode; } });
  try { await run(); } finally { delete (HTMLElement.prototype as { offsetParent?: unknown }).offsetParent; }
};
const engineSized = () => waitFor(() => { expect(groupWidths().reduce((sum, width) => sum + width, 0)).toBeGreaterThan(850); });
const sizesOf = (node: DockNode | undefined) => (node?.type === 'branch' ? node.sizes : []);

/** Content stand-in: counts its own renders per panel. */
const renders: Record<string, number> = {};
function Probe({ id }: { id: string }) { renders[id] = (renders[id] ?? 0) + 1; return <span data-probe={id} />; }
const inner = (id: string) => <Probe id={id} />;
const MOVES = 12;
/** A move, then the layout notification a browser sends on every frame of a drag (jsdom's engine sends none while the pointer moves). */
const moveAcross = async (from: number) => {
  for (let i = 1; i <= MOVES; i += 1) {
    pointer('pointermove', document, from + i * 10);
    act(() => { engine.api!.getPanel('a')!.api.setSize({ width: 450 + i * 10 }); });
    for (let j = 0; j < 8; j += 1) await Promise.resolve();
  }
};

describe('DockLayout defers a sash drag to its end (#1013)', () => {
  beforeEach(() => { for (const key of Object.keys(renders)) delete renders[key]; });

  it('tells the parent once with the last sizes, and re-renders no content while the pointer is down', async () => {
    await withLayoutParent(async () => {
      const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'], inner });
      await ready();
      await engineSized();
      await flush();
      pointer('pointerdown', document.querySelector<HTMLElement>('.dv-sash')!, 450);
      const before = { ...renders };
      await moveAcross(450);
      await flush();
      expect(calls.layout).toHaveLength(0);
      expect(renders).toEqual(before);
      pointer('pointerup', document, 450 + MOVES * 10);
      await flush();
      expect(calls.layout).toHaveLength(1);
      const [first, second] = sizesOf(calls.layout[0]);
      expect(first!).toBeGreaterThan(second!);
      expect(first! + second!).toBeCloseTo(100, 0);
    });
  });

  it('freezes the content at its size from the start of the drag and releases it at the end', async () => {
    await withLayoutParent(async () => {
      mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'], inner });
      await ready();
      await engineSized();
      const host = document.querySelector<HTMLElement>('[data-dock-panel="a"]')!;
      const content = host.querySelector<HTMLElement>('[data-dock-panel-content]')!;
      const root = document.querySelector('[data-dock-layout]')!;
      expect(root).not.toHaveAttribute('data-dock-resizing');
      pointer('pointerdown', document.querySelector<HTMLElement>('.dv-sash')!, 450);
      expect(root).toHaveAttribute('data-dock-resizing');
      expect(host).toHaveAttribute('data-dock-frozen');
      pointer('pointerup', document, 450);
      await flush();
      expect(root).not.toHaveAttribute('data-dock-resizing');
      expect(host).not.toHaveAttribute('data-dock-frozen');
      expect(content.style.width).toBe('');
    });
  });

  it('tells the parent nothing for a drag that changed nothing', async () => {
    await withLayoutParent(async () => {
      const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'] });
      await ready();
      await engineSized();
      pointer('pointerdown', document.querySelector<HTMLElement>('.dv-sash')!, 450);
      pointer('pointerup', document, 450);
      await flush();
      expect(calls.layout).toHaveLength(0);
    });
  });

  it('tells the parent once from the release timer when the engine sends no final notification', async () => {
    await withLayoutParent(async () => {
      const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'] });
      await ready();
      await engineSized();
      pointer('pointerdown', document.querySelector<HTMLElement>('.dv-sash')!, 450);
      await moveAcross(450);
      expect(calls.layout).toHaveLength(0);
      // Only the window's capture listener sees this release: the engine's own document listener never ends its drag.
      pointer('pointerup', window, 570);
      await flush();
      expect(calls.layout).toHaveLength(1);
      const [first, second] = sizesOf(calls.layout[0]);
      expect(first!).toBeGreaterThan(second!);
    });
  });

  it('tells the parent nothing when the layout unmounts mid-drag, and mounts again normally', async () => {
    await withLayoutParent(async () => {
      const layout = row([50, 50], group(['a']), group(['b']));
      const first = mountDock({ layout, ids: ['a', 'b'] });
      await ready();
      await engineSized();
      pointer('pointerdown', document.querySelector<HTMLElement>('.dv-sash')!, 450);
      await moveAcross(450);
      first.unmount();
      await flush();
      expect(first.calls.layout).toHaveLength(0);
      cleanup();
      const second = mountDock({ layout, ids: ['a', 'b'] });
      await ready();
      await engineSized();
      pointer('pointerdown', document.querySelector<HTMLElement>('.dv-sash')!, 450);
      await moveAcross(450);
      pointer('pointerup', document, 570);
      await flush();
      expect(second.calls.layout).toHaveLength(1);
    });
  });

  it('applies a separator key at once (not a drag)', async () => {
    const { calls } = mountDock({ layout: row([50, 50], group(['a']), group(['b'])), ids: ['a', 'b'] });
    await ready();
    const separator = document.querySelector<HTMLElement>('[role="separator"][data-dock-separator], [role="separator"]')!;
    act(() => { separator.focus(); });
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    act(() => { separator.dispatchEvent(event); });
    expect(calls.layout).toHaveLength(1);
  });
});
