// F1–F5, X1–X6 — the platform 권한 요청 page. fetch is mocked directly (house style), with the bridge's `/api/fo` base path.

import { configureApiClient } from '@/lib/api/client';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionRequestsScreen } from '../PermissionRequestsScreen';

const MS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MS_B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const MS_ARCHIVED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac';
const ID_PENDING = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const ID_APPROVED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const ID_CANCELLED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
const ID_MORE_INFO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4';

const ms = (id: string, name: string, archived = false) => ({
  id,
  workspace_id: 'ws-1',
  slug: name.toLowerCase(),
  name,
  external_key: null,
  default_owner_actor_id: null,
  default_owner_team_id: null,
  default_reviewer_actor_id: null,
  default_reviewer_team_id: null,
  archived_at: archived ? '2026-01-01T00:00:00Z' : null,
  archived_by_actor_id: null,
  created_at: '2026-05-20T00:00:00Z',
  updated_at: '2026-05-20T00:00:00Z',
});

const row = (id: string, status: string, over: Record<string, unknown> = {}) => ({
  id,
  requested_capability: 'voc.read',
  requested_managed_system_id: MS_A,
  reason: `${status} 사유`,
  requested_object_type: null,
  requested_object_id: null,
  source_object_type: null,
  source_object_id: null,
  source_action_id: null,
  revision: 3,
  requested_expiration: null,
  updated_at: '2026-10-20T00:00:00.000Z',
  return_route_intent: null,
  status,
  created_at: '2026-10-20T00:00:00.000Z',
  ...over,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
let calls: Call[] = [];
let listRows: unknown[] = [];
let postResponse: () => Response = () =>
  json({ id: ID_PENDING, status: 'pending', created_at: '2026-10-24T00:00:00.000Z' }, 201);
let cancelResponse: () => Response = () =>
  json({
    id: ID_PENDING,
    status: 'cancelled',
    revision: 4,
    updated_at: '2026-10-24T00:00:00.000Z',
  });

function installFetch() {
  calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({
      url,
      method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const path = new URL(url, 'http://x').pathname;
    if (path === '/api/fo/managed-systems')
      return json({
        items: [ms(MS_A, 'Alpha'), ms(MS_B, 'Beta'), ms(MS_ARCHIVED, 'Gamma', true)],
        total: 3,
      });
    if (path === '/api/fo/permission-requests/mine') return json({ requests: listRows });
    if (path === '/api/fo/permission-requests' && method === 'POST') return postResponse();
    if (path.endsWith('/cancel') && method === 'POST') return cancelResponse();
    const detailId = /^\/api\/fo\/permission-requests\/([^/]+)$/.exec(path)?.[1];
    if (detailId !== undefined && method === 'GET')
      return json({
        ...row(detailId, 'needs_more_info'),
        requester_actor_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        source_summary: null,
        latest_admin_question: {
          note: '어떤 Survey인지 알려 주세요',
          created_at: '2026-10-21T00:00:00.000Z',
        },
        editable_scope_candidates: [],
        allowed_actions: ['withdraw'],
      });
    return new Response('not mocked', { status: 500 });
  }) as typeof fetch;
}

function mount() {
  const seam = {
    canLink: () => false,
    Link: () => null,
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
  } satisfies HostSeam;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <HostSeamProvider value={seam}>
        <PermissionRequestsScreen />
      </HostSeamProvider>
    </QueryClientProvider>,
  );
  return { seam, user: userEvent.setup() };
}

async function choose(user: ReturnType<typeof userEvent.setup>, name: string, option: string) {
  screen.getByRole('combobox', { name }).focus();
  await user.keyboard('{Enter}');
  await user.click(await screen.findByRole('option', { name: option }));
}

const posts = () =>
  calls.filter((c) => c.method === 'POST' && c.url === '/api/fo/permission-requests');
const mineCalls = () => calls.filter((c) => c.url.startsWith('/api/fo/permission-requests/mine'));
const submitButton = () => screen.getByRole('button', { name: '요청 보내기' });
const reasonBox = () => screen.getByRole('textbox', { name: /사유/ });

const originalFetch = globalThis.fetch;
beforeEach(() => {
  configureApiClient({ basePath: '/api/fo' });
  listRows = [];
  postResponse = () =>
    json({ id: ID_PENDING, status: 'pending', created_at: '2026-10-24T00:00:00.000Z' }, 201);
  cancelResponse = () =>
    json({
      id: ID_PENDING,
      status: 'cancelled',
      revision: 4,
      updated_at: '2026-10-24T00:00:00.000Z',
    });
  installFetch();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  configureApiClient({ basePath: '' });
});

describe('새 권한 요청', () => {
  it('F1 posts the capability, Managed System and reason with an Idempotency-Key, then resets and refetches', async () => {
    const { seam, user } = mount();
    await waitFor(() => expect(mineCalls()).toHaveLength(1));
    expect(mineCalls()[0]?.url).toBe('/api/fo/permission-requests/mine?status=all');
    expect(submitButton()).toBeEnabled();

    await choose(user, '기능', 'VOC 조회');
    await choose(user, 'Managed System', 'Alpha');
    await user.type(reasonBox(), '  장애 분석에 필요합니다  ');
    await user.click(submitButton());

    await waitFor(() => expect(seam.notifySuccess).toHaveBeenCalledWith('권한 요청을 보냈습니다'));
    expect(posts()).toHaveLength(1);
    expect(posts()[0]?.body).toEqual({
      requested_capability: 'voc.read',
      requested_managed_system_id: MS_A,
      reason: '장애 분석에 필요합니다',
    });
    expect(posts()[0]?.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(reasonBox()).toHaveValue('');
    expect(screen.queryByRole('combobox', { name: 'Managed System' })).not.toBeInTheDocument();
    await waitFor(() => expect(mineCalls()).toHaveLength(2));
  });

  it('F2 offers workspace.admin nowhere and only active Managed Systems', async () => {
    const { user } = mount();
    screen.getByRole('combobox', { name: '기능' }).focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('option', { name: 'VOC 조회' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: '워크스페이스 관리자 권한' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'VOC 조회' }));
    expect(calls.find((call) => call.url.includes('/managed-systems'))?.url).toContain('limit=500');

    screen.getByRole('combobox', { name: 'Managed System' }).focus();
    await user.keyboard('{Enter}');
    const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(options).toEqual(['Alpha', 'Beta']);
  });

  it.each([
    {
      label: 'workspace.read has no Managed System field',
      capability: '워크스페이스 전체 읽기',
      system: null,
      expectedBody: { requested_capability: 'workspace.read', reason: '사유' },
    },
    {
      label: 'survey.export workspace-wide omits the Managed System',
      capability: 'Survey 데이터 내보내기',
      system: '전체 (워크스페이스)',
      expectedBody: { requested_capability: 'survey.export', reason: '사유' },
    },
    {
      label: 'survey.export may name one Managed System',
      capability: 'Survey 데이터 내보내기',
      system: 'Beta',
      expectedBody: {
        requested_capability: 'survey.export',
        requested_managed_system_id: MS_B,
        reason: '사유',
      },
    },
  ])('F2 $label', async ({ capability, system, expectedBody }) => {
    const { user } = mount();
    await choose(user, '기능', capability);
    if (system === null) {
      expect(screen.queryByRole('combobox', { name: 'Managed System' })).not.toBeInTheDocument();
    } else {
      if (system !== '전체 (워크스페이스)') await choose(user, 'Managed System', system);
      expect(screen.getByRole('combobox', { name: 'Managed System' })).toBeInTheDocument();
    }
    await user.type(reasonBox(), '사유');
    await user.click(submitButton());
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.body).toEqual(expectedBody);
  });

  it('F2 blocks a capability that needs a Managed System until one is chosen', async () => {
    const { user } = mount();
    await choose(user, '기능', 'VOC Triage');
    await user.type(reasonBox(), '사유');
    await user.click(submitButton());
    expect(posts()).toHaveLength(0);
    await choose(user, 'Managed System', 'Alpha');
    await user.click(submitButton());
    await waitFor(() => expect(posts()).toHaveLength(1));
  });

  it.each([
    {
      code: 'conflict.capability_already_granted',
      status: 409,
      toast: '이미 권한이 부여되어 있습니다.',
      field: null,
    },
    {
      code: 'conflict.permission_request_duplicate',
      status: 409,
      toast: '동일한 권한 요청이 이미 진행 중입니다.',
      field: null,
    },
    {
      code: 'validation.sensitive_reason_required',
      status: 422,
      toast: null,
      field: '민감한 작업입니다. 사유를 입력해 주세요.',
    },
  ])('F3 $code shows its mapped message and no success', async ({ code, status, toast, field }) => {
    postResponse = () => json({ code, message: 'x' }, status);
    const { seam, user } = mount();
    await choose(user, '기능', 'VOC 조회');
    await choose(user, 'Managed System', 'Alpha');
    await user.type(reasonBox(), '사유');
    await user.click(submitButton());

    await waitFor(() => expect(posts()).toHaveLength(1));
    if (toast !== null) {
      await waitFor(() => expect(seam.notifyError).toHaveBeenCalledWith(toast));
    } else {
      expect(await screen.findByText(field as string)).toBeInTheDocument();
      expect(seam.notifyError).not.toHaveBeenCalled();
    }
    expect(seam.notifySuccess).not.toHaveBeenCalled();
    expect(reasonBox()).toHaveValue('사유');
  });
});

describe('내 권한 요청', () => {
  it('F4 labels each row and offers 요청 철회 on open rows only', async () => {
    listRows = [
      row(ID_PENDING, 'pending'),
      row(ID_APPROVED, 'approved', {
        requested_capability: 'finding.read',
        requested_managed_system_id: null,
      }),
      row(ID_CANCELLED, 'cancelled', { requested_managed_system_id: MS_ARCHIVED }),
      row(ID_MORE_INFO, 'needs_more_info', {
        requested_managed_system_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      }),
    ];
    mount();
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(4);
    const [pending, approved, cancelled, moreInfo] = items as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(within(pending).getByText('대기 중')).toBeInTheDocument();
    expect(within(pending).getByText(/Alpha/)).toBeInTheDocument();
    expect(within(approved).getByText('승인됨')).toBeInTheDocument();
    expect(within(approved).getByText(/^전체 ·/)).toBeInTheDocument();
    expect(within(cancelled).getByText('철회')).toBeInTheDocument();
    expect(within(cancelled).getByText(/Gamma/)).toBeInTheDocument();
    expect(within(moreInfo).getByText(/알 수 없는 Managed System/)).toBeInTheDocument();
    expect(
      within(moreInfo).getByText('철회한 뒤 답을 사유에 적어 다시 요청할 수 있습니다.'),
    ).toBeInTheDocument();
    expect(within(pending).getByRole('button', { name: /^요청 철회/ })).toBeInTheDocument();
    expect(within(moreInfo).getByRole('button', { name: /^요청 철회/ })).toBeInTheDocument();
    expect(within(approved).queryByRole('button', { name: /^요청 철회/ })).not.toBeInTheDocument();
    expect(within(cancelled).queryByRole('button', { name: /^요청 철회/ })).not.toBeInTheDocument();
  });

  it('F4 withdraws after an inline confirm with the row revision, then refetches', async () => {
    listRows = [row(ID_PENDING, 'pending')];
    const { seam, user } = mount();
    await user.click(await screen.findByRole('button', { name: /^요청 철회/ }));
    expect(screen.getByText('요청을 철회할까요?')).toBeInTheDocument();
    expect(calls.filter((c) => c.url.endsWith('/cancel'))).toHaveLength(0);
    const before = mineCalls().length;

    await user.click(screen.getByRole('button', { name: '철회' }));
    await waitFor(() => expect(seam.notifySuccess).toHaveBeenCalledWith('요청이 철회되었습니다.'));
    const cancels = calls.filter((c) => c.url.endsWith('/cancel'));
    expect(cancels).toHaveLength(1);
    expect(cancels[0]?.url).toBe(`/api/fo/permission-requests/${ID_PENDING}/cancel`);
    expect(cancels[0]?.body).toEqual({ expected_revision: 3 });
    await waitFor(() => expect(mineCalls().length).toBeGreaterThan(before));
  });

  it('F4 keeps the row when the confirm is dismissed', async () => {
    listRows = [row(ID_PENDING, 'pending')];
    const { user } = mount();
    await user.click(await screen.findByRole('button', { name: /^요청 철회/ }));
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByRole('button', { name: /^요청 철회/ })).toBeInTheDocument();
    expect(calls.filter((c) => c.url.endsWith('/cancel'))).toHaveLength(0);
  });

  it('F4 a stale revision tells the user and refetches', async () => {
    listRows = [row(ID_PENDING, 'pending')];
    cancelResponse = () => json({ code: 'conflict.stale_write', message: 'x' }, 409);
    const { seam, user } = mount();
    await user.click(await screen.findByRole('button', { name: /^요청 철회/ }));
    const before = mineCalls().length;
    await user.click(screen.getByRole('button', { name: '철회' }));
    await waitFor(() =>
      expect(seam.notifyError).toHaveBeenCalledWith('요청이 바뀌었습니다. 목록을 새로 고쳤습니다.'),
    );
    expect(seam.notifySuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(mineCalls().length).toBeGreaterThan(before));
  });

  it('F4 shows the empty state', async () => {
    mount();
    expect(await screen.findByText('보낸 권한 요청이 없습니다.')).toBeInTheDocument();
  });

  it('F4 shows a retryable error state', async () => {
    const base = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('/mine')
        ? json({ code: 'internal.unexpected', message: 'x' }, 500)
        : base(input, init),
    ) as typeof fetch;
    mount();
    expect(await screen.findByText('요청을 불러오지 못했습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 확인' })).toBeInTheDocument();
  });
});

it('tells the user that business-system access is the platform admin’s', () => {
  mount();
  expect(
    screen.getByText(
      '업무 시스템 접근 권한은 플랫폼 관리자가 줍니다. 여기서는 FeedbackOps 기능 권한을 요청합니다.',
    ),
  ).toBeInTheDocument();
});

const focused = () => document.activeElement;
const withdrawButton = () => screen.getByRole('button', { name: /^요청 철회/ });

describe('포커스·필수 입력·관리자 질문 (UX 검토)', () => {
  it.each([
    {
      how: '취소',
      act: (user: ReturnType<typeof userEvent.setup>) =>
        user.click(screen.getByRole('button', { name: '취소' })),
    },
    { how: 'Esc', act: (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}') },
  ])(
    'X1 opening the confirm focuses 취소; $how closes it and focuses 요청 철회',
    async ({ act }) => {
      listRows = [row(ID_PENDING, 'pending')];
      const { user } = mount();
      await user.click(await screen.findByRole('button', { name: /^요청 철회/ }));
      expect(focused()).toBe(screen.getByRole('button', { name: '취소' }));
      await act(user);
      expect(screen.queryByText('요청을 철회할까요?')).not.toBeInTheDocument();
      expect(focused()).toBe(withdrawButton());
    },
  );

  it('X2 a successful withdraw focuses the row', async () => {
    listRows = [row(ID_PENDING, 'pending')];
    const { seam, user } = mount();
    const item = await screen.findByRole('listitem');
    await user.click(withdrawButton());
    listRows = [row(ID_PENDING, 'cancelled')];
    await user.click(screen.getByRole('button', { name: '철회' }));
    await waitFor(() => expect(seam.notifySuccess).toHaveBeenCalled());
    await waitFor(() => expect(focused()).toBe(item));
  });

  it('X2 a successful withdraw focuses the heading when the refetched list lacks the row', async () => {
    listRows = [row(ID_PENDING, 'pending')];
    const { user } = mount();
    await user.click(await screen.findByRole('button', { name: /^요청 철회/ }));
    listRows = [];
    await user.click(screen.getByRole('button', { name: '철회' }));
    const heading = await screen.findByRole('heading', { name: '내 권한 요청' });
    await waitFor(() => expect(focused()).toBe(heading));
  });

  it('X2 a 409 focuses 요청 철회 again', async () => {
    listRows = [row(ID_PENDING, 'pending')];
    cancelResponse = () => json({ code: 'conflict.stale_write', message: 'x' }, 409);
    const { seam, user } = mount();
    await user.click(await screen.findByRole('button', { name: /^요청 철회/ }));
    await user.click(screen.getByRole('button', { name: '철회' }));
    await waitFor(() => expect(seam.notifyError).toHaveBeenCalled());
    await waitFor(() => expect(focused()).toBe(withdrawButton()));
  });

  it('X3 a successful submit focuses the 기능 trigger', async () => {
    const { seam, user } = mount();
    await choose(user, '기능', 'VOC 조회');
    await choose(user, 'Managed System', 'Alpha');
    await user.type(reasonBox(), '사유');
    await user.click(submitButton());
    await waitFor(() => expect(seam.notifySuccess).toHaveBeenCalled());
    await waitFor(() => expect(focused()).toBe(screen.getByRole('combobox', { name: '기능' })));
  });

  it.each([
    {
      label: 'no capability',
      fill: async () => {},
      alert: '기능을 선택하세요.',
      control: () => screen.getByRole('combobox', { name: '기능' }),
    },
    {
      label: 'Managed System required and empty',
      fill: async (user: ReturnType<typeof userEvent.setup>) => {
        await choose(user, '기능', 'VOC Triage');
        await user.type(reasonBox(), '사유');
      },
      alert: 'Managed System을 선택하세요.',
      control: () => screen.getByRole('combobox', { name: 'Managed System' }),
    },
    {
      label: 'empty reason',
      fill: async (user: ReturnType<typeof userEvent.setup>) => {
        await choose(user, '기능', 'VOC Triage');
        await choose(user, 'Managed System', 'Alpha');
      },
      alert: '사유는 필수입니다.',
      control: () => reasonBox(),
    },
  ])(
    'X4 submit with $label shows the alert, marks the control, focuses it and posts nothing',
    async ({ fill, alert, control }) => {
      const { user } = mount();
      await fill(user);
      await user.click(submitButton());
      expect(await screen.findByText(alert)).toHaveAttribute('role', 'alert');
      expect(control()).toHaveAttribute('aria-invalid', 'true');
      expect(control()).toHaveAccessibleDescription(alert);
      expect(focused()).toBe(control());
      expect(posts()).toHaveLength(0);
    },
  );

  it('X4 marks Managed System required and clears an error when its field changes', async () => {
    const { user } = mount();
    await choose(user, '기능', 'VOC Triage');
    expect(screen.getByText('Managed System · 필수')).toBeInTheDocument();
    await user.click(submitButton());
    expect(await screen.findByText('Managed System을 선택하세요.')).toBeInTheDocument();
    await choose(user, 'Managed System', 'Alpha');
    expect(screen.queryByText('Managed System을 선택하세요.')).not.toBeInTheDocument();
  });

  it('X5 a needs_more_info row shows the admin question; a pending row requests no detail', async () => {
    listRows = [row(ID_PENDING, 'pending'), row(ID_MORE_INFO, 'needs_more_info')];
    mount();
    expect(await screen.findByText('관리자 질문: 어떤 Survey인지 알려 주세요')).toBeInTheDocument();
    const detailUrls = calls
      .filter((c) => /\/permission-requests\/[^/?]+$/.test(c.url) && c.method === 'GET')
      .map((c) => c.url);
    expect(detailUrls).toEqual([`/api/fo/permission-requests/${ID_MORE_INFO}`]);
  });

  it('X6 two open rows have distinct 요청 철회 names', async () => {
    listRows = [
      row(ID_PENDING, 'pending'),
      row(ID_MORE_INFO, 'needs_more_info', {
        requested_capability: 'finding.read',
        requested_managed_system_id: null,
      }),
    ];
    mount();
    const buttons = await screen.findAllByRole('button', { name: /^요청 철회/ });
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      '요청 철회: VOC 조회 · Alpha',
      expect.stringMatching(/^요청 철회: .+ · 전체$/),
    ]);
  });
});
