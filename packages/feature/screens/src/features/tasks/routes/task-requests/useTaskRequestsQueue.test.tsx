import * as api from '../../../../lib/api';
import { useMe } from '../../../../lib/auth/useMe';
import { taskRequestPage } from '../../../../test/task-request-pages';
import type { ListTaskRequestsQuery } from '@ap/feature-shared';
import type { TaskRequestDto } from '@ap/feature-shared';
import type { ListToolbarTab } from '@ap/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTaskRequestsQueue } from './useTaskRequestsQueue';

const { fetchTaskRequestsMock, resolveActorsMock } = vi.hoisted(() => ({
  fetchTaskRequestsMock: vi.fn(),
  resolveActorsMock: vi.fn(),
}));

vi.mock('../../../../lib/api', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchTaskRequests: async (options: ListTaskRequestsQuery) => {
    const result = await fetchTaskRequestsMock(options);
    return taskRequestPage(result.items, options);
  },
  resolveActors: resolveActorsMock,
}));

// The hook imports the module paths; forward at call time so the barrel fakes above still apply.
vi.mock('../../../../lib/api/task-requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/api/task-requests')>()),
  fetchTaskRequests: (...args: Parameters<typeof api.fetchTaskRequests>) =>
    api.fetchTaskRequests(...args),
}));
vi.mock('../../../../lib/api/actors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/api/actors')>()),
  resolveActors: (...args: Parameters<typeof api.resolveActors>) => api.resolveActors(...args),
}));
vi.mock('../../../../lib/api/registry-reads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/api/registry-reads')>()),
  fetchManagedSystems: vi.fn(async () => ({ items: [] })),
}));

vi.mock('../../../../lib/auth/useMe', () => ({
  useMe: () => ({
    data: { actor: { id: '60000000-0000-0000-0000-000000000006', role_level: 'Admin' } },
  }),
}));
vi.mock('../../../../lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/api/me')>()),
  useMeBridge: () => useMe(),
}));

const taskRequest = {
  id: '10000000-0000-0000-0000-000000000001',
  workspace_id: '90000000-0000-0000-0000-000000000009',
  display_id: 'REQ-42',
  source_type: 'finding',
  source_id: '40000000-0000-0000-0000-000000000004',
  primary_managed_system_id: '30000000-0000-0000-0000-000000000003',
  evidence_summary: '쿼리 플랜 개선 필요',
  requested_outcome: 'Task 전환 검토',
  requester_actor_id: '20000000-0000-0000-0000-000000000002',
  status: 'pending_review',
  assigned_reviewer_actor_id: null,
  assigned_reviewer_team_id: null,
  reviewer_actor_id: null,
  decision_reason: null,
  decided_at: null,
  created_at: '2026-07-10T00:00:00.000Z',
  updated_at: '2026-07-10T00:00:00.000Z',
  source: {
    type: 'finding',
    id: '40000000-0000-0000-0000-000000000004',
    display_id: 'FIN-179',
    relation_type: 'requested_task',
    link_id: '70000000-0000-0000-0000-000000000007',
  },
} as TaskRequestDto;

type ReviewerFilters = { reviewer?: string; reviewerTeam?: string };

function renderQueue(filters: ReviewerFilters = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    ({ activeFilters }: { activeFilters: ReviewerFilters }) => useTaskRequestsQueue(activeFilters),
    { initialProps: { activeFilters: filters }, wrapper },
  );
  return { ...hook, queryClient };
}

const badgeFor = (tabs: ListToolbarTab[], value: string) =>
  tabs.find((tab) => tab.value === value)?.badgeCount;

// #706 — tab counts are unknown until the read succeeds; unknown must never
// render as 0.
describe('useTaskRequestsQueue tab counts (#706)', () => {
  beforeEach(() => {
    fetchTaskRequestsMock.mockReset();
    resolveActorsMock.mockReset();
    resolveActorsMock.mockResolvedValue({ actors: [], teams: [] });
  });

  it('renders fresh all-tab status and assignment after a completed decision', async () => {
    fetchTaskRequestsMock.mockResolvedValue({ items: [taskRequest] });
    const { result } = renderQueue();
    await waitFor(() => expect(result.current.selected?.id).toBe(taskRequest.id));
    act(() => result.current.setActiveTab('all'));
    await waitFor(() => expect(result.current.queueSettled).toBe(true));
    const approved = { ...taskRequest, status: 'approved' as const };
    const fresh = {
      ...approved,
      status: 'converted' as const,
      assigned_reviewer_actor_id: 'fresh-reviewer',
    };
    fetchTaskRequestsMock.mockResolvedValue({ items: [fresh] });
    act(() => result.current.onDecisionComplete(approved));
    await waitFor(() =>
      expect(result.current.selected).toMatchObject({
        status: 'converted',
        assigned_reviewer_actor_id: 'fresh-reviewer',
      }),
    );
    expect(result.current.selectedId).toBe(taskRequest.id);
  });

  it('uses the filtered summary for every badge and refetches it after a decision', async () => {
    const secondRequest: TaskRequestDto = {
      ...taskRequest,
      id: '10000000-0000-0000-0000-000000000002',
      status: 'approved',
    };
    fetchTaskRequestsMock.mockImplementation(async (options: ListTaskRequestsQuery) => ({
      items:
        options.reviewer === undefined && options.reviewer_team_id === undefined
          ? [taskRequest, secondRequest]
          : [taskRequest],
    }));

    const { result, rerender } = renderQueue({ reviewer: 'me', reviewerTeam: 'team-1' });
    act(() => result.current.setActiveTab('all'));

    await waitFor(() => expect(result.current.queueSettled).toBe(true));
    await waitFor(() => expect(badgeFor(result.current.tabs, 'all')).toBe(1));
    expect(
      Object.fromEntries(result.current.tabs.map(({ value, badgeCount }) => [value, badgeCount])),
    ).toEqual({
      pending_review: 1,
      needs_more_evidence: 0,
      approved: 0,
      rejected: 0,
      all: 1,
    });
    expect(result.current.tabs.every((tab) => (tab.badgeCount ?? 0) <= 1)).toBe(true);
    expect(result.current.hasItems).toBe(true);
    expect(result.current.shown).toHaveLength(1);
    expect(
      fetchTaskRequestsMock.mock.calls.some(
        ([options]) =>
          options.limit === 1 && options.reviewer === 'me' && options.reviewer_team_id === 'team-1',
      ),
    ).toBe(true);

    const filteredSummaryCalls = () =>
      fetchTaskRequestsMock.mock.calls.filter(
        ([options]) =>
          options.limit === 1 &&
          options.reviewer === 'me' &&
          options.reviewer_team_id === 'team-1',
      ).length;
    const readsBeforeDecision = filteredSummaryCalls();
    act(() => result.current.onDecisionComplete({ ...taskRequest, status: 'approved' }));
    await waitFor(() => expect(filteredSummaryCalls()).toBeGreaterThan(readsBeforeDecision));

    rerender({ activeFilters: {} });
    await waitFor(() => expect(badgeFor(result.current.tabs, 'all')).toBe(2));
    expect(
      Object.fromEntries(result.current.tabs.map(({ value, badgeCount }) => [value, badgeCount])),
    ).toEqual({
      pending_review: 1,
      needs_more_evidence: 0,
      approved: 1,
      rejected: 0,
      all: 2,
    });
  });

  it('keeps global hasItems separate from filtered zero badges', async () => {
    fetchTaskRequestsMock.mockImplementation(async (options: ListTaskRequestsQuery) => ({
      items:
        options.reviewer === undefined && options.reviewer_team_id === undefined
          ? [taskRequest]
          : [],
    }));

    const { result } = renderQueue({ reviewer: 'me', reviewerTeam: 'team-1' });
    act(() => result.current.setActiveTab('all'));

    await waitFor(() => expect(result.current.queueSettled).toBe(true));
    await waitFor(() => expect(badgeFor(result.current.tabs, 'all')).toBe(0));
    expect(result.current.tabs.map((tab) => tab.badgeCount)).toEqual([0, 0, 0, 0, 0]);
    expect(result.current.hasItems).toBe(true);
  });

  it.each(['pending', 'failed'] as const)(
    'keeps reviewer-filtered badges unknown while its summary is %s',
    async (state) => {
      fetchTaskRequestsMock.mockImplementation((options: ListTaskRequestsQuery) => {
        if (options.limit !== 1 || options.reviewer === undefined)
          return Promise.resolve({ items: [taskRequest] });
        return state === 'pending'
          ? new Promise(() => undefined)
          : Promise.reject(new Error('filtered summary failed'));
      });

      const { result, queryClient } = renderQueue({ reviewer: 'me' });
      await waitFor(() => expect(result.current.hasItems).toBe(true));
      await waitFor(() =>
        expect(
          fetchTaskRequestsMock.mock.calls.some(
            ([options]) => options.limit === 1 && options.reviewer === 'me',
          ),
        ).toBe(true),
      );
      await waitFor(() =>
        expect(
          queryClient
            .getQueryCache()
            .findAll({ queryKey: ['task-requests', undefined, 'filtered-summary'] })[0]?.state
            .status,
        ).toBe(state === 'pending' ? 'pending' : 'error'),
      );
      expect(result.current.tabs.map((tab) => tab.badgeCount)).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
    },
  );

  it.each(['pending', 'failed', 'loaded', 'loaded-empty'] as const)(
    'shows tab counts only after the read succeeds (%s)',
    async (state) => {
      if (state === 'pending') {
        // Never resolves: pins the read in its pending state. (The tsconfig
        // lib predates Promise.withResolvers, and no resolver is needed.)
        fetchTaskRequestsMock.mockReturnValue(new Promise(() => undefined));
      } else if (state === 'failed') {
        fetchTaskRequestsMock.mockRejectedValue(new Error('read failed'));
      } else if (state === 'loaded-empty') {
        fetchTaskRequestsMock.mockResolvedValue({ items: [] });
      } else {
        fetchTaskRequestsMock.mockResolvedValue({ items: [taskRequest] });
      }

      const { result } = renderQueue();

      if (state === 'pending') {
        expect(result.current.tabs.map((tab) => tab.badgeCount)).toEqual([
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
        ]);
        return;
      }
      if (state === 'failed') {
        await waitFor(() => expect(result.current.hasError).toBe(true));
        expect(result.current.tabs.map((tab) => tab.badgeCount)).toEqual([
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
        ]);
        return;
      }
      // Waiting on the badge itself: `hasItems === false` also holds while the
      // read is pending, so it cannot distinguish loaded-empty from pending.
      // The badge only appears once the read has succeeded.
      const expected = state === 'loaded-empty' ? 0 : 1;
      await waitFor(() => expect(badgeFor(result.current.tabs, 'all')).toBe(expected));
      expect(badgeFor(result.current.tabs, 'pending_review')).toBe(expected);
      expect(badgeFor(result.current.tabs, 'needs_more_evidence')).toBe(0);
      expect(badgeFor(result.current.tabs, 'approved')).toBe(0);
      expect(badgeFor(result.current.tabs, 'rejected')).toBe(0);
    },
  );

  it('recovers from a failed read through a no-data refetch to real zero counts', async () => {
    let releaseRead: (() => void) | undefined;
    let failed = false;
    fetchTaskRequestsMock.mockImplementation((options: ListTaskRequestsQuery) => {
      if (options.status !== undefined) return Promise.resolve({ items: [] });
      if (!failed) {
        failed = true;
        return Promise.reject(new Error('read failed'));
      }
      return new Promise<{ items: TaskRequestDto[] }>((resolve) => {
        releaseRead = () => resolve({ items: [] });
      });
    });

    const { result } = renderQueue();
    await waitFor(() => expect(result.current.hasError).toBe(true));
    expect(result.current.tabs.map((tab) => tab.badgeCount)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);

    act(() => result.current.refetch());

    // Post-error refetch resets to pending with no data: the error clears and
    // the counts stay absent while it is unresolved.
    await waitFor(() => expect(result.current.hasError).toBe(false));
    expect(result.current.tabs.map((tab) => tab.badgeCount)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ]);

    await act(async () => {
      releaseRead?.();
    });

    await waitFor(() => expect(badgeFor(result.current.tabs, 'all')).toBe(0));
    expect(badgeFor(result.current.tabs, 'pending_review')).toBe(0);
    expect(badgeFor(result.current.tabs, 'needs_more_evidence')).toBe(0);
    expect(badgeFor(result.current.tabs, 'approved')).toBe(0);
    expect(badgeFor(result.current.tabs, 'rejected')).toBe(0);
  });
});
