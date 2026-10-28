// TriageRoute.pinDeepLink.test.tsx — #383
//
// The VOC detail panel's "Triage에서 변경" button deep-links to
// /vocs?view=triage&selected=<id>. Already-triaged VOCs are excluded by the
// queue predicate, so the route must forward that target as `pinVocId` or the
// console cannot show what the link points at.

import { registerTriageTestHost } from '@/test/triage-host';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
let searchState: Record<string, unknown> = {};

// Capture the exact params TriageRoute hands the list hook.
const useVocListSpy = vi.fn((_params: Record<string, unknown>) => ({
  data: { items: [], next_cursor: undefined },
  isLoading: false,
  error: null,
  refetch: vi.fn(),
}));

vi.mock('../../hooks/useVocList', () => ({
  useVocList: (params: unknown) => useVocListSpy(params as Record<string, unknown>),
}));

vi.mock('@/lib/cross-system/useWorkspaceActors', () => ({
  useWorkspaceActors: () => ({ actors: [], isSuccess: true, isLoading: false, error: null }),
}));

const useMeMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/useMe', () => ({ useMe: useMeMock }));
vi.mock('@/lib/api/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/me')>()),
  useMeBridge: useMeMock,
}));
vi.mock('@/lib/cross-system/usePermissionCheckBridge', () => ({
  usePermissionCheckBridge: vi.fn(),
  permissionCheckQueryKey: () => ['permission-check', 'voc.triage', null],
  permissionRequestsMineKey: ['permission-requests-mine'],
}));

import { useMe } from '@/lib/auth/useMe';
import { usePermissionCheckBridge as usePermissionCheck } from '@/lib/cross-system/usePermissionCheckBridge';
import { TriageRoute } from '@/test/screen-host/features/voc/routes/TriageRoute';

const ADMIN_ME = {
  data: {
    actor: {
      id: 'admin-uuid-1',
      external_id: 'admin-1',
      email: 'admin@test.local',
      display_name: '관리자',
      role_level: 'admin',
    },
    workspace_id: 'ws-1',
  },
  isLoading: false,
  isError: false,
  isPending: false,
  isSuccess: true,
  error: null,
};

function renderRoute() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TriageRoute />
    </QueryClientProvider>,
  );
}

beforeAll(() => registerTriageTestHost(() => searchState, navigateMock));

describe('TriageRoute — re-triage deep link (#383)', () => {
  beforeEach(() => {
    vi.mocked(useMe).mockReturnValue(ADMIN_ME as unknown as ReturnType<typeof useMe>);
    vi.mocked(usePermissionCheck).mockReturnValue({
      data: { state: 'approved' },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof usePermissionCheck>);
    useVocListSpy.mockClear();
    searchState = {};
  });

  it('forwards ?selected as pinVocId so the queue can carry the target', () => {
    searchState = { selected: '00000000-0000-4000-8000-0000000000aa' };

    renderRoute();

    const params = useVocListSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params.view).toBe('triage');
    expect(params.pinVocId).toBe('00000000-0000-4000-8000-0000000000aa');
  });

  it('omits pinVocId when the URL carries no selection', () => {
    searchState = {};

    renderRoute();

    const params = useVocListSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params).not.toHaveProperty('pinVocId');
  });
});
