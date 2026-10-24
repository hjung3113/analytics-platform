import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFoApi } from '@ap/fo-bridge/fo-api';
import { foQueryClient } from '@ap/fo-bridge';
import { ID_A, ID_B, listOf, mount, notification, stubFetch, switchableAdapter, json } from '../fo/test-support';

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

  it('V9: voc.public_update_posted links to the reporter VOC page with a returnTo to 알림; an operator event stays unlinked', async () => {
    stubFetch(() => listOf(
      notification(ID_A, { event_type: 'voc.public_update_posted', detail: { voc_id: ID_B } }),
      notification(ID_B, { event_type: 'voc.assigned_to_me', detail: { voc_id: ID_B } }),
    ));
    mount(switchableAdapter().adapter);
    const linked = await screen.findByTestId(`home-inbox-row-${ID_A}`);
    const link = within(linked).getByRole('link');
    const href = new URL(link.getAttribute('href')!, window.location.origin);
    expect(href.pathname).toBe(`/voc/${ID_B}`);
    expect(new URL(href.searchParams.get('returnTo')!, window.location.origin).pathname).toBe('/notifications');
    expect(within(screen.getByTestId(`home-inbox-row-${ID_B}`)).queryByRole('link')).toBeNull();
  });

  it('a 401 calls onSessionLost and shows the session-expired state without any login UI or /me request', async () => {
    const calls = stubFetch(() => json({ code: 'auth.session_invalid', message: 'no session' }, 401));
    mount(switchableAdapter().adapter);
    expect(await screen.findByText('세션이 만료되었습니다')).toBeTruthy();
    expect(screen.queryByTestId('home-inbox-list')).toBeNull();
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    expect(document.querySelector('form')).toBeNull();
    expect(calls.filter(c => /(^|\/)(me|auth)(\/|$|\?)/.test(c.path))).toEqual([]);
  });

  it.each([['mark-read', '읽음으로 표시'], ['archive', '보관']])('a %s 401 after the list loaded retires the subtree and clears the cache before the redirect', async (_name, label) => {
    stubFetch((_path, method) => method === 'POST' ? json({ code: 'auth.session_invalid', message: 'no session' }, 401) : listOf(notification(ID_A)));
    mount(switchableAdapter().adapter);
    const row = await screen.findByTestId(`home-inbox-row-${ID_A}`);
    expect(foQueryClient.getQueryCache().getAll().length).toBeGreaterThan(0);
    fireEvent.click(within(row).getByRole('button', { name: label }));
    await waitFor(() => expect(onSessionLost).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId(`home-inbox-row-${ID_A}`)).toBeNull());
    expect(screen.queryByTestId('home-inbox-list')).toBeNull();
    expect(foQueryClient.getQueryCache().getAll()).toEqual([]);
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
