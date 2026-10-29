import { VocClusterDetailPanel } from '@/features/voc-cluster/components/detail/VocClusterDetailPanel';
import * as api from '@/lib/api';
import { fetchTaskRequests } from '@/lib/api';
import { ApiError } from '@/lib/api/types';
import { FindingDetailPanel } from '@/test/host-adapters/features/findings/components/FindingDetail/FindingDetailPanel';
import { MilestoneDetailPanel } from '@/test/host-adapters/features/tasks/components/MilestoneDetailPanel';
import { TaskDetailPanel } from '@/test/host-adapters/features/tasks/components/TaskDetailPanel';
import { VocDetailPanel } from '@/test/host-adapters/features/voc/components/detail/VocDetailPanel';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { tanstackHost } from '@/test/host-adapters/lib/host/tanstack-host';
import { AppFrame } from '@/test/detail-slot-host';
import { TaskRequestsRoute } from '@/test/screen-host/features/tasks/routes/TaskRequestsRoute';
import type { TaskDetailDto, TaskRequestDto } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const readResults = vi.hoisted(() => ({
  findings: {} as Record<string, unknown>,
  vocs: {} as Record<string, unknown>,
  clusters: {} as Record<string, unknown>,
  tasks: {} as Record<string, unknown>,
  milestones: {} as Record<string, unknown>,
  resolveRead: async (reads: Record<string, unknown>, id: string): Promise<unknown> => {
    const result = reads[id];
    if (result instanceof Error) throw result;
    return result;
  },
}));

vi.mock('@/features/findings/components/FindingDetail/FullFindingDetail', () => ({
  FullFindingDetail: ({ finding }: { finding: { display_id: string; title: string } }) => (
    <div data-testid="finding-record">
      {finding.display_id} {finding.title}
    </div>
  ),
}));

vi.mock('@/features/voc/components/detail/FullDetailView', () => ({
  FullDetailView: ({ voc }: { voc: { display_id: string; title: string } }) => (
    <div data-testid="voc-record">
      {voc.display_id} {voc.title}
    </div>
  ),
}));

vi.mock('@/features/voc/components/detail/SummaryPermissionView', () => ({
  SummaryPermissionView: () => <div>Summary only</div>,
}));

vi.mock('@/features/voc-cluster/hooks/useConfirmCluster', () => ({
  useConfirmCluster: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/features/voc-cluster/hooks/useRemoveClusterMember', () => ({
  useRemoveClusterMember: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/features/voc-cluster/hooks/useRequestTaskFromCluster', () => ({
  useRequestTaskFromCluster: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/cross-system/useManagedSystem', () => ({
  useManagedSystem: () => null,
}));

vi.mock('@/lib/auth/useMe', () => ({
  useMe: () => ({ data: { actor: { id: 'actor-1', role_level: 'admin' } } }),
}));

// The cluster panel reads the session through lib/api/me (761c).
vi.mock('@/lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/me')>()),
  useMeBridge: () => ({ data: { actor: { id: 'actor-1', role_level: 'admin' } } }),
}));

vi.mock('@/lib/cross-system/usePermissionCheck', () => ({
  usePermissionCheck: () => ({ data: { state: 'approved' } }),
}));

vi.mock('@/features/cross-system/progress-notes/ProgressNotesSection', () => ({
  ProgressNotesSection: () => null,
}));

vi.mock('@/features/tasks/components/milestone-detail/MilestoneDetailContent', () => ({
  MilestoneDetailContent: ({ milestone }: { milestone: { display_id: string; title: string } }) => (
    <div data-testid="milestone-record">
      {milestone.display_id} {milestone.title}
    </div>
  ),
}));

vi.mock('@ap/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ap/ui')>();
  return {
    ...actual,
    ListShell: ({
      list,
      detailPanel,
    }: { list: React.ReactNode; detailPanel?: React.ReactNode }) => (
      <div data-shell="list">
        <main>{list}</main>
        <aside>{detailPanel}</aside>
      </div>
    ),
  };
});

vi.mock('@/lib/api/registry-reads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/registry-reads')>();
  return {
    ...actual,
    fetchManagedSystems: vi.fn(async () => ({ items: [] })),
  };
});

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    apiRequest: vi.fn(async (_method: string, path: string) => {
      if (path.split('?')[0] === '/findings') return { data: { items: [] } };
      if (path.split('?')[0]?.endsWith('/candidate-peers'))
        return {
          data: {
            candidate_basis: 'same_managed_system_active_voc',
            candidates: [],
            page: { has_more: false },
          },
        };
      const [collection, id] = path.split('/').slice(1);
      const reads =
        collection === 'findings'
          ? readResults.findings
          : collection === 'voc-clusters'
            ? readResults.clusters
            : {};
      return { data: await readResults.resolveRead(reads, id ?? '') };
    }),
    apiClient: vi.fn(async (_method: string, path: string) => {
      const id = path.split('/').at(-1) ?? '';
      return { data: await readResults.resolveRead(readResults.vocs, id) };
    }),
    getTask: vi.fn(async (id: string) => {
      return readResults.resolveRead(readResults.tasks, id);
    }),
    fetchTaskRequests: vi.fn(async () => ({ items: [] })),
    resolveActors: vi.fn(async () => ({ actors: [], teams: [] })),
  };
});

// Screens import the module paths; forward at call time to the barrel overrides above.
vi.mock('@/lib/api/tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/tasks')>()),
  getTask: (...args: Parameters<typeof api.getTask>) => api.getTask(...args),
}));
vi.mock('@/lib/api/task-requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/task-requests')>()),
  fetchTaskRequests: (...args: Parameters<typeof api.fetchTaskRequests>) =>
    api.fetchTaskRequests(...args),
}));
vi.mock('@/lib/api/actors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/actors')>()),
  resolveActors: (...args: Parameters<typeof api.resolveActors>) => api.resolveActors(...args),
}));

// useVocDetail imports the client module directly (bridge-safe graph, #654), not the barrel mocked above.
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    // The cluster hooks import the client module directly (761c), like useVocDetail.
    apiRequest: (async (method: string, path: string, ...rest: unknown[]) => {
      const [collection, id] = path.split('/').slice(1);
      if (collection === 'findings' && id)
        return { data: await readResults.resolveRead(readResults.findings, id) };
      if (collection !== 'voc-clusters')
        return (actual.apiRequest as (...args: unknown[]) => Promise<unknown>)(
          method,
          path,
          ...rest,
        );
      return { data: await readResults.resolveRead(readResults.clusters, id ?? '') };
    }) as typeof actual.apiRequest,
    apiClient: vi.fn(async (_method: string, path: string) => {
      const id = path.split('/').at(-1) ?? '';
      return { data: await readResults.resolveRead(readResults.vocs, id) };
    }),
  };
});

vi.mock('@/lib/api/milestones', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/milestones')>();
  return {
    ...actual,
    getMilestone: vi.fn(async (id: string) => readResults.resolveRead(readResults.milestones, id)),
  };
});

// The platform bridge's seam shape: the host owns the page title and the detail parts never write one.
const PLATFORM_LIKE_HOST: HostSeam = { ...tanstackHost, hostOwnsTitle: true, useTitle: () => undefined };

const IDS = {
  allowed: '10000000-0000-4000-8000-000000000001',
  blocked: '10000000-0000-4000-8000-000000000002',
  taskRequestA: '20000000-0000-4000-8000-000000000001',
  taskRequestB: '20000000-0000-4000-8000-000000000002',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderAtRoute(
  path: '/vocs' | '/findings' | '/tasks' | '/voc-clusters',
  Page: () => React.ReactNode,
  initialUrl: string = path,
) {
  const root = createRootRoute({
    component: () => (
      <HostSeamProvider value={PLATFORM_LIKE_HOST}>
        <Outlet />
      </HostSeamProvider>
    ),
  });
  const pageRoute = createRoute({
    getParentRoute: () => root,
    path,
    component: Page,
  });
  const router = createRouter({
    routeTree: root.addChildren([pageRoute]),
    history: createMemoryHistory({ initialEntries: [initialUrl] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, queryClient };
}

function FindingSelection() {
  const [id, setId] = React.useState(IDS.allowed);
  return (
    <>
      <button type="button" onClick={() => setId(IDS.blocked)}>
        Select blocked Finding
      </button>
      <FindingDetailPanel findingId={id} />
    </>
  );
}

function VocSelection() {
  const [id, setId] = React.useState(IDS.allowed);
  return (
    <>
      <button type="button" onClick={() => setId(IDS.blocked)}>
        Select blocked VOC
      </button>
      <VocDetailPanel vocId={id} onClose={() => undefined} />
    </>
  );
}

function ClusterSelection() {
  const [id, setId] = React.useState(IDS.allowed);
  return (
    <>
      <button type="button" onClick={() => setId(IDS.blocked)}>
        Select missing Cluster
      </button>
      <VocClusterDetailPanel clusterId={id} />
    </>
  );
}

function TaskSelection() {
  const [id, setId] = React.useState(IDS.allowed);
  return (
    <>
      <button type="button" onClick={() => setId(IDS.blocked)}>
        Select blocked Task
      </button>
      <TaskDetailPanel
        taskId={id}
        onClose={() => undefined}
        actorNamesById={new Map()}
        managedSystemNamesById={new Map()}
      />
    </>
  );
}

function MilestoneSelection() {
  const [id, setId] = React.useState(IDS.allowed);
  return (
    <>
      <button type="button" onClick={() => setId(IDS.blocked)}>
        Select missing Milestone
      </button>
      <MilestoneDetailPanel
        milestoneId={id}
        onClose={() => undefined}
        actorNamesById={new Map()}
        managedSystemNamesById={new Map()}
        analyticsAreaNamesById={new Map()}
      />
    </>
  );
}

const TASK_REQUEST_SOURCE_ID = '50000000-0000-4000-8000-000000000005';

const taskRequest = (id: string, displayId: string, requestedOutcome: string): TaskRequestDto => ({
  id,
  workspace_id: '90000000-0000-4000-8000-000000000009',
  display_id: displayId,
  source_type: 'finding',
  source_id: '50000000-0000-4000-8000-000000000005',
  primary_managed_system_id: '30000000-0000-4000-8000-000000000003',
  evidence_summary: 'summary',
  requested_outcome: requestedOutcome,
  requester_actor_id: '40000000-0000-4000-8000-000000000004',
  status: 'pending_review',
  assigned_reviewer_actor_id: null,
  assigned_reviewer_team_id: null,
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  source: {
    id: '50000000-0000-4000-8000-000000000005',
    type: 'finding',
    relation_type: 'requested_task',
    link_id: '60000000-0000-4000-8000-000000000006',
  },
});

/** The shell's detail slot host (`AppFrame`'s `<aside>`): the Task Request panel parts register their frame here. */
const detailSlot = () => document.querySelector('[data-app-frame] > aside');

function TaskRequestSelection() {
  const [selectedParam, setSelectedParam] = React.useState(IDS.taskRequestA);
  return (
    <>
      <button type="button" onClick={() => setSelectedParam('missing-request-id')}>
        Select missing Task Request
      </button>
      <AppFrame>
        <TaskRequestsRoute selectedParam={selectedParam} />
      </AppFrame>
    </>
  );
}

const taskDetail = (id: string, displayId: string, title: string): TaskDetailDto => ({
  id,
  workspace_id: '90000000-0000-4000-8000-000000000009',
  display_id: displayId,
  title,
  status: 'backlog',
  priority: 'medium',
  assignee_actor_id: null,
  assignee_team_id: null,
  due_date: null,
  primary_managed_system_id: '30000000-0000-4000-8000-000000000003',
  milestone_id: null,
  analytics_area_id: null,
  source_task_request_id: null,
  created_by: '40000000-0000-4000-8000-000000000004',
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  source: null,
});

const milestone = (id: string, displayId: string, title: string) => ({
  id,
  display_id: displayId,
  title,
  primary_managed_system_id: '30000000-0000-4000-8000-000000000003',
  source_finding: null,
});

beforeEach(() => {
  readResults.findings = {
    [IDS.allowed]: { id: IDS.allowed, display_id: 'FIN-1', title: 'Finding title' },
    [IDS.blocked]: new ApiError(403, { code: 'permission.denied', message: 'Finding is blocked' }),
    // The Task Request panel parts read their source Finding.
    [TASK_REQUEST_SOURCE_ID]: { id: TASK_REQUEST_SOURCE_ID, display_id: 'FIN-9', title: 'Source' },
  };
  readResults.vocs = {
    [IDS.allowed]: {
      id: IDS.allowed,
      display_id: 'VOC-1',
      title: 'VOC title',
      primary_managed_system_id: '30000000-0000-4000-8000-000000000003',
      reporter_id: 'actor-1',
      triage_state: 'untriaged',
    },
    [IDS.blocked]: new ApiError(403, { code: 'permission.denied', message: 'VOC is blocked' }),
  };
  readResults.clusters = {
    [IDS.allowed]: {
      id: IDS.allowed,
      display_id: 'CLU-1',
      title: 'Cluster title',
      primary_managed_system_id: '30000000-0000-4000-8000-000000000003',
      status: 'open',
      members: [],
      linked_findings: [],
    },
    [IDS.blocked]: new ApiError(404, { code: 'not_found.record', message: 'Cluster missing' }),
  };
  readResults.tasks = {
    [IDS.allowed]: taskDetail(IDS.allowed, 'TASK-1', 'Task title'),
    [IDS.blocked]: new ApiError(403, {
      code: 'permission.denied',
      message: 'Task is not readable',
    }),
  };
  readResults.milestones = {
    [IDS.allowed]: milestone(IDS.allowed, 'MLS-1', 'Milestone title'),
    [IDS.blocked]: new ApiError(404, {
      code: 'not_found.record',
      message: 'Milestone missing',
    }),
  };
  vi.mocked(fetchTaskRequests).mockResolvedValue({
    items: [
      taskRequest(IDS.taskRequestA, 'REQ-1', 'Request A outcome'),
      taskRequest(IDS.taskRequestB, 'REQ-2', 'Request B outcome'),
    ],
  });
});

describe('production detail parts under a host that owns the title: denial, missing and refetch failure', () => {
  it('Finding: shows the permitted record, then a 403 shows the denied state and never the record', async () => {
    renderAtRoute('/findings', FindingSelection);
    await waitFor(() => expect(screen.getByTestId('finding-record')).toHaveTextContent('FIN-1 Finding title'));

    const blockedRead = deferred<unknown>();
    readResults.findings[IDS.blocked] = blockedRead.promise;
    fireEvent.click(screen.getByRole('button', { name: 'Select blocked Finding' }));
    expect(await screen.findByLabelText('Finding 상세 불러오는 중')).toBeInTheDocument();
    expect(screen.queryByTestId('finding-record')).not.toBeInTheDocument();

    blockedRead.reject(
      new ApiError(403, { code: 'permission.denied', message: 'Finding is blocked' }),
    );
    await waitFor(
      () => expect(screen.getByRole('heading', { name: 'Finding 상세' })).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(screen.queryByTestId('finding-record')).not.toBeInTheDocument();
  });

  it('VOC: shows the permitted record, then a 403 shows the error state and never the record', async () => {
    renderAtRoute('/vocs', VocSelection, '/vocs?view=inbox');
    await waitFor(() => expect(screen.getByTestId('voc-record')).toHaveTextContent('VOC-1 VOC title'));

    const blockedRead = deferred<unknown>();
    readResults.vocs[IDS.blocked] = blockedRead.promise;
    fireEvent.click(screen.getByRole('button', { name: 'Select blocked VOC' }));
    expect(await screen.findByLabelText('VOC 상세 불러오는 중')).toBeInTheDocument();
    expect(screen.queryByTestId('voc-record')).not.toBeInTheDocument();

    blockedRead.reject(new ApiError(403, { code: 'permission.denied', message: 'VOC is blocked' }));
    await waitFor(
      () => expect(screen.getByText('데이터를 불러오지 못했습니다.')).toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(screen.queryByTestId('voc-record')).not.toBeInTheDocument();
  });

  it('Cluster: shows the permitted record, then a 404 shows the not-found state and never the record', async () => {
    renderAtRoute('/voc-clusters', ClusterSelection);
    await waitFor(() => expect(screen.getByText('Cluster title')).toBeInTheDocument());

    const missingRead = deferred<unknown>();
    readResults.clusters[IDS.blocked] = missingRead.promise;
    fireEvent.click(screen.getByRole('button', { name: 'Select missing Cluster' }));
    expect(await screen.findByTestId('cluster-detail-skeleton')).toBeInTheDocument();

    missingRead.reject(new ApiError(404, { code: 'not_found.record', message: 'Cluster missing' }));
    await waitFor(
      () =>
        expect(screen.getByTestId('cluster-detail-error')).toHaveTextContent('찾을 수 없습니다'),
      { timeout: 4000 },
    );
    expect(screen.queryByText('Cluster title')).not.toBeInTheDocument();
  });

  it('Task: shows the permitted record, then a 403 shows the denied state and never the record', async () => {
    renderAtRoute('/tasks', TaskSelection, '/tasks?view=backlog');
    await waitFor(() => expect(screen.getAllByText('Task title').length).toBeGreaterThan(0));

    const blockedRead = deferred<unknown>();
    readResults.tasks[IDS.blocked] = blockedRead.promise;
    fireEvent.click(screen.getByRole('button', { name: 'Select blocked Task' }));
    expect(await screen.findByLabelText('Task 상세 불러오는 중')).toHaveAttribute('aria-busy', 'true');

    blockedRead.reject(
      new ApiError(403, { code: 'permission.denied', message: 'Task is not readable' }),
    );
    await waitFor(() => expect(screen.getByText('Task detail')).toBeInTheDocument());
    expect(screen.queryAllByText('Task title')).toHaveLength(0);
  });

  it('Milestone: shows the permitted record, then a 404 shows the unavailable state and never the record', async () => {
    renderAtRoute('/tasks', MilestoneSelection, '/tasks?view=milestones');
    await waitFor(() => expect(screen.getByTestId('milestone-record')).toHaveTextContent('MLS-1 Milestone title'));

    const missingRead = deferred<unknown>();
    readResults.milestones[IDS.blocked] = missingRead.promise;
    fireEvent.click(screen.getByRole('button', { name: 'Select missing Milestone' }));
    expect(await screen.findByText('Milestone을 불러오는 중…')).toBeInTheDocument();

    missingRead.reject(
      new ApiError(404, { code: 'not_found.record', message: 'Milestone missing' }),
    );
    await waitFor(() =>
      expect(screen.getByText('Milestone 상세를 불러오지 못했습니다.')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('milestone-record')).not.toBeInTheDocument();
  });

  it('Finding: a settled failed refetch keeps the React Query data but never renders the stale record', async () => {
    const { queryClient } = renderAtRoute('/findings', FindingSelection);
    await waitFor(() => expect(screen.getByTestId('finding-record')).toBeInTheDocument());

    const failedRefetch = deferred<unknown>();
    readResults.findings[IDS.allowed] = failedRefetch.promise;
    const refetch = queryClient.refetchQueries({ queryKey: ['finding', IDS.allowed] });
    await waitFor(() =>
      expect(queryClient.getQueryState(['finding', IDS.allowed])?.fetchStatus).toBe('fetching'),
    );

    failedRefetch.reject(
      new ApiError(403, { code: 'permission.denied', message: 'Finding access expired' }),
    );
    await refetch;
    await waitFor(() =>
      expect(queryClient.getQueryState(['finding', IDS.allowed])?.status).toBe('error'),
    );
    expect(queryClient.getQueryData(['finding', IDS.allowed])).toMatchObject({ id: IDS.allowed });
    expect(screen.queryByTestId('finding-record')).not.toBeInTheDocument();
  });

  it('Task Request: a row click selects that record, and a missing URL target clears the selection', async () => {
    renderAtRoute('/tasks', TaskRequestSelection, '/tasks?view=requests');
    await waitFor(() => expect(detailSlot()).toHaveTextContent('REQ-1'));

    fireEvent.click(screen.getByRole('button', { name: /REQ-2/ }));
    await waitFor(() => expect(detailSlot()).toHaveTextContent('REQ-2'));

    fireEvent.click(screen.getByRole('button', { name: 'Select missing Task Request' }));
    await waitFor(() => expect(detailSlot()).not.toHaveTextContent('REQ-'));
  });
});
