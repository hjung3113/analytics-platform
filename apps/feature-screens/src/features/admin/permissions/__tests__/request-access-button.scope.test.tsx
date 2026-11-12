// #1844 node 1844f2 — the request dialog for a blocked Site or 공정 (ADR-0154 decision 6, advisor major 2).
// Synthetic site/room names only (ADR-0151).

import { createPermissionRequestSchema } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { scopeCandidatesBody, scopeCreateResultBody } from '@/test/fixtures/permission-scope';
import { RequestAccessButton, type RequestAccessButtonProps } from '../request-access-button.js';

const RETURN_ROUTE = '/menus/production?scopeId=SITE-A';
const REQUEST_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Call = { path: string; method: string; body: unknown };
let calls: Call[] = [];
let created: () => Response;

beforeEach(() => {
  calls = [];
  created = () => json(scopeCreateResultBody(REQUEST_ID, 'site_room', 'SITE-B', 'RB4'), 201);
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://x').pathname;
    const method = init?.method ?? 'GET';
    calls.push({
      path,
      method,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    if (path === '/permission-requests/scope-candidates') return json(scopeCandidatesBody());
    if (path === '/permission-requests' && method === 'POST') return created();
    return new Response('not mocked', { status: 500 });
  }) as typeof fetch;
});

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mount(props: RequestAccessButtonProps) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RequestAccessButton {...props} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

async function choose(user: ReturnType<typeof userEvent.setup>, name: string, option: string) {
  screen.getByRole('combobox', { name }).focus();
  await user.keyboard('{Enter}');
  await user.click(await screen.findByRole('option', { name: option }));
}

const posts = () => calls.filter((c) => c.method === 'POST');
const candidateReads = () => calls.filter((c) => c.path === '/permission-requests/scope-candidates');

describe('<RequestAccessButton> Site·공정 target', () => {
  it('a Site target: choose Site·공정, pick a 공정 from the candidate read, and post the 1844c shape', async () => {
    const user = mount({ scopeTarget: { kind: 'site', site: 'SITE-B' }, returnRouteIntent: RETURN_ROUTE });
    await user.click(screen.getByRole('button', { name: '권한 요청' }));

    const form = screen.getByTestId('permission-request-form');
    expect(within(form).getByText('Site SITE-B')).toBeInTheDocument();
    expect(screen.getByText('권한을 확인하고, 필요한 최소 범위의 사유를 입력하세요.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '공정' })).not.toBeInTheDocument();

    await choose(user, '범위 종류', 'Site·공정');
    screen.getByRole('combobox', { name: '공정' }).focus();
    await user.keyboard('{Enter}');
    const rooms = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(rooms).toEqual(['RB1', 'RB4']);
    await user.click(screen.getByRole('option', { name: 'RB4' }));
    expect(candidateReads().length).toBeGreaterThan(0);

    await user.type(screen.getByTestId('permission-request-reason'), '공정 데이터 확인');
    await user.click(screen.getByRole('button', { name: '요청 제출' }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    const body = posts()[0]?.body;
    expect(body).toEqual({
      requested_capability: 'scope.read',
      requested_scope_kind: 'site_room',
      requested_scope_site: 'SITE-B',
      requested_scope_room: 'RB4',
      reason: '공정 데이터 확인',
      return_route_intent: RETURN_ROUTE,
    });
    expect(createPermissionRequestSchema.parse(body)).toEqual(body);

    // Advisor major 2: the existing completion step, not a silent close.
    expect(await screen.findByText('권한 요청 완료')).toBeInTheDocument();
    expect(screen.getByTestId('permission-request-id')).toHaveTextContent(REQUEST_ID);
    expect(screen.getByText('Site SITE-B · 공정 RB4')).toBeInTheDocument();
    expect(screen.getByText('대기 중')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
  });

  it('a Site target with Site 전체 sends no room and the completion step names the whole site', async () => {
    created = () => json(scopeCreateResultBody(REQUEST_ID, 'site', 'SITE-B'), 201);
    const user = mount({ scopeTarget: { kind: 'site', site: 'SITE-B' }, returnRouteIntent: RETURN_ROUTE });
    await user.click(screen.getByRole('button', { name: '권한 요청' }));

    await choose(user, '범위 종류', 'Site 전체 (이후 추가되는 공정 포함)');
    await user.type(screen.getByTestId('permission-request-reason'), 'Site 전체 확인');
    await user.click(screen.getByRole('button', { name: '요청 제출' }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.body).toEqual({
      requested_capability: 'scope.read',
      requested_scope_kind: 'site',
      requested_scope_site: 'SITE-B',
      reason: 'Site 전체 확인',
      return_route_intent: RETURN_ROUTE,
    });
    expect(await screen.findByText('Site SITE-B 전체')).toBeInTheDocument();
  });

  it('a Site target refuses to submit before a scope kind is chosen', async () => {
    const user = mount({ scopeTarget: { kind: 'site', site: 'SITE-B' }, returnRouteIntent: RETURN_ROUTE });
    await user.click(screen.getByRole('button', { name: '권한 요청' }));
    await user.type(screen.getByTestId('permission-request-reason'), '사유');
    await user.click(screen.getByRole('button', { name: '요청 제출' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('범위 종류를 선택하세요.');
    expect(posts()).toHaveLength(0);
  });

  it('a 공정 target comes prefilled and posts that room', async () => {
    const user = mount({
      scopeTarget: { kind: 'site_room', site: 'SITE-B', room: 'RB4' },
      returnRouteIntent: RETURN_ROUTE,
    });
    await user.click(screen.getByRole('button', { name: '권한 요청' }));

    expect(screen.getByRole('combobox', { name: '범위 종류' })).toHaveTextContent('Site·공정');
    expect(await screen.findByRole('combobox', { name: '공정' })).toHaveTextContent('RB4');

    await user.type(screen.getByTestId('permission-request-reason'), '공정 확인');
    await user.click(screen.getByRole('button', { name: '요청 제출' }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.body).toMatchObject({
      requested_capability: 'scope.read',
      requested_scope_kind: 'site_room',
      requested_scope_site: 'SITE-B',
      requested_scope_room: 'RB4',
    });
    expect(await screen.findByText('권한 요청 완료')).toBeInTheDocument();
  });

  it('a capability target keeps today\'s form and never reads Site·공정 candidates', async () => {
    created = () => json({ id: REQUEST_ID, status: 'pending', created_at: '2026-11-12T00:00:00.000Z' }, 201);
    const user = mount({ capability: 'workspace.read', returnRouteIntent: RETURN_ROUTE });
    await user.click(screen.getByRole('button', { name: '권한 요청' }));

    expect(screen.queryByRole('combobox', { name: '범위 종류' })).not.toBeInTheDocument();
    await user.type(screen.getByTestId('permission-request-reason'), '조회');
    await user.click(screen.getByRole('button', { name: '요청 제출' }));

    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(posts()[0]?.body).toEqual({
      requested_capability: 'workspace.read',
      reason: '조회',
      return_route_intent: RETURN_ROUTE,
    });
    expect(candidateReads()).toHaveLength(0);
  });
});
