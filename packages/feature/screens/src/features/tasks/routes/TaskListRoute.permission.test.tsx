import * as registryReads from '../../../lib/api/registry-reads';
import { useMe } from '../../../lib/auth/useMe';
import { GLOSSARY } from '../../../lib/copy/glossary';
import { PERMISSION_BLOCKED_REASONS } from '../../../lib/copy/permission-reasons';
import { HostSeamProvider, useHostSeam } from '../../../lib/host/host-seam';
import { TaskListRoute } from '../../../test/screen-host/features/tasks/routes/TaskListRoute';
import { useAccessRequestState } from '../../../test-support/access-request-host';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({
      to,
      search,
      children,
    }: { to: string; search: { view: string }; children: ReactNode }) => (
      <a href={`${to}?view=${search.view}`}>{children}</a>
    ),
  };
});
vi.mock('@ap/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ap/ui')>()),
  ListShell: ({
    toolbar,
    tabs,
    list,
    detailPanel,
  }: {
    toolbar?: { title?: ReactNode; actions?: ReactNode };
    tabs?: ReactNode;
    list: ReactNode;
    detailPanel?: ReactNode;
  }) => (
    <main>
      <header>
        {toolbar?.title}
        {toolbar?.actions}
      </header>
      <div data-testid="task-tabs">{tabs}</div>
      {list}
      <aside data-testid="task-detail">{detailPanel}</aside>
    </main>
  ),
}));
vi.mock('../../../lib/api/me', async (io) => ({
  ...(await io<typeof import('../../../lib/api/me')>()),
  useMeBridge: () => useMe(),
}));
vi.mock('../../../lib/auth/useMe', () => ({
  useMe: () => ({ data: { actor: { id: 'developer', role_level: 'developer' } } }),
}));
vi.mock('../../../lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('../../../lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/registry-reads')>()),
  fetchManagedSystems: async () => ({ items: [] }),
}));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each([false, true])('distinguishes a scoped empty Task list by finding.manage allow=%s', async (allow) => {
  const catalog = vi.spyOn(registryReads, 'fetchManagedSystems').mockRejectedValue(new Error('Catalog read failed'));
  const managedSystem = '30000000-0000-4000-8000-000000000003';
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const body = url.pathname === '/me/permissions/check'
      && url.searchParams.get('capability') === 'finding.manage'
      && url.searchParams.get('managed_system_id') === managedSystem
      ? { state: allow ? 'approved' : 'blocked_non_requestable', decision: { allow } }
      : { items: [], page: { total: 0, has_more: false } };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TaskListRoute view="backlog" managedSystem={managedSystem} />
    </QueryClientProvider>,
  );
  if (allow) {
    expect(await screen.findByTestId('list-state-message')).toHaveAttribute('data-variant', 'empty');
  } else {
    expect(await screen.findByText(PERMISSION_BLOCKED_REASONS.taskList)).toHaveAttribute('role', 'status');
    expect(screen.queryByTestId('list-state-message')).not.toBeInTheDocument();
    expect(catalog).toHaveBeenCalledTimes(1);
  }
});

it('names the archive for a Developer whose archived System is out of scope (#2768)', async () => {
  const managedSystem = '30000000-0000-4000-8000-000000000003';
  vi.spyOn(registryReads, 'fetchManagedSystems').mockResolvedValue({
    items: [{ id: managedSystem, name: 'Tableau', archived_at: '2026-01-01T00:00:00Z' }],
  } as Awaited<ReturnType<typeof registryReads.fetchManagedSystems>>);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const body = url.pathname === '/me/permissions/check'
      ? { state: 'blocked_non_requestable', decision: { allow: false, reason: 'no_grant', requestable: null } }
      : { items: [], page: { total: 0, has_more: false } };
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TaskListRoute view="backlog" managedSystem={managedSystem} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText(PERMISSION_BLOCKED_REASONS.archivedSystem)).toBeInTheDocument();
  expect(screen.queryByText(PERMISSION_BLOCKED_REASONS.taskList)).not.toBeInTheDocument();
  expect(screen.queryByText('필요한 권한')).not.toBeInTheDocument();
});

it('FIX1 shows the denied Task detail for an unreadable deep link without a Task title', async () => {
  const id = '10000000-0000-0000-0000-000000000099';
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      const denied = url.pathname === `/tasks/${id}`;
      return new Response(
        JSON.stringify(
          denied
            ? { code: 'permission.denied', message: 'permission denied' }
            : { items: [], page: { total: 0, has_more: false } },
        ),
        { status: denied ? 403 : 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TaskListRoute view="backlog" selectedParam={id} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText(PERMISSION_BLOCKED_REASONS.taskDetail)).toBeInTheDocument();
  expect(screen.getByTestId('task-detail')).toHaveTextContent('Task detail');
  expect(screen.queryByTestId('detail-panel-title')).not.toBeInTheDocument();
  expect(screen.queryByText('Restricted Task')).not.toBeInTheDocument();
});

it('hides Task list controls after a denied read and links to 내 VOC', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ code: 'permission.denied', message: 'finding.manage required' }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        ),
    ),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TaskListRoute view="my" filters={{ q: 'internal filter', status: 'doing' }} />
    </QueryClientProvider>,
  );

  expect(await screen.findByText(PERMISSION_BLOCKED_REASONS.taskList)).toBeInTheDocument();
  expect(screen.queryByPlaceholderText('제목 또는 ID')).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Task 상태' })).not.toBeInTheDocument();
  expect(screen.queryByText(/internal filter/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: GLOSSARY.myVocs })).toHaveAttribute(
    'href',
    '/vocs?view=my',
  );
});

it.each([
  ['blocked_not_requestable', { detail: { reason: 'role_required', minimum_role: 'developer' } }],
  ['request_access', { requestable_permission: {
    permission: 'finding.manage', managed_system_id: '30000000-0000-4000-8000-000000000003',
  } }],
] as const)('renders the Task list 403 as a %s card with ordered recovery actions', async (state, hint) => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const { pathname } = new URL(String(input), 'http://localhost');
    if (pathname === '/tasks') return Response.json({ code: 'permission.denied', ...hint }, { status: 403 });
    if (pathname === '/permission-requests/mine') return Response.json({ requests: [] });
    return Response.json({ items: [] });
  }));
  function Host() {
    const seam = useHostSeam();
    return <HostSeamProvider value={{
      ...seam, useAccessRequestState,
      usePermissionLinks: () => ({ permissionHomeHref: '/', permissionRequestHref: () => '/permission-requests' }),
    }}><TaskListRoute /></HostSeamProvider>;
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><Host /></QueryClientProvider>);

  const heading = await screen.findByRole('heading', { name: 'Task 목록' });
  const card = heading.closest<HTMLElement>('[data-state]');
  if (!card) throw new Error('Missing Task denial card');
  expect(card).toHaveAttribute('data-state', state);
  const home = within(card).getByRole('link', { name: '홈으로' });
  const recovery = within(card).getByRole('link', { name: '내 VOC' });
  expect(recovery).toHaveAttribute('href', '/vocs?view=my');
  const actions = [home, recovery];
  if (state === 'request_access') actions.unshift(await within(card).findByRole('link', { name: '권한 요청' }));
  else expect(within(card).getByText('Developer 이상 역할이 필요합니다.')).toBeInTheDocument();
  expect(Array.from(home.parentElement?.children ?? [])).toEqual(actions);
  expect(within(card).getByText('Task 목록을 볼 권한이 없습니다.')).toBeInTheDocument();
});

it('renders no list total once a refetch is denied after a successful load', async () => {
  const task = {
    id: '10000000-0000-0000-0000-000000000001',
    workspace_id: '90000000-0000-0000-0000-000000000009',
    display_id: 'TASK-1000',
    primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
    title: 'Retained Task',
    status: 'backlog',
    priority: 'high',
    assignee_actor_id: null,
    assignee_team_id: null,
    due_date: null,
    milestone_id: null,
    analytics_area_id: null,
    source_task_request_id: null,
    created_by: '20000000-0000-0000-0000-000000000002',
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
  };
  let denied = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const { pathname } = new URL(String(input), 'http://localhost');
      if (pathname !== '/tasks' && pathname !== `/tasks/${task.id}`) {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return denied
        ? new Response(JSON.stringify({ code: 'permission.denied', message: 'denied' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          })
        : new Response(
            JSON.stringify(
              pathname === '/tasks'
                ? { items: [task], page: { total: 41, has_more: false } }
                : task,
            ),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TaskListRoute view="my" filters={{}} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('41건')).toBeInTheDocument();

  denied = true;
  await client.invalidateQueries();

  await waitFor(() =>
    expect(screen.getByText(PERMISSION_BLOCKED_REASONS.taskList)).toBeInTheDocument(),
  );
  expect(screen.queryByText('41건')).not.toBeInTheDocument();
});
