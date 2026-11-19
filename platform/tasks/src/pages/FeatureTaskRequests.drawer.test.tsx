import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { LAZY_MOUNT_WAIT, resetFeatureSessionForTests, settleFetch } from '@ap/feature-bridge/testing';
import { memoryStorage, useToastsForTest } from '@ap/kernel/testing';
import { mountAt } from '../test-support';

const REQUEST = '10000000-0000-4000-8000-000000000001';
const MISSING = '10000000-0000-4000-8000-000000000099';
const ACTOR = '20000000-0000-4000-8000-000000000001';
const SYSTEM = '30000000-0000-4000-8000-000000000001';
const TITLE = '설비 이력 조회 속도 개선';
const request = {
  id: REQUEST, display_id: 'REQ-2536', workspace_id: SYSTEM, primary_managed_system_id: SYSTEM,
  source_type: 'finding', source_id: REQUEST, evidence_summary: '조회 이력', requested_outcome: TITLE,
  requester_actor_id: ACTOR, status: 'pending_review', assigned_reviewer_actor_id: null,
  assigned_reviewer_team_id: null, reviewer_actor_id: null, decision_reason: null, decided_at: null,
  created_at: '2026-10-05T00:00:00.000Z', updated_at: '2026-10-05T00:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function ToastLog() {
  const toasts = useToastsForTest();
  return <div role="log">{toasts.map(toast => <p key={toast.id}>{toast.text}</p>)}</div>;
}

const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
beforeAll(async () => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  await import('./FeatureTaskRequests');
}, 60_000);
afterAll(() => {
  if (scrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  resetFeatureSessionForTests();
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input, 'http://test');
    switch (url.pathname) {
      case '/api/features/me':
        return Response.json({ actor: { id: ACTOR, external_id: ACTOR, email: 'admin@example.test', display_name: 'Admin', role_level: 'admin' }, workspace_id: SYSTEM });
      case '/api/features/task-requests':
        return Response.json({ items: url.searchParams.has('reviewer') ? [] : [request], page: { has_more: false, total: 1 } });
      case `/api/features/task-requests/${REQUEST}`:
        return Response.json(request);
      case `/api/features/task-requests/${MISSING}`:
        return Response.json({ code: 'resource.not_found', message: 'Missing' }, { status: 404 });
      case '/api/features/actors/resolve':
        return Response.json({ actors: [], teams: [] });
      default:
        return Response.json({ items: [], total: 0 });
    }
  }));
});

afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

it('keeps decisions in the detail and takes the linked request title to the full page', async () => {
  mountAt(`/flow/task-requests?v=1&focus=${REQUEST}`);
  const drawer = await screen.findByRole('dialog', { name: TITLE }, LAZY_MOUNT_WAIT);
  expect(within(drawer).getByText('REQ-2536')).toBeTruthy();
  const heading = within(drawer).getByRole('link', { name: TITLE });
  expect(within(drawer).getByRole('button', { name: '링크 복사' })).toBeTruthy();
  expect(within(drawer).getByRole('heading', { name: '검토 결정' })).toBeTruthy();
  fireEvent.click(heading);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(await screen.findByRole('heading', { name: `REQ-2536 ${TITLE}` })).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: '목록으로' }));
  expect(await screen.findByRole('dialog', { name: TITLE })).toBeTruthy();
});

it('closes an open request excluded by the applied reviewer filter and restores queue focus', async () => {
  mountAt(`/flow/task-requests?v=1&focus=${REQUEST}`, { extra: <ToastLog /> });
  await screen.findByRole('dialog', undefined, LAZY_MOUNT_WAIT);
  fireEvent.click(await screen.findByRole('combobox', { name: '검토자 필터' }));
  fireEvent.click(await screen.findByRole('option', { name: '내 검토 요청' }));
  await waitFor(() => expect(new URLSearchParams(window.location.search).has('focus')).toBe(false));
  expect(new URLSearchParams(window.location.search).get('reviewer')).toBe('me');
  expect(screen.queryByRole('dialog')).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Task 요청' })));
  expect(screen.getByRole('log').textContent).toContain('열린 항목이 목록에서 빠져 닫았습니다');
});

it('keeps a missing ID until the user clears it and preserves the filters', async () => {
  mountAt(`/flow/task-requests?v=1&reviewer=me&focus=${MISSING}`);
  const drawer = await screen.findByRole('dialog', { name: MISSING }, LAZY_MOUNT_WAIT);
  expect(within(drawer).getByRole('heading', { name: MISSING }).className).toContain('t-mono');
  expect(within(drawer).getByText('이 항목을 찾을 수 없습니다 — 삭제되었거나 볼 권한이 없습니다')).toBeTruthy();
  expect(within(drawer).getAllByRole('button').map(button => button.textContent || button.getAttribute('aria-label'))).toEqual(['상세 닫기', '선택 해제']);
  expect(new URLSearchParams(window.location.search).get('focus')).toBe(MISSING);
  fireEvent.click(within(drawer).getByRole('button', { name: '선택 해제' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(new URLSearchParams(window.location.search).has('focus')).toBe(false);
  expect(new URLSearchParams(window.location.search).get('reviewer')).toBe('me');
});

it.each([404, 403])('recovers an uppercase Task Request link after a %s denial', async status => {
  const id = 'ab000000-0000-4000-8000-000000000001';
  const focus = id.toUpperCase();
  const detail = deferred<Response>();
  const detailRead = vi.fn(() => detail.promise).mockResolvedValueOnce(
    Response.json({ code: status === 404 ? 'resource.not_found' : 'permission.denied', message: 'Unavailable' }, { status }),
  );
  const fetch = vi.mocked(globalThis.fetch);
  const original = fetch.getMockImplementation()!;
  fetch.mockImplementation((input, init) => String(input).toLowerCase().endsWith(`/task-requests/${id}`)
    ? detailRead() : original(input, init));

  mountAt(`/flow/task-requests?v=1&focus=${focus}`);
  const recovery = await screen.findByRole('dialog', { name: focus }, LAZY_MOUNT_WAIT);
  expect(within(recovery).getByRole('button', { name: '선택 해제' })).toBeTruthy();
  window.dispatchEvent(new Event('visibilitychange'));
  await waitFor(() => expect(detailRead).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('dialog', { name: focus })).toBe(recovery);

  const title = '접근 복구 후 설비 이력 요청';
  await act(async () => detail.resolve(Response.json({ ...request, id, requested_outcome: title })));
  const drawer = await screen.findByRole('dialog', { name: title });
  expect(within(drawer).getByRole('link', { name: title })).toBeTruthy();
  expect(screen.queryByRole('dialog', { name: focus })).toBeNull();
  expect(new URLSearchParams(window.location.search).get('focus')).toBe(focus);
});

it('lets the user retry a failed read of a full-page request outside the queue', async () => {
  const fetch = vi.mocked(globalThis.fetch);
  const original = fetch.getMockImplementation()!;
  let failOnce = true;
  fetch.mockImplementation(async (input, init) => {
    if (failOnce && String(input).endsWith(`/task-requests/${REQUEST}`)) {
      failOnce = false;
      return Response.json({ code: 'internal_error', message: 'Unavailable' }, { status: 500 });
    }
    return original(input, init);
  });
  mountAt(`/flow/task-requests?v=1&reviewer=me&focus=${REQUEST}&detailPage=1`);
  fireEvent.click(await screen.findByRole('button', { name: '다시 시도' }, LAZY_MOUNT_WAIT));
  expect(await screen.findByRole('heading', { name: `REQ-2536 ${TITLE}` })).toBeTruthy();
});

it('opens the freshly authorized full-page article when the queue read fails', async () => {
  const fetch = vi.mocked(globalThis.fetch);
  const original = fetch.getMockImplementation()!;
  fetch.mockImplementation(async (input, init) => {
    if (new URL(String(input), 'http://test').pathname === '/api/features/task-requests') {
      return Response.json({ code: 'internal_error', message: 'Unavailable' }, { status: 500 });
    }
    return original(input, init);
  });
  mountAt(`/flow/task-requests?v=1&focus=${REQUEST}&detailPage=1`);
  expect(await screen.findByRole('heading', { name: `REQ-2536 ${TITLE}` }, LAZY_MOUNT_WAIT)).toBeTruthy();
  expect(screen.getByTestId('task-request-outside-list')).toBeTruthy();
  expect(screen.queryByRole('button', { name: '승인' })).toBeNull();
});

it('rechecks record access on full-page entry even while the queue row is cached', async () => {
  const fetch = vi.mocked(globalThis.fetch);
  const original = fetch.getMockImplementation()!;
  const detail = deferred<Response>();
  fetch.mockImplementation((input, init) => String(input).endsWith(`/task-requests/${REQUEST}`)
    ? detail.promise : original(input, init));
  mountAt(`/flow/task-requests?v=1&focus=${REQUEST}`);
  const link = await screen.findByRole('link', { name: TITLE }, LAZY_MOUNT_WAIT);
  fireEvent.click(link);
  expect(screen.queryByRole('heading', { name: `REQ-2536 ${TITLE}` })).toBeNull();
  expect(screen.queryByText('조회 이력')).toBeNull();
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).endsWith(`/task-requests/${REQUEST}`))).toBe(true));
  await act(async () => detail.resolve(Response.json({ code: 'resource.not_found', message: 'Missing' }, { status: 404 })));
  const recovery = await screen.findByRole('dialog', { name: REQUEST });
  expect(within(recovery).getByRole('button', { name: '선택 해제' })).toBeTruthy();
  expect(screen.queryByText(TITLE)).toBeNull();
  expect(screen.queryByText('조회 이력')).toBeNull();
  expect(document.title).not.toContain(TITLE);
});

it.each([false, true])('keeps Task mounted while filtering, then closes only for settled absence (included=%s)', async included => {
  const fetch = vi.mocked(globalThis.fetch);
  const original = fetch.getMockImplementation()!;
  const list = deferred<Response>();
  const detail = deferred<Response>();
  const filteredRead = vi.fn(() => list.promise);
  fetch.mockImplementation((input, init) => {
    const url = new URL(String(input), 'http://test');
    if (url.pathname.endsWith(`/task-requests/${REQUEST}`)) return detail.promise;
    if (url.pathname.endsWith('/task-requests') && url.searchParams.has('reviewer') &&
      url.searchParams.get('status') === 'pending_review') return filteredRead();
    return original(input, init);
  });
  mountAt(`/flow/task-requests?v=1&focus=${REQUEST}`, { extra: <ToastLog /> });
  const drawer = await screen.findByRole('dialog', { name: TITLE }, LAZY_MOUNT_WAIT);
  fireEvent.click(await screen.findByRole('combobox', { name: '검토자 필터' }));
  fireEvent.click(await screen.findByRole('option', { name: '내 검토 요청' }));
  await waitFor(() => expect(filteredRead).toHaveBeenCalled());
  expect(screen.getByRole('dialog', { name: TITLE })).toBe(drawer);
  await act(async () => list.resolve(Response.json({ items: included ? [request] : [], page: { has_more: false } })));
  if (included) {
    await settleFetch(fetch, 'reviewer=me');
    expect(screen.getByRole('dialog', { name: TITLE })).toBe(drawer);
    expect(new URLSearchParams(window.location.search).get('focus')).toBe(REQUEST);
    return;
  }
  await waitFor(() => expect(new URLSearchParams(window.location.search).has('focus')).toBe(false));
  await act(async () => detail.resolve(Response.json({ message: 'Unavailable' }, { status: 500 })));
  expect(new URLSearchParams(window.location.search).get('reviewer')).toBe('me');
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Task 요청' })));
  expect(within(screen.getByRole('log')).getAllByText('열린 항목이 목록에서 빠져 닫았습니다')).toHaveLength(1);
});

it.each([
  ['matching', null, false],
  ['excluded', null, true],
  ['404', 404, false],
  ['403', 403, false],
  ['404 then excluded', 404, true],
  ['403 then excluded', 403, true],
] as const)('keeps the drawer on a partial queue and retries its detail read (%s)', async (_outcome, denialStatus, excluded) => {
  const fetch = vi.mocked(globalThis.fetch);
  const original = fetch.getMockImplementation()!;
  const firstDetail = deferred<Response>();
  const retryDetail = deferred<Response>();
  const postDenialDetail = deferred<Response>();
  const authorizedTitle = '갱신된 설비 이력 요청';
  const authorizedEvidence = '갱신된 조회 이력';
  const detailRead = vi.fn(async () => Response.json({
    ...request, assigned_reviewer_actor_id: excluded ? null : ACTOR, requested_outcome: authorizedTitle, evidence_summary: authorizedEvidence,
  }))
    .mockImplementationOnce(() => firstDetail.promise)
    .mockImplementationOnce(() => retryDetail.promise)
    .mockImplementationOnce(() => postDenialDetail.promise);
  const other = { ...request, id: MISSING, requested_outcome: '다른 검토 요청', assigned_reviewer_actor_id: ACTOR };
  fetch.mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://test');
    if (url.pathname.endsWith(`/task-requests/${REQUEST}`)) return detailRead();
    if (url.pathname.endsWith('/task-requests') && url.searchParams.has('reviewer')) {
      return Response.json({ items: [other], page: { has_more: true, cursor: 'next-page' } });
    }
    return original(input, init);
  });
  mountAt(`/flow/task-requests?v=1&focus=${REQUEST}`, { extra: <ToastLog /> });
  const drawer = await screen.findByRole('dialog', { name: TITLE }, LAZY_MOUNT_WAIT);
  fireEvent.click(await screen.findByRole('combobox', { name: '검토자 필터' }));
  fireEvent.click(await screen.findByRole('option', { name: '내 검토 요청' }));
  await waitFor(() => expect(detailRead).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('dialog', { name: TITLE })).toBe(drawer);
  expect(within(drawer).queryByRole('button', { name: '승인' })).toBeNull();
  await act(async () => firstDetail.resolve(Response.json({ message: 'Unavailable' }, { status: 500 })));
  fireEvent.click(await within(drawer).findByRole('button', { name: '다시 시도' }));
  await waitFor(() => expect(detailRead).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('dialog', { name: TITLE })).toBe(drawer);
  expect(new URLSearchParams(window.location.search).get('focus')).toBe(REQUEST);
  await act(async () => retryDetail.resolve(denialStatus !== null
    ? Response.json({ code: denialStatus === 404 ? 'not_found.record' : 'permission.denied', message: 'Unavailable' }, { status: denialStatus })
    : Response.json({ ...request, assigned_reviewer_actor_id: excluded ? null : ACTOR })));
  expect(new URLSearchParams(window.location.search).get('reviewer')).toBe('me');
  const log = within(screen.getByRole('log'));
  const closed = '열린 항목이 목록에서 빠져 닫았습니다';
  const expectFilteredClose = async () => {
    await waitFor(() => expect(new URLSearchParams(window.location.search).has('focus')).toBe(false));
    expect(new URLSearchParams(window.location.search).get('reviewer')).toBe('me');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Task 요청' })));
    expect(log.getAllByText(closed)).toHaveLength(1);
  };
  if (denialStatus === null && excluded) {
    await expectFilteredClose();
    return;
  }
  await settleFetch(fetch, `/task-requests/${REQUEST}`);
  expect(new URLSearchParams(window.location.search).get('focus')).toBe(REQUEST);
  expect(log.queryByText(closed)).toBeNull();
  if (denialStatus !== null) {
    const expectIdOnly = () => {
      const recovery = within(screen.getByRole('dialog', { name: REQUEST }));
      expect(recovery.getAllByRole('button').map(button => button.textContent || button.getAttribute('aria-label'))).toEqual(['상세 닫기', '선택 해제']);
      expect(recovery.queryByRole('link')).toBeNull();
      expect(recovery.queryByText(TITLE)).toBeNull();
      expect(screen.queryByText('조회 이력')).toBeNull();
      expect(document.title).not.toContain(TITLE);
      expect(new URLSearchParams(window.location.search).get('focus')).toBe(REQUEST);
    };
    expectIdOnly();
    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'));
      await waitFor(() => expect(detailRead).toHaveBeenCalledTimes(3));
    });
    expectIdOnly();
    await act(async () => postDenialDetail.resolve(Response.json({ message: 'Unavailable' }, { status: 500 })));
    await settleFetch(fetch, `/task-requests/${REQUEST}`);
    expectIdOnly();
    if (excluded) {
      window.dispatchEvent(new Event('visibilitychange'));
      await waitFor(() => expect(detailRead).toHaveBeenCalledTimes(4));
      await expectFilteredClose();
      return;
    }
    fireEvent.click(screen.getByRole('combobox', { name: '검토자 필터' }));
    fireEvent.click(await screen.findByRole('option', { name: '모든 검토자' }));
    expect(await screen.findByText(TITLE)).toBeTruthy(); // The original queue row is still cached.
    expectIdOnly();
    window.dispatchEvent(new Event('visibilitychange'));
    const recovered = await screen.findByRole('dialog', { name: authorizedTitle });
    expect(within(recovered).getByRole('link', { name: authorizedTitle })).toBeTruthy();
    expect(within(recovered).getByText(authorizedEvidence)).toBeTruthy();
    return;
  }
  expect(screen.getByRole('dialog', { name: TITLE })).toBe(drawer);
  expect(within(drawer).queryByRole('button', { name: '다시 시도' })).toBeNull();
  expect(within(drawer).queryByRole('button', { name: '승인' })).toBeNull();
});

it('keeps the latest authorized queue or detail projection after a detached denial', async () => {
  const fetch = vi.mocked(globalThis.fetch);
  const original = fetch.getMockImplementation()!;
  const recovery = deferred<Response>();
  const olderPage = deferred<Response>();
  const readOlderPage = vi.fn(() => olderPage.promise);
  const sourceLink = { type: 'voc', id: MISSING, link_id: SYSTEM, relation_type: 'requested_task' };
  const sourceTitle = '권한이 있는 검토자만 볼 수 있는 VOC 제목';
  const sourceDisplayId = 'VOC-2536';
  const originalRow = { ...request, source_type: 'voc', source_id: MISSING, assigned_reviewer_actor_id: ACTOR,
    source: { ...sourceLink, title: sourceTitle, display_id: sourceDisplayId } };
  const recoveredRow = { ...originalRow, requested_outcome: '접근 복구 후 요청' };
  const redactedRow = { ...originalRow, requested_outcome: '출처가 가려진 최신 요청', source: sourceLink };
  const latestDetail = { ...redactedRow, requested_outcome: '상세에서 갱신된 요청' };
  const detailRead = vi.fn(() => recovery.promise).mockResolvedValueOnce(
    Response.json({ code: 'permission.denied', message: 'Unavailable' }, { status: 403 }),
  );
  fetch.mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://test');
    if (url.pathname.endsWith(`/task-requests/${REQUEST}`)) return detailRead();
    if (url.pathname.endsWith('/task-requests') && url.searchParams.get('limit') === '50') {
      if (url.searchParams.has('cursor')) return readOlderPage();
      const allStatuses = !url.searchParams.has('status');
      const items = allStatuses ? [redactedRow] : url.searchParams.has('reviewer') ? [] : [originalRow];
      return Response.json({ items, page: { has_more: true, cursor: 'next-page' } });
    }
    return original(input, init);
  });
  mountAt(`/flow/task-requests?v=1&focus=${REQUEST}`);
  await screen.findByRole('dialog', { name: TITLE }, LAZY_MOUNT_WAIT);
  fireEvent.click(await screen.findByRole('combobox', { name: '검토자 필터' }));
  fireEvent.click(await screen.findByRole('option', { name: '내 검토 요청' }));
  await screen.findByRole('dialog', { name: REQUEST });
  window.dispatchEvent(new Event('visibilitychange'));
  await waitFor(() => expect(detailRead).toHaveBeenCalledTimes(2));
  await act(async () => recovery.resolve(Response.json(recoveredRow)));
  const recovered = within(await screen.findByRole('dialog', { name: recoveredRow.requested_outcome }));
  expect(recovered.getByText(sourceTitle)).toBeTruthy();
  expect(recovered.getByText(sourceDisplayId)).toBeTruthy();

  fireEvent.click(screen.getByRole('combobox', { name: '검토자 필터' }));
  fireEvent.click(await screen.findByRole('option', { name: '모든 검토자' }));
  expect(await screen.findByRole('dialog', { name: recoveredRow.requested_outcome })).toBeTruthy();
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^전체/ }));
  await settleFetch(fetch, '/task-requests?limit=50');
  const expectRedactedProjection = (title: string) => {
    expect(screen.queryByText(sourceTitle)).toBeNull();
    expect(screen.queryByText(sourceDisplayId)).toBeNull();
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: title })).toBeTruthy();
  };
  expectRedactedProjection(redactedRow.requested_outcome);

  fireEvent.mouseDown(screen.getByRole('tab', { name: /^검토 중/ }));
  expect(await screen.findByText(TITLE)).toBeTruthy(); // The older unfiltered row is still cached.
  expectRedactedProjection(redactedRow.requested_outcome);
  expect(detailRead).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByRole('combobox', { name: '검토자 필터' }));
  fireEvent.click(await screen.findByRole('option', { name: '내 검토 요청' }));
  await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
  fireEvent.click(await screen.findByRole('button', { name: '더 불러오기' }));
  await waitFor(() => expect(readOlderPage).toHaveBeenCalledTimes(1));
  detailRead.mockResolvedValueOnce(Response.json(latestDetail));
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31_000);
  try {
    window.dispatchEvent(new Event('visibilitychange'));
    await waitFor(() => expect(detailRead).toHaveBeenCalledTimes(3));
    await screen.findByRole('dialog', { name: latestDetail.requested_outcome });
    expectRedactedProjection(latestDetail.requested_outcome);
    await act(async () => olderPage.resolve(Response.json({ items: [originalRow], page: { has_more: false } })));
    await settleFetch(fetch, 'cursor=next-page');
    expect(await screen.findByText(TITLE)).toBeTruthy();
    expectRedactedProjection(latestDetail.requested_outcome);
  } finally {
    clock.mockRestore();
  }
  fireEvent.click(screen.getByRole('combobox', { name: '검토자 필터' }));
  fireEvent.click(await screen.findByRole('option', { name: '모든 검토자' }));
  expect(await screen.findByText(TITLE)).toBeTruthy();
  fireEvent.mouseDown(screen.getByRole('tab', { name: /^전체/ }));
  expect(await screen.findByText(redactedRow.requested_outcome)).toBeTruthy();
  expectRedactedProjection(latestDetail.requested_outcome);
  expect(detailRead).toHaveBeenCalledTimes(3);
});

it('refreshes the full-page record and shows the converted outcome at the same URL', async () => {
  const fetch = vi.mocked(globalThis.fetch);
  const original = fetch.getMockImplementation()!;
  const approved = { ...request, status: 'approved', source_type: 'voc' };
  const converted = { ...approved, status: 'converted' };
  const task = {
    id: MISSING, workspace_id: SYSTEM, display_id: 'TASK-2536', primary_managed_system_id: SYSTEM,
    title: TITLE, status: 'backlog', priority: 'medium', assignee_actor_id: null, assignee_team_id: null,
    due_date: null, milestone_id: null, analytics_area_id: null, source_task_request_id: REQUEST,
    created_by: ACTOR, created_at: request.created_at, updated_at: request.updated_at,
  };
  let didConvert = false;
  const read = vi.fn(() => Response.json(didConvert ? converted : approved));
  const convert = vi.fn<(method: string | undefined) => Response>(() => {
    didConvert = true;
    return Response.json(task);
  });
  fetch.mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://test');
    if (url.pathname.endsWith(`/task-requests/${REQUEST}/convert`)) return convert(init?.method);
    if (url.pathname.endsWith(`/task-requests/${REQUEST}`)) return read();
    if (url.pathname.endsWith('/task-requests')) {
      const status = url.searchParams.get('status');
      const item = didConvert ? converted : approved;
      return Response.json({ items: status === null || status === item.status ? [item] : [], page: { has_more: false } });
    }
    return original(input, init);
  });
  mountAt(`/flow/task-requests?v=1&focus=${REQUEST}&detailPage=1`);
  const startUrl = window.location.href;
  const article = await screen.findByRole('article', undefined, LAZY_MOUNT_WAIT);
  fireEvent.click(await within(article).findByRole('button', { name: 'Task로 전환' }));
  const submit = await screen.findByTestId<HTMLButtonElement>('task-request-convert-submit');
  await waitFor(() => expect(submit.disabled).toBe(false));
  fireEvent.click(submit);
  await waitFor(() => expect(convert).toHaveBeenCalledWith('POST'));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  const summary = await within(article).findByRole('heading', { name: '결정 요약' });
  expect(summary.closest('section')?.textContent).toContain('전환됨');
  expect(screen.getByRole('article')).toBe(article);
  expect(window.location.href).toBe(startUrl);
});

it.each(['bogus', ''])('rejects malformed detail mode before making Task reads (%s)', async detailPage => {
  mountAt(`/flow/task-requests?v=1&focus=${REQUEST}&detailPage=${detailPage}`);
  expect(await screen.findByText('주소의 detailPage 값이 올바르지 않습니다', undefined, LAZY_MOUNT_WAIT)).toBeTruthy();
  expect(vi.mocked(globalThis.fetch).mock.calls.filter(([url]) => String(url).includes('/task-requests'))).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: '값 지우기' }));
  expect(await screen.findByRole('dialog', { name: TITLE }, LAZY_MOUNT_WAIT)).toBeTruthy();
});

it('keeps the retained decision header links bound to the visible request during handoff', async () => {
  const next = { ...request, id: MISSING, display_id: 'REQ-2537', requested_outcome: '다른 요청' };
  const original = vi.mocked(globalThis.fetch).getMockImplementation()!;
  const refreshed = deferred<Response>();
  const refreshRead = vi.fn(() => refreshed.promise);
  let decided = false;
  vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://test');
    if (url.pathname.endsWith('/reject')) {
      decided = true;
      return Response.json({ ...request, status: 'rejected' });
    }
    if (url.pathname.endsWith('/task-requests') && url.searchParams.has('status')) {
      return decided ? refreshRead() : Response.json({ items: [request, next], page: { has_more: false } });
    }
    return original(input, init);
  });
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', Object.create(navigator, { clipboard: { value: { writeText } } }));
  mountAt(`/flow/task-requests?v=1&focus=${REQUEST}`);
  const drawer = await screen.findByRole('dialog', { name: TITLE }, LAZY_MOUNT_WAIT);
  fireEvent.click(within(drawer).getByRole('button', { name: '반려' }));
  const decision = await screen.findByRole('dialog', { name: 'Task 요청 반려' });
  fireEvent.change(within(decision).getByRole('textbox', { name: '반려 사유' }), { target: { value: '검토 완료' } });
  const confirm = within(decision).getByRole('button', { name: '반려' });
  confirm.focus();
  fireEvent.click(confirm);
  await waitFor(() => expect(new URLSearchParams(window.location.search).get('focus')).toBe(MISSING));
  expect(refreshRead).toHaveBeenCalled();
  // The decision modal may hide the drawer from the accessibility tree while it waits for the next row.
  const link = within(drawer).getByText(TITLE).closest('a')!;
  expect(new URL(link.href).searchParams.get('focus')).toBe(REQUEST);
  fireEvent.click(drawer.querySelector<HTMLButtonElement>('button[aria-label="링크 복사"]')!);
  expect(new URL(writeText.mock.calls[0]![0]).searchParams.get('focus')).toBe(REQUEST);
  await act(async () => refreshed.resolve(Response.json({ items: [next], page: { has_more: false } })));
});

it('keeps the approved drawer open for conversion after the pending queue settles', async () => {
  const next = { ...request, id: MISSING, display_id: 'REQ-2537', requested_outcome: '다른 요청' };
  const fetch = vi.mocked(globalThis.fetch);
  const original = fetch.getMockImplementation()!;
  const refreshed = deferred<Response>();
  const refreshRead = vi.fn(async () => (await refreshed.promise).clone());
  let approved = false;
  fetch.mockImplementation(async (input, init) => {
    const url = new URL(String(input), 'http://test');
    if (url.pathname.endsWith('/approve')) {
      approved = true;
      return Response.json({ ...request, status: 'approved' });
    }
    if (url.pathname.endsWith('/task-requests') && url.searchParams.get('status') === 'pending_review') {
      return approved ? refreshRead() : Response.json({ items: [request, next], page: { has_more: false } });
    }
    return original(input, init);
  });

  mountAt(`/flow/task-requests?v=1&focus=${REQUEST}`, { extra: <ToastLog /> });
  const drawer = await screen.findByRole('dialog', { name: TITLE }, LAZY_MOUNT_WAIT);
  fireEvent.click(within(drawer).getByRole('button', { name: '승인' }));
  const decision = await screen.findByRole('dialog', { name: 'Task 요청 승인' });
  fireEvent.change(within(decision).getByRole('textbox', { name: '본인 승인 사유' }), { target: { value: '검토 완료' } });
  fireEvent.click(within(decision).getByRole('button', { name: '승인' }));
  const convert = await within(drawer).findByRole('button', { name: 'Task로 전환' });
  await waitFor(() => expect(document.activeElement).toBe(convert));
  await waitFor(() => expect(refreshRead).toHaveBeenCalled());

  const refreshedNext = { ...next, requested_outcome: '갱신된 다음 요청' };
  await act(async () => refreshed.resolve(Response.json({ items: [refreshedNext], page: { has_more: false } })));
  await screen.findByText(refreshedNext.requested_outcome);
  expect(new URLSearchParams(window.location.search).get('focus')).toBe(REQUEST);
  expect(screen.getByRole('dialog', { name: TITLE })).toBe(drawer);
  expect(within(drawer).getByRole('button', { name: 'Task로 전환' })).toBe(convert);
  expect(within(screen.getByRole('log')).queryByText('열린 항목이 목록에서 빠져 닫았습니다')).toBeNull();

  fireEvent.click(within(drawer).getByRole('button', { name: '다음 요청' }));
  await waitFor(() => expect(new URLSearchParams(window.location.search).get('focus')).toBe(MISSING));
  expect(screen.getByRole('dialog', { name: refreshedNext.requested_outcome })).toBe(drawer);
});
