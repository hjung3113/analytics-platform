import { parseAppSearch, stringifyAppSearch } from '@/lib/router/search-serialization';
import { DetailPanelSlotProvider } from '@fops/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { recoveryVisualList } from '../../../../tests/visual/fixtures/recovery';
import {
  IntegrationDashboardRouteShell,
  validateIntegrationDashboardSearch,
} from '../../../routes/_authed/integration';

const ID = '11111111-1111-4111-8111-111111111111';
const time = '2026-07-20T08:00:00.000Z';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('writes history as a boolean through the production search codec', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const path = new URL(input, 'http://localhost').pathname;
      if (path === '/me')
        return response({
          actor: {
            id: ID,
            external_id: 'ext-admin',
            email: 'admin@example.com',
            display_name: '관리자',
            role_level: 'admin',
          },
          workspace_id: ID,
        });
      if (path === '/dashboard/summary')
        return response({
          computed_at: time,
          kpis: {},
          action_queues: [],
          coverage: [],
          by_managed_system: [],
        });
      if (path === '/managed-systems') return response({ items: [] });
      if (path === '/dashboard/recovery-items') return response(recoveryVisualList('active'));
      return response({ items: [], total: 0, next_cursor: null });
    }),
  );
  const root = createRootRoute({
    component: () => (
      <DetailPanelSlotProvider>
        <Outlet />
      </DetailPanelSlotProvider>
    ),
  });
  const route = createRoute({
    getParentRoute: () => root,
    path: '/integration',
    component: IntegrationDashboardRouteShell,
    validateSearch: validateIntegrationDashboardSearch,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/integration'] }),
    parseSearch: parseAppSearch,
    stringifySearch: stringifyAppSearch,
  });
  await act(async () => router.load());
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const queue = await screen.findByTestId('recovery-queue');
  fireEvent.mouseDown(within(queue).getByRole('tab', { name: '최근 처리 이력' }), {
    button: 0,
    ctrlKey: false,
  });
  await waitFor(() => expect(router.state.location.searchStr).toContain('history='));
  expect(router.state.location.searchStr).toContain('history=true');
  expect(router.state.location.searchStr).not.toContain('%22');
  expect((router.state.location.search as { history?: unknown }).history).toBe(true);
});
