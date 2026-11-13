// #1887: an open decision and its typed reason survive a session expiry for the same user only.
import { beginSessionDraftOwner, resetSessionDraftsForTests, snapshotSessionDrafts } from '@/lib/session-draft/registry';
import type { TaskRequestDto } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTaskRequestDecision } from './useTaskRequestDecision';

const taskRequest = {
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
} satisfies TaskRequestDto;

const draftKeys = () => Object.keys(sessionStorage).filter((key) => key.startsWith('draft:'));

function renderDecision() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(
    () => useTaskRequestDecision({ item: taskRequest, currentActorId: '60000000-0000-0000-0000-000000000006', currentRole: 'admin' }),
    { wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider> },
  );
}

function typeRejectReasonAndExpire() {
  const first = renderDecision();
  act(() => first.result.current.reject());
  act(() => first.result.current.changeValue('근거가 부족합니다'));
  snapshotSessionDrafts('u1');
  first.unmount();
}

beforeEach(() => {
  sessionStorage.clear();
  resetSessionDraftsForTests();
});
afterEach(() => sessionStorage.clear());

describe('useTaskRequestDecision session-expiry draft (#1887)', () => {
  it('the same user\'s next session reopens the decision with the typed reason', async () => {
    typeRejectReasonAndExpire();
    beginSessionDraftOwner('u1');
    const next = renderDecision();
    await waitFor(() => expect(next.result.current.dialog).toEqual({ requestId: taskRequest.id, action: 'reject', value: '근거가 부족합니다', error: null }));
    expect(draftKeys()).toEqual([]);
  });

  it('another user gets no dialog', () => {
    typeRejectReasonAndExpire();
    beginSessionDraftOwner('u2');
    const next = renderDecision();
    expect(next.result.current.dialog).toBeNull();
    expect(draftKeys()).toEqual([]);
  });

  it('a cancelled dialog keeps nothing', () => {
    const view = renderDecision();
    act(() => view.result.current.reject());
    act(() => view.result.current.changeValue('근거가 부족합니다'));
    act(() => view.result.current.close());
    snapshotSessionDrafts('u1');
    expect(draftKeys()).toEqual([]);
  });
});
