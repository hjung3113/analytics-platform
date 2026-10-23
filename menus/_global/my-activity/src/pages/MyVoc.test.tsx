import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFoApi } from '../fo-api';
import { foQueryClient } from '../fo/session';
import { ID_A, ID_B, json, mountAt, stubFetch, switchableAdapter, type Call } from '../fo/test-support';

const origin = () => window.location.origin;
const session = () => switchableAdapter('user-a', ['platform:view', 'voc:view']);
const ME = '44444444-4444-4444-8444-444444444444';
const OPERATOR = '55555555-5555-4555-8555-555555555555';
const OWNER = '99999999-9999-4999-8999-999999999999';
const MS = '33333333-3333-4333-8333-333333333333';
// Requests the 내 VOC page must never send (Invariants).
const DENIED = /\/me\/permissions\/check|\/managed-systems|\/analytics-areas|\/tasks|\/findings|\/recommendations/;

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const entry = (id: string, kind: string, actor: string, text: string) => ({
  id, kind, actor_id: actor, body_rich_content: doc(text), created_at: '2026-07-22T00:00:00.000Z', attachments: [],
  visibility: kind === 'internal_comment' ? 'internal' : kind === 'reporter_reply' ? 'reporter' : 'public',
});
const PUBLIC = entry('a1111111-1111-4111-8111-111111111111', 'public_update', OPERATOR, '재현했습니다. 곧 고치겠습니다.');
const INTERNAL = entry('a3333333-3333-4333-8333-333333333333', 'internal_comment', OPERATOR, '내부 메모: 담당 팀 책임 문제');

function row(id: string, title: string) {
  return {
    id, display_id: `VOC-${id.slice(0, 2)}`, title, primary_managed_system_id: MS, analytics_area_id: null, reporter_id: ME, owner_user_id: OWNER, owner_team_id: null,
    severity: 'critical', reporter_facing_status: 'reviewing', triage_state: 'triaged', review_postponed_at: null, source_context: 'direct_use',
    created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-21T00:00:00.000Z', similar_count: 3, attachment_count: 0,
  };
}
// What the backend sends a reporter who also holds an operator capability.
const operatorEnvelope = (id: string) => ({
  ...row(id, '로그인이 안 됩니다'),
  similar: { items: [{ id: ID_B, display_id: 'VOC-0007', title: '비슷한 다른 VOC', reporter_facing_status: 'received', severity: 'high' }] },
  follow_up: { decision: null, can_record: true, can_withdraw: false },
  description_rich_content: doc('아침마다 로그인이 실패합니다.'),
  next_actions: [{ kind: 'request_finding', label: 'Finding 요청' }],
  next_reporter_states: { allowed: ['closed'], forbidden: {} },
  linked_execution: { findingRef: null, taskRef: null },
  conversation_timeline: [PUBLIC, INTERNAL],
  conversation_page: { has_more: false },
  permission_decisions: {},
  attachments: [],
});
const FORBIDDEN = [/Critical|critical|심각/, /Triage|triage/, /박운영/, /비슷한 다른 VOC/, /같은 Managed System/, /내부 메모/, /Finding 요청/, /Analytics Area/];

/** Answers the reporter routes; `list` and `detail` override the answers. */
function vocFetch(over: { list?: (path: string) => Response; detail?: () => Response; meId?: string } = {}) {
  return stubFetch(path => {
    if (path === '/api/fo/me') return json({ actor: { id: over.meId ?? ME, external_id: 'x', email: 'me@x.test', display_name: '김제출', role_level: 'user' }, workspace_id: MS });
    if (path.startsWith('/api/fo/vocs?')) return over.list?.(path) ?? json({ items: [row(ID_A, '로그인이 안 됩니다'), row(ID_B, '차트가 안 열립니다')], page: { has_more: false } });
    if (path === `/api/fo/vocs/${ID_A}`) return over.detail?.() ?? json(operatorEnvelope(ID_A));
    if (path.startsWith(`/api/fo/vocs/${ID_A}/conversation`)) return json({ items: [PUBLIC, INTERNAL], has_more: false });
    if (path === '/api/fo/actors?workspace=current') {
      return json({ actors: [
        { id: OPERATOR, display_name: '이운영', email: 'op@x.test', role_level: 'developer', actor_type: 'user' },
        { id: OWNER, display_name: '박운영', email: 'ow@x.test', role_level: 'developer', actor_type: 'user' },
      ] });
    }
    return json({ code: 'internal.unexpected', message: 'not mocked' }, 500);
  });
}

const listCalls = (calls: Call[]) => calls.filter(call => call.path.startsWith('/api/fo/vocs?'));
const lastList = (calls: Call[]) => new URL(listCalls(calls).at(-1)!.path, origin()).searchParams;
const search = () => new URLSearchParams(window.location.search);

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});
afterEach(() => {
  cleanup();
  foQueryClient.clear();
  setFoApi(null);
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('내 VOC without a FeedbackOps API (mock preview) — V1', () => {
  it.each([
    ['/voc?v=1', '내 VOC'],
    [`/voc/${ID_A}?v=1`, '내 VOC 상세'],
  ])('%s shows %s and 실서버 필요 and requests nothing', async (url, heading) => {
    setFoApi(null);
    const calls = vocFetch();
    mountAt(session().adapter, url);
    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(calls).toEqual([]);
  });
});

describe('내 VOC through the FeedbackOps bridge', () => {
  const onSessionLost = vi.fn();
  beforeEach(() => { onSessionLost.mockReset(); setFoApi({ basePath: '/api/fo', onSessionLost }); });

  it('V2: lists GET /api/fo/vocs?view=my with the session cookie and sends no operator request', async () => {
    const calls = vocFetch();
    mountAt(session().adapter, '/voc?v=1');
    expect(await screen.findByText('차트가 안 열립니다')).toBeTruthy();
    const list = listCalls(calls);
    expect(list).toHaveLength(1);
    expect(list[0]!.credentials).toBe('include');
    expect(Object.fromEntries(lastList(calls))).toEqual({ view: 'my', sort: 'created_at:desc', limit: '50' });
    expect(calls.filter(call => DENIED.test(call.path))).toEqual([]);
  });

  it('V3: search, status filter and sort write q/status/sort on /voc and the next request carries them', async () => {
    const calls = vocFetch();
    const user = userEvent.setup();
    mountAt(session().adapter, '/voc?v=1');
    await screen.findByText('차트가 안 열립니다');

    await user.type(screen.getByRole('searchbox'), '툴팁{Enter}');
    await waitFor(() => expect(lastList(calls).get('q')).toBe('툴팁'));
    expect(search().get('q')).toBe('툴팁');

    await user.click(screen.getByRole('button', { name: /필터/ }));
    await user.click(await screen.findByText('종료됨'));
    await waitFor(() => expect(lastList(calls).get('filter.reporter_facing_status')).toBe('closed'));
    expect(search().get('status')).toBe('closed');
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: /정렬|최신순/ }));
    await user.click(await screen.findByText('오래된순'));
    await waitFor(() => expect(lastList(calls).get('sort')).toBe('created_at:asc'));
    expect(search().get('sort')).toBe('created_at:asc');
    expect(window.location.pathname).toBe('/voc');
    expect(lastList(calls).get('q')).toBe('툴팁');
  });

  it('V3: a URL with q, status and sort renders those controls selected and requests them', async () => {
    const calls = vocFetch();
    mountAt(session().adapter, `/voc?v=1&status=received,closed&sort=created_at:asc&q=${encodeURIComponent('툴팁')}`);
    await screen.findByText('차트가 안 열립니다');
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('툴팁');
    expect(Object.fromEntries(lastList(calls))).toEqual({ view: 'my', q: '툴팁', 'filter.reporter_facing_status': 'received,closed', sort: 'created_at:asc', limit: '50' });
    expect(screen.getByRole('button', { name: /필터/ }).textContent).toContain('2');
    expect(screen.getByRole('button', { name: /오래된순/ })).toBeTruthy();
  });

  it.each([
    ['status', 'bogus', 'sort=created_at:asc'],
    ['sort', 'severity:desc', 'q=ab'],
    ['q', '가'.repeat(101), 'sort=created_at:asc'],
    ['focus', 'not-a-uuid', 'q=ab'],
  ])('V4: a bad %s is named, preserved and not requested; 값 지우기 removes only that key', async (key, value, other) => {
    const calls = vocFetch();
    mountAt(session().adapter, `/voc?v=1&${key}=${encodeURIComponent(value)}&${other}`);
    expect(await screen.findByText(`주소의 ${key} 값이 올바르지 않습니다`)).toBeTruthy();
    expect(search().get(key)).toBe(value);
    expect(calls).toEqual([]);

    await userEvent.setup().click(screen.getByRole('button', { name: '값 지우기' }));
    await waitFor(() => expect(search().has(key)).toBe(false));
    expect(search().get('v')).toBe('1');
    expect(search().has(other.split('=')[0]!)).toBe(true);
    expect(screen.queryByText(`주소의 ${key} 값이 올바르지 않습니다`)).toBeNull();
  });

  it.each([
    ['status', 'bogus', 'q=ab', /필터/],
    ['q', '가'.repeat(101), 'sort=created_at:asc', null],
    ['sort', 'severity:desc', 'q=ab', /정렬|최신순/],
  ])('UX-2: after 값 지우기 removes the bad %s, focus is on its control and not on <body>', async (key, value, other, name) => {
    vocFetch();
    mountAt(session().adapter, `/voc?v=1&${key}=${encodeURIComponent(value)}&${other}`);
    await userEvent.setup().click(await screen.findByRole('button', { name: '값 지우기' }));
    await screen.findByText('차트가 안 열립니다');
    const control = name === null ? screen.getByRole('searchbox') : screen.getByRole('button', { name });
    await waitFor(() => expect(document.activeElement).toBe(control));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('V5: a row click opens the reporter detail in the slot without leaving /voc or remounting the list', async () => {
    const calls = vocFetch();
    const user = userEvent.setup();
    mountAt(session().adapter, '/voc?v=1');
    await screen.findByText('차트가 안 열립니다');
    const box = screen.getByRole('searchbox');
    fireEvent.change(box, { target: { value: '초안' } });

    await user.click(screen.getByText('로그인이 안 됩니다'));
    const panel = await screen.findByRole('dialog');
    expect(await within(panel).findByRole('heading', { name: '로그인이 안 됩니다', level: 2 }, { timeout: 3000 })).toBeTruthy();
    expect(window.location.pathname).toBe('/voc');
    expect(search().get('focus')).toBe(ID_A);
    expect(screen.getByRole('searchbox')).toBe(box);
    expect((box as HTMLInputElement).value).toBe('초안');
    expect(calls.map(call => call.path)).toContain(`/api/fo/vocs/${ID_A}`);

    const full = within(panel).getByRole('link', { name: '전체 화면' });
    const href = new URL(full.getAttribute('href')!, origin());
    expect(href.pathname).toBe(`/voc/${ID_A}`);
    expect(new URL(href.searchParams.get('returnTo')!, origin()).pathname).toBe('/voc');

    await user.click(within(panel).getByRole('button', { name: '상세 닫기' }));
    await waitFor(() => expect(search().has('focus')).toBe(false));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.location.pathname).toBe('/voc');
  });

  it('V5: scrolling the list and opening or switching a row keeps the scroll, the search draft and the list (no second list request)', async () => {
    const calls = vocFetch();
    const user = userEvent.setup();
    mountAt(session().adapter, '/voc?v=1');
    await screen.findByText('차트가 안 열립니다');
    const scroller = screen.getByTestId('my-voc-list-scroll');
    const box = screen.getByRole('searchbox');
    fireEvent.change(box, { target: { value: '초안' } });
    scroller.scrollTop = 321;

    await user.click(screen.getByText('로그인이 안 됩니다'));
    await within(await screen.findByRole('dialog')).findByRole('heading', { name: '로그인이 안 됩니다', level: 2 }, { timeout: 3000 });
    await user.click(screen.getByText('차트가 안 열립니다'));
    await waitFor(() => expect(search().get('focus')).toBe(ID_B));

    expect(screen.getByTestId('my-voc-list-scroll')).toBe(scroller);
    expect(scroller.scrollTop).toBe(321);
    expect(screen.getByRole('searchbox')).toBe(box);
    expect((box as HTMLInputElement).value).toBe('초안');
    expect(listCalls(calls)).toHaveLength(1);
  });

  it('C1: an operator opening a VOC another actor submitted gets not-found in the slot and on the full page, with none of it drawn', async () => {
    const calls = vocFetch({ meId: OPERATOR });
    mountAt(session().adapter, `/voc?v=1&focus=${ID_A}`);
    const panel = await screen.findByRole('dialog');
    expect(await within(panel).findByText('VOC를 찾을 수 없습니다', {}, { timeout: 3000 })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/아침마다 로그인이 실패합니다|재현했습니다|log\.txt/);
    expect(within(panel).queryByRole('heading', { name: '로그인이 안 됩니다' })).toBeNull();
    cleanup();

    mountAt(session().adapter, `/voc/${ID_A}?v=1`);
    expect(await screen.findByText('VOC를 찾을 수 없습니다', {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: '로그인이 안 됩니다' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/아침마다 로그인이 실패합니다|재현했습니다/);
    expect(calls.filter(call => DENIED.test(call.path))).toEqual([]);
  });

  it('V6: for an operator envelope neither the drawer nor the full page shows an operator field', async () => {
    vocFetch();
    mountAt(session().adapter, `/voc?v=1&focus=${ID_A}`);
    expect(await screen.findByText('아침마다 로그인이 실패합니다.', {}, { timeout: 3000 })).toBeTruthy();
    expect(await screen.findByText('재현했습니다. 곧 고치겠습니다.')).toBeTruthy();
    for (const pattern of FORBIDDEN) expect(document.body.textContent).not.toMatch(pattern);
    expect(screen.queryByRole('tab', { name: '내부' })).toBeNull();
    cleanup();

    mountAt(session().adapter, `/voc/${ID_A}?v=1`);
    expect(await screen.findByText('아침마다 로그인이 실패합니다.', {}, { timeout: 3000 })).toBeTruthy();
    for (const pattern of FORBIDDEN) expect(document.body.textContent).not.toMatch(pattern);
    expect(screen.queryByRole('tab', { name: '내부' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('V7: the detail page offers the way back to the origin, and only that', async () => {
    vocFetch();
    mountAt(session().adapter, `/voc/${ID_A}?v=1&returnTo=${encodeURIComponent('/notifications?v=1')}`);
    await screen.findByText('아침마다 로그인이 실패합니다.', {}, { timeout: 3000 });
    const more = screen.queryByRole('button', { name: '더보기' });
    if (more) await userEvent.setup().click(more);
    const back = screen.getAllByRole('link').find(link => new URL(link.getAttribute('href')!, origin()).pathname === '/notifications');
    expect(back).toBeTruthy();
    for (const link of screen.getAllByRole('link')) expect(new URL(link.getAttribute('href')!, origin()).origin).toBe(origin());
  });

  it.each(['not-a-uuid', '..%2F..%2Fme'])('V7: the invalid VOC ID %s is not found and requests nothing', async vocId => {
    const calls = vocFetch();
    mountAt(session().adapter, `/voc/${vocId}?v=1`);
    expect(await screen.findByRole('heading', { name: '내 VOC 상세' })).toBeTruthy();
    expect(screen.getByText('VOC를 찾을 수 없습니다')).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('V7: a FeedbackOps 404 shows the FeedbackOps not-found text', async () => {
    vocFetch({ detail: () => json({ code: 'not_found.record', message: 'not found' }, 404) });
    mountAt(session().adapter, `/voc/${ID_A}?v=1`);
    expect(await screen.findByText('VOC를 찾을 수 없습니다', {}, { timeout: 4000 })).toBeTruthy();
  });

  it('V8: a 401 on the list retires the page through onSessionLost without a toast or navigation', async () => {
    vocFetch({ list: () => json({ code: 'auth.session_invalid', message: 'no session' }, 401) });
    mountAt(session().adapter, '/voc?v=1');
    expect(await screen.findByText('세션이 만료되었습니다')).toBeTruthy();
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('list', { name: 'toasts' }).children).toHaveLength(0);
    expect(window.location.pathname).toBe('/voc');
  });
});
