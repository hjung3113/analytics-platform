import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  HostSeamProvider,
  clearDefaultHost,
  registerDefaultHost,
  useHostNavigate,
  useHostSeam,
  useHostSearch,
  useHostTitle,
} from '../host-seam';
import { tanstackHost } from '../tanstack-host';

/** TanStack's default `parseSearch` (JSON-parses values), not the app's: only `location.searchStr` keeps `q=123` a string. */
function routerAt(entry: string, probe: () => void) {
  const root = createRootRoute({
    component: function Probe() {
      probe();
      return null;
    },
  });
  const route = createRoute({ getParentRoute: () => root, path: '/vocs' });
  return createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [entry] }),
  });
}

afterEach(() => {
  registerDefaultHost(tanstackHost);
});

describe('host navigation over a TanStack router', () => {
  it('replaces the location, reads raw strings, and clears a key absent from `to`', async () => {
    let navigate!: ReturnType<typeof useHostNavigate>;
    let search!: ReturnType<typeof useHostSearch>;
    const router = routerAt('/vocs', () => {
      navigate = useHostNavigate();
      search = useHostSearch();
    });
    render(<RouterProvider router={router} />);
    await vi.waitFor(() => expect(navigate).toBeDefined());

    await act(async () => navigate('/vocs?view=inbox&q=a', { replace: true }));
    expect(router.history.location.search).toBe('?view=inbox&q=a');
    expect(search).toEqual({ view: 'inbox', q: 'a' });
    expect(router.history.length).toBe(1);

    await act(async () => navigate('/vocs?view=inbox&q=123'));
    expect(search).toEqual({ view: 'inbox', q: '123' });
    expect(search.q).toBe('123');

    await act(async () => navigate('/vocs?view=inbox'));
    expect(search).toEqual({ view: 'inbox' });
  });
});

describe('default host', () => {
  it('returns the registered default without a provider', () => {
    registerDefaultHost(tanstackHost);
    const { result } = renderHook(() => useHostSeam());
    expect(result.current).toBe(tanstackHost);
  });

  it('prefers the provider value over the default', () => {
    const seam = { ...tanstackHost };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <HostSeamProvider value={seam}>{children}</HostSeamProvider>
    );
    const { result } = renderHook(() => useHostSeam(), { wrapper });
    expect(result.current).toBe(seam);
  });

  it('throws when none is registered', () => {
    clearDefaultHost();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useHostSeam())).toThrow('HostSeamProvider is missing');
    error.mockRestore();
  });

  it.each([
    ['useHostNavigate', () => useHostNavigate()],
    ['useHostSearch', () => useHostSearch()],
    ['useHostTitle', () => useHostTitle('x')],
  ])('%s throws when the seam lacks the hook', (_name, hook) => {
    const seam = {
      canLink: () => false,
      Link: () => null,
      notifyError: () => undefined,
      notifySuccess: () => undefined,
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <HostSeamProvider value={seam}>{children}</HostSeamProvider>
    );
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(hook, { wrapper })).toThrow('HostSeamProvider is missing');
    error.mockRestore();
  });
});
