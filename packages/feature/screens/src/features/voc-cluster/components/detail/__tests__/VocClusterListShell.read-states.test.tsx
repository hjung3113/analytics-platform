import { ApiError } from '../../../../../lib/api';
import { listVocClustersResponseSchema } from '@ap/feature-shared';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HostPrimaryAction } from '../../../../../lib/host/HostPrimaryAction';
import { HostSeamProvider, type HostSeam } from '../../../../../lib/host/host-seam';
import { HeadTargetHost } from '../../../../../test/primary-action-host';
import { useDecidePermissionRequest } from '../../../../admin/permissions/useDecidePermissionRequest';
import { useDirectPermissionGrant } from '../../../../admin/permissions/useDirectPermissionGrant';
import { useRevokePermission } from '../../../../admin/permissions/useRevokePermission';
import { clusterSuggestionsFixture } from '../../../../../test/fixtures/cluster-suggestions';
import { IDS, draftNoFinding, emptyList, populatedList } from '../../../../../test/fixtures/voc-clusters';
import { VocClusterListShell } from '../VocClusterListShell';

const apiRequestMock = vi.hoisted(() => vi.fn());
const meMock = vi.hoisted(() => vi.fn());
const scopePath = '/me/permissions/scope?capability=finding.read';
const otherSystem = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fullScope = { data: { scope: { kind: 'all' } } };
const noop = () => undefined;
const search = {};
const suggestionHost: HostSeam = {
  canLink: () => false,
  Link: () => null,
  notifyError: noop,
  notifySuccess: noop,
  notify: () => 'notice',
  dismiss: noop,
  useNavigate: () => noop,
  useSearch: () => search,
};
vi.mock('../../../../../lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../lib/api/client')>()),
  apiRequest: apiRequestMock,
}));

// The shell's /me read goes through the same mocked client; no session keeps the suggestion tab and create CTA out.
vi.mock('../../../../../lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../lib/api/me')>()),
  useMeBridge: () => ({ data: meMock() }),
}));

function DetailSlot() {
  const { ref } = useDetailPanelSlotHost();
  return <div ref={ref} />;
}

function renderClusterList({
  systemId = IDS.managedSystem,
  selectedId = null,
  onCloseDetail = noop,
  onSuggestionModeChange,
}: {
  systemId?: string;
  selectedId?: string | null;
  onCloseDetail?: Parameters<typeof VocClusterListShell>[0]['onCloseDetail'];
  onSuggestionModeChange?: Parameters<typeof VocClusterListShell>[0]['onSuggestionModeChange'];
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: () => 0 } },
  });
  const view = (managedSystemId: string) => {
    const list = (
      <VocClusterListShell
        selectedId={selectedId}
        onSelect={() => undefined}
        onCloseDetail={onCloseDetail}
        managedSystemId={managedSystemId}
        {...(onSuggestionModeChange ? { onSuggestionModeChange } : {})}
      />
    );
    return (
      <QueryClientProvider client={queryClient}>
        {onSuggestionModeChange ? (
          <HostSeamProvider value={suggestionHost}>
            <DetailPanelSlotProvider>
              {list}
              <DetailSlot />
            </DetailPanelSlotProvider>
          </HostSeamProvider>
        ) : list}
      </QueryClientProvider>
    );
  };
  const { rerender } = render(view(systemId));
  return { queryClient, changeSystem: (managedSystemId: string) => rerender(view(managedSystemId)) };
}

beforeEach(() => meMock.mockReset());

describe('VocClusterListShell list states (#609)', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it.each(['empty', 'filtered', 'error'] as const)(
    'shows the %s state and recovers from retryable or filtered reads',
    async (state) => {
      const user = userEvent.setup();
      if (state === 'empty') {
        apiRequestMock.mockResolvedValueOnce({ data: emptyList }).mockResolvedValue(fullScope);
      } else if (state === 'filtered') {
        apiRequestMock.mockResolvedValue({
          data: listVocClustersResponseSchema.parse({ items: [draftNoFinding] }),
        });
      } else {
        apiRequestMock
          .mockRejectedValueOnce(new Error('temporary read failure'))
          .mockRejectedValueOnce(new Error('temporary read failure'))
          .mockResolvedValueOnce({ data: populatedList });
      }

      renderClusterList();

      if (state === 'empty') {
        expect(await screen.findByTestId('list-state-message')).toHaveAttribute(
          'data-variant',
          'empty',
        );
        expect(screen.getByText('생성된 반복 VOC가 없습니다.')).toBeInTheDocument();
        expect(
          screen.getByText('VOC를 묶어 만든 반복 VOC가 여기에 표시됩니다.'),
        ).toBeInTheDocument();
        return;
      }

      if (state === 'filtered') {
        await screen.findByText(draftNoFinding.title);
        await user.click(screen.getByRole('tab', { name: /^확정/ }));
        expect(await screen.findByTestId('list-state-message')).toHaveAttribute(
          'data-variant',
          'filtered',
        );
        expect(screen.getByText('이 필터에 해당하는 반복 VOC가 없습니다')).toBeInTheDocument();
        expect(screen.getByText('선택한 조건: 확정')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '필터 초기화' }));
        expect(await screen.findByText(draftNoFinding.title)).toBeInTheDocument();
        expect(
          apiRequestMock.mock.calls.every(([, path]) =>
            String(path).includes(`managed_system_id=${IDS.managedSystem}`),
          ),
        ).toBe(true);
        return;
      }

      expect(
        await screen.findByTestId('list-state-message', {}, { timeout: 5000 }),
      ).toHaveAttribute('data-variant', 'error');
      expect(screen.getByText('반복 VOC 목록을 불러오지 못했습니다')).toBeInTheDocument();
      expect(screen.getByText('잠시 후 다시 시도하세요.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: '다시 시도' }));
      expect(await screen.findByText(draftNoFinding.title)).toBeInTheDocument();
    },
  );

  it('keeps permission denials on the blocked panel path', async () => {
    const denied = new ApiError(403, {
      code: 'permission.denied',
      message: 'voc_cluster.read required',
    });
    apiRequestMock.mockRejectedValueOnce(denied).mockRejectedValueOnce(denied);

    renderClusterList();

    expect(
      await screen.findByText(
        '반복 VOC 목록을 볼 권한이 없습니다. 관리자에게 권한을 요청하세요.',
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    // The page head already names the screen; the toolbar title row would repeat it (#2677).
    expect(screen.queryByText('반복 VOC')).not.toBeInTheDocument();
    expect(screen.queryByText('VOC를 유사 주제로 묶어 Finding으로 승격합니다.')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: '반복 VOC 필터' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText(/전체 0|확정 0|Finding 없음 0/)).not.toBeInTheDocument();
    expect(screen.queryByText('0개')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-state-message')).not.toBeInTheDocument();
  });

  it('shows the shared denial card for an out-of-scope System with a successful empty list', async () => {
    const onCloseDetail = vi.fn();
    apiRequestMock.mockImplementation(async (_method: string, path: string) => {
      if (path === scopePath) return { data: { scope: { kind: 'scoped', managed_system_ids: [] } } };
      if (path.startsWith('/me/permissions/check')) {
        return { data: { state: 'blocked_non_requestable', decision: { allow: false } } };
      }
      return { data: emptyList };
    });
    renderClusterList({ selectedId: IDS.draft, onCloseDetail });

    expect(await screen.findByRole('heading', { name: '반복 VOC 목록' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cluster-empty-state')).not.toBeInTheDocument();
    expect(onCloseDetail).toHaveBeenCalledWith({ reconcile: true });
    expect(apiRequestMock).not.toHaveBeenCalledWith(
      'GET', `/voc-clusters/${IDS.draft}`, expect.any(Function), expect.anything(),
    );
  });

  it.each(['approval', 'direct grant'] as const)('refreshes a cached empty list decision after %s and revoke', async (grant) => {
    let allowed = false;
    apiRequestMock.mockImplementation(async (method: string, path: string) => {
      if (method === 'POST') allowed = !path.endsWith('/revoke');
      if (path === scopePath) {
        return { data: { scope: { kind: 'scoped', managed_system_ids: allowed ? [IDS.managedSystem] : [] } } };
      }
      if (path.startsWith('/me/permissions/check')) return { data: { state: 'blocked_non_requestable', decision: { allow: false } } };
      return { data: emptyList };
    });
    const { queryClient } = renderClusterList();
    const { result } = renderHook(() => ({
      decide: useDecidePermissionRequest(),
      grant: useDirectPermissionGrant(noop),
      revoke: useRevokePermission(),
    }), {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}><HostSeamProvider value={suggestionHost}>{children}</HostSeamProvider></QueryClientProvider>
      ),
    });
    await screen.findByRole('heading', { name: '반복 VOC 목록' });
    await act(async () => {
      const mutation = { reason: 'approved for operations', idempotencyKey: 'grant' };
      if (grant === 'approval') {
        await result.current.decide.mutateAsync({ ...mutation, id: IDS.draft, expectedRevision: 1, action: 'approve' });
      } else {
        await result.current.grant.mutateAsync({
          idempotencyKey: mutation.idempotencyKey,
          body: { actor_id: IDS.actor, capability: 'finding.read', managed_system_id: IDS.managedSystem, reason: mutation.reason },
        });
      }
    });
    await screen.findByTestId('cluster-empty-state');
    await act(async () => {
      await result.current.revoke.mutateAsync({ kind: 'grants', id: IDS.draft, reason: 'access ended', idempotencyKey: 'revoke' });
    });
    expect(await screen.findByRole('heading', { name: '반복 VOC 목록' })).toBeInTheDocument();
  });

  it('waits for stale scope to refresh before classifying an empty list in a new System', async () => {
    apiRequestMock.mockResolvedValueOnce({ data: emptyList }).mockResolvedValueOnce(fullScope);
    const { changeSystem, queryClient } = renderClusterList();
    await screen.findByTestId('cluster-empty-state');
    // The target list is already cached, so the scope query stays enabled across the switch:
    // only the entry recheck can start the refresh (R-2689c C10).
    queryClient.setQueryData(['voc-clusters', { managedSystemId: otherSystem }], emptyList);
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['permission-scope'], refetchType: 'none' });
    });
    let confirmScope!: () => void;
    apiRequestMock.mockImplementation(async (_method: string, path: string) => {
      if (path === scopePath) return new Promise((resolve) => {
        confirmScope = () => resolve({ data: { scope: { kind: 'scoped', managed_system_ids: [] } } });
      });
      if (path.startsWith('/me/permissions/check')) return { data: { state: 'approved', decision: { allow: true } } };
      return { data: emptyList };
    });
    changeSystem(otherSystem);
    await waitFor(() => expect(confirmScope).toBeDefined());
    expect(screen.queryByTestId('cluster-empty-state')).not.toBeInTheDocument();
    await act(async () => confirmScope());
    expect(await screen.findByRole('heading', { name: '반복 VOC 목록' })).toBeInTheDocument();
  });

  it('uses the scope refreshed in another System when returning to a revoked System', async () => {
    let allowedSystems = [IDS.managedSystem];
    apiRequestMock.mockImplementation(async (_method: string, path: string) => {
      if (path === scopePath) {
        return { data: { scope: { kind: 'scoped', managed_system_ids: allowedSystems } } };
      }
      if (path.startsWith('/me/permissions/check')) {
        return { data: { state: 'blocked_non_requestable', decision: { allow: false } } };
      }
      return { data: emptyList };
    });
    const { changeSystem, queryClient } = renderClusterList();
    await screen.findByTestId('cluster-empty-state');
    changeSystem(otherSystem);
    await screen.findByRole('heading', { name: '반복 VOC 목록' });

    allowedSystems = [];
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['permission-scope'], type: 'active' });
    });
    changeSystem(IDS.managedSystem);
    expect(screen.queryByTestId('cluster-empty-state')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '반복 VOC 목록' })).toBeInTheDocument();
  });

  it.each([false, true])('keeps the denial and retries a failed point check (prior request: %s)', async (confirmed) => {
    const user = userEvent.setup();
    let pointFails = !confirmed;
    let requestable = true;
    apiRequestMock.mockImplementation(async (_method: string, path: string) => {
      if (path === scopePath) return { data: { scope: { kind: 'scoped', managed_system_ids: [] } } };
      if (path.startsWith('/me/permissions/check')) {
        if (pointFails) throw new Error('temporary point check failure');
        return { data: { state: requestable ? 'request_access' : 'blocked_non_requestable', decision: { allow: false } } };
      }
      return { data: emptyList };
    });
    const { queryClient } = renderClusterList({ onSuggestionModeChange: noop });
    const requestText = '권한 요청';
    if (confirmed) {
      await screen.findByText(requestText);
      pointFails = true;
      await act(async () => { await queryClient.invalidateQueries({ queryKey: ['permission-check'] }); });
    }
    const retry = await screen.findByRole('button', { name: '다시 시도' });
    expect(screen.getByRole('heading', { name: '반복 VOC 목록' })).toBeInTheDocument();
    if (confirmed) expect(screen.getByText(requestText)).toBeInTheDocument();
    pointFails = false;
    await user.click(retry);
    const request = await screen.findByRole('button', { name: requestText });
    await waitFor(() => expect(retry).not.toBeInTheDocument());
    request.focus();
    requestable = false;
    await act(() => queryClient.invalidateQueries({ queryKey: ['permission-check'] }));
    await waitFor(() => expect(document.body).toHaveFocus());
  });

  it('moves focus to the denial card during a keyboard point-check retry', async () => {
    const user = userEvent.setup();
    let resolveRetry!: () => void;
    const response = { data: { state: 'blocked_non_requestable', decision: { allow: false } } };
    const pointCheck = vi.fn()
      .mockRejectedValueOnce(new Error('temporary point check failure'))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRetry = () => resolve(response);
      }));
    apiRequestMock.mockImplementation(async (_method: string, path: string) => {
      if (path === scopePath) return { data: { scope: { kind: 'scoped', managed_system_ids: [] } } };
      if (path.startsWith('/me/permissions/check')) return pointCheck();
      return { data: emptyList };
    });
    renderClusterList();

    const retry = await screen.findByRole('button', { name: '다시 시도' });
    await user.tab();
    expect(retry).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(retry).not.toBeInTheDocument());
    const card = screen.getByRole('heading', { name: '반복 VOC 목록' }).closest('[tabindex="-1"]');
    try {
      expect(card).toHaveFocus();
    } finally {
      await act(async () => resolveRetry());
    }
  });

  it.each([
    ['archived System outside the effective scope', otherSystem, IDS.managedSystem, false],
    ['active System in the effective scope', IDS.managedSystem, IDS.managedSystem, true],
    ['upper-case deep link', otherSystem.toUpperCase(), otherSystem, true],
    ['upper-case scope response', otherSystem, otherSystem.toUpperCase(), true],
  ] as const)('classifies an empty list using the effective scope for %s', async (_case, systemId, scopeId, allowed) => {
    apiRequestMock.mockImplementation(async (_method: string, path: string) => {
      if (path === scopePath) {
        return { data: { scope: { kind: 'scoped', managed_system_ids: [scopeId] } } };
      }
      if (path.startsWith('/me/permissions/check')) {
        return { data: { state: 'approved', decision: { allow: true } } };
      }
      return { data: emptyList };
    });
    renderClusterList({ systemId });

    await waitFor(() => expect(apiRequestMock).toHaveBeenCalledWith('GET', scopePath, expect.any(Function), expect.anything()));
    if (allowed) {
      expect(await screen.findByTestId('cluster-empty-state')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: '반복 VOC 목록' })).not.toBeInTheDocument();
    } else {
      expect(await screen.findByText('반복 VOC 목록을 볼 권한이 없습니다. 관리자에게 권한을 요청하세요.'))
        .toHaveAttribute('role', 'status');
      expect(screen.queryByTestId('cluster-empty-state')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '권한 요청' })).not.toBeInTheDocument();
    }
  });

  it('exits an open suggestion session when switching to a denied System', async () => {
    const user = userEvent.setup();
    const onSuggestionModeChange = vi.fn();
    meMock.mockReturnValue({
      workspace_id: IDS.workspace,
      actor: { id: IDS.actor, role_level: 'developer' },
    });
    apiRequestMock.mockImplementation(async (_method: string, path: string) => {
      if (path === scopePath) {
        return { data: { scope: { kind: 'scoped', managed_system_ids: [IDS.managedSystem] } } };
      }
      if (path.startsWith('/me/permissions/check')) {
        return { data: { state: 'blocked_non_requestable', decision: { allow: false } } };
      }
      if (path.startsWith('/voc-cluster-suggestions')) return { data: clusterSuggestionsFixture };
      return { data: path.endsWith(otherSystem) ? emptyList : populatedList };
    });
    const { changeSystem } = renderClusterList({ onSuggestionModeChange });
    await user.click(await screen.findByRole('tab', { name: /^반복 VOC 제안\s*,\s*1$/ }));
    await user.click(await screen.findByRole('button', { name: /VOC-12/ }));
    expect(await screen.findByTestId('cluster-suggestion-panel')).toBeInTheDocument();
    expect(onSuggestionModeChange).toHaveBeenLastCalledWith(true, expect.anything());

    changeSystem(otherSystem);
    await screen.findByText('반복 VOC 목록을 볼 권한이 없습니다. 관리자에게 권한을 요청하세요.');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cluster-suggestion-panel')).not.toBeInTheDocument();
    expect(onSuggestionModeChange).toHaveBeenLastCalledWith(false, { preserveSelection: true });

    changeSystem(IDS.managedSystem);
    expect(await screen.findByRole('tab', { name: /^반복 VOC 제안\s*,\s*1$/, selected: false }))
      .toBeInTheDocument();
  });
});

// #706 — tab counts are unknown until the list read succeeds; unknown must
// never render as 0.
describe('VocClusterListShell tab counts (#706)', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it.each(['pending', 'failed', 'empty', 'populated'] as const)(
    'shows tab counts only after the list read succeeds (%s)',
    async (state) => {
      let allowScope!: () => void;
      if (state === 'pending') {
        // Never resolves: pins the read in its pending state. (The tsconfig
        // lib predates Promise.withResolvers, and no resolver is needed.)
        apiRequestMock.mockReturnValue(new Promise(() => undefined));
      } else if (state === 'failed') {
        apiRequestMock.mockRejectedValue(new Error('temporary read failure'));
      } else if (state === 'empty') {
        apiRequestMock.mockResolvedValueOnce({ data: emptyList }).mockImplementation(() =>
          new Promise((resolve) => { allowScope = () => resolve(fullScope); }));
      } else {
        apiRequestMock.mockResolvedValue({ data: populatedList });
      }

      renderClusterList();

      if (state === 'pending') {
        expect(screen.getByTestId('cluster-list-skeleton')).toBeInTheDocument();
      } else if (state === 'failed') {
        expect(
          await screen.findByTestId('list-state-message', {}, { timeout: 5000 }),
        ).toHaveAttribute('data-variant', 'error');
      } else if (state === 'empty') {
        await waitFor(() => expect(allowScope).toBeDefined());
        for (const name of ['전체', '확정', 'Finding 없음']) {
          expect(screen.getByRole('tab', { name })).toBeInTheDocument();
        }
        expect(screen.getByTestId('cluster-list-skeleton')).toBeInTheDocument();
        await act(async () => allowScope());
        expect(await screen.findByTestId('cluster-empty-state')).toBeInTheDocument();
      } else {
        expect(await screen.findByText(draftNoFinding.title)).toBeInTheDocument();
        expect(screen.queryByText('3개', { exact: true })).not.toBeInTheDocument();
      }

      if (state === 'pending' || state === 'failed') {
        expect(screen.getByRole('tab', { name: '전체' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: '확정' })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Finding 없음' })).toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /^전체\s*,\s*\d+$/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('tab', { name: /^확정\s*,\s*\d+$/ })).not.toBeInTheDocument();
        expect(
          screen.queryByRole('tab', { name: /^Finding 없음\s*,\s*\d+$/ }),
        ).not.toBeInTheDocument();
        return;
      }
      if (state === 'empty') {
        expect(screen.getByRole('tab', { name: /^전체\s*,\s*0$/ })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /^확정\s*,\s*0$/ })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /^Finding 없음\s*,\s*0$/ })).toBeInTheDocument();
        return;
      }
      expect(screen.getByRole('tab', { name: /^전체\s*,\s*3$/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /^확정\s*,\s*2$/ })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /^Finding 없음\s*,\s*2$/ })).toBeInTheDocument();
    },
  );

  it('recovers from a failed read through a no-data refetch to real zero counts', async () => {
    const user = userEvent.setup();
    apiRequestMock
      .mockRejectedValueOnce(new Error('temporary read failure'))
      .mockRejectedValueOnce(new Error('temporary read failure'));
    let releaseRead: (() => void) | undefined;
    apiRequestMock.mockReturnValueOnce(
      new Promise<{ data: typeof emptyList }>((resolve) => {
        releaseRead = () => resolve({ data: emptyList });
      }),
    ).mockResolvedValue(fullScope);

    renderClusterList();

    expect(await screen.findByTestId('list-state-message', {}, { timeout: 5000 })).toHaveAttribute(
      'data-variant',
      'error',
    );
    expect(screen.queryByRole('tab', { name: /^전체\s*,\s*\d+$/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    // Post-error refetch resets to pending with no data: the skeleton replaces
    // the error view and the counts stay absent while it is unresolved.
    expect(await screen.findByTestId('cluster-list-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('list-state-message')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^전체\s*,\s*\d+$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^확정\s*,\s*\d+$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^Finding 없음\s*,\s*\d+$/ })).not.toBeInTheDocument();

    await act(async () => {
      releaseRead?.();
    });

    expect(await screen.findByRole('tab', { name: /^전체\s*,\s*0$/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^확정\s*,\s*0$/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Finding 없음\s*,\s*0$/ })).toBeInTheDocument();
  });
});

describe('VocClusterListShell denied list header (#2677)', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  function renderWithHead({ denied, head = true }: { denied: boolean; head?: boolean }) {
    const state = { denied };
    const forbidden = new ApiError(403, { code: 'permission.denied', message: 'voc_cluster.read required' });
    apiRequestMock.mockImplementation(async (_method: string, path: string) => {
      if (path.startsWith('/voc-clusters') && state.denied) throw forbidden;
      if (path.startsWith('/voc-clusters')) return { data: populatedList };
      return { data: { available: false, items: [] } };
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const shell = (
      <VocClusterListShell
        selectedId={null}
        onSelect={() => undefined}
        onCloseDetail={() => undefined}
        managedSystemId={IDS.managedSystem}
        primaryAction={
          <HostPrimaryAction>
            <button type="button">반복 VOC 생성</button>
          </HostPrimaryAction>
        }
        toolbarActions={<span data-testid="cluster-create-hint">관리자 또는 개발자 권한이 필요합니다.</span>}
      />
    );
    render(
      <QueryClientProvider client={queryClient}>
        {head ? (
          <HeadTargetHost base={suggestionHost}>{shell}</HeadTargetHost>
        ) : (
          <HostSeamProvider value={suggestionHost}>{shell}</HostSeamProvider>
        )}
      </QueryClientProvider>,
    );
    return {
      deny: async () => {
        state.denied = true;
        await act(async () => {
          await queryClient.invalidateQueries({ queryKey: ['voc-clusters'] });
        });
      },
    };
  }

  it('drops the title row but keeps the head action on a denied list read', async () => {
    renderWithHead({ denied: true });
    await screen.findByText('반복 VOC 목록을 볼 권한이 없습니다. 관리자에게 권한을 요청하세요.', {}, { timeout: 5000 });
    expect(screen.queryByText('VOC를 유사 주제로 묶어 Finding으로 승격합니다.')).not.toBeInTheDocument();
    // Creating a Cluster is not a read of the denied list, so the head action stays.
    expect(within(screen.getByTestId('host-head')).getByRole('button', { name: '반복 VOC 생성' })).toBeInTheDocument();
    expect(screen.queryByTestId('cluster-create-hint')).not.toBeInTheDocument();
  });

  it('keeps the head action node and its focus while a denial settles (R-2677c C1)', async () => {
    const { deny } = renderWithHead({ denied: false });
    expect(await screen.findByText('VOC를 유사 주제로 묶어 Finding으로 승격합니다.')).toBeInTheDocument();
    const create = within(screen.getByTestId('host-head')).getByRole('button', { name: '반복 VOC 생성' });
    create.focus();
    await deny();
    await screen.findByText('반복 VOC 목록을 볼 권한이 없습니다. 관리자에게 권한을 요청하세요.', {}, { timeout: 5000 });
    expect(within(screen.getByTestId('host-head')).getByRole('button', { name: '반복 VOC 생성' })).toBe(create);
    expect(create).toHaveFocus();
  });

  it('keeps the create action visible on a denied list in a host without a head (R-2677c C3)', async () => {
    renderWithHead({ denied: true, head: false });
    await screen.findByText('반복 VOC 목록을 볼 권한이 없습니다. 관리자에게 권한을 요청하세요.', {}, { timeout: 5000 });
    expect(screen.getByRole('button', { name: '반복 VOC 생성' })).toBeVisible();
    expect(screen.queryByTestId('cluster-create-hint')).not.toBeInTheDocument();
  });

  it('keeps the title row on a readable list', async () => {
    renderWithHead({ denied: false });
    expect(await screen.findByText('VOC를 유사 주제로 묶어 Finding으로 승격합니다.')).toBeInTheDocument();
    expect(screen.getByTestId('cluster-create-hint')).toBeVisible();
  });
});
