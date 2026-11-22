import { ApiError } from '../../../../lib/api';
import { listVocClustersResponseSchema, vocClusterSuggestionItemSchema } from '@ap/feature-shared';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HostSeamProvider, type HostSeam } from '../../../../lib/host/host-seam';
import { IDS, draftNoFinding, emptyList, populatedList } from '../../../../test/fixtures/voc-clusters';
import { clusterSuggestionsKey } from '../../hooks/useClusterSuggestions';
import { VocClusterListShell } from './VocClusterListShell';

const apiRequestMock = vi.hoisted(() => vi.fn());
const useMeBridgeMock = vi.hoisted(() => vi.fn());
const approved = { data: { state: 'approved', decision: { allow: true } } };
const denied = { data: { state: 'blocked_non_requestable', decision: { allow: false } } };
const fullScope = { data: { scope: { kind: 'all' } } };
const scopePath = '/me/permissions/scope?capability=finding.read';
const otherSystem = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const navigate = () => undefined;
const search = {};
const testHost: HostSeam = {
  canLink: () => false,
  Link: () => null,
  notifyError: () => undefined,
  notifySuccess: () => undefined,
  notify: () => 'notice',
  dismiss: () => undefined,
  useNavigate: () => navigate,
  useSearch: () => search,
};
vi.mock('../../../../lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/api/client')>()),
  apiRequest: apiRequestMock,
}));

// Default to no session so the ordinary list cases have no Suggestions tab.
vi.mock('../../../../lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/api/me')>()),
  useMeBridge: () => ({ data: useMeBridgeMock() }),
}));

function DetailSlot() {
  const { ref } = useDetailPanelSlotHost();
  return <div ref={ref} />;
}

function renderClusterList(
  managedSystemId: string = IDS.managedSystem,
  onSuggestionModeChange?: Parameters<typeof VocClusterListShell>[0]['onSuggestionModeChange'],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: () => 0 } },
  });
  const view = (systemId: string) => {
    const list = (
      <VocClusterListShell
        selectedId={null}
        onSelect={() => undefined}
        onCloseDetail={() => undefined}
        managedSystemId={systemId}
        {...(onSuggestionModeChange ? { onSuggestionModeChange } : {})}
      />
    );
    return (
      <QueryClientProvider client={queryClient}>
        {onSuggestionModeChange ? (
          <HostSeamProvider value={testHost}>
            <DetailPanelSlotProvider>
              {list}
              <DetailSlot />
            </DetailPanelSlotProvider>
          </HostSeamProvider>
        ) : list}
      </QueryClientProvider>
    );
  };
  const { rerender } = render(view(managedSystemId));
  return { queryClient, changeSystem: (systemId: string) => rerender(view(systemId)) };
}

beforeEach(() => {
  useMeBridgeMock.mockReset();
});

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

  it('blocks an empty scoped Cluster list when finding.read is denied', async () => {
    apiRequestMock.mockImplementation(async (_method: string, path: string) => {
      if (path === scopePath) return { data: { scope: { kind: 'scoped', managed_system_ids: [] } } };
      if (path === `/me/permissions/check?capability=finding.read&managed_system_id=${IDS.managedSystem}`) return denied;
      return { data: emptyList };
    });
    renderClusterList();

    expect(await screen.findByText('반복 VOC 목록을 볼 권한이 없습니다. 관리자에게 권한을 요청하세요.'))
      .toHaveAttribute('role', 'status');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

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
    expect(screen.getByText('반복 VOC')).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: '반복 VOC 필터' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText(/전체 0|확정 0|Finding 없음 0/)).not.toBeInTheDocument();
    expect(screen.queryByText('0개')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-state-message')).not.toBeInTheDocument();
  });

  it('exits open Suggestions when the new System settles as an empty denied Cluster list', async () => {
    const user = userEvent.setup();
    const onSuggestionModeChange = vi.fn();
    useMeBridgeMock.mockReturnValue({
      workspace_id: IDS.workspace,
      actor: { id: IDS.actor, role_level: 'developer' },
    });
    const pair = vocClusterSuggestionItemSchema.parse({
      id: IDS.candidateVoc,
      primary_managed_system_id: IDS.managedSystem,
      revision: 1,
      embedding_version: 1,
      source_hashes: ['hash-a', 'hash-b'],
      vocs: [
        { id: IDS.existingVoc, display_id: 'VOC-12', title: 'First VOC', description_rich_content: null },
        { id: IDS.candidateVoc, display_id: 'VOC-34', title: 'Second VOC', description_rich_content: null },
      ],
    });
    let resolveList!: (value: { data: typeof emptyList }) => void;
    const pendingList = new Promise<Parameters<typeof resolveList>[0]>((resolve) => {
      resolveList = resolve;
    });
    const scopeResponse = { data: { scope: { kind: 'scoped', managed_system_ids: [IDS.managedSystem] } } };
    let resolveScope!: (value: typeof scopeResponse) => void;
    const pendingScope = new Promise<typeof scopeResponse>((resolve) => {
      resolveScope = resolve;
    });
    apiRequestMock.mockImplementation((_method: string, path: string) => {
      if (path === scopePath) return pendingScope;
      if (path.startsWith('/me/permissions/check')) return Promise.resolve(denied);
      if (path.startsWith('/voc-cluster-suggestions')) {
        return Promise.resolve({ data: { available: true, items: path.endsWith(otherSystem) ? [] : [pair] } });
      }
      if (path.endsWith(otherSystem)) return pendingList;
      return Promise.resolve({ data: populatedList });
    });

    const { queryClient, changeSystem } = renderClusterList(IDS.managedSystem, onSuggestionModeChange);
    queryClient.setQueryData(
      clusterSuggestionsKey(otherSystem, `${IDS.workspace}:${IDS.actor}:developer`),
      { available: true, items: [] },
    );
    await user.click(await screen.findByRole('tab', { name: /^반복 VOC 제안\s*,\s*1$/ }));
    await user.click(await screen.findByRole('button', { name: /VOC-12/ }));
    expect(screen.getByTestId('cluster-suggestion-panel')).toBeInTheDocument();

    changeSystem(otherSystem);
    await act(async () => resolveList({ data: emptyList }));
    await waitFor(() =>
      expect(queryClient.getQueryState(['voc-clusters', { managedSystemId: otherSystem }])?.status)
        .toBe('success'),
    );
    const checkingState = {
      loading: screen.queryByTestId('cluster-list-skeleton') !== null,
      suggestionTab: screen.queryByRole('tab', { name: /반복 VOC 제안/ }),
      panel: screen.queryByTestId('cluster-suggestion-panel'),
    };
    await act(async () => resolveScope(scopeResponse));

    expect(await screen.findByText('반복 VOC 목록을 볼 권한이 없습니다. 관리자에게 권한을 요청하세요.', {}, { timeout: 2000 }))
      .toHaveAttribute('role', 'status');
    expect(checkingState).toEqual({ loading: true, suggestionTab: null, panel: null });
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cluster-suggestion-panel')).not.toBeInTheDocument();
    expect(onSuggestionModeChange).toHaveBeenLastCalledWith(false, { preserveSelection: true });

    changeSystem(IDS.managedSystem);
    expect(await screen.findByRole('tab', { name: /^전체/, selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^반복 VOC 제안\s*,\s*1$/, selected: false })).toBeInTheDocument();
  });

  it.each([
    ['archived System excluded by effective finding.read scope', otherSystem, false],
    ['active System in effective finding.read scope', IDS.managedSystem, true],
  ] as const)('classifies a successful empty list for an %s', async (_description, systemId, allowed) => {
    // Workspace grant plus a deny elsewhere expands to explicit active System IDs.
    // The archived System still passes the workspace-grant point check.
    apiRequestMock.mockImplementation(async (_method: string, path: string) => {
      if (path === scopePath) return { data: { scope: { kind: 'scoped', managed_system_ids: [IDS.managedSystem] } } };
      if (path.startsWith('/me/permissions/check')) return approved;
      return { data: emptyList };
    });
    renderClusterList(systemId);

    if (allowed) {
      expect(await screen.findByTestId('cluster-empty-state')).toBeInTheDocument();
      return;
    }
    expect(await screen.findByText('반복 VOC 목록을 볼 권한이 없습니다. 관리자에게 권한을 요청하세요.'))
      .toHaveAttribute('role', 'status');
    expect(screen.queryByTestId('cluster-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '권한 요청' })).not.toBeInTheDocument();
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
      if (state === 'pending') {
        // Never resolves: pins the read in its pending state. (The tsconfig
        // lib predates Promise.withResolvers, and no resolver is needed.)
        apiRequestMock.mockReturnValue(new Promise(() => undefined));
      } else if (state === 'failed') {
        apiRequestMock.mockRejectedValue(new Error('temporary read failure'));
      } else if (state === 'empty') {
        apiRequestMock.mockResolvedValueOnce({ data: emptyList }).mockResolvedValue(fullScope);
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
