import { ApiError } from '@/lib/api/types';
import { TASK_REQUEST_COPY } from '@/lib/copy/task-requests';
import { registerDefaultHost } from '@/lib/host/host-seam';
import { tanstackHost } from '@/test/host-adapters/lib/host/tanstack-host';
import type { TaskRequestDto } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { FormEvent, PropsWithChildren } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskRequestDecision } from './useTaskRequestDecision';
import type { UseTaskRequestDecisionResult } from './useTaskRequestDecision';

const api = vi.hoisted(() => ({
  approveTaskRequest: vi.fn(),
  rejectTaskRequest: vi.fn(),
  requestMoreEvidenceForTaskRequest: vi.fn(),
}));
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }));
const navigate = vi.hoisted(() => vi.fn());

vi.mock('sonner', () => ({ toast }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}));
vi.mock('@/lib/api/task-requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/task-requests')>()),
  approveTaskRequest: (...args: unknown[]) => api.approveTaskRequest(...args),
  rejectTaskRequest: (...args: unknown[]) => api.rejectTaskRequest(...args),
  requestMoreEvidenceForTaskRequest: (...args: unknown[]) =>
    api.requestMoreEvidenceForTaskRequest(...args),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  approveTaskRequest: api.approveTaskRequest,
  rejectTaskRequest: api.rejectTaskRequest,
  requestMoreEvidenceForTaskRequest: api.requestMoreEvidenceForTaskRequest,
}));

const taskRequest: TaskRequestDto = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'REQ-1071',
  source_type: 'finding',
  source_id: '40000000-0000-0000-0000-000000000004',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  evidence_summary: 'Evidence summary',
  requested_outcome: 'Review the candidate task',
  requester_actor_id: '20000000-0000-0000-0000-000000000002',
  status: 'pending_review',
  assigned_reviewer_actor_id: null,
  assigned_reviewer_team_id: null,
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  source: undefined,
};

function renderDecision(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return renderHook(
    () =>
      useTaskRequestDecision({
        item: taskRequest,
        currentActorId: '60000000-0000-0000-0000-000000000006',
        currentRole: 'admin',
      }),
    {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    },
  );
}

function submitDecision(decision: UseTaskRequestDecisionResult) {
  act(() => {
    decision.submitDecision({
      preventDefault: () => undefined,
    } as unknown as FormEvent<HTMLFormElement>);
  });
}

describe('useTaskRequestDecision success toast', () => {
  // The seam's navigation is the router's, not `useNavigate`: route it to the file's navigate mock.
  beforeAll(() => {
    registerDefaultHost({
      ...tanstackHost,
      useNavigate: () => (to, options) => {
        const url = new URL(to, 'http://x');
        navigate({
          to: url.pathname,
          search: Object.fromEntries(url.searchParams),
          ...(options?.replace ? { replace: true } : {}),
        });
      },
    });
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    api.approveTaskRequest.mockReset().mockResolvedValue({ ...taskRequest, status: 'approved' });
    api.rejectTaskRequest.mockReset().mockResolvedValue({ ...taskRequest, status: 'rejected' });
    api.requestMoreEvidenceForTaskRequest
      .mockReset()
      .mockResolvedValue({ ...taskRequest, status: 'needs_more_evidence' });
    toast.mockReset();
    toast.error.mockReset();
    toast.success.mockReset();
    navigate.mockReset();
  });

  it('offers Task로 전환 on the approve toast and navigates to the approved request', async () => {
    const { result } = renderDecision();
    act(() => result.current.approve());
    submitDecision(result.current);
    await waitFor(() => expect(result.current.result).not.toBeNull());

    expect(toast.success).toHaveBeenCalledTimes(1);
    const [message, options] = toast.success.mock.calls[0] ?? [];
    expect(message).toBe(TASK_REQUEST_COPY.decisions.approve);
    expect(options?.action).toMatchObject({ label: TASK_REQUEST_COPY.convertToTask });

    act(() => options.action.onClick());
    expect(navigate).toHaveBeenCalledWith({
      to: '/tasks',
      search: { view: 'requests', param: taskRequest.id },
    });
  });

  it.each(['reject', 'requestEvidence'] as const)(
    'shows the %s toast without a conversion action',
    async (action) => {
      const { result } = renderDecision();
      act(() => result.current[action]());
      act(() => result.current.changeValue('검토 메모'));
      submitDecision(result.current);
      await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));

      expect(toast.success.mock.calls[0]?.[1]?.action).toBeUndefined();
      expect(navigate).not.toHaveBeenCalled();
    },
  );
  it('keeps the open dialog on a rerender with the same item object and clears it for a new object with an equal id', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(
      ({ item }: { item: TaskRequestDto }) =>
        useTaskRequestDecision({
          item,
          currentActorId: '60000000-0000-0000-0000-000000000006',
          currentRole: 'admin',
        }),
      {
        initialProps: { item: taskRequest },
        wrapper: ({ children }: PropsWithChildren) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      },
    );
    act(() => result.current.reject());
    act(() => result.current.changeValue('검토 메모'));
    expect(result.current.dialog).toMatchObject({ action: 'reject', value: '검토 메모' });

    rerender({ item: taskRequest });
    expect(result.current.dialog).toMatchObject({ action: 'reject', value: '검토 메모' });

    rerender({ item: { ...taskRequest } });
    expect(result.current.dialog).toBeNull();
    expect(result.current.isSubmitting).toBe(false);
  });

  describe('Idempotency-Key and error handling (#1888)', () => {
    it('resends the SAME key after a network failure and mints a new one for a new dialog', async () => {
      api.approveTaskRequest
        .mockReset()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue({ ...taskRequest, status: 'approved' });
      const { result } = renderDecision();
      act(() => result.current.approve());
      submitDecision(result.current);
      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(result.current.dialog?.reasonInvalid).toBe(false);
      submitDecision(result.current);
      await waitFor(() => expect(result.current.result).not.toBeNull());

      const [first, second] = api.approveTaskRequest.mock.calls;
      expect(first?.[2]).toBe(second?.[2]);

      act(() => result.current.approve());
      submitDecision(result.current);
      await waitFor(() => expect(api.approveTaskRequest).toHaveBeenCalledTimes(3));
      expect(api.approveTaskRequest.mock.calls[2]?.[2]).not.toBe(first?.[2]);
    });

    it('refetches the list and the detail on 409 and does not flag the reason field', async () => {
      api.approveTaskRequest
        .mockReset()
        .mockRejectedValue(new ApiError(409, { code: 'conflict.stale_write', message: 'x' }));
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const spy = vi.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderDecision(queryClient);
      act(() => result.current.approve());
      submitDecision(result.current);
      await waitFor(() => expect(result.current.error).not.toBeNull());

      const keys = spy.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
      expect(keys).toContain(JSON.stringify(['task-requests']));
      expect(keys).toContain(JSON.stringify(['task-request']));
      expect(result.current.dialog?.reasonInvalid).toBe(false);
    });

    it('flags the reason field for a validation error only', async () => {
      api.rejectTaskRequest
        .mockReset()
        .mockRejectedValue(new ApiError(422, { code: 'validation.failed', message: 'x' }));
      const { result } = renderDecision();
      act(() => result.current.reject());
      act(() => result.current.changeValue('사유'));
      submitDecision(result.current);
      await waitFor(() => expect(result.current.error).not.toBeNull());
      expect(result.current.dialog?.reasonInvalid).toBe(true);
    });
  });
});
