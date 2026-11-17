import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@ap/kernel';
import type { DockviewApi, DockviewReadyEvent } from 'dockview-react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DockLayoutBase } from '../DockLayout';
import { group, installResizeObserver } from './harness';

const engine = vi.hoisted(() => ({ api: null as DockviewApi | null, props: null as Record<string, unknown> | null, overlay: null as ((event: unknown) => void) | null, drop: null as ((event: unknown) => void) | null }));
vi.mock('dockview-react', async importOriginal => {
  const actual = await importOriginal<typeof import('dockview-react')>();
  return { ...actual, DockviewReact: (props: React.ComponentProps<typeof actual.DockviewReact>) => {
    engine.props = props as unknown as Record<string, unknown>;
    engine.drop = props.onWillDrop as typeof engine.drop;
    const onReady = (event: DockviewReadyEvent) => {
      engine.api = event.api;
      Object.defineProperty(event.api, 'onWillShowOverlay', { value: (handler: (event: unknown) => void) => { engine.overlay = handler; return { dispose() {} }; } });
      props.onReady(event);
    };
    return <actual.DockviewReact {...props} onReady={onReady} />;
  } };
});

const observer = installResizeObserver();
beforeAll(() => observer.resize(1000, 700));
afterAll(() => observer.restore());
afterEach(() => { cleanup(); vi.restoreAllMocks(); engine.api = null; });

async function mount({ workspace = true, floor = 360 } = {}) {
  render(<I18nProvider><DockLayoutBase label="배치" panels={['a', 'b'].map(id => ({ id, title: id, render: () => <div>{id}</div> }))}
    layout={group(['a'])} onLayoutChange={vi.fn()} separatorLabel={() => '경계'}
    floating={workspace ? { panels: [{ panelId: 'b', x: 0, y: 48, width: 500, height: 440 }], peekId: 'b', peekHeightFloor: floor, onDismissPeek: vi.fn(), onChange: vi.fn() } : undefined} /></I18nProvider>);
  await screen.findAllByRole('tab');
  await waitFor(() => expect(engine.api?.getPanel('a')).toBeDefined());
  if (workspace) await waitFor(() => expect(engine.api?.getPanel('b')?.api.location.type).toBe('floating'));
}

/** The content's natural height shows only while its height is released; otherwise it reads as the allocated height, as `h-full` does in a browser. */
function contentHeight(natural: () => number, allocated = 398) {
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    if (!this.hasAttribute('data-dock-panel-content')) return 0;
    return this.style.height === 'auto' ? natural() : Math.max(natural(), allocated);
  });
}

describe('workspace peek regressions (#2435)', () => {
  it.each(['content', 'edge'])('whole peek group cannot preview or drop onto %s', async kind => {
    await mount();
    const source = engine.api!.getPanel('b')!.group.id;
    const event = {
      kind, position: 'left', group: engine.api!.getPanel('a')!.group, api: engine.api!,
      getData: () => ({ viewId: engine.api!.id, groupId: source, panelId: null }),
      preventDefault: vi.fn(),
    };
    act(() => engine.overlay!(event));
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    act(() => engine.drop!(event));
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
  });
  it.each([
    { natural: 0, available: 652, floor: 360, expected: 360 },
    { natural: 60, available: 652, floor: 360, expected: 360 },
    { natural: 900, available: 652, floor: 360, expected: 440 },
    { natural: 60, available: 250, floor: 500, expected: 250 },
  ])('fits natural=$natural with floor=$floor inside available=$available', async ({ natural, available, floor, expected }) => {
    await mount({ floor });
    const panel = engine.api!.getPanel('b')!;
    const setSize = vi.spyOn(panel.group.api, 'setSize');
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const height = available + 48;
      return { x: 0, y: 0, top: 0, left: 0, right: 1000, bottom: height, width: 1000, height, toJSON() {} };
    });
    contentHeight(() => natural);
    act(() => observer.resize(1000, available + 48));
    expect(setSize).toHaveBeenLastCalledWith({ height: expected });
  });
  it('content that gets shorter shrinks the peek back to its floor (the measure never echoes the allocated height)', async () => {
    await mount();
    const panel = engine.api!.getPanel('b')!;
    const setSize = vi.spyOn(panel.group.api, 'setSize');
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ x: 0, y: 0, top: 0, left: 0, right: 1000, bottom: 700, width: 1000, height: 700, toJSON() {} }));
    let natural = 900;
    contentHeight(() => natural);
    act(() => observer.resize(1000, 700));
    expect(setSize).toHaveBeenLastCalledWith({ height: 440 });
    natural = 60;
    act(() => observer.resize(1000, 701));
    expect(setSize).toHaveBeenLastCalledWith({ height: 360 });
  });
  it('a float moved or resized in the compact display is saved with the stored layout unchanged', async () => {
    const onChange = vi.fn();
    const layout = group(['a']);
    render(<I18nProvider><DockLayoutBase label="배치" narrow panels={['a', 'b'].map(id => ({ id, title: id, render: () => <div>{id}</div> }))}
      layout={layout} onLayoutChange={vi.fn()} separatorLabel={() => '경계'}
      floating={{ panels: [{ panelId: 'b', x: 0, y: 48, width: 500, height: 300 }], onDismissPeek: vi.fn(), onChange }} /></I18nProvider>);
    await waitFor(() => expect(engine.api?.getPanel('b')?.api.location.type).toBe('floating'));
    act(() => { engine.api!.getPanel('b')!.group.api.setSize({ width: 320, height: 200 }); });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const [panels, tree] = onChange.mock.lastCall!;
    expect(panels.map((panel: { panelId: string }) => panel.panelId)).toEqual(['b']);
    expect(tree).toBe(layout);
  });
  it('peek content keeps the full height so fill-height bodies (charts) can draw', async () => {
    await mount();
    for (const content of document.querySelectorAll('[data-dock-panel-content]')) expect(content.className).toContain('h-full');
  });
  it('workspace floats use only the panel tabbar as their header', async () => {
    await mount();
    expect(engine.props?.floatingGroupDragHandle).toBe('tabbar');
  });
  it('BoardDock keeps the engine default floating header', async () => {
    await mount({ workspace: false });
    expect(engine.props?.floatingGroupDragHandle).toBeUndefined();
  });
});
