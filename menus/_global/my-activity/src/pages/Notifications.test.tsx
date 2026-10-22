import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRound } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, type MenuEntry } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import { setFoApi } from '../fo-api';
import Notifications from './Notifications';

// The real manifests in their global group; a space needs one menu of its own, so a filler stands in for it.
const filler = { ...manifests[1]!, primary: true, id: 'filler', group: 'noticeVoc', path: '/filler' } as MenuEntry;
const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'filler' }],
  groups: [
    { id: 'myActivity', label: { ko: '내 활동', en: 'My activity' }, icon: UserRound, space: null },
    { id: 'noticeVoc', label: { ko: '공지·VOC', en: 'Notice·VOC' }, icon: UserRound, space: 'analytics' },
  ],
  menus: [...manifests, filler],
});

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

function notification(id: string, over: Record<string, unknown> = {}) {
  return {
    id, event_type: 'voc.assigned_to_me', subject_type: 'voc', subject_id: id, summary: `VOC 담당자로 지정되었습니다 (${id.slice(0, 2)}).`,
    detail: { voc_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, created_at: '2026-07-27T00:00:00.000Z', read_at: null, archived_at: null, ...over,
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const listOf = (...items: unknown[]) => json({ items, page: { has_more: false }, unread_count: items.length });

type Call = { path: string; method: string; credentials: RequestCredentials | undefined };

/** Stubs `fetch`: `handle` answers by path; every request is recorded. */
function stubFetch(handle: (path: string, method: string, calls: Call[]) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { path: String(input), method: init?.method ?? 'GET', credentials: init?.credentials };
    calls.push(call);
    return handle(call.path, call.method, calls);
  }));
  return calls;
}

/** An adapter whose session the test can replace; `notify` announces the change (the Kernel bumps `revision`). */
function switchableAdapter(initialUser = 'user-a') {
  const listeners = new Set<() => void>();
  let session = testSession(['platform:view'], { user: { id: initialUser, name: initialUser, title: { ko: initialUser, en: initialUser } } });
  const adapter = testAdapter({ session: () => session, subscribe: onChange => { listeners.add(onChange); return () => { listeners.delete(onChange); }; } });
  return {
    adapter,
    setUser: (id: string) => { session = testSession(['platform:view'], { user: { id, name: id, title: { ko: id, en: id } } }); },
    notify: () => { for (const listener of [...listeners]) listener(); },
  };
}

function ToastProbe() {
  const { toasts } = usePlatform();
  return <ul aria-label="toasts">{toasts.map(t => <li key={t.id} data-tone={t.tone}>{t.text}</li>)}</ul>;
}

function Harness() {
  const [shown, setShown] = useState(true);
  return <>
    <button type="button" onClick={() => setShown(value => !value)}>toggle</button>
    <ToastProbe />
    {shown && <Notifications />}
  </>;
}

function mount(adapter: ReturnType<typeof testAdapter>) {
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Harness /></PlatformProvider></I18nProvider>);
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/notifications');
});
afterEach(() => { cleanup(); setFoApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('Notifications without a FeedbackOps API (mock preview)', () => {
  it('shows 실서버 필요, mounts nothing from FeedbackOps and requests nothing', () => {
    setFoApi(null);
    const calls = stubFetch(() => listOf());
    mount(switchableAdapter().adapter);
    expect(screen.getByRole('heading', { name: '알림' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(screen.queryByTestId('home-inbox-list')).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe('Notifications through the FeedbackOps bridge', () => {
  const onSessionLost = vi.fn();
  beforeEach(() => { onSessionLost.mockReset(); setFoApi({ basePath: '/api/fo', onSessionLost }); });

  it('lists unread notifications from /api/fo with the session cookie, unlinked, and marks one read', async () => {
    const calls = stubFetch((path, method) => {
      if (method === 'POST') return json(notification(ID_A, { read_at: '2026-07-28T00:00:00.000Z' }));
      return listOf(notification(ID_A));
    });
    mount(switchableAdapter().adapter);
    const row = await screen.findByTestId(`home-inbox-row-${ID_A}`);
    expect(calls[0]).toEqual({ path: '/api/fo/notifications?unread=true', method: 'GET', credentials: 'include' });
    expect(within(row).queryByRole('link')).toBeNull();
    fireEvent.click(within(row).getAllByRole('button')[0]!);
    await waitFor(() => expect(calls.map(c => `${c.method} ${c.path}`)).toContain(`POST /api/fo/notifications/${ID_A}/read`));
    expect(calls.filter(c => /^\/api\/fo\/(me|auth)/.test(c.path) || /^\/(me|auth)/.test(c.path))).toEqual([]);
  });

  it('a 401 calls onSessionLost and shows the list error without any login UI or /me request', async () => {
    const calls = stubFetch(() => json({ code: 'auth.session_invalid', message: 'no session' }, 401));
    mount(switchableAdapter().adapter);
    expect(await screen.findByText('알림을 불러오지 못했습니다.')).toBeTruthy();
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    expect(document.querySelector('form')).toBeNull();
    expect(calls.filter(c => /(^|\/)(me|auth)(\/|$|\?)/.test(c.path))).toEqual([]);
  });

  it('a failed mark-read raises a danger Kernel toast with the mapped message', async () => {
    stubFetch((_path, method) => method === 'POST' ? json({ code: 'internal.unexpected', message: 'boom' }, 500) : listOf(notification(ID_A)));
    mount(switchableAdapter().adapter);
    const row = await screen.findByTestId(`home-inbox-row-${ID_A}`);
    fireEvent.click(within(row).getAllByRole('button')[0]!);
    const toast = await within(screen.getByRole('list', { name: 'toasts' })).findByText('일시적 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    expect(toast.getAttribute('data-tone')).toBe('danger');
  });
});

describe('session generation (no leak across users or revisions)', () => {
  beforeEach(() => { setFoApi({ basePath: '/api/fo', onSessionLost: vi.fn() }); });

  it.each([
    ['another user', 'user-b', ID_B],
    ['the same user after a revision bump', 'user-a', ID_A],
  ])('%s: the previous rows are gone in the same act and the new list shows after it resolves', async (_name, nextUser, nextId) => {
    const fixture = switchableAdapter('user-a');
    let held: ((response: Response) => void) | null = null;
    let holding = false;
    stubFetch(() => {
      if (!holding) return listOf(notification(ID_A));
      return new Promise<Response>(resolve => { held = resolve; });
    });
    mount(fixture.adapter);
    await screen.findByTestId(`home-inbox-row-${ID_A}`);

    await act(async () => {
      holding = true;
      fixture.setUser(nextUser);
      fixture.notify();
    });
    expect(screen.queryByTestId(`home-inbox-row-${ID_A}`)).toBeNull();
    expect(held).not.toBeNull();

    await act(async () => { held!(listOf(notification(nextId))); });
    expect(await screen.findByTestId(`home-inbox-row-${nextId}`)).toBeTruthy();
  });

  it('unmounting and remounting the page in the same generation keeps the cache', async () => {
    const fixture = switchableAdapter('user-a');
    let requests = 0;
    stubFetch(() => {
      requests += 1;
      return requests === 1 ? listOf(notification(ID_A)) : new Promise<Response>(() => {});
    });
    mount(fixture.adapter);
    await screen.findByTestId(`home-inbox-row-${ID_A}`);
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.queryByTestId(`home-inbox-row-${ID_A}`)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId(`home-inbox-row-${ID_A}`)).toBeTruthy();
  });
});
