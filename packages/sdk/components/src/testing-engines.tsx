// Test-only public entry `@ap/components/testing/engines` (ADR-0040 extension, ADR-0067, #1640): engine seams registered from inside
// this package, so `echarts/core` and `dockview-react` resolve from here. Import only from test files; the boundary lint rejects
// production imports. Call each function inside `vi.hoisted(async () => (await import('@ap/components/testing/engines')).fn())`,
// before the test's static imports run. This module must never import the chart or dock implementation: the engine would load before the mock.
import type { ComponentType } from 'react';
import { vi } from 'vitest';

export type CanvasProbe = { init: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn>; options: unknown[] };

/** Replaces the `echarts/core` canvas with a fake instance. Returns the probe: `init` calls, `dispose` calls and every `setOption` payload. */
export function mockEchartsCanvas(): CanvasProbe {
  const probe: CanvasProbe = { init: vi.fn(), dispose: vi.fn(), options: [] };
  vi.doMock('echarts/core', () => ({
    use: vi.fn(),
    init: (...args: unknown[]) => {
      probe.init(...args);
      return { setOption: (option: unknown) => probe.options.push(option), on: vi.fn(), off: vi.fn(), dispose: probe.dispose, resize: vi.fn(), dispatchAction: vi.fn(), getWidth: () => 800, getHeight: () => 300, getModel: () => ({ getComponent: () => null }) };
    },
  }));
  return probe;
}

export type DockEngineApi = { panels: { api: { setSize: (size: { width: number }) => void } }[] };
export type DockEngineProbe = { api: undefined | DockEngineApi };

/** Wraps the real `DockviewReact` and captures the engine `api` from its ready event. Returns the probe holding it. */
export function probeDockEngine(): DockEngineProbe {
  const probe: DockEngineProbe = { api: undefined };
  vi.doMock('dockview-react', async importOriginal => {
    const actual = await importOriginal<{ DockviewReact: ComponentType<{ onReady: (event: { api: DockEngineApi }) => void }> }>();
    const Real = actual.DockviewReact;
    return { ...actual, DockviewReact: (props: { onReady: (event: { api: DockEngineApi }) => void }) => <Real {...props} onReady={event => { probe.api = event.api; props.onReady(event); }} /> };
  });
  return probe;
}
