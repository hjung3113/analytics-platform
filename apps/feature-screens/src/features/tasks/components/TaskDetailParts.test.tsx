import type { HostSeam } from '@/lib/host/host-seam';
import { HostSeamProvider } from '@/lib/host/host-seam';
import type { TaskDetailDto } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type UseTaskDetailPartsArgs, useTaskDetailParts } from './TaskDetailParts';

const api = vi.hoisted(() => ({
  getTask: vi.fn(),
  assignTaskResponsibility: vi.fn(),
}));
vi.mock('@/lib/api/tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/tasks')>()),
  getTask: api.getTask,
  assignTaskResponsibility: api.assignTaskResponsibility,
}));
vi.mock('@/lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/me')>()),
  useMeBridge: () => ({ data: { actor: { id: 'admin', role_level: 'admin' } } }),
}));
vi.mock('@/lib/cross-system/usePermissionCheckBridge', () => ({
  usePermissionCheckBridge: () => ({ data: { state: 'denied' } }),
}));
vi.mock('@/lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/registry-reads')>()),
  fetchManagedSystems: vi.fn(async () => ({ items: [], total: 0 })),
}));
vi.mock('@/lib/api/actors', () => ({
  resolveActors: vi.fn(async () => ({ actors: [], teams: [] })),
}));
vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [] }),
}));
vi.mock('@/features/cross-system/progress-notes/ProgressNotesSection', () => ({
  ProgressNotesSection: () => null,
}));

const VOC_ID = '60000000-0000-4000-8000-000000000006';
const FINDING_ID = '40000000-0000-4000-8000-000000000004';
const task: TaskDetailDto = {
  id: '10000000-0000-4000-8000-000000000001',
  workspace_id: '90000000-0000-4000-8000-000000000009',
  display_id: 'TASK-1000',
  primary_managed_system_id: '30000000-0000-4000-8000-000000000003',
  title: '배정 테스트',
  status: 'backlog',
  priority: 'medium',
  assignee_actor_id: null,
  assignee_team_id: null,
  due_date: null,
  milestone_id: null,
  analytics_area_id: null,
  source_task_request_id: null,
  created_by: '40000000-0000-4000-8000-000000000004',
  created_at: '2026-10-13T00:00:00.000Z',
  updated_at: '2026-10-13T00:00:00.000Z',
  source: {
    finding: {
      id: FINDING_ID,
      display_id: 'FIN-1',
      title: '출처 Finding',
      summary: '요약',
      evidence_count: 1,
    },
    voc: {
      id: VOC_ID,
      display_id: 'VOC-7',
      title: '출처 VOC',
      visibility_state: 'allowed',
      reporter_facing_status: 'progress',
    },
  } as unknown as TaskDetailDto['source'],
};

function makeSeam(overrides: Partial<HostSeam> = {}) {
  const navigate = vi.fn();
  const calls = {
    navigate,
    success: vi.fn(),
    error: vi.fn(),
    title: vi.fn(),
    canLink: vi.fn((_to: string) => true),
  };
  const seam: HostSeam = {
    canLink: calls.canLink,
    Link: () => null,
    notifyError: calls.error,
    notifySuccess: calls.success,
    useNavigate: () => navigate,
    useTitle: calls.title,
    absoluteHref: (to) => `https://host.test${to}`,
    ...overrides,
  };
  return { seam, calls };
}

function Harness(props: UseTaskDetailPartsArgs) {
  const parts = useTaskDetailParts(props);
  return (
    <div>
      <div data-testid="view">{parts.view.kind}</div>
      <div data-testid="title">{parts.title}</div>
      <div data-testid="actions">{parts.headerActions}</div>
      <div data-testid="body">{parts.body}</div>
      <div data-testid="footer">{parts.footer}</div>
    </div>
  );
}

function renderParts(
  seam: HostSeam,
  props: Partial<UseTaskDetailPartsArgs> = {},
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
): ReactNode {
  return render(
    <QueryClientProvider client={client}>
      <HostSeamProvider value={seam}>
        <Harness
          taskId={task.id}
          onClose={() => {}}
          actorNamesById={new Map()}
          managedSystemNamesById={new Map()}
          {...props}
        />
      </HostSeamProvider>
    </QueryClientProvider>,
  ) as unknown as ReactNode;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getTask.mockResolvedValue(task);
});

afterEach(() => {
  // biome-ignore lint/performance/noDelete: removing the shadow restores the real descriptor
  delete (navigator as { clipboard?: unknown }).clipboard;
  // biome-ignore lint/performance/noDelete: same, for the secure-context shim
  delete (window as { isSecureContext?: unknown }).isSecureContext;
});

describe('Task detail parts through the host seam', () => {
  it('sends the source VOC to the inbox selection and the Finding to its path through the seam', async () => {
    const { seam, calls } = makeSeam();
    renderParts(seam);
    fireEvent.click(await screen.findByRole('button', { name: /출처 VOC/ }));
    expect(calls.navigate).toHaveBeenLastCalledWith(`/vocs?view=inbox&selected=${VOC_ID}`);
    fireEvent.click(screen.getByRole('button', { name: /출처 Finding/ }));
    expect(calls.navigate).toHaveBeenLastCalledWith(`/findings/${FINDING_ID}`);
  });

  it('leaves the VOC and Finding nodes unnavigable when the host cannot link', async () => {
    const { seam } = makeSeam({ canLink: () => false });
    renderParts(seam);
    await screen.findByText('FIN-1');
    expect(screen.queryByRole('button', { name: /출처 VOC/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /출처 Finding/ })).not.toBeInTheDocument();
  });

  it('copies the host absolute link and shows no copy action when the host has none', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    const first = makeSeam();
    const { unmount } = renderParts(first.seam, { view: 'my' }) as unknown as {
      unmount: () => void;
    };
    fireEvent.click(await screen.findByRole('button', { name: /링크 복사/ }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`https://host.test/tasks?view=my&param=${task.id}`),
    );
    await waitFor(() => expect(first.calls.success).toHaveBeenCalled());
    unmount();
    const none = makeSeam({ absoluteHref: () => null });
    renderParts(none.seam);
    await screen.findByText('FIN-1');
    expect(screen.getByTestId('actions')).toBeEmptyDOMElement();
  });

  it('notifies a responsibility save through the seam', async () => {
    api.assignTaskResponsibility.mockResolvedValue(task);
    const { seam, calls } = makeSeam();
    renderParts(seam);
    fireEvent.click(await screen.findByRole('button', { name: '배정 수정' }));
    fireEvent.click(screen.getByRole('button', { name: '배정 저장' }));
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(calls.success).toHaveBeenCalledWith('배정을 저장했습니다.'));
  });

  it('sets the document title through the seam once the Task has loaded', async () => {
    const { seam, calls } = makeSeam();
    renderParts(seam);
    await screen.findByText('FIN-1');
    expect(calls.title).toHaveBeenCalledWith(expect.stringContaining('TASK-1000'));
  });

  it('keeps the parts title while the Task refetches in the background', async () => {
    const { seam } = makeSeam();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderParts(seam, {}, client);
    await screen.findByText('FIN-1');
    expect(screen.getByTestId('title').textContent).toContain(task.title);
    api.getTask.mockReturnValue(new Promise(() => {}));
    void client.invalidateQueries({ queryKey: ['task', task.id] });
    await waitFor(() => expect(client.isFetching({ queryKey: ['task', task.id] })).toBe(1));
    expect(screen.getByTestId('title').textContent).toContain(task.title);
  });

  it.each([
    { view: 'board' as const, status: 'backlog' as const, withCallback: true, footer: true },
    { view: 'board' as const, status: 'released' as const, withCallback: true, footer: false },
    { view: 'board' as const, status: 'backlog' as const, withCallback: false, footer: false },
    { view: 'backlog' as const, status: 'backlog' as const, withCallback: true, footer: false },
  ])('ready footer: $view/$status callback=$withCallback → $footer', async (c) => {
    api.getTask.mockResolvedValue({ ...task, status: c.status });
    const { seam } = makeSeam();
    renderParts(seam, { view: c.view, ...(c.withCallback ? { onMoveToNextStatus: vi.fn() } : {}) });
    await screen.findByText('FIN-1');
    const button = screen.queryByRole('button', { name: '다음 상태로 이동' });
    expect(button !== null).toBe(c.footer);
  });

  it.each([true, false])('loading footer placeholder follows hasActionFooter=%s', (flag) => {
    api.getTask.mockReturnValue(new Promise(() => {}));
    const { seam } = makeSeam();
    renderParts(seam, { hasActionFooter: flag });
    const placeholders = screen
      .getByTestId('body')
      .querySelectorAll('[aria-hidden="true"].border-t');
    expect(placeholders).toHaveLength(flag ? 1 : 0);
  });
});
