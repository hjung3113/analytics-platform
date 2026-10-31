import { type HostLinkProps, type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { FindingDetailPanel } from '@/test/host-adapters/features/findings/components/FindingDetail/FindingDetailPanel';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type UseFindingDetailPartsArgs, useFindingDetailParts } from './FindingDetailParts';

const FINDING_ID = '10000000-0000-0000-0000-000000000001';
const TASK_ID = '20000000-0000-0000-0000-000000000002';
const VOC_ID = '50000000-0000-0000-0000-000000000005';
const CLUSTER_ID = '70000000-0000-7000-8000-000000000007';

const detailState = vi.hoisted(() => ({
  value: {} as {
    data?: unknown;
    isLoading?: boolean;
    isError?: boolean;
    isSuccess?: boolean;
    isFetching?: boolean;
    error?: unknown;
  },
}));
const finding = vi.hoisted(() => ({
  value: {
    id: '10000000-0000-0000-0000-000000000001',
    workspace_id: '90000000-0000-0000-0000-000000000009',
    display_id: 'FIN-179',
    primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
    title: '리포트 속도 저하',
    summary: '쿼리 플랜 개선 필요',
    source_type: 'manual',
    source_id: null as string | null,
    owner_actor_id: null,
    owner_team_id: null,
    evidence_count: 0,
    severity: 'high',
    confidence: 'medium',
    status: 'active',
    analytics_area_id: null,
    linked_task_id: null as string | null,
    linked_milestone_id: null,
    created_by: '40000000-0000-0000-0000-000000000004',
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
    source: null,
  } as Record<string, unknown>,
}));
const clusterDetail = vi.hoisted(() => ({
  value: { isSuccess: false } as Record<string, unknown>,
}));

vi.mock('@/features/findings/hooks/useFindingDetail', () => ({
  useFindingDetail: () => detailState.value,
}));
vi.mock('@/features/findings/hooks/useEvidenceHighlights', () => ({
  useEvidenceHighlights: () => ({ data: [], isLoading: false, isError: false }),
}));
vi.mock('@/features/findings/hooks/useFindingStatusMutation', () => ({
  useFindingStatusMutation: () => ({
    mutate: (_input: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.(),
    isPending: false,
  }),
}));
vi.mock('@/features/voc-cluster/hooks/useVocClusterDetail', () => ({
  useVocClusterDetail: () => clusterDetail.value,
}));
vi.mock('@/features/cross-system/progress-notes/ProgressNotesSection', () => ({
  ProgressNotesSection: () => null,
}));
vi.mock('@/lib/cross-system/useVocDetail', () => ({
  useVocDetail: () => ({ data: { title: 'Export failures', display_id: 'VOC-1001' } }),
}));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('@/lib/cross-system/usePermissionCheckBridge', () => ({
  usePermissionCheckBridge: () => ({ data: { state: 'approved' } }),
}));
vi.mock('@/lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/me')>()),
  useMeBridge: () => ({ data: { actor: { role_level: 'admin' } } }),
}));
vi.mock('@/lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/registry-reads')>()),
  fetchAnalyticsAreas: vi.fn(async () => ({ items: [] })),
  fetchManagedSystems: vi.fn(async () => ({ items: [] })),
}));
vi.mock('@/lib/api/task-requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/task-requests')>()),
  fetchTaskRequests: vi.fn(async () => ({ items: [] })),
}));
vi.mock('@/lib/api/tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/tasks')>()),
  getTask: vi.fn(async () => ({
    id: '20000000-0000-0000-0000-000000000002',
    display_id: 'TASK-901',
    title: '매출 리포트 쿼리 플랜 개선',
  })),
}));
vi.mock('@/lib/api/errorMapper', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/errorMapper')>()),
  errorMapper: () => ({ message: 'mapped error' }),
}));

function makeSeam(linkable: boolean) {
  const calls = {
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
    navigate: vi.fn(),
    title: vi.fn(),
  };
  const seam: HostSeam = {
    canLink: vi.fn(() => linkable),
    Link: ({ to, children, ...rest }: HostLinkProps) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    notifyError: calls.notifyError,
    notifySuccess: calls.notifySuccess,
    notify: vi.fn(() => 'notice'),
    dismiss: vi.fn(),
    useNavigate: () => calls.navigate,
    useTitle: calls.title,
  };
  return { seam, calls };
}

function Harness(props: UseFindingDetailPartsArgs) {
  const parts = useFindingDetailParts(props);
  return (
    <div>
      <div data-testid="view">{parts.view.kind}</div>
      <div data-testid="title">{parts.title}</div>
      <div data-testid="body">{parts.body}</div>
    </div>
  );
}

function renderIn(seam: HostSeam, ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HostSeamProvider value={seam}>{ui}</HostSeamProvider>
    </QueryClientProvider>,
  );
}

function loaded() {
  detailState.value = {
    data: finding.value,
    isLoading: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  finding.value = {
    ...finding.value,
    source_type: 'manual',
    source_id: null,
    linked_task_id: null,
  };
  clusterDetail.value = { isSuccess: false };
  loaded();
});

describe('useFindingDetailParts', () => {
  it.each([
    {
      name: 'loading',
      state: { isLoading: true, isError: false },
      kind: 'loading',
      title: 'Finding',
      text: null,
      label: 'Finding 상세 불러오는 중',
    },
    {
      name: 'not-found',
      state: { isLoading: false, isError: true, error: { code: 'not_found.record' } },
      kind: 'not-found',
      title: 'Finding',
      text: 'Finding을 찾을 수 없습니다.',
    },
    {
      name: 'missing data',
      state: { isLoading: false, isError: false, data: undefined },
      kind: 'not-found',
      title: 'Finding',
      text: 'Finding을 찾을 수 없습니다.',
    },
    {
      name: 'blocked',
      state: { isLoading: false, isError: true, error: { code: 'permission.denied' } },
      kind: 'blocked',
      title: 'Finding',
      text: 'Finding 상세',
    },
    {
      name: 'error',
      state: { isLoading: false, isError: true, error: { code: 'server.error' } },
      kind: 'error',
      title: 'Finding',
      text: '데이터를 불러오지 못했습니다.',
    },
    {
      name: 'full',
      state: undefined,
      kind: 'full',
      title: 'FIN-179 · 리포트 속도 저하',
      testId: 'finding-detail-panel',
    },
  ])('the $name state gives view, title and body', (c) => {
    if (c.state !== undefined) detailState.value = c.state;
    const { seam } = makeSeam(true);
    renderIn(seam, <Harness findingId={FINDING_ID} onClose={() => {}} />);

    expect(screen.getByTestId('view')).toHaveTextContent(c.kind);
    expect(screen.getByTestId('title')).toHaveTextContent(c.title);
    const body = within(screen.getByTestId('body'));
    if (c.text) expect(body.getAllByText(c.text).length).toBeGreaterThan(0);
    if (c.label) expect(body.getByLabelText(c.label)).toBeInTheDocument();
    if (c.testId) expect(body.getByTestId(c.testId)).toBeInTheDocument();
  });

  it('calls onClose from the not-found button', async () => {
    detailState.value = { isLoading: false, isError: true, error: { code: 'not_found.record' } };
    const onClose = vi.fn();
    const { seam } = makeSeam(true);
    renderIn(seam, <Harness findingId={FINDING_ID} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: 'Findings 목록으로' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('gives the host the document title once loaded and null while loading', () => {
    const { seam, calls } = makeSeam(true);
    renderIn(seam, <Harness findingId={FINDING_ID} onClose={() => {}} />);
    expect(calls.title).toHaveBeenLastCalledWith('FIN-179 · 리포트 속도 저하');

    detailState.value = { isLoading: true, isError: false };
    const loading = makeSeam(true);
    renderIn(loading.seam, <Harness findingId={FINDING_ID} onClose={() => {}} />);
    expect(loading.calls.title).toHaveBeenLastCalledWith(null);
  });

  it('reports 조치 불필요 through the host notice', async () => {
    const { seam, calls } = makeSeam(true);
    renderIn(seam, <Harness findingId={FINDING_ID} onClose={() => {}} />);

    await userEvent.click(screen.getByTestId('mark-not-actionable-btn'));

    expect(calls.notifySuccess).toHaveBeenCalledWith('Finding이 조치 불필요로 표시되었습니다.');
  });

  it.each([
    {
      name: 'linked Task',
      patch: { linked_task_id: TASK_ID },
      href: `/tasks?view=backlog&param=${TASK_ID}`,
      text: 'TASK-901',
    },
    {
      name: 'linked VOC',
      patch: { source_type: 'voc', source_id: VOC_ID },
      href: `/vocs?view=inbox&selected=${VOC_ID}`,
      text: 'VOC-1001',
    },
    {
      name: 'source Cluster',
      patch: { source_type: 'voc_cluster', source_id: CLUSTER_ID },
      href: `/voc-clusters/${CLUSTER_ID}`,
      text: 'CLU-9001',
    },
  ])('$name links through the host only when canLink allows it', async (c) => {
    finding.value = { ...finding.value, ...c.patch };
    clusterDetail.value = {
      isSuccess: true,
      data: { title: '결제 실패 클러스터', display_id: 'CLU-9001' },
    };
    loaded();

    const linked = makeSeam(true);
    const first = renderIn(linked.seam, <Harness findingId={FINDING_ID} onClose={() => {}} />);
    const link = (await screen.findByText(c.text)).closest('a');
    expect(link?.getAttribute('href')).toBe(c.href);
    expect(linked.seam.canLink).toHaveBeenCalledWith(c.href);
    first.unmount();

    const unlinked = makeSeam(false);
    renderIn(unlinked.seam, <Harness findingId={FINDING_ID} onClose={() => {}} />);
    const label = await screen.findByText(c.text);
    expect(label.closest('a')).toBeNull();
    expect(unlinked.seam.canLink).toHaveBeenCalledWith(c.href);
  });

  it('the standalone panel sends the not-found button to /findings', async () => {
    detailState.value = { isLoading: false, isError: true, error: { code: 'not_found.record' } };
    const { seam, calls } = makeSeam(true);
    renderIn(seam, <FindingDetailPanel findingId={FINDING_ID} />);

    await userEvent.click(screen.getByRole('button', { name: 'Findings 목록으로' }));

    expect(calls.navigate).toHaveBeenCalledWith('/findings');
  });

  it('the full-page body still renders the finding title (no switch)', () => {
    const { seam } = makeSeam(true);
    renderIn(seam, <Harness findingId={FINDING_ID} onClose={() => {}} />);

    expect(screen.getByTestId('title')).toHaveTextContent('FIN-179 · 리포트 속도 저하');
    expect(within(screen.getByTestId('body')).getByRole('heading', { name: '리포트 속도 저하' }))
      .toBeInTheDocument();
  });

  it('the slot body (titleInHeader) omits the title the header already shows', () => {
    const { seam } = makeSeam(true);
    renderIn(
      seam,
      <Harness findingId={FINDING_ID} onClose={() => {}} titleInHeader />,
    );

    expect(screen.getByTestId('title')).toHaveTextContent('FIN-179 · 리포트 속도 저하');
    expect(
      within(screen.getByTestId('body')).queryByRole('heading', { name: '리포트 속도 저하' }),
    ).toBeNull();
    // The summary section under the title block stays.
    expect(within(screen.getByTestId('body')).getAllByText('요약').length).toBeGreaterThan(0);
    expect(within(screen.getByTestId('body')).getByText('쿼리 플랜 개선 필요')).toBeInTheDocument();
  });
});
