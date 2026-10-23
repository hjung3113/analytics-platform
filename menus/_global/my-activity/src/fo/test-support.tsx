/** Fixtures shared by the FeedbackOps bridge tests (page and notifications slot). */
import { Suspense, useState } from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { UserRound } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, type MenuEntry } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import Notifications from '../pages/Notifications';
import { groupId, spaceId } from '@ap/contracts';

// The real manifests in their global group; a space needs one menu of its own, so a filler stands in for it.
const filler = { ...manifests[1]!, primary: true, id: 'filler', group: 'noticeVoc', path: '/filler' } as MenuEntry;
export const registry = createRegistry({
  spaces: [{ id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'filler' }],
  groups: [
    { id: groupId('myActivity'), label: { ko: '내 활동', en: 'My activity' }, icon: UserRound, space: null },
    { id: groupId('noticeVoc'), label: { ko: '공지·VOC', en: 'Notice·VOC' }, icon: UserRound, space: spaceId('analytics') },
  ],
  menus: [...manifests, filler],
});

export const ID_A = '11111111-1111-4111-8111-111111111111';
export const ID_B = '22222222-2222-4222-8222-222222222222';

export function notification(id: string, over: Record<string, unknown> = {}) {
  return {
    id, event_type: 'voc.assigned_to_me', subject_type: 'voc', subject_id: id, summary: `VOC 담당자로 지정되었습니다 (${id.slice(0, 2)}).`,
    detail: { voc_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }, created_at: '2026-07-27T00:00:00.000Z', read_at: null, archived_at: null, ...over,
  };
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
export const listOf = (...items: unknown[]) => json({ items, page: { has_more: false }, unread_count: items.length });

export type Call = { path: string; method: string; credentials: RequestCredentials | undefined };

/** Stubs `fetch`: `handle` answers by path; every request is recorded. */
export function stubFetch(handle: (path: string, method: string, calls: Call[]) => Response | Promise<Response>) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { path: String(input), method: init?.method ?? 'GET', credentials: init?.credentials };
    calls.push(call);
    return handle(call.path, call.method, calls);
  }));
  return calls;
}

/** An adapter whose session the test can replace; `notify` announces the change (the Kernel bumps `revision`). */
export function switchableAdapter(initialUser = 'user-a') {
  const listeners = new Set<() => void>();
  let session = testSession(['platform:view'], { user: { id: initialUser, name: initialUser, title: { ko: initialUser, en: initialUser } } });
  const adapter = testAdapter({ session: () => session, subscribe: onChange => { listeners.add(onChange); return () => { listeners.delete(onChange); }; } });
  return {
    adapter,
    setUser: (id: string) => { session = testSession(['platform:view'], { user: { id, name: id, title: { ko: id, en: id } } }); },
    notify: () => { for (const listener of [...listeners]) listener(); },
  };
}

export function ToastProbe() {
  const { toasts } = usePlatform();
  return <ul aria-label="toasts">{toasts.map(t => <li key={t.id} data-tone={t.tone}>{t.text}</li>)}</ul>;
}

export function Harness() {
  const [shown, setShown] = useState(true);
  return <>
    <button type="button" onClick={() => setShown(value => !value)}>toggle</button>
    <ToastProbe />
    {shown && <Notifications />}
  </>;
}

export function mount(adapter: ReturnType<typeof testAdapter>) {
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Harness /></PlatformProvider></I18nProvider>);
}

/** Renders the matched route's page component like the shell does (params included). */
export function TestRoutes() {
  const { route } = usePlatform();
  if (route === null) return null;
  const Page = route.menu.component;
  return Page ? <Suspense fallback={null}><Page key={route.menu.id} params={route.params} /></Suspense> : null;
}

/** Mounts the platform at `url` (the real manifests, so path params and `returnTo` resolve as in the app). */
export function mountAt(adapter: ReturnType<typeof testAdapter>, url: string) {
  window.history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><ToastProbe /><TestRoutes /></PlatformProvider></I18nProvider>);
}
