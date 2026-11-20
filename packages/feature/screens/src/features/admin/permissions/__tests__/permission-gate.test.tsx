// <PermissionGate> contract: children render only when the backend returns
// state=approved; every other state uses the shared PermissionBlockedPanel.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { type HostSeam, HostSeamProvider } from '../../../../lib/host/host-seam';
import { PermissionGate } from '../permission-gate.js';

const HOST_SEAM: HostSeam = {
  canLink: () => true,
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  notifyError: () => {},
  notifySuccess: () => {},
  useHere: () => '/permission-gate-test',
};

function wrap(node: React.ReactNode, host: HostSeam = HOST_SEAM) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <HostSeamProvider value={host}>{node}</HostSeamProvider>
    </QueryClientProvider>,
  );
}

function mockPermissionState(
  state: string,
  actors: Array<{
    id: string;
    display_name: string;
    email: string;
    role_level: string;
  }> = [],
) {
  globalThis.fetch = vi.fn(async (input) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/me/permissions/check') {
      const requestable = ['request_access', 'expired', 'revoked'].includes(state)
        ? [{ workspace_id: 'ws' }]
        : null;
      const reason = state === 'expired' ? 'grant_expired' : 'no_grant';
      return new Response(
        JSON.stringify({
          state,
          decision: { allow: false, reason, requestable },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.pathname === '/actors') {
      return new Response(JSON.stringify({ actors }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not mocked', { status: 500 });
  }) as typeof globalThis.fetch;
}

const BLOCKED_STATES = [
  {
    state: 'pending_request',
    panelState: 'denied',
    title: '권한 요청',
    description: '보낸 권한 요청을 검토하고 있습니다.',
  },
  {
    state: 'rejected',
    panelState: 'denied',
    title: '권한 요청이 거절되었습니다.',
    description: '이 권한 요청은 이전에 거절되었습니다.',
  },
  {
    state: 'expired',
    panelState: 'request_access',
    title: '권한이 만료되었습니다.',
    description: '이전에 받은 권한이 만료되었습니다.',
  },
  {
    state: 'revoked',
    panelState: 'request_access',
    title: '권한이 취소되었습니다.',
    description: '이전에 받은 권한이 취소되었습니다.',
  },
  {
    state: 'hidden_existence',
    panelState: 'denied',
    title: '찾을 수 없습니다.',
    description: '요청한 항목을 사용할 수 없습니다.',
  },
  {
    state: 'summary_visible',
    panelState: 'summary_visible',
    title: '제한된 요약',
    description: '승인된 요약만 확인할 수 있습니다.',
  },
  {
    state: 'blocked_non_requestable',
    panelState: 'blocked_not_requestable',
    title: '접근할 수 없습니다.',
    description: '현재 계정에서는 이 작업을 사용할 수 없습니다.',
  },
] as const;

describe('<PermissionGate>', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => new Response('not mocked', { status: 500 }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('renders children when /me/permissions/check returns approved', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ state: 'approved', decision: { allow: true, via: 'role' } }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof globalThis.fetch;
    wrap(
      <PermissionGate capability="workspace.admin">
        <p>secret payload</p>
      </PermissionGate>,
    );
    await waitFor(() => {
      expect(screen.getByText('secret payload')).toBeInTheDocument();
    });
    expect(screen.getByText('secret payload').closest('[aria-live]')).toBeNull();
  });

  test('announces the loading and blocked body and keeps Admin contact guidance outside the card', async () => {
    let resolvePermissionCheck!: (response: Response) => void;
    const permissionCheck = new Promise<Response>((resolve) => {
      resolvePermissionCheck = resolve;
    });
    const fetchMock = vi.fn(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/me/permissions/check') return permissionCheck;
      if (url.pathname === '/actors') {
        return new Response(
          JSON.stringify({
            actors: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                display_name: 'Admin One',
                email: 'admin.one@example.test',
                role_level: 'admin',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('not mocked', { status: 500 });
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    wrap(
      <PermissionGate capability="workspace.admin">
        <p>secret payload</p>
      </PermissionGate>,
    );

    const liveRegion = screen.getByText('접근 확인 중…').closest('[aria-live="polite"]');
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveTextContent('접근 확인 중…');

    resolvePermissionCheck(
      new Response(
        JSON.stringify({
          state: 'blocked_non_requestable',
          decision: { allow: false, reason: 'explicit_deny', requestable: null },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const contactGuidance = await screen.findByText('담당 관리자에게 문의하세요. Admin One');
    expect(liveRegion).not.toBeInTheDocument();
    const heading = screen.getByRole('heading', { name: '접근할 수 없습니다.', level: 2 });
    expect(heading.closest('[aria-live], [role="status"]')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('현재 계정에서는 이 작업을 사용할 수 없습니다.');
    expect(contactGuidance.closest('[data-state], [aria-live], [role="status"]')).toBeNull();
    expect(screen.queryByText('secret payload')).not.toBeInTheDocument();
  });

  test('renders request_access state when backend says request_access', async () => {
    mockPermissionState('request_access');
    wrap(
      <PermissionGate capability="workspace.admin">
        <p>secret payload</p>
      </PermissionGate>,
    );
    const panelTitle = await screen.findByRole('heading', { name: '권한 요청' });
    expect(panelTitle.closest('[data-state]')).toHaveAttribute('data-state', 'request_access');
    expect(screen.getByText('이 화면을 보려면 권한이 필요합니다.')).toBeInTheDocument();
    expect(
      screen.queryByText('이 항목에 접근하려면 권한 요청이 필요합니다.'),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '권한 요청' })).toBeInTheDocument();
    });
    expect(screen.queryByText('secret payload')).not.toBeInTheDocument();

    const request = screen.getByRole('button', { name: '권한 요청' });
    expect(request).toHaveClass('bg-accent-primary');
    expect(screen.getByText('필요한 권한')).toBeInTheDocument();
    fireEvent.click(request);
    const dialog = await screen.findByTestId('permission-request-dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog.closest('[aria-live]')).toBeNull();
  });

  test('puts the pending link first and the permitted Home second', async () => {
    mockPermissionState('pending_request');
    wrap(<PermissionGate capability="workspace.admin"><p>secret payload</p></PermissionGate>, {
      ...HOST_SEAM,
      permissionRequestHref: () => '/company/permission-requests',
      permissionHomeHref: '/company/',
    });
    const status = await screen.findByRole('link', { name: '내 권한 요청 보기' });
    const home = screen.getByRole('link', { name: '홈으로' });
    expect(status).toHaveAttribute('href', '/company/permission-requests');
    expect(home).toHaveAttribute('href', '/company/');
    expect(status).toHaveClass('bg-surface-raised');
    expect(home).toHaveClass('bg-surface-raised');
    expect(Array.from(status.parentElement?.children ?? [])).toEqual([status, home]);
    expect(status.closest('[aria-live], [role="status"]')).toBeNull();
    expect(home.closest('[aria-live], [role="status"]')).toBeNull();
    expect(screen.queryByRole('button', { name: '권한 요청' })).not.toBeInTheDocument();
    expect(screen.queryByText(/검토 중/)).not.toBeInTheDocument();
  });

  test('renders blocked_non_requestable when backend says so', async () => {
    mockPermissionState('blocked_non_requestable');
    wrap(
      <PermissionGate capability="workspace.admin">
        <p>secret payload</p>
      </PermissionGate>,
    );
    await waitFor(() => {
      expect(screen.getByText('접근할 수 없습니다.')).toBeInTheDocument();
    });
    expect(screen.queryByText('secret payload')).not.toBeInTheDocument();
  });

  test.each(BLOCKED_STATES)(
    'renders the $state copy through PermissionBlockedPanel',
    async ({ state, panelState, title, description }) => {
      mockPermissionState(state);
      wrap(
        <PermissionGate capability="workspace.admin">
          <p>secret payload</p>
        </PermissionGate>,
      );

      const panelTitle = await screen.findByRole('heading', { name: title });
      expect(panelTitle.closest('[data-state]')).toHaveAttribute('data-state', panelState);
      expect(screen.getByText(description)).toBeInTheDocument();
      expect(document.querySelector('[data-permission-state]')).toBeNull();
      if (state === 'revoked' || state === 'expired') {
        fireEvent.click(screen.getByRole('button', { name: '권한 요청' }));
        expect(await screen.findByTestId('permission-request-dialog')).toBeInTheDocument();
      } else {
        expect(screen.queryByRole('button', { name: '권한 요청' })).not.toBeInTheDocument();
      }
      expect(screen.queryByText('secret payload')).not.toBeInTheDocument();
      if (state === 'summary_visible') {
        expect(screen.queryByText('요약 정보가 없습니다.')).not.toBeInTheDocument();
        expect(panelTitle.closest('[data-state]')?.querySelector('.bg-surface-canvas')).toBeNull();
      }
    },
  );

  test('blocked state retains contact guidance and all Admin names without exposing emails', async () => {
    mockPermissionState('blocked_non_requestable', [
      {
        id: '11111111-1111-4111-8111-111111111111',
        display_name: 'Admin One',
        email: 'admin.one@example.test',
        role_level: 'admin',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        display_name: 'Admin Two',
        email: 'admin.two@example.test',
        role_level: 'admin',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        display_name: 'Developer',
        email: 'developer@example.test',
        role_level: 'developer',
      },
    ]);
    wrap(
      <PermissionGate capability="workspace.admin">
        <p>secret payload</p>
      </PermissionGate>,
    );

    expect(
      await screen.findByText('담당 관리자에게 문의하세요. Admin One, Admin Two'),
    ).toBeInTheDocument();
    expect(screen.queryByText('admin.one@example.test', { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText('developer@example.test', { exact: true })).not.toBeInTheDocument();
  });

  test('blocked state keeps contact guidance when Admin lookup fails', async () => {
    const fetchMock = vi.fn(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname === '/me/permissions/check') {
        return new Response(
          JSON.stringify({
            state: 'blocked_non_requestable',
            decision: { allow: false, reason: 'explicit_deny', requestable: null },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ code: 'internal.unexpected', message: 'failed' }), {
        status: 500,
      });
    });
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
    wrap(
      <PermissionGate capability="workspace.admin">
        <p>secret payload</p>
      </PermissionGate>,
    );

    expect(await screen.findByText('담당 관리자에게 문의하세요.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/actors?workspace=current', expect.anything());
  });
});
