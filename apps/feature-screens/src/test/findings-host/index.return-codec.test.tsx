// The Findings back link keeps the stored VOC URL exactly (#762 l, review F1). `returnTo` is a string the app codec
// (`stringifyAppSearch`) already serialized, so the router in this harness uses the production codec: the link must show
// that string unchanged and a plain click must restore the VOC search once decoded, not quote it a second time.

import {
  parseAppSearch,
  stringifyAppSearch,
} from '@/test/host-adapters/lib/router/search-serialization';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@ap/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ap/ui')>();
  return {
    ...actual,
    ListShell: ({
      list,
      detailPanel,
    }: {
      list: React.ReactNode;
      detailPanel?: React.ReactNode;
    }) => (
      <div data-shell="list">
        {list}
        {detailPanel}
      </div>
    ),
  };
});

vi.mock('@/test/host-adapters/features/findings/components/FindingDetail/index', () => ({
  FindingDetailPanel: ({
    findingId,
    headerExtras,
  }: {
    findingId: string;
    headerExtras?: React.ReactNode;
  }) => (
    <section data-testid="finding-detail-panel">
      <div data-testid="detail-panel-header-content">{headerExtras}</div>
      <div>finding:{findingId}</div>
    </section>
  ),
}));

import { FindingsListPage, findingsSearchSchema } from '@/test/findings-host/screen';

const F1_ID = '11111111-1111-4111-8111-111111111111';

function installFetch(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input.toString(), 'http://localhost');
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (url.pathname === '/findings')
      return json({ items: [], page: { total: 0, has_more: false } });
    if (url.pathname === '/actors') return json({ actors: [] });
    return json({ code: 'not_mocked' }, 500);
  }) as typeof globalThis.fetch;
}

function renderWithCodec(initialPath: string) {
  installFetch();
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/findings',
    validateSearch: (raw) => findingsSearchSchema.parse(raw),
    component: FindingsListPage,
  });
  const vocRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/vocs',
    component: () => <div data-testid="voc-origin-context" />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route, vocRoute]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
    parseSearch: parseAppSearch,
    stringifySearch: stringifyAppSearch,
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('/findings back link with the production search codec', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each(['true', 'null', '"quoted"', '1000'])(
    'keeps the stored VOC URL for q=%s and restores that q once',
    async (q) => {
      const stored = `/vocs${stringifyAppSearch({ view: 'inbox', q })}`;
      const router = renderWithCodec(
        `/findings${stringifyAppSearch({ selected: F1_ID, returnTo: stored })}`,
      );

      const link = await screen.findByRole('link', { name: '원래 VOC로 돌아가기' });
      expect(link.getAttribute('href')).toBe(stored);

      await userEvent.click(link);

      await waitFor(() => expect(router.state.location.pathname).toBe('/vocs'));
      expect(router.state.location.search).toMatchObject({ view: 'inbox', q });
    },
  );
});
