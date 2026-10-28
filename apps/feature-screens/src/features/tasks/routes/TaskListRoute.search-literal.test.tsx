// TaskListRoute.search-literal.test.tsx — the standalone route's navigate writes every href value as the string it is;
// only the boolean `overdue` keeps its decoded type (#763 l, review F1).

import { getTask, listTasks } from '@/lib/api';
import { useMe } from '@/lib/auth/useMe';
import {
  parseAppSearch,
  stringifyAppSearch,
} from '@/test/host-adapters/lib/router/search-serialization';
import { TasksRouteView, validateTasksSearch } from '@/test/screen-host/routes/_authed/tasks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  listTasks: vi.fn(),
  getTask: vi.fn(),
}));
vi.mock('@/lib/api/tasks', async (io) => ({
  ...(await io<typeof import('@/lib/api/tasks')>()),
  listTasks: (...args: Parameters<typeof listTasks>) => listTasks(...args),
  getTask: (...args: Parameters<typeof getTask>) => getTask(...args),
}));
vi.mock('@/lib/api/me', async (io) => ({
  ...(await io<typeof import('@/lib/api/me')>()),
  useMeBridge: () => useMe(),
}));
vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({
    data: { actor: { id: '20000000-0000-0000-0000-000000000002', role_level: 'admin' } },
  }),
}));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('@/lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/registry-reads')>()),
  fetchManagedSystems: async () => ({ items: [] }),
}));
const A = '30000000-0000-0000-0000-000000000003';

function mount(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: '/tasks',
    validateSearch: validateTasksSearch,
    component: () => <TasksRouteView search={route.useSearch()} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [path] }),
    parseSearch: parseAppSearch,
    stringifySearch: stringifyAppSearch,
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

async function commitSearch(text: string) {
  const box = await screen.findByPlaceholderText('제목 또는 ID');
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: 'Enter' });
}

beforeEach(() => {
  vi.mocked(listTasks).mockReset();
  vi.mocked(getTask).mockReset();
  vi.mocked(listTasks).mockResolvedValue({ items: [], page: { total: 0, has_more: false } });
});
afterEach(cleanup);

describe('standalone Task list navigate', () => {
  it.each(['backlog', 'my'] as const)(
    'writes the literal search text "undefined" to the URL and keeps it (%s)',
    async (view) => {
      const router = mount(`/tasks?view=${view}&managedSystem=${A}`);
      await commitSearch('undefined');
      await waitFor(() => expect(router.state.location.search.q).toBe('undefined'));
      expect(router.state.location.href).toContain('q=undefined');
      await waitFor(() => expect(vi.mocked(listTasks).mock.calls.at(-1)?.[0]?.q).toBe('undefined'));
      expect(router.state.location.search.q).toBe('undefined');
    },
  );

  it('keeps overdue a boolean through an unrelated write, URL encoding unchanged', async () => {
    const router = mount(`/tasks?view=backlog&managedSystem=${A}&overdue=true`);
    await commitSearch('쿼리');
    await waitFor(() => expect(router.state.location.search.q).toBe('쿼리'));
    expect(router.state.location.search.overdue).toBe(true);
    expect(router.state.location.href).toContain('overdue=true');
    expect(router.state.location.href).not.toContain('overdue=%22');
  });

  it('leaves the other keys as they were', async () => {
    const router = mount(`/tasks?view=backlog&managedSystem=${A}&public_update=missing`);
    await commitSearch('abc');
    await waitFor(() => expect(router.state.location.search.q).toBe('abc'));
    expect(router.state.location.search).toEqual({
      view: 'backlog',
      managedSystem: A,
      public_update: 'missing',
      q: 'abc',
    });
  });
});
