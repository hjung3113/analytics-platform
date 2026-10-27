import { ApiError } from '@/lib/api/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const requestProps = vi.hoisted(
  () => [] as Array<{ capability: string; returnRouteIntent: string }>,
);
const useVocListMock = vi.hoisted(() => vi.fn());
const usePermissionCheckMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/admin/permissions/request-access-button', () => ({
  RequestAccessButton: (props: { capability: string; returnRouteIntent: string }) => {
    requestProps.push(props);
    return <div data-testid={`request-access-${props.capability}`}>{props.returnRouteIntent}</div>;
  },
}));

vi.mock('@/lib/cross-system/usePermissionCheck', () => ({
  usePermissionCheck: usePermissionCheckMock,
}));

vi.mock('@/lib/cross-system/usePermissionCheckBridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cross-system/usePermissionCheckBridge')>()),
  usePermissionCheckBridge: usePermissionCheckMock,
}));

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => ({}),
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock('@/features/voc/hooks/useVocList', () => ({ useVocList: useVocListMock }));
vi.mock('@/features/voc/hooks/useVocListPages', () => ({ useVocListPages: useVocListMock }));
vi.mock('@/features/voc/components/list/VocList', () => ({ VocList: () => null }));

import { SurveyResultsSummary } from '@/features/surveys/components/results/SurveyResultsSummary';
import { InboxScreen } from '@/features/voc/routes/InboxScreen';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { PermissionGate } from '../permission-gate.js';

const SURVEY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function withClient(node: ReactNode) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {node}
    </QueryClientProvider>
  );
}

const INBOX_SEAM: HostSeam = {
  canLink: () => true,
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  notifyError: () => {},
  notifySuccess: () => {},
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
};

const PERMISSION_GATE_SEAM: HostSeam = {
  canLink: () => true,
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  notifyError: () => {},
  notifySuccess: () => {},
  useHere: () => '/permission-state?selected=state-fixture',
};

const HOST_RETURN_INTENT_SEAM: HostSeam = {
  ...PERMISSION_GATE_SEAM,
  useHere: () => '/host/permission-state?selected=host-seam',
};

const SURVEY_RESULTS_SEAM: HostSeam = {
  ...PERMISSION_GATE_SEAM,
  useHere: () => `/surveys/${SURVEY_ID}/results`,
};

function InboxHarness() {
  return (
    <HostSeamProvider value={INBOX_SEAM}>
      <InboxScreen view="inbox" renderDetail={() => null} />
    </HostSeamProvider>
  );
}

describe('permission request return routes', () => {
  beforeEach(() => {
    cleanup();
    requestProps.length = 0;
    usePermissionCheckMock.mockReturnValue({
      data: {
        state: 'request_access',
        decision: { allow: false, reason: 'no_grant', requestable: [{ workspace_id: 'ws' }] },
      },
      isPending: false,
      isError: false,
    });
    window.history.pushState({}, '', '/permission-state?selected=state-fixture');
    useVocListMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError(403, {
        code: 'permission.scope_required',
        message: 'VOC fixture scope is required',
        requestable_permission: {
          permission: 'voc.read.fixture',
          managed_system_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        },
      }),
      refetch: vi.fn(),
    });
  });

  test('AC-D8e three call sites pass distinct return_route_intent values', () => {
    render(
      withClient(
        <HostSeamProvider value={PERMISSION_GATE_SEAM}>
          <PermissionGate capability="permission.state.fixture">
            <p>protected fixture</p>
          </PermissionGate>
        </HostSeamProvider>,
      ),
    );
    expect(screen.getByTestId('request-access-permission.state.fixture')).toBeInTheDocument();
    cleanup();

    render(
      withClient(
        <HostSeamProvider value={SURVEY_RESULTS_SEAM}>
          <SurveyResultsSummary
            survey={
              {
                id: SURVEY_ID,
                display_id: 'SRV-D8E',
                title: 'Distinct survey fixture',
                type: 'outcome',
                status: 'closed',
                questions: [],
              } as never
            }
            results={
              {
                survey_id: SURVEY_ID,
                status: 'closed',
                identity_protected: true,
                response_state: 'visible',
                anonymity_threshold: 5,
                questions: [],
                next_actions: [
                  {
                    id: 'create_finding',
                    availability: 'blocked_requestable',
                    intent: 'open_finding_draft',
                    requestable_permission: {
                      permission: 'finding.manage.fixture',
                      managed_system_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
                    },
                  },
                ],
              } as never
            }
          />
        </HostSeamProvider>,
      ),
    );
    expect(screen.getByTestId('request-access-finding.manage.fixture')).toBeInTheDocument();
    cleanup();

    render(withClient(<InboxHarness />));
    expect(screen.getByTestId('request-access-voc.read.fixture')).toBeInTheDocument();

    const values = requestProps.map(({ returnRouteIntent }) => returnRouteIntent);
    expect(values).toHaveLength(3);
    expect(new Set(values)).toEqual(
      new Set([
        '/permission-state?selected=state-fixture',
        `/surveys/${SURVEY_ID}/results`,
        '/vocs?view=inbox',
      ]),
    );
  });

  test('PermissionGate uses the host return intent', () => {
    render(
      withClient(
        <HostSeamProvider value={HOST_RETURN_INTENT_SEAM}>
          <PermissionGate capability="permission.host-intent.fixture">
            <p>protected fixture</p>
          </PermissionGate>
        </HostSeamProvider>,
      ),
    );

    expect(screen.getByTestId('request-access-permission.host-intent.fixture')).toHaveTextContent(
      '/host/permission-state?selected=host-seam',
    );
  });
});
