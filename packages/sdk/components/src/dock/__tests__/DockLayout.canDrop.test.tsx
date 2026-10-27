import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@ap/kernel';
import { column, group, installResizeObserver } from './harness';
import { DockLayout, DockLayoutBase } from '../DockLayout';
import type { DockDrop, DockRows } from '../dockTypes';

const panelData = vi.hoisted(() => ({ current: null as { viewId: string; groupId: string; panelId: string | null } | null }));
// The engine's own drag events need real geometry; the handlers the layout hands the engine are captured and called with fake events.
const engine = vi.hoisted(() => ({ willDrop: null as ((event: unknown) => void) | null, overlay: null as ((event: unknown) => void) | null }));
vi.mock('dockview-react', async importOriginal => {
  const actual = await importOriginal<typeof import('dockview-react')>();
  return {
    ...actual,
    getPanelData: () => panelData.current,
    DockviewReact: (props: React.ComponentProps<typeof actual.DockviewReact>) => {
      engine.willDrop = props.onWillDrop as typeof engine.willDrop;
      const onReady: typeof props.onReady = event => {
        Object.defineProperty(event.api, 'onWillShowOverlay', { value: (handler: (e: unknown) => void) => { engine.overlay = handler; return { dispose: () => { engine.overlay = null; } }; } });
        props.onReady(event);
      };
      return <actual.DockviewReact {...props} onReady={onReady} />;
    },
  };
});

const observer = installResizeObserver();
beforeAll(() => { observer.resize(900, 600); });
afterAll(() => { observer.restore(); });
afterEach(() => { cleanup(); engine.willDrop = null; engine.overlay = null; });

const panels = ['a', 'b', 'c'].map(id => ({ id, title: `패널 ${id}`, render: () => <div>content {id}</div> }));
const label = ({ dir }: { dir: string }) => dir;
const layout = column([50, 50], group(['a', 'b']), group(['c']));

async function mount(canDropAt?: (drop: DockDrop) => boolean) {
  render(<I18nProvider><DockLayout panels={panels} layout={layout} onLayoutChange={vi.fn()} separatorLabel={label} label="배치" minPanelSize={{ width: 20, height: 20 }} canDropAt={canDropAt} /></I18nProvider>);
  await screen.findAllByRole('tab');
  await waitFor(() => { expect(engine.overlay).not.toBeNull(); });
}

const target = (ids: string[]) => ({ panels: ids.map(id => ({ id })) });
function overlay(over: { panelId?: string | null; position: string; group?: string[]; kind?: string }) {
  const event = {
    kind: over.kind ?? 'content', position: over.position, group: over.group ? target(over.group) : undefined,
    getData: () => ({ viewId: 'own', groupId: 'g', panelId: over.panelId === undefined ? 'a' : over.panelId }),
    defaultPrevented: false, preventDefault: vi.fn(() => { event.defaultPrevented = true; }),
  };
  act(() => { engine.overlay!(event); });
  return event;
}
function drop(over: { panelId?: string | null; position: string; group?: string[]; kind?: string }, _onPanelDrop?: unknown) {
  const event = {
    kind: over.kind ?? 'content', position: over.position, group: over.group ? target(over.group) : undefined, api: { id: 'own' },
    getData: () => ({ viewId: 'own', groupId: 'g', panelId: over.panelId === undefined ? 'a' : over.panelId }),
    defaultPrevented: false, preventDefault: vi.fn(() => { event.defaultPrevented = true; }),
  };
  engine.willDrop!(event);
  return event;
}

describe('DockLayout canDropAt', () => {
  it('asks with the dragged tab, the tabs of the group under the pointer and the position; a false answer draws no preview and refuses the drop', async () => {
    const canDropAt = vi.fn((drop: DockDrop) => drop.position === 'center');
    await mount(canDropAt);
    const refused = overlay({ position: 'left', group: ['c'] });
    expect(canDropAt).toHaveBeenLastCalledWith({ panelId: 'a', targetGroupPanelIds: ['c'], position: 'left' });
    expect(refused.preventDefault).toHaveBeenCalled();
    expect(overlay({ position: 'center', group: ['c'] }).preventDefault).not.toHaveBeenCalled();

    const onPanelDrop = vi.fn();
    expect(drop({ position: 'right', group: ['c'] }, onPanelDrop).preventDefault).toHaveBeenCalled();
    expect(drop({ position: 'center', group: ['c'] }, onPanelDrop).preventDefault).not.toHaveBeenCalled();
  });

  it('reports a refused drop to onPanelDrop as null, before any move can be recorded (row mode)', async () => {
    const onPanelDrop = vi.fn();
    const rows: DockRows = { heights: [300, 300], minimums: [100, 100], maximum: 700, onHeightsChange: vi.fn(), onPanelDrop };
    render(<I18nProvider><DockLayoutBase panels={panels} layout={layout} onLayoutChange={vi.fn()} separatorLabel={label} label="배치" minPanelSize={{ width: 20, height: 20 }} rows={rows} canDropAt={drop => drop.position === 'center'} /></I18nProvider>);
    await screen.findAllByRole('tab');
    const refused = drop({ position: 'left', group: ['c'] }, onPanelDrop);
    expect(refused.preventDefault).toHaveBeenCalled();
    expect(onPanelDrop).toHaveBeenLastCalledWith(null);
    drop({ position: 'center', group: ['c'] }, onPanelDrop);
    expect(onPanelDrop).toHaveBeenLastCalledWith('a');
  });

  it('over the outer edge or with no group the target group list is empty', async () => {
    const canDropAt = vi.fn(() => true);
    await mount(canDropAt);
    overlay({ position: 'left', kind: 'edge', group: ['c'] });
    expect(canDropAt).toHaveBeenLastCalledWith({ panelId: 'a', targetGroupPanelIds: [], position: 'left' });
    overlay({ position: 'top' });
    expect(canDropAt).toHaveBeenLastCalledWith({ panelId: 'a', targetGroupPanelIds: [], position: 'top' });
  });

  it('is not asked for a dragged whole group, which keeps the engine behaviour', async () => {
    const canDropAt = vi.fn(() => false);
    await mount(canDropAt);
    expect(overlay({ panelId: null, position: 'left', group: ['c'] }).preventDefault).not.toHaveBeenCalled();
    expect(canDropAt).not.toHaveBeenCalled();
  });

  it('without the prop nothing is refused', async () => {
    await mount();
    expect(overlay({ position: 'left', group: ['c'] }).preventDefault).not.toHaveBeenCalled();
    expect(drop({ position: 'left', group: ['c'] }, vi.fn()).preventDefault).not.toHaveBeenCalled();
  });
});
