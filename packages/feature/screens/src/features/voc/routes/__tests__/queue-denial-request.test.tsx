import { useState } from 'react';
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, assert, describe, expect, it, vi } from 'vitest';

import { useAccessRequestState } from '../../../../test-support/access-request-host';
import { HostSeamProvider, type HostSeam } from '../../../../lib/host/host-seam';
import { OwnerPermissionRequestDialog } from '../../../home/OwnerPermissionRequestDialog';
import { TriageScreen } from '../../components/triage/TriageScreen';
import { InboxScreen } from '../InboxScreen';

const SYSTEM = '10000000-0000-4000-8000-000000000001';
const OTHER_SYSTEM = '10000000-0000-4000-8000-000000000002';
const ID = '10000000-0000-4000-8000-000000000003';
const AT = '2026-11-20T00:00:00.000Z';
const REASON = 'VOC를 확인할 조회 권한이 필요합니다.';
const ROW = {
  id: ID, requested_capability: 'voc.read', requested_managed_system_id: SYSTEM,
  requested_object_type: null, requested_object_id: null, source_object_type: null,
  source_object_id: null, source_action_id: null, requested_expiration: null,
  return_route_intent: null, revision: 1, status: 'pending', reason: REASON,
  created_at: AT, updated_at: AT,
};

function mount(view: 'inbox' | 'triage', {
  existing, home, canOpenStatus = true, hint = { permission: 'voc.read', managed_system_id: SYSTEM },
  check, conflict, list, client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  hosted = false, reflectSubmittedRequest = true,
}: {
  existing: boolean; home?: string; canOpenStatus?: boolean;
  hint?: { permission: string; managed_system_id: string | null };
  check?: (params: URLSearchParams) => Response | Promise<Response>;
  conflict?: boolean;
  list?: () => Response | Promise<Response>;
  client?: QueryClient;
  hosted?: boolean;
  reflectSubmittedRequest?: boolean;
}) {
  let pending = existing;
  const calls = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const { pathname: path, searchParams } = new URL(String(input), 'http://localhost');
    if (path === '/vocs') return list?.() ?? Response.json({
      code: 'permission.denied', message: 'denied',
      requestable_permission: { ...hint, reason_required: true },
    }, { status: 403 });
    if (path === '/me/permissions/check') {
      if (check) return check(searchParams);
      if (view === 'inbox' || searchParams.get('capability') === 'voc.read') return Response.json({
        state: 'request_access',
        decision: { allow: false, reason: 'no_grant', requestable: [{ workspace_id: 'ws' }] },
      });
      return Response.json({ state: 'approved', decision: { allow: true } });
    }
    if (path === '/me/permissions/scope') return Response.json({ scope: { kind: 'all' } });
    if (path === '/me') return Response.json({ workspace_id: 'ws', actor: { id: 'actor', display_name: 'Developer', external_id: 'dev', email: 'dev@example.test', role_level: 'developer' } });
    if (path === '/nav/counts') return Response.json({ counts: {} });
    if (path === '/managed-systems') return Response.json({ items: [], total: 0 });
    if (path === '/analytics-areas') return Response.json({ items: [] });
    if (path === '/permission-requests/mine') {
      const unrelated = [
        { ...ROW, id: '10000000-0000-4000-8000-000000000004', requested_managed_system_id: OTHER_SYSTEM },
        { ...ROW, id: '10000000-0000-4000-8000-000000000005', requested_capability: 'voc.triage' },
      ].filter(row => row.requested_capability !== hint.permission || row.requested_managed_system_id !== hint.managed_system_id);
      return Response.json({ requests: pending ? [...unrelated, ROW] : unrelated });
    }
    if (path === '/permission-requests' && init?.method === 'POST') {
      if (conflict) return Response.json({ code: 'conflict.permission_request_duplicate', message: 'duplicate' }, { status: 409 });
      pending ||= reflectSubmittedRequest;
      return Response.json({ id: ID, status: 'pending', created_at: AT }, { status: 201 });
    }
    if (path === `/permission-requests/${ID}`) return Response.json({
      ...ROW, requester_actor_id: ID, source_summary: null, latest_admin_question: null,
      editable_scope_candidates: [], allowed_actions: ['withdraw'],
    });
    if (path === `/permission-requests/${ID}/cancel`) {
      pending = false;
      return Response.json({ id: ID, status: 'cancelled', revision: 2, updated_at: AT });
    }
    return Response.json({ code: 'test.unhandled_request', message: path }, { status: 500 });
  });
  vi.stubGlobal('fetch', calls);
  const search = { managedSystem: SYSTEM };
  const host: HostSeam = {
    canLink: to => canOpenStatus && to === '/permission-requests',
    Link: ({ to, children, ...rest }) => <a href={to} {...rest}>{children}</a>,
    useSearch: () => search,
    useNavigate: () => vi.fn(),
    useHere: () => `/vocs?view=${view}`,
    notifyError: vi.fn(), notifySuccess: vi.fn(),
    ...(home ? { permissionHomeHref: home } : {}),
    ...(hosted ? { useAccessRequestState, usePermissionLinks: () => ({
      permissionRequestHref: () => '/permission-requests/new',
    }) } : {}),
  };
  function Page() {
    const [withdraw, setWithdraw] = useState(false);
    return <>
      {view === 'inbox' ? <InboxScreen view="inbox" renderDetail={() => null} /> : <TriageScreen />}
      <button type="button" onClick={() => setWithdraw(true)}>Open request details</button>
      {withdraw && <OwnerPermissionRequestDialog id={ID} onClose={() => setWithdraw(false)} />}
    </>;
  }
  render(<QueryClientProvider client={client}><HostSeamProvider value={host}><Page /></HostSeamProvider></QueryClientProvider>);
  return { client, calls };
}

afterEach(() => vi.unstubAllGlobals());

function holdRecheck() {
  let resolve!: (value: Response) => void;
  const recheck = new Promise<Response>(done => { resolve = done; });
  const check = vi.fn<() => Response | Promise<Response>>(() => recheck).mockImplementationOnce(() => Response.json({
    state: 'request_access',
    decision: { allow: false, reason: 'no_grant', requestable: [{ managed_system_id: SYSTEM }] },
  }));
  return {
    check,
    settle: () => resolve(Response.json({
      state: 'blocked_non_requestable', decision: { allow: false, reason: 'explicit_deny' },
    })),
  };
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const response = new Promise<Response>(done => { resolve = done; });
  return { response, resolve };
}

function returnToWindow() {
  focusManager.setFocused(false);
  focusManager.setFocused(true);
  focusManager.setFocused(undefined);
}

const queueDenial = (systemId: string | null) => Response.json({
  code: 'permission.denied', message: 'denied',
  requestable_permission: { permission: 'voc.read', managed_system_id: systemId, reason_required: true },
}, { status: 403 });
const requestableCheck = () => ({
  state: 'request_access', decision: { allow: false, requestable: [{ managed_system_id: SYSTEM }] },
});
const approvedCheck = () => Response.json({ state: 'approved', decision: { allow: true } });

it('waits for a new Triage check instead of offering a request from the cache', async () => {
  const client = new QueryClient();
  const queryKey = ['permission-check', 'voc.read', OTHER_SYSTEM];
  client.setQueryData(queryKey, requestableCheck());
  const check = deferredResponse();
  const hintedCheck = vi.fn(() => check.response);
  mount('triage', {
    existing: false, client, hint: { permission: 'voc.read', managed_system_id: OTHER_SYSTEM },
    check: params => params.get('managed_system_id') === OTHER_SYSTEM ? hintedCheck() : approvedCheck(),
  });
  await waitFor(() => expect(screen.queryByText('확인 중') ??
    screen.queryByRole('button', { name: '권한 요청' })).toBeVisible());
  expect.soft(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();
  expect.soft(screen.queryByText('확인 중')).toBeVisible();
  expect.soft(hintedCheck).toHaveBeenCalledTimes(1);
  await act(async () => check.resolve(Response.json({
    state: 'blocked_non_requestable', decision: { allow: false, reason: 'explicit_deny' },
  })));
  await waitFor(() => expect(client.isFetching({ queryKey })).toBe(0));
  expect(screen.queryByText('확인 중')).toBeNull();
  expect(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();
});

it('closes the Inbox dialog and rereads the denied list when its check allows access', async () => {
  const allowed = deferredResponse();
  const check = vi.fn((): Response | Promise<Response> => Response.json(requestableCheck()));
  const list = vi.fn(() => queueDenial(SYSTEM));
  const { client } = mount('inbox', { existing: false, check, list });
  fireEvent.click(await screen.findByRole('button', { name: '권한 요청' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  check.mockImplementationOnce(() => allowed.response);
  await act(async () => { void client.invalidateQueries({ queryKey: ['permission-check'] }); });
  await act(async () => allowed.resolve(approvedCheck()));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(list).toHaveBeenCalledTimes(2);
});

it.each([SYSTEM, null])('uses the current Inbox hint after switching from %s', async initial => {
  let target = initial;
  const check = vi.fn(() => Response.json(requestableCheck()));
  mount('inbox', { existing: false, hosted: true, list: () => queueDenial(target), check });
  const nextRole = initial === null ? 'link' : 'button';
  const entry = await screen.findByRole(initial === null ? 'button' : 'link', { name: '권한 요청' });
  if (initial === null) fireEvent.click(entry);
  const openedDialog = initial === null ? screen.getByRole('dialog') : undefined;
  target = initial === null ? SYSTEM : null;
  await act(async () => returnToWindow());
  await waitFor(() => expect(check.mock.calls.length).toBeGreaterThan(1));
  if (openedDialog) {
    expect(screen.getByRole('dialog')).toBe(openedDialog);
    fireEvent.click(within(openedDialog).getByRole('button', { name: '취소' }));
  }
  const next = await waitFor(() => {
    const action = screen.getByRole(nextRole, { name: '권한 요청' });
    expect(action).not.toHaveAttribute('aria-disabled', 'true');
    return action;
  });
  if (nextRole === 'link') expect(next).toHaveAttribute('href', '/permission-requests/new');
  else {
    fireEvent.click(next);
    expect(screen.getByRole('dialog')).toBeVisible();
  }
});

it('keeps Triage denial focus through a same-queue window refresh', async () => {
  const queue = deferredResponse();
  const check = deferredResponse();
  const list = vi.fn((): Response | Promise<Response> => queueDenial(SYSTEM))
    .mockImplementationOnce(() => queueDenial(SYSTEM)).mockImplementationOnce(() => queueDenial(SYSTEM))
    .mockImplementationOnce(() => queue.response);
  let refreshing = false;
  const { client } = mount('triage', { existing: false, list, check: params => {
    if (params.get('capability') === 'voc.triage') return approvedCheck();
    return refreshing ? check.response : Response.json(requestableCheck());
  } });
  (await screen.findByRole('button', { name: '권한 요청' })).focus();
  refreshing = true;
  await client.invalidateQueries({ queryKey: ['permission-check', 'voc.read'], refetchType: 'none' });
  await act(async () => returnToWindow());
  await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
  await act(async () => queue.resolve(queueDenial(SYSTEM)));
  await waitFor(() => expect(list).toHaveBeenCalledTimes(4));
  await screen.findByText('확인 중');
  expect(document.activeElement).not.toBe(document.body);
});

it('uses the hinted triage check for a queue 403 even with a cached approval', async () => {
  const invalidated = deferredResponse();
  const focused = deferredResponse();
  const focusedQueue = deferredResponse();
  const approval = () => Response.json({ state: 'approved', decision: { allow: true } });
  const hint = { permission: 'voc.triage', managed_system_id: SYSTEM };
  const forbidden = () => Response.json({ code: 'permission.denied', message: 'denied',
    requestable_permission: { ...hint, reason_required: true } }, { status: 403 });
  const check = vi.fn((): Response | Promise<Response> => approval())
    .mockImplementationOnce(approval)
    .mockImplementationOnce(() => invalidated.response)
    .mockImplementationOnce(() => focused.response);
  const list = vi.fn((): Response | Promise<Response> => forbidden())
    .mockImplementationOnce(forbidden).mockImplementationOnce(forbidden)
    .mockImplementationOnce(() => focusedQueue.response);
  const queryKey = ['permission-check', hint.permission, SYSTEM];
  const client = new QueryClient();
  client.setQueryData(queryKey, { state: 'approved', decision: { allow: true } });
  mount('triage', { existing: false, hint, check, list, client });
  await screen.findByRole('heading', { name: '분류', level: 2 });
  expect.soft(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();

  await act(async () => {
    void client.invalidateQueries({ queryKey, predicate: query => query.queryKey.length > queryKey.length });
  });
  await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
  expect.soft(screen.queryByText('확인 중')).toBeInTheDocument();
  expect.soft(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();
  await act(async () => invalidated.resolve(approval()));
  await waitFor(() => expect(client.isFetching({ queryKey })).toBe(0));

  await act(async () => returnToWindow());
  await waitFor(() => expect(list).toHaveBeenCalledTimes(3));
  await act(async () => focusedQueue.resolve(forbidden()));
  await screen.findByRole('heading', { name: '분류', level: 2 });
  expect.soft(screen.queryByText('확인 중')).toBeInTheDocument();
  expect.soft(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();

  await waitFor(() => expect(check).toHaveBeenCalledTimes(3));
  await act(async () => focused.resolve(Response.json({ code: 'test.failure', message: 'failed' }, { status: 500 })));
  await waitFor(() => expect(client.isFetching({ queryKey })).toBe(0));
  expect.soft(screen.queryByText('권한을 요청할 수 있는지 확인하지 못했습니다.')).toBeInTheDocument();
  expect.soft(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();
  const retry = screen.queryByRole('button', { name: '다시 시도' });
  expect.soft(retry).toBeInTheDocument();
  if (retry) {
    fireEvent.click(retry);
    await waitFor(() => expect(check).toHaveBeenCalledTimes(4));
  }
});

it.each([201, 409])('keeps the Inbox %i result when a focus refetch repeats the denial', async status => {
  const queueRefresh = deferredResponse();
  const deniedCheck = deferredResponse();
  const forbidden = () => Response.json({ code: 'permission.denied', message: 'denied',
    requestable_permission: { permission: 'voc.read', managed_system_id: SYSTEM, reason_required: true } }, { status: 403 });
  const requestable = () => Response.json({ state: 'request_access', decision: { allow: false,
    reason: 'no_grant', requestable: [{ managed_system_id: SYSTEM }] } });
  const list = vi.fn((): Response | Promise<Response> => forbidden())
    .mockImplementationOnce(forbidden).mockImplementationOnce(() => queueRefresh.response);
  const check = vi.fn((): Response | Promise<Response> => deniedCheck.response)
    .mockImplementationOnce(requestable).mockImplementationOnce(requestable);
  const { calls, client } = mount('inbox', { existing: false, check, list, conflict: status === 409 });
  fireEvent.click(await screen.findByRole('button', { name: '권한 요청' }));
  fireEvent.change(screen.getByTestId('permission-request-reason'), { target: { value: REASON } });
  const submit = screen.getByRole('button', { name: '요청 제출' });
  submit.focus();
  fireEvent.submit(screen.getByTestId('permission-request-form'));
  const result = status === 201 ? 'permission-request-id' : 'permission-request-conflict';
  const action = status === 201 ? '다른 권한 요청' : '요청 제출';
  await screen.findByTestId(result);
  await waitFor(() => expect(screen.getByRole('button', { name: action })).not.toHaveAttribute('aria-disabled'));
  const focused = document.activeElement;
  expect(focused).not.toBe(document.body);

  await act(async () => returnToWindow());
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect.soft(screen.queryByTestId(result)).toBeVisible();
  await act(async () => queueRefresh.resolve(forbidden()));
  await waitFor(() => expect(check).toHaveBeenCalledTimes(3));
  await act(async () => deniedCheck.resolve(Response.json({
    state: 'blocked_non_requestable', decision: { allow: false, reason: 'explicit_deny' },
  })));
  await waitFor(() => expect(client.isFetching({ queryKey: ['permission-check'] })).toBe(0));
  expect.soft(screen.queryByTestId(result)).toBeVisible();
  expect.soft(document.activeElement).toBe(focused);
  const held = screen.queryByRole('button', { name: action });
  expect.soft(held).toHaveAttribute('aria-disabled', 'true');
  if (held) fireEvent.click(held);
  const form = screen.queryByTestId('permission-request-form');
  if (form) fireEvent.submit(form);
  expect(calls.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
});

it('keeps the Inbox receipt and holds another request when a requestable check says pending_request', async () => {
  const { check } = holdRecheck();
  check.mockImplementationOnce(() => Response.json({ state: 'pending_request', decision: {
    allow: false, reason: 'no_grant', requestable: [{ managed_system_id: SYSTEM }],
  } }));
  const { calls, client } = mount('inbox', { existing: false, check, reflectSubmittedRequest: false });
  fireEvent.click(await screen.findByRole('button', { name: '권한 요청' }));
  fireEvent.change(screen.getByTestId('permission-request-reason'), { target: { value: REASON } });
  fireEvent.submit(screen.getByTestId('permission-request-form'));
  await screen.findByTestId('permission-request-id');
  await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(client.isMutating()).toBe(0));
  const dialog = within(screen.getByRole('dialog'));
  const another = dialog.getByRole('button', { name: '다른 권한 요청' });
  expect.soft(another).toHaveAttribute('aria-disabled', 'true');
  expect.soft(dialog.queryByText('보낸 권한 요청을 검토하고 있습니다.')).toBeVisible();
  fireEvent.click(another);
  const form = dialog.queryByTestId('permission-request-form');
  if (form) {
    fireEvent.change(dialog.getByTestId('permission-request-reason'), { target: { value: REASON } });
    await act(async () => { fireEvent.submit(form); });
  }
  expect.soft(dialog.queryByTestId('permission-request-id')).toBeVisible();
  expect(calls.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  const confirm = dialog.queryByRole('button', { name: '확인' });
  if (confirm) {
    fireEvent.click(confirm);
    expect(await screen.findByRole('link', { name: '내 권한 요청 보기' })).toBeVisible();
  }
});

it.each([['triage', 'voc.triage', '분류'], ['inbox', 'voc.read', 'VOC 처리함']] as const)(
  'holds the %s denial request while rechecking the same System',
  async (view, capability, title) => {
    const { check, settle } = holdRecheck();
    const { client } = mount(view, { existing: false, check });
    const request = await screen.findByRole('button', { name: '권한 요청' });
    request.focus();
    await act(async () => { void client.invalidateQueries({ queryKey: ['permission-check', capability, SYSTEM] }); });
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();
    expect(screen.getByText('확인 중')).toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    await act(async () => settle());
    await waitFor(() => expect(screen.getByRole('heading', { name: title }).closest('[data-state]'))
      .toHaveAttribute('data-state', 'blocked_not_requestable'));
    expect(screen.queryByText('확인 중')).toBeNull();
    expect(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  },
);

it.each([201, 409])('keeps the Inbox %i result and blocks another submission during and after the recheck', async status => {
  const { check, settle } = holdRecheck();
  const { calls, client } = mount('inbox', { existing: false, check, conflict: status === 409 });
  fireEvent.click(await screen.findByRole('button', { name: '권한 요청' }));
  const form = screen.getByTestId('permission-request-form');
  fireEvent.change(screen.getByTestId('permission-request-reason'), { target: { value: REASON } });
  const submit = screen.getByRole('button', { name: '요청 제출' });
  submit.focus();
  fireEvent.submit(form);
  const result = status === 201 ? 'permission-request-id' : 'permission-request-conflict';
  const action = status === 201 ? '다른 권한 요청' : '요청 제출';
  await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
  expect(await screen.findByTestId(result)).toBeVisible();
  expect(screen.getByRole('button', { name: action })).toHaveAttribute('aria-disabled', 'true');
  expect(document.activeElement).not.toBe(document.body);
  await act(async () => settle());
  await screen.findByText('현재 이 권한을 요청할 수 없습니다.');
  expect(screen.getByTestId(result)).toBeVisible();
  const held = screen.getByRole('button', { name: action });
  expect(held).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(held);
  if (status === 409) fireEvent.submit(form);
  expect(calls.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  expect(screen.getByTestId(result)).toBeVisible();
  check.mockReturnValueOnce(Response.json({
    state: 'request_access', decision: { allow: false, requestable: [{ managed_system_id: SYSTEM }] },
  }));
  await act(async () => client.invalidateQueries({ queryKey: ['permission-check', 'voc.read', SYSTEM] }));
  await waitFor(() => expect(held).not.toHaveAttribute('aria-disabled'));
});

it.each([
  ['inbox', 'VOC 처리함', 'finding.read', SYSTEM],
  ['triage', '분류', 'voc.read', 'all'],
  ['triage', '분류', 'voc.read', 'not-a-uuid'],
  ['triage', '분류', 'voc.triage', null],
] as const)('%s suppresses the queue request for %s (%s, %s)', async (view, title, permission, managed_system_id) => {
  mount(view, { existing: false, hint: { permission, managed_system_id } });
  const heading = await screen.findByRole('heading', { name: title, level: view === 'inbox' ? 3 : 2 });
  expect(heading.closest('[data-state]')).toHaveAttribute('data-state', 'blocked_not_requestable');
  expect(screen.queryByRole('button', { name: '권한 요청' })).toBeNull();
});

describe.each([['inbox', 'VOC 처리함', 3], ['triage', '분류', 2]] as const)('%s queue denial', (view, title, level) => {
  it('shows an existing exact-target request in the card after mounting', async () => {
    mount(view, { existing: true });
    const status = await screen.findByRole('link', { name: '내 권한 요청 보기' });
    const card = status.closest<HTMLElement>('[data-request-status]');
    assert(card);
    expect(within(card).getByRole('heading', { name: title, level })).toBeInTheDocument();
    expect(within(card).getByRole('status')).toHaveTextContent('보낸 권한 요청을 검토하고 있습니다.');
    expect(within(card).queryByRole('button', { name: '권한 요청' })).toBeNull();
  });

  it('focuses the status link on submit and restores Request after withdrawal with the gate still mounted', async () => {
    mount(view, { existing: false, home: '/' });
    const request = await screen.findByRole('button', { name: '권한 요청' });
    const card = request.closest<HTMLElement>('[data-request-status]');
    assert(card);
    expect(within(card).getByRole('status')).toHaveTextContent('이 항목에 접근하려면 권한 요청이 필요합니다.');
    request.focus();
    fireEvent.click(request);
    fireEvent.change(screen.getByTestId('permission-request-reason'), { target: { value: REASON } });
    fireEvent.submit(screen.getByTestId('permission-request-form'));
    const confirm = await screen.findByRole('button', { name: '확인' });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Escape' });
    const status = await within(card).findByRole('link', { name: '내 권한 요청 보기' });
    await waitFor(() => expect(status).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: 'Open request details' }));
    fireEvent.click(await screen.findByRole('button', { name: '요청 철회' }));
    const confirmation = screen.getByTestId('owner-withdraw-confirmation');
    fireEvent.click(within(confirmation).getByRole('button', { name: '요청 철회' }));
    expect(await within(card).findByRole('button', { name: '권한 요청' })).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: '내 권한 요청 보기' })).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: '권한 요청' }));
    expect(screen.getByTestId('permission-request-form')).toBeInTheDocument();
  });
});

it.each([{ home: '/' }, {}] as Array<{ home?: string }>)('focuses Home or the heading if the status link is unavailable (%j)', async options => {
  mount('inbox', { existing: false, canOpenStatus: false, ...options });
  const request = await screen.findByRole('button', { name: '권한 요청' });
  const card = request.closest<HTMLElement>('[data-request-status]');
  assert(card);
  fireEvent.click(request);
  fireEvent.change(screen.getByTestId('permission-request-reason'), { target: { value: REASON } });
  fireEvent.submit(screen.getByTestId('permission-request-form'));
  fireEvent.click(await screen.findByRole('button', { name: '확인' }));
  const target = options.home
    ? within(card).getByRole('link', { name: '홈으로' })
    : within(card).getByRole('heading', { name: 'VOC 처리함' });
  await waitFor(() => expect(target).toHaveFocus());
});
