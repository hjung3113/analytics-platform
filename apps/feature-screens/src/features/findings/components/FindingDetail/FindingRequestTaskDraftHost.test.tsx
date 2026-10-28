import { type HostLinkProps, type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import type { FindingDto } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FindingRequestTaskDraftHost } from './FindingRequestTaskDraftHost';

const apiClientMock = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  apiClient: apiClientMock,
}));
vi.mock('@/lib/api/errorMapper', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/errorMapper')>()),
  errorMapper: () => ({ message: 'mapped error' }),
}));
vi.mock('@/lib/api/useIdempotencyKey', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/useIdempotencyKey')>()),
  useIdempotencyKey: () => ({ key: 'idem-key', markConsumed: vi.fn() }),
}));

const FINDING: FindingDto = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'FIN-179',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  title: '리포트 속도 저하',
  summary: '쿼리 플랜 개선 필요',
  source_type: 'manual',
  source_id: null,
  owner_actor_id: null,
  owner_team_id: null,
  evidence_count: 0,
  severity: 'medium',
  confidence: 'medium',
  status: 'active',
  analytics_area_id: null,
  linked_task_id: null,
  linked_milestone_id: null,
  created_by: '40000000-0000-0000-0000-000000000004',
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  source: null,
};

function makeSeam(linkable: boolean) {
  const calls = {
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
    notify: vi.fn(() => 'notice'),
    navigate: vi.fn(),
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
    notify: calls.notify,
    dismiss: vi.fn(),
    useNavigate: () => calls.navigate,
    useTitle: vi.fn(),
  };
  return { seam, calls };
}

async function submitDraft(seam: HostSeam) {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <HostSeamProvider value={seam}>
        <FindingRequestTaskDraftHost
          findingId={FINDING.id}
          finding={FINDING}
          open
          onClose={() => {}}
        />
      </HostSeamProvider>
    </QueryClientProvider>,
  );
  await user.type(
    await screen.findByTestId('request-task-requested-outcome-input'),
    'Improve the report query plan',
  );
  await user.click(screen.getByTestId('request-task-submit'));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FindingRequestTaskDraftHost', () => {
  it('raises a persistent success notice whose action opens the new Task Request', async () => {
    apiClientMock.mockResolvedValue({ data: { id: 'task-request-1' } });
    const { seam, calls } = makeSeam(true);
    await submitDraft(seam);

    await waitFor(() => expect(calls.notify).toHaveBeenCalledTimes(1));
    expect(calls.notify).toHaveBeenCalledWith({
      tone: 'success',
      message: 'Task Request가 생성되었습니다.',
      durationMs: Number.POSITIVE_INFINITY,
      action: { label: 'Task Request 열기', onAction: expect.any(Function) },
    });
    const [[notice]] = calls.notify.mock.calls as unknown as [
      [{ action: { onAction: () => void } }],
    ];
    notice.action.onAction();
    expect(calls.navigate).toHaveBeenCalledWith('/tasks?view=requests&param=task-request-1');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('leaves the action out when the host cannot link to the Task Request', async () => {
    apiClientMock.mockResolvedValue({ data: { id: 'task-request-1' } });
    const { seam, calls } = makeSeam(false);
    await submitDraft(seam);

    await waitFor(() => expect(calls.notify).toHaveBeenCalledTimes(1));
    expect(calls.notify).toHaveBeenCalledWith({
      tone: 'success',
      message: 'Task Request가 생성되었습니다.',
      durationMs: Number.POSITIVE_INFINITY,
    });
  });

  it('reports a failed submit through the host error notice', async () => {
    apiClientMock.mockRejectedValue(
      Object.assign(new Error('boom'), { envelope: { code: 'server.error' } }),
    );
    const { seam, calls } = makeSeam(true);
    await submitDraft(seam);

    await waitFor(() => expect(calls.notifyError).toHaveBeenCalledWith('mapped error'));
    expect(calls.notify).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
