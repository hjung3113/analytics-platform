import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

// The composition entrypoint decides which SavedViewStore reaches the Kernel (#1043 Q2): the assembly's own, never a local mock store the entrypoint builds itself.
const seen = vi.hoisted(() => ({ providerProps: [] as Record<string, unknown>[], assembly: undefined as unknown }));

vi.mock('#platform-assembly', () => ({ createAssembly: () => seen.assembly }));
// The store factory itself moved to @ap/mock-server (1702h) and lint bans that import here and in main.tsx,
// so "builds no local store" is now enforced by the import boundary, not by mocking the factory.
vi.mock('@ap/kernel', async importOriginal => ({
  ...(await importOriginal<typeof import('@ap/kernel')>()),
  PlatformProvider: (props: Record<string, unknown>) => { seen.providerProps.push(props); return null; },
  I18nProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@ap/shell', () => ({ AppShell: () => null, RouteOutlet: () => null, GlobalContextBar: () => null, OpenInBoardAction: () => null }));
vi.mock('./slots', () => ({ makeAppSlots: () => () => ({}) }));

async function boot(assembly: unknown) {
  seen.assembly = assembly;
  await import('./main');
  await vi.waitFor(() => expect(seen.providerProps).not.toHaveLength(0)); // StrictMode renders twice
  return seen.providerProps[0]!;
}

beforeEach(() => {
  vi.resetModules();
  seen.providerProps.length = 0;
  document.body.innerHTML = '<div id="root"></div>';
});
afterEach(() => { document.body.innerHTML = ''; });

// Each case imports the whole app through main.tsx; the first import alone takes ~5 s of transform under load.
describe('main.tsx saved view wiring', { timeout: 30_000 }, () => {
  it('a real assembly (no savedViews) builds no local store and passes none to PlatformProvider', async () => {
    const props = await boot({ adapter: {}, topBarTools: null });
    expect(props.savedViews).toBeUndefined();
  });

  it('a mock assembly passes exactly its own store, without building another', async () => {
    const store = { mock: true };
    const props = await boot({ adapter: {}, topBarTools: null, savedViews: store });
    expect(props.savedViews).toBe(store);
  });
});
