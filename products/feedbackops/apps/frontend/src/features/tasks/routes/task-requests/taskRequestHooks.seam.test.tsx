import { TASK_REQUEST_COPY } from '@/lib/copy/task-requests';
import { type HostNotice, type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import type { TaskDto, TaskRequestDto } from '@fops/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { FormEvent, PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskRequestLinkedTask } from './TaskRequestLinkedTask';
import { useTaskRequestConversion } from './useTaskRequestConversion';
import { useTaskRequestDecision } from './useTaskRequestDecision';
import { useTaskRequestLink } from './useTaskRequestLink';

const api = vi.hoisted(() => ({
  approveTaskRequest: vi.fn(),
  rejectTaskRequest: vi.fn(),
  requestMoreEvidenceForTaskRequest: vi.fn(),
  convertTaskRequest: vi.fn(),
  linkExistingTask: vi.fn(),
  checkPermission: vi.fn(),
}));

vi.mock('@/lib/api/task-requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/task-requests')>()),
  approveTaskRequest: api.approveTaskRequest,
  rejectTaskRequest: api.rejectTaskRequest,
  requestMoreEvidenceForTaskRequest: api.requestMoreEvidenceForTaskRequest,
}));
vi.mock('@/lib/api/tasks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/tasks')>()),
  convertTaskRequest: api.convertTaskRequest,
  linkExistingTask: api.linkExistingTask,
}));

vi.mock('@/lib/api/permission-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/permission-reads')>()),
  fetchPermissionCheckViaClient: api.checkPermission,
}));

const taskRequest = {
  id: '10000000-0000-0000-0000-000000000001',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  requester_actor_id: '20000000-0000-0000-0000-000000000002',
  requested_outcome: 'Review the candidate task',
  status: 'pending_review',
} as TaskRequestDto;
const task = {
  id: '50000000-0000-0000-0000-000000000005',
  display_id: 'TASK-901',
  title: '정산 배치',
  assignee_actor_id: null,
  assignee_team_id: null,
} as TaskDto;

const host = {
  canLink: vi.fn<(to: string) => boolean>(() => true),
  notify: vi.fn<(notice: HostNotice) => string>(() => 'notice-id'),
  notifyError: vi.fn<(message: string) => void>(),
  notifySuccess: vi.fn<(message: string) => void>(),
  navigate: vi.fn<(to: string, options?: { replace?: boolean }) => void>(),
};
const seam: HostSeam = {
  canLink: (to) => host.canLink(to),
  Link: ({ to, className, children }) => (
    <a href={to} className={className} data-seam-link="">
      {children}
    </a>
  ),
  notifyError: (message) => host.notifyError(message),
  notifySuccess: (message) => host.notifySuccess(message),
  useNavigate: () => host.navigate,
  notify: (notice) => host.notify(notice),
  dismiss: () => undefined,
};

function wrapper({ children }: PropsWithChildren) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <HostSeamProvider value={seam}>{children}</HostSeamProvider>
    </QueryClientProvider>
  );
}

const submitEvent = { preventDefault: () => undefined } as unknown as FormEvent<HTMLFormElement>;

function renderDecision() {
  return renderHook(
    () =>
      useTaskRequestDecision({
        item: taskRequest,
        currentActorId: '60000000-0000-0000-0000-000000000006',
        currentRole: 'admin',
      }),
    { wrapper },
  );
}

describe('Task Request hooks through the host seam', () => {
  beforeEach(() => {
    host.canLink.mockReset().mockReturnValue(true);
    host.notify.mockClear();
    host.notifyError.mockClear();
    host.notifySuccess.mockClear();
    host.navigate.mockClear();
    api.approveTaskRequest.mockReset().mockResolvedValue({ ...taskRequest, status: 'approved' });
    api.rejectTaskRequest.mockReset().mockResolvedValue({ ...taskRequest, status: 'rejected' });
    api.requestMoreEvidenceForTaskRequest
      .mockReset()
      .mockResolvedValue({ ...taskRequest, status: 'needs_more_evidence' });
    api.convertTaskRequest.mockReset().mockResolvedValue(task);
    api.linkExistingTask.mockReset().mockResolvedValue(task);
  });

  it('notifies the approval with a convert action that navigates to the request', async () => {
    const { result } = renderDecision();
    act(() => result.current.approve());
    act(() => result.current.submitDecision(submitEvent));
    await waitFor(() => expect(host.notify).toHaveBeenCalledTimes(1));

    const notice = host.notify.mock.calls[0]?.[0];
    expect(notice).toMatchObject({
      tone: 'success',
      message: TASK_REQUEST_COPY.decisions.approve,
      action: { label: TASK_REQUEST_COPY.convertToTask },
    });
    expect(host.canLink).toHaveBeenCalledWith(`/tasks?view=requests&param=${taskRequest.id}`);
    act(() => notice?.action?.onAction());
    expect(host.navigate).toHaveBeenCalledWith(`/tasks?view=requests&param=${taskRequest.id}`);
  });

  it('drops the convert action when the host cannot link to the request', async () => {
    host.canLink.mockReturnValue(false);
    const { result } = renderDecision();
    act(() => result.current.approve());
    act(() => result.current.submitDecision(submitEvent));
    await waitFor(() => expect(host.notify).toHaveBeenCalledTimes(1));

    expect(host.notify.mock.calls[0]?.[0]).toEqual({
      tone: 'success',
      message: TASK_REQUEST_COPY.decisions.approve,
    });
  });

  it.each(['reject', 'requestEvidence'] as const)(
    'notifies %s without an action',
    async (action) => {
      const { result } = renderDecision();
      act(() => result.current[action]());
      act(() => result.current.changeValue('검토 메모'));
      act(() => result.current.submitDecision(submitEvent));
      await waitFor(() => expect(host.notify).toHaveBeenCalledTimes(1));

      expect(host.notify.mock.calls[0]?.[0]).toEqual({
        tone: 'success',
        message:
          TASK_REQUEST_COPY.decisions[action === 'reject' ? 'reject' : 'request-more-evidence'],
      });
      expect(host.navigate).not.toHaveBeenCalled();
    },
  );

  it('raises a decision failure after the dialog is gone through notifyError', async () => {
    let fail: (error: Error) => void = () => undefined;
    api.approveTaskRequest.mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const { result, rerender } = renderHook(
      ({ item }: { item: TaskRequestDto }) =>
        useTaskRequestDecision({ item, currentActorId: null, currentRole: 'admin' }),
      { wrapper, initialProps: { item: taskRequest } },
    );
    act(() => result.current.approve());
    act(() => result.current.submitDecision(submitEvent));
    await waitFor(() => expect(result.current.isPending).toBe(true));
    // Selecting another request closes the dialog while the write is in flight.
    rerender({ item: { ...taskRequest, id: '10000000-0000-0000-0000-000000000002' } });
    await act(async () => fail(new Error('boom')));
    await waitFor(() => expect(host.notifyError).toHaveBeenCalledTimes(1));
    expect(host.notify).not.toHaveBeenCalled();
  });

  it('blocks a self-approval without the scoped permission through notifyError', async () => {
    api.checkPermission.mockResolvedValue({ state: 'denied' });
    const { result } = renderHook(
      () =>
        useTaskRequestDecision({
          item: taskRequest,
          currentActorId: taskRequest.requester_actor_id,
          currentRole: 'developer',
        }),
      { wrapper },
    );
    act(() => result.current.approve());
    expect(host.notifyError).toHaveBeenCalledWith('본인 승인에는 범위가 지정된 권한이 필요합니다.');
    expect(api.approveTaskRequest).not.toHaveBeenCalled();
  });

  it('notifies the conversion with an open-Task action that never expires', async () => {
    const { result } = renderHook(
      () =>
        useTaskRequestConversion({
          item: { ...taskRequest, status: 'approved' },
          currentRole: 'admin',
        }),
      { wrapper },
    );
    act(() => result.current.submit(submitEvent));
    await waitFor(() => expect(host.notify).toHaveBeenCalledTimes(1));

    const notice = host.notify.mock.calls[0]?.[0];
    expect(notice).toMatchObject({
      tone: 'success',
      durationMs: Number.POSITIVE_INFINITY,
      action: { label: TASK_REQUEST_COPY.openTask },
    });
    act(() => notice?.action?.onAction());
    expect(host.navigate).toHaveBeenCalledWith(`/tasks?view=backlog&param=${task.id}`);
  });

  it('raises a conversion failure through notifyError', async () => {
    api.convertTaskRequest.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(
      () =>
        useTaskRequestConversion({
          item: { ...taskRequest, status: 'approved' },
          currentRole: 'admin',
        }),
      { wrapper },
    );
    act(() => result.current.submit(submitEvent));
    await waitFor(() => expect(host.notifyError).toHaveBeenCalledTimes(1));
    expect(host.notify).not.toHaveBeenCalled();
  });

  it('raises link success and failure through notifySuccess and notifyError', async () => {
    const { result } = renderHook(
      () =>
        useTaskRequestLink({ item: { ...taskRequest, status: 'approved' }, currentRole: 'admin' }),
      { wrapper },
    );
    act(() => result.current.link(task.id));
    await waitFor(() =>
      expect(host.notifySuccess).toHaveBeenCalledWith('Task TASK-901을 연결했습니다.'),
    );

    api.linkExistingTask.mockRejectedValue(new Error('boom'));
    act(() => result.current.link(task.id));
    await waitFor(() => expect(host.notifyError).toHaveBeenCalledTimes(1));
  });

  it('renders the linked Task through the seam Link with the backlog href', () => {
    render(<TaskRequestLinkedTask task={task} />, { wrapper });
    const link = screen.getByRole('link', { name: /정산 배치/ });
    expect(link).toHaveAttribute('data-seam-link');
    expect(link).toHaveAttribute('href', `/tasks?view=backlog&param=${task.id}`);
  });
});
