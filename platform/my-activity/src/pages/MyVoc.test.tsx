import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import type { Permission } from '@ap/contracts';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { featureQueryClient } from '@ap/feature-bridge';
import { LAZY_MOUNT_WAIT } from '@ap/feature-bridge/testing';
import { ID_A, ID_B, json, mountAt, stubFetch, switchableAdapter, type Call } from '../feature/test-support';

const origin = () => window.location.origin;
const session = (extra: Permission[] = []) => switchableAdapter('user-a', ['platform:view', 'voc:view', ...extra]);
const ME = '44444444-4444-4444-8444-444444444444';
const OPERATOR = '55555555-5555-4555-8555-555555555555';
const OWNER = '99999999-9999-4999-8999-999999999999';
const MS = '33333333-3333-4333-8333-333333333333';
// Requests the VOC page must never send (Invariants): the system filter reads /managed-systems, nothing else beyond the VOC routes.
const DENIED = /\/me\/permissions\/check|\/analytics-areas|\/tasks|\/findings|\/recommendations/;

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

const publicItem = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  id, display_id: `VOC-${id.slice(0, 2)}`, title, reporter_facing_status: 'reviewing', managed_system: { id: MS, name: '플랫폼' },
  created_at: '2026-07-20T00:00:00.000Z', updated_at: '2026-07-21T00:00:00.000Z', mine: false, ...over,
});
const publicView = (id: string, title: string, over: Record<string, unknown> = {}) => ({
  ...publicItem(id, title, over), description_rich_content: doc('공개 본문입니다.'),
  entries: [{ id: 'b1111111-1111-4111-8111-111111111111', kind: 'public_update', body_rich_content: doc('담당자가 확인했습니다.'), created_at: '2026-07-22T00:00:00.000Z', attachments: [] }],
  attachments: [],
});
const PUBLIC_PREFIX = '/api/features/vocs/public';

type Over = {
  list?: (path: string) => Response; pub?: (id: string) => Response | Promise<Response>; detail?: () => Response; meId?: string;
};
/** Answers the public VOC routes, the system list and (for an own VOC) the reporter routes. */
function vocFetch(over: Over = {}) {
  return stubFetch(path => {
    if (path === '/api/features/me') return json({ actor: { id: over.meId ?? ME, external_id: 'x', email: 'me@x.test', display_name: '김제출', role_level: 'user' }, workspace_id: MS });
    if (path.startsWith(`${PUBLIC_PREFIX}?`)) return over.list?.(path) ?? json({ items: [publicItem(ID_A, '로그인이 안 됩니다', { mine: true }), publicItem(ID_B, '차트가 안 열립니다')], page: { has_more: false } });
    if (path.startsWith(`${PUBLIC_PREFIX}/`)) {
      const id = path.slice(PUBLIC_PREFIX.length + 1);
      return over.pub?.(id) ?? json(id === ID_A ? publicView(ID_A, '로그인이 안 됩니다', { mine: true }) : publicView(id, '차트가 안 열립니다'));
    }
    if (path === '/api/features/managed-systems') return json({ items: [{ id: MS, workspace_id: MS, slug: 'platform', name: '플랫폼', external_key: null, default_owner_actor_id: null, default_owner_team_id: null, default_reviewer_actor_id: null, default_reviewer_team_id: null, archived_at: null, archived_by_actor_id: null, created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z' }], total: 1 });
    if (path === `/api/features/vocs/${ID_A}`) return over.detail?.() ?? json(operatorEnvelope(ID_A));
    if (path.startsWith(`/api/features/vocs/${ID_A}/conversation`)) return json({ items: [PUBLIC, INTERNAL], has_more: false });
    if (path === '/api/features/actors?workspace=current') {
      return json({ actors: [
        { id: OPERATOR, display_name: '이운영', email: 'op@x.test', role_level: 'developer', actor_type: 'user' },
        { id: OWNER, display_name: '박운영', email: 'ow@x.test', role_level: 'developer', actor_type: 'user' },
      ] });
    }
    return json({ code: 'internal.unexpected', message: 'not mocked' }, 500);
  });
}

const listCalls = (calls: Call[]) => calls.filter(call => call.path.startsWith(`${PUBLIC_PREFIX}?`));
const lastList = (calls: Call[]) => new URL(listCalls(calls).at(-1)!.path, origin()).searchParams;
/** Requests to the reporter/operator VOC routes (`/vocs/<id>…`), which a VOC that is not the actor's own must never cause. */
const reporterCalls = (calls: Call[], id: string) => calls.filter(call => call.path.startsWith(`/api/features/vocs/${id}`));
const search = () => new URLSearchParams(window.location.search);
// Operator-envelope fields the backend may send an own VOC to a reporter who also holds an operator capability: never drawn.
const FORBIDDEN = [/Critical|critical|심각/, /Triage|triage/, /박운영/, /비슷한 다른 VOC/, /같은 Managed System/, /내부 메모/, /Finding 요청/, /Analytics Area/];
const NOT_OWN = /아침마다 로그인이 실패합니다|재현했습니다|내부 메모|reporter-reply-composer/;

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});
afterEach(() => {
  cleanup();
  featureQueryClient.clear();
  setFeatureApi(null);
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('VOC without a feature API (mock preview) — V1', () => {
  it.each([
    ['/voc?v=1', 'VOC'],
    [`/voc/${ID_A}?v=1`, 'VOC 상세'],
  ])('%s shows %s and 실서버 필요 and requests nothing', async (url, heading) => {
    setFeatureApi(null);
    const calls = vocFetch();
    mountAt(session().adapter, url);
    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(calls).toEqual([]);
  });
});

describe('VOC through the feature bridge', () => {
  const onSessionLost = vi.fn();
  beforeEach(() => { onSessionLost.mockReset(); setFeatureApi({ basePath: '/api/features', onSessionLost }); });

  it('adapts to its own container and returns to the mounted list with the keyboard while keeping filters', async () => {
    vocFetch();
    mountAt(session(['features:access']).adapter, `/voc?v=1&focus=${ID_B}&q=chart`);
    const pane = await screen.findByRole('region', { name: 'VOC 상세' });
    expect(pane.parentElement?.parentElement?.classList.contains('@container/voc')).toBe(true);
    expect(pane.parentElement?.classList.contains('@3xl/voc:grid-cols-[minmax(320px,2fr)_3fr]')).toBe(true);
    const list = screen.getByRole('searchbox').closest('[data-voc-list]');
    expect(list?.classList.contains('hidden')).toBe(true);
    expect(list?.classList.contains('@3xl/voc:block')).toBe(true);
    const back = within(pane).getByRole('button', { name: '목록 보기' });
    expect(back.parentElement?.classList.contains('flex-wrap')).toBe(true);
    expect(back.classList.contains('@3xl/voc:hidden')).toBe(true);
    back.focus();
    await userEvent.setup().keyboard('{Enter}');
    await waitFor(() => expect(search().has('focus')).toBe(false));
    expect(search().get('q')).toBe('chart');
    expect(screen.getByRole('searchbox').closest('[data-voc-list]')).toBe(list);
    expect(list?.classList.contains('hidden')).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(list));
  });

  it('narrow container: choosing a row hands focus to the detail pane when the list is hidden under it (review R1)', async () => {
    vocFetch();
    const css = document.createElement('style');
    // jsdom evaluates no Tailwind: stand in for the narrow container, where a selection hides the list.
    css.textContent = '[data-voc-list].hidden { display: none; }';
    document.head.append(css);
    try {
      mountAt(session(['features:access']).adapter, '/voc?v=1');
      const user = userEvent.setup();
      await user.click(await screen.findByText('차트가 안 열립니다'));
      const pane = await screen.findByRole('region', { name: 'VOC 상세' });
      await waitFor(() => expect(document.activeElement).toBe(pane));
    } finally { css.remove(); }
  });

  it('narrow container: clearing a bad value while a VOC stays selected focuses the detail pane, not a hidden control (review R1)', async () => {
    vocFetch();
    const css = document.createElement('style');
    css.textContent = '[data-voc-list].hidden { display: none; }';
    document.head.append(css);
    try {
      mountAt(session(['features:access']).adapter, `/voc?v=1&mine=false&focus=${ID_B}`);
      await userEvent.setup().click(await screen.findByRole('button', { name: '값 지우기' }));
      const pane = await screen.findByRole('region', { name: 'VOC 상세' });
      await waitFor(() => expect(document.activeElement).toBe(pane));
    } finally { css.remove(); }
  });

  it('V2: lists GET /vocs/public with the session cookie, reads the system list, and sends no operator request', async () => {
    const calls = vocFetch();
    mountAt(session().adapter, '/voc?v=1');
    expect(await screen.findByText('차트가 안 열립니다')).toBeTruthy();
    const list = listCalls(calls);
    expect(list).toHaveLength(1);
    expect(list[0]!.credentials).toBe('include');
    expect(Object.fromEntries(lastList(calls))).toEqual({ limit: '50' });
    expect(calls.map(call => call.path)).toContain('/api/features/managed-systems');
    expect(calls.filter(call => DENIED.test(call.path))).toEqual([]);
    expect(reporterCalls(calls, ID_A)).toEqual([]);
    expect(reporterCalls(calls, ID_B)).toEqual([]);
  });

  it('V2: every row names its system, and only the actor’s own VOC carries 「내가 등록」', async () => {
    vocFetch();
    mountAt(session().adapter, '/voc?v=1');
    await screen.findByText('차트가 안 열립니다');
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    for (const item of rows) expect(within(item).getByText('플랫폼')).toBeTruthy();
    expect(within(rows[0]!).getByText('내가 등록')).toBeTruthy();
    expect(within(rows[1]!).queryByText('내가 등록')).toBeNull();
  });

  it('V3: the 내가 등록한 toggle writes mine=true and the next request carries it; 전체 removes both', async () => {
    const calls = vocFetch();
    const user = userEvent.setup();
    mountAt(session().adapter, '/voc?v=1');
    await screen.findByText('차트가 안 열립니다');
    await user.click(screen.getByRole('radio', { name: '내가 등록한' }));
    await waitFor(() => expect(lastList(calls).get('mine')).toBe('true'));
    expect(search().get('mine')).toBe('true');
    expect(window.location.pathname).toBe('/voc');
    await user.click(screen.getByRole('radio', { name: '전체' }));
    await waitFor(() => expect(search().has('mine')).toBe(false));
    expect(screen.getByRole('radio', { name: '전체' }).getAttribute('data-state')).toBe('on');
  });

  it('V3: search writes q and the next request carries it', async () => {
    const calls = vocFetch();
    const user = userEvent.setup();
    mountAt(session().adapter, '/voc?v=1');
    await screen.findByText('차트가 안 열립니다');
    await user.type(screen.getByRole('searchbox'), '툴팁{Enter}');
    await waitFor(() => expect(lastList(calls).get('q')).toBe('툴팁'));
    expect(search().get('q')).toBe('툴팁');
  });

  it('V3: the system select lists the Managed Systems and writes system; the next request carries managed_system_id', async () => {
    const calls = vocFetch();
    // Radix Select reads pointer capture and scrolls the active option into view; jsdom has neither.
    Object.assign(Element.prototype, { hasPointerCapture: () => false, setPointerCapture: () => undefined, releasePointerCapture: () => undefined, scrollIntoView: () => undefined });
    const user = userEvent.setup();
    mountAt(session().adapter, '/voc?v=1');
    await screen.findByText('차트가 안 열립니다');
    await user.click(screen.getByRole('combobox', { name: '시스템' }));
    await user.click(await screen.findByRole('option', { name: '플랫폼' }));
    await waitFor(() => expect(lastList(calls).get('managed_system_id')).toBe(MS));
    expect(search().get('system')).toBe(MS);
  });

  it('V3: a URL with q, mine and system renders those controls selected and requests them', async () => {
    const calls = vocFetch();
    mountAt(session().adapter, `/voc?v=1&mine=true&system=${MS}&q=${encodeURIComponent('툴팁')}`);
    await screen.findByText('차트가 안 열립니다');
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('툴팁');
    expect(Object.fromEntries(lastList(calls))).toEqual({ mine: 'true', managed_system_id: MS, q: '툴팁', limit: '50' });
    expect(screen.getByRole('radio', { name: '내가 등록한' }).getAttribute('data-state')).toBe('on');
  });

  it.each([
    ['status', 'received,closed', 'mine=true'],
    ['sort', 'created_at:asc', 'q=ab'],
    ['status', 'bogus', 'q=ab'],
  ])('B2: an older copied URL with a %s value is rejected as unsupported by the public list, preserved, not requested, and 값 지우기 removes only that key', async (key, value, other) => {
    const calls = vocFetch();
    mountAt(session().adapter, `/voc?v=1&${key}=${encodeURIComponent(value)}&${other}`);
    expect(await screen.findByText(`VOC 목록은 주소의 ${key} 조건을 지원하지 않습니다`)).toBeTruthy();
    expect(search().get(key)).toBe(value);
    expect(calls).toEqual([]);

    await userEvent.setup().click(screen.getByRole('button', { name: '값 지우기' }));
    await waitFor(() => expect(search().has(key)).toBe(false));
    expect(search().has(other.split('=')[0]!)).toBe(true);
    await screen.findByText('차트가 안 열립니다');
    expect(lastList(calls).has(key)).toBe(false);
  });

  it('V3: 더 보기 requests the next cursor page with the same filters and appends its rows', async () => {
    const ID_C = '66666666-6666-4666-8666-666666666666';
    const calls = vocFetch({ list: path => new URL(path, origin()).searchParams.has('cursor')
      ? json({ items: [publicItem(ID_C, '세 번째 VOC')], page: { has_more: false } })
      : json({ items: [publicItem(ID_B, '차트가 안 열립니다')], page: { cursor: 'next-1', has_more: true } }) });
    const user = userEvent.setup();
    mountAt(session().adapter, '/voc?v=1&mine=true');
    await screen.findByText('차트가 안 열립니다');
    await user.click(screen.getByRole('button', { name: '더 불러오기' }));
    expect(await screen.findByText('세 번째 VOC')).toBeTruthy();
    expect(screen.getByText('차트가 안 열립니다')).toBeTruthy();
    const last = lastList(calls);
    expect(last.get('cursor')).toBe('next-1');
    expect(last.get('mine')).toBe('true');
    expect(search().has('cursor')).toBe(false);
  });

  it.each([
    ['q', '가'.repeat(101), 'mine=true'],
    ['mine', 'false', 'q=ab'],
    ['system', 'not-a-uuid', 'q=ab'],
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
    ['q', '가'.repeat(101), 'mine=true', () => screen.getByRole('searchbox')],
    ['mine', 'false', 'q=ab', () => screen.getByRole('radio', { name: '전체' })],
    ['system', 'not-a-uuid', 'q=ab', () => screen.getByRole('combobox', { name: '시스템' })],
  ])('UX-2: after 값 지우기 removes the bad %s, focus is on its control and not on <body>', async (key, value, other, control) => {
    vocFetch();
    mountAt(session().adapter, `/voc?v=1&${key}=${encodeURIComponent(value)}&${other}`);
    await userEvent.setup().click(await screen.findByRole('button', { name: '값 지우기' }));
    await screen.findByText('차트가 안 열립니다');
    await waitFor(() => expect(document.activeElement).toBe(control()));
    expect(document.activeElement).not.toBe(document.body);
  });

  it('UX-2: the focus request is one-shot; a later remount of the list (back to the warning, then forward) does not move focus again', async () => {
    vocFetch();
    const user = userEvent.setup();
    mountAt(session().adapter, '/voc?v=1&system=bogus&q=ab');
    await user.click(await screen.findByRole('button', { name: '값 지우기' }));
    await screen.findByText('차트가 안 열립니다');
    const select = screen.getByRole('combobox', { name: '시스템' });
    await waitFor(() => expect(document.activeElement).toBe(select));

    const box = screen.getByRole('searchbox');
    box.focus();
    expect(document.activeElement).toBe(box);
    window.history.back();
    await screen.findByText('주소의 system 값이 올바르지 않습니다');
    window.history.forward();
    await screen.findByText('차트가 안 열립니다');
    expect(document.activeElement).not.toBe(screen.getByRole('combobox', { name: '시스템' }));
  });

  it('V5: a row of another reporter opens the public detail in the pane without leaving /voc, and no reporter route is requested', async () => {
    const calls = vocFetch();
    const user = userEvent.setup();
    mountAt(session().adapter, '/voc?v=1');
    await screen.findByText('차트가 안 열립니다');
    const box = screen.getByRole('searchbox');
    fireEvent.change(box, { target: { value: '초안' } });

    await user.click(screen.getByText('차트가 안 열립니다'));
    const pane = await screen.findByRole('region', { name: 'VOC 상세' });
    expect(await within(pane).findByText('공개 본문입니다.', {}, LAZY_MOUNT_WAIT)).toBeTruthy();
    expect(within(pane).getByText('담당자가 확인했습니다.')).toBeTruthy();
    expect(within(pane).getByRole('list', { name: '진행 단계' })).toBeTruthy();
    expect(window.location.pathname).toBe('/voc');
    expect(search().get('focus')).toBe(ID_B);
    expect(screen.getByRole('searchbox')).toBe(box);
    expect((box as HTMLInputElement).value).toBe('초안');
    expect(reporterCalls(calls, ID_B).filter(call => !call.path.startsWith(`${PUBLIC_PREFIX}/`))).toEqual([]);
    expect(calls.map(call => call.path)).toContain(`${PUBLIC_PREFIX}/${ID_B}`);
    expect(screen.queryByTestId('reporter-reply-composer')).toBeNull();

    const full = within(pane).getByRole('link', { name: '전체 화면' });
    const href = new URL(full.getAttribute('href')!, origin());
    expect(href.pathname).toBe(`/voc/${ID_B}`);
    expect(new URL(href.searchParams.get('returnTo')!, origin()).pathname).toBe('/voc');
  });

  it('V5: the actor’s own VOC opens the reporter detail with the reply input', async () => {
    const calls = vocFetch();
    const user = userEvent.setup();
    mountAt(session().adapter, '/voc?v=1');
    await screen.findByText('차트가 안 열립니다');
    await user.click(screen.getByText('로그인이 안 됩니다'));
    const pane = await screen.findByRole('region', { name: 'VOC 상세' });
    expect(await within(pane).findByText('아침마다 로그인이 실패합니다.', {}, LAZY_MOUNT_WAIT)).toBeTruthy();
    expect(await within(pane).findByTestId('reporter-reply-composer')).toBeTruthy();
    expect(calls.map(call => call.path)).toContain(`/api/features/vocs/${ID_A}`);
  });

  it('V5: scrolling the list and switching a row keeps the scroll, the search draft and the list (no second list request)', async () => {
    const calls = vocFetch();
    const user = userEvent.setup();
    mountAt(session().adapter, '/voc?v=1');
    await screen.findByText('차트가 안 열립니다');
    const scroller = screen.getByTestId('public-voc-list-scroll');
    const box = screen.getByRole('searchbox');
    fireEvent.change(box, { target: { value: '초안' } });
    scroller.scrollTop = 321;

    await user.click(screen.getByText('로그인이 안 됩니다'));
    await waitFor(() => expect(search().get('focus')).toBe(ID_A));
    await user.click(screen.getByText('차트가 안 열립니다'));
    await waitFor(() => expect(search().get('focus')).toBe(ID_B));

    expect(screen.getByTestId('public-voc-list-scroll')).toBe(scroller);
    expect(scroller.scrollTop).toBe(321);
    expect(screen.getByRole('searchbox')).toBe(box);
    expect((box as HTMLInputElement).value).toBe('초안');
    expect(listCalls(calls)).toHaveLength(1);
  });

  it('B5: refresh and back keep the selection; a copied focus link opens a VOC outside the loaded page and outside the filters', async () => {
    const calls = vocFetch({ list: () => json({ items: [publicItem(ID_B, '차트가 안 열립니다')], page: { has_more: false } }) });
    const user = userEvent.setup();
    mountAt(session().adapter, '/voc?v=1&mine=true');
    await user.click(await screen.findByText('차트가 안 열립니다'));
    await waitFor(() => expect(search().get('focus')).toBe(ID_B));
    const url = `${window.location.pathname}${window.location.search}`;
    cleanup();
    mountAt(session().adapter, url);
    expect(await screen.findByText('공개 본문입니다.', {}, LAZY_MOUNT_WAIT)).toBeTruthy();
    expect(search().get('mine')).toBe('true');
    expect(search().get('focus')).toBe(ID_B);
    cleanup();

    // Copied link: the focused VOC (the actor's own) is not in the loaded list at all.
    mountAt(session().adapter, `/voc?v=1&focus=${ID_A}`);
    expect(await screen.findByText('아침마다 로그인이 실패합니다.', {}, LAZY_MOUNT_WAIT)).toBeTruthy();
    expect(calls.map(call => call.path)).toContain(`${PUBLIC_PREFIX}/${ID_A}`);
  });

  it('B5: back after selecting a row returns to the list without a selection, then forward restores it', async () => {
    vocFetch();
    const user = userEvent.setup();
    mountAt(session().adapter, '/voc?v=1&mine=true');
    await user.click(await screen.findByText('차트가 안 열립니다'));
    await waitFor(() => expect(search().get('focus')).toBe(ID_B));
    window.history.back();
    await waitFor(() => expect(search().has('focus')).toBe(false));
    expect(search().get('mine')).toBe('true');
    window.history.forward();
    await waitFor(() => expect(search().get('focus')).toBe(ID_B));
    expect(await screen.findByText('공개 본문입니다.', {}, LAZY_MOUNT_WAIT)).toBeTruthy();
  });

  it.each([
    ['pane', `/voc?v=1&focus=${ID_B}`],
    ['full page', `/voc/${ID_B}?v=1`],
  ])('B3: in the %s, a VOC that is not the actor’s own is the public detail only; nothing is requested from the reporter route and no reporter text is drawn', async (_name, url) => {
    const calls = vocFetch();
    mountAt(session().adapter, url);
    expect(await screen.findByText('공개 본문입니다.', {}, LAZY_MOUNT_WAIT)).toBeTruthy();
    expect(screen.getByTestId('public-voc-detail')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NOT_OWN);
    expect(reporterCalls(calls, ID_B).filter(call => !call.path.startsWith(`${PUBLIC_PREFIX}/`))).toEqual([]);
    expect(calls.filter(call => DENIED.test(call.path))).toEqual([]);
  });

  it.each([
    ['pane', `/voc?v=1&focus=${ID_A}`],
    ['full page', `/voc/${ID_A}?v=1`],
  ])('B3: in the %s, the actor’s own VOC (mine from the server) mounts the reporter detail and keeps the reply input', async (_name, url) => {
    vocFetch();
    mountAt(session().adapter, url);
    expect(await screen.findByText('아침마다 로그인이 실패합니다.', {}, LAZY_MOUNT_WAIT)).toBeTruthy();
    expect(await screen.findByTestId('reporter-reply-composer')).toBeTruthy();
    expect(screen.queryByTestId('public-voc-detail')).toBeNull();
    // V6: the operator envelope behind this own VOC reaches neither route's screen.
    await screen.findByText('재현했습니다. 곧 고치겠습니다.');
    for (const pattern of FORBIDDEN) expect(document.body.textContent).not.toMatch(pattern);
    expect(screen.queryByRole('tab', { name: '내부' })).toBeNull();
    // The only editor is the reporter's own reply (#1159); no public update or internal comment composer.
    const editors = screen.getAllByRole('textbox').filter(el => el.closest('[data-testid="reporter-reply-composer"]') !== null || el.getAttribute('type') !== 'search');
    expect(editors).toHaveLength(1);
    expect(editors[0]!.closest('[data-testid="reporter-reply-composer"]')).not.toBeNull();
    expect(screen.queryByTestId('public-update-composer')).toBeNull();
    expect(screen.queryByTestId('internal-comment-composer')).toBeNull();
    // U2: the own VOC carries the same progress stage line as the public detail.
    expect(screen.getByRole('list', { name: '진행 단계' })).toBeTruthy();
  });

  it('B3: while the ownership answer is pending the reporter detail is not requested; on a denial it is never mounted', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const calls = vocFetch({ pub: async id => { await gate; return json(publicView(id, '로그인이 안 됩니다', { mine: true })); } });
    mountAt(session().adapter, `/voc/${ID_A}?v=1`);
    await screen.findByLabelText('VOC 상세 불러오는 중', {}, LAZY_MOUNT_WAIT);
    expect(reporterCalls(calls, ID_A).filter(call => !call.path.startsWith(`${PUBLIC_PREFIX}/`))).toEqual([]);
    release();
    expect(await screen.findByTestId('reporter-reply-composer', {}, LAZY_MOUNT_WAIT)).toBeTruthy();
    cleanup();
    featureQueryClient.clear();

    const denied = vocFetch({ pub: () => json({ code: 'not_found.record', message: 'not found' }, 404) });
    mountAt(session().adapter, `/voc?v=1&focus=${ID_A}`);
    const pane = await screen.findByRole('region', { name: 'VOC 상세' });
    expect(await within(pane).findByText('VOC를 찾을 수 없습니다', {}, LAZY_MOUNT_WAIT)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/아침마다 로그인이 실패합니다|공개 본문/);
    expect(reporterCalls(denied, ID_A).filter(call => !call.path.startsWith(`${PUBLIC_PREFIX}/`))).toEqual([]);
  });

  it('V6: a public answer carrying an operator field is rejected by the strict schema and drawn as an error, not as data', async () => {
    vocFetch({ pub: id => json({ ...publicView(id, '차트가 안 열립니다'), severity: 'critical', reporter_id: ME }) });
    mountAt(session().adapter, `/voc/${ID_B}?v=1`);
    expect(await screen.findByText('데이터를 불러오지 못했습니다.', {}, { timeout: 4000 })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/공개 본문|critical|Critical/);
  });

  it.each([
    [[] as Permission[], false],
    [['features:access'] as Permission[], true],
  ])('K3: with %j the 「업무 흐름에서 처리」 link is shown = %s', async (extra, shown) => {
    vocFetch();
    mountAt(session(extra).adapter, `/voc?v=1&focus=${ID_B}`);
    await screen.findByText('공개 본문입니다.', {}, LAZY_MOUNT_WAIT);
    const link = screen.queryByRole('link', { name: '업무 흐름에서 처리' });
    if (!shown) { expect(link).toBeNull(); return; }
    const href = new URL(link!.getAttribute('href')!, origin());
    expect(href.pathname.endsWith('/inbox')).toBe(true);
    expect(href.searchParams.get('focus')).toBe(ID_B);
    expect(new URL(href.searchParams.get('returnTo')!, origin()).pathname).toBe('/voc');
  });

  it('V7: the detail page offers the way back to the origin, and only that', async () => {
    vocFetch();
    mountAt(session().adapter, `/voc/${ID_A}?v=1&returnTo=${encodeURIComponent('/notifications?v=1')}`);
    await screen.findByText('아침마다 로그인이 실패합니다.', {}, LAZY_MOUNT_WAIT);
    const more = screen.queryByRole('button', { name: '더보기' });
    if (more) await userEvent.setup().click(more);
    const back = screen.getAllByRole('link').find(link => new URL(link.getAttribute('href')!, origin()).pathname === '/notifications');
    expect(back).toBeTruthy();
    for (const link of screen.getAllByRole('link')) expect(new URL(link.getAttribute('href')!, origin()).origin).toBe(origin());
  });

  it.each(['not-a-uuid', '..%2F..%2Fme'])('V7: the invalid VOC ID %s is not found and requests nothing', async vocId => {
    const calls = vocFetch();
    mountAt(session().adapter, `/voc/${vocId}?v=1`);
    expect(await screen.findByRole('heading', { name: 'VOC 상세' })).toBeTruthy();
    expect(screen.getByText('VOC를 찾을 수 없습니다')).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('V7: a feature 404 shows the feature not-found text', async () => {
    vocFetch({ pub: () => json({ code: 'not_found.record', message: 'not found' }, 404) });
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
