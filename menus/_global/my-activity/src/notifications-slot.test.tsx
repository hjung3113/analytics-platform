import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter } from '@ap/kernel/testing';
import { manifests } from './index';
import { setFoApi } from './fo-api';
import Notifications from './pages/Notifications';
import { notificationsSlot } from './notifications-slot';
import { foQueryClient } from './fo/session';
import { ID_A, ID_B, json, listOf, notification, registry, stubFetch, switchableAdapter } from './fo/test-support';

const COUNT = '/api/fo/notifications?unread=true&limit=1';
const countOf = (n: number) => json({ items: [], page: { has_more: false }, unread_count: n });

function Probe() {
  return <notificationsSlot.UnreadCount>{n => <button type="button">{n === null ? 'none' : `count ${n}`}</button>}</notificationsSlot.UnreadCount>;
}

function mount(adapter: ReturnType<typeof testAdapter>, children: React.ReactNode) {
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{children}</PlatformProvider></I18nProvider>);
}

const onSessionLost = vi.fn();
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/notifications');
  onSessionLost.mockReset();
});
afterEach(() => { cleanup(); setFoApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('notifications slot', () => {
  it('names the notifications manifest menu', () => {
    const manifest = manifests.find(menu => menu.id === notificationsSlot.menuId);
    expect(manifest?.path).toBe('/notifications');
  });

  it('without a FeedbackOps API shows no count, 실서버 필요 in the popover body, and requests nothing', () => {
    setFoApi(null);
    const calls = stubFetch(() => listOf());
    mount(switchableAdapter().adapter, <><Probe /><notificationsSlot.Recent /></>);
    expect(screen.getByRole('button').textContent).toBe('none');
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(calls).toEqual([]);
  });

  describe('with a FeedbackOps API', () => {
    beforeEach(() => { setFoApi({ basePath: '/api/fo', onSessionLost }); });

    it('shares one count request between two probes', async () => {
      const calls = stubFetch(() => countOf(3));
      mount(switchableAdapter().adapter, <><Probe /><Probe /></>);
      await waitFor(() => expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['count 3', 'count 3']));
      expect(calls).toEqual([{ path: COUNT, method: 'GET', credentials: 'include' }]);
    });

    it('keeps the same element focused when the count arrives', async () => {
      let release: (response: Response) => void = () => {};
      stubFetch(() => new Promise<Response>(resolve => { release = resolve; }));
      mount(switchableAdapter().adapter, <Probe />);
      const button = screen.getByRole('button');
      button.focus();
      expect(button.textContent).toBe('none');
      await act(async () => { release(countOf(3)); });
      await waitFor(() => expect(screen.getByRole('button').textContent).toBe('count 3'));
      expect(screen.getByRole('button')).toBe(button);
      expect(document.activeElement).toBe(button);
    });

    it('marking a popover row read requests the count again', async () => {
      let unread = 3;
      const calls = stubFetch((path, method) => {
        if (method === 'POST') { unread = 2; return json(notification(ID_A, { read_at: '2026-07-28T00:00:00.000Z' })); }
        if (path === COUNT) return countOf(unread);
        return listOf(notification(ID_A), notification(ID_B));
      });
      mount(switchableAdapter().adapter, <><Probe /><notificationsSlot.Recent /></>);
      const row = await screen.findByTestId(`home-inbox-row-${ID_A}`);
      await screen.findByRole('button', { name: 'count 3' });
      expect(calls.map(c => `${c.method} ${c.path}`)).toContain('GET /api/fo/notifications?limit=10');
      fireEvent.click(within(row).getByRole('button', { name: '읽음으로 표시' }));
      await waitFor(() => expect(calls.map(c => `${c.method} ${c.path}`)).toContain(`POST /api/fo/notifications/${ID_A}/read`));
      await screen.findByRole('button', { name: 'count 2' });
    });

    it.each([
      ['another user', 'user-b'],
      ['the same user after a revision bump', 'user-a'],
    ])('%s: the previous count is gone in the same act', async (_name, nextUser) => {
      const fixture = switchableAdapter('user-a');
      let held: ((response: Response) => void) | null = null;
      let holding = false;
      stubFetch(() => holding ? new Promise<Response>(resolve => { held = resolve; }) : countOf(3));
      mount(fixture.adapter, <Probe />);
      await screen.findByRole('button', { name: 'count 3' });
      await act(async () => { holding = true; fixture.setUser(nextUser); fixture.notify(); });
      expect(screen.getByRole('button').textContent).toBe('none');
      expect(held).not.toBeNull();
      await act(async () => { held!(countOf(5)); });
      await screen.findByRole('button', { name: 'count 5' });
    });

    it('a 401 from the count poll retires the page and the probe in one notification', async () => {
      let lost = false;
      stubFetch(path => {
        if (path === COUNT) return lost ? json({ code: 'auth.session_invalid', message: 'no session' }, 401) : countOf(3);
        return listOf(notification(ID_A));
      });
      const view = mount(switchableAdapter().adapter, <><Notifications /><Probe /></>);
      await screen.findByTestId(`home-inbox-row-${ID_A}`);
      await screen.findByRole('button', { name: 'count 3' });
      const calls = vi.mocked(fetch).mock.calls.length;
      lost = true;
      // The next poll answers 401: refetch the count the way its 60 s interval does.
      await act(async () => { await foQueryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] }); });
      await waitFor(() => expect(onSessionLost).toHaveBeenCalledTimes(1));
      await screen.findByText('세션이 만료되었습니다');
      expect(screen.queryByTestId(`home-inbox-row-${ID_A}`)).toBeNull();
      expect(screen.getByRole('button', { name: /^(none|count)/ }).textContent).toBe('none');
      expect(vi.mocked(fetch).mock.calls.slice(calls).map(([input]) => String(input)).filter(path => /(^|\/)(me|auth)(\/|$|\?)/.test(path))).toEqual([]);
      view.unmount();
    });
  });
});
