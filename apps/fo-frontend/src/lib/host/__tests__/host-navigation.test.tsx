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

import { parseAppSearch, stringifyAppSearch } from '@/lib/router/search-serialization';
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

/** A router with the app's search codec, as `createAppRouter` builds it. */
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
    parseSearch: parseAppSearch,
    stringifySearch: stringifyAppSearch,
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

describe('host search semantics over the app codec', () => {
  it.each(['true', 'null', '"quoted"', '123'])(
    'a written %s reads back as that text and is written the way the router wrote it before',
    async (term) => {
      let navigate!: ReturnType<typeof useHostNavigate>;
      let search!: ReturnType<typeof useHostSearch>;
      const router = routerAt('/vocs', () => {
        navigate = useHostNavigate();
        search = useHostSearch();
      });
      render(<RouterProvider router={router} />);
      await vi.waitFor(() => expect(navigate).toBeDefined());
      await act(async () =>
        navigate(`/vocs?${new URLSearchParams({ view: 'inbox', q: term })}#h`, { replace: true }),
      );
      expect(search).toEqual({ view: 'inbox', q: term });
      expect(router.history.location.search).toBe(stringifyAppSearch({ view: 'inbox', q: term }));
      expect(router.history.location.hash).toBe('#h');
    },
  );

  it('reads a legacy bare true/number leaf as its text', async () => {
    let search!: ReturnType<typeof useHostSearch>;
    const router = routerAt('/vocs?q=true&n=null', () => {
      search = useHostSearch();
    });
    render(<RouterProvider router={router} />);
    await vi.waitFor(() => expect(search).toBeDefined());
    expect(search).toEqual({ q: 'true', n: 'null' });
  });

  it('hands a new search object per navigation, also back to the same URL', async () => {
    const seen: ReturnType<typeof useHostSearch>[] = [];
    const router = routerAt('/vocs?q=a', () => {
      seen.push(useHostSearch());
    });
    render(<RouterProvider router={router} />);
    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
    const first = seen.at(-1);
    await act(async () => router.navigate({ to: '/vocs', search: { q: 'b' } as never }));
    await act(async () => router.history.back());
    await vi.waitFor(() => expect(seen.at(-1)).toEqual({ q: 'a' }));
    expect(seen.at(-1)).not.toBe(first);
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
