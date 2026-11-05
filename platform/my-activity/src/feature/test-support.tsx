/** Fixtures shared by the feature bridge tests (page and notifications slot). */
import { Suspense, useState } from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { UserRound } from 'lucide-react';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, type MenuEntry, type Registry } from '@ap/kernel';
import { testAdapter, testSession, ToastProbe } from '@ap/kernel/testing';
import { manifests } from '../index';
import Notifications from '../pages/Notifications';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { groupId, spaceId, type Permission } from '@ap/contracts';

// The real manifests in their global groups (내 활동, 소통); a space needs one menu of its own, so a filler in its own group stands in for it.
const filler = { ...manifests.find(m => m.id === 'surveys')!, primary: true, id: 'filler', group: 'filler', path: '/filler', aliases: undefined } as MenuEntry;
// 소통 needs its one primary menu; the real 공지 lives in `@ap/menu-notice-voc`, so a stand-in primary takes its place.
const notices = { ...filler, id: 'notices', group: 'noticeVoc', path: '/notices', component: undefined } as MenuEntry;
// The operator inbox, the destination of 소통 › VOC's 「업무 흐름에서 처리」 link: gated like the real `inbox` (`features:access`) and declaring `focus` and `returnTo`.
const inbox = { ...filler, primary: false, id: 'inbox', path: '/flow/inbox', permission: 'features:access', pageKeys: ['focus', 'returnTo'] } as MenuEntry;
// The 개선 아이템 detail (`@ap/menu-improvement-items` manifest shape; that package is not a dependency here), the destination of an `improvement.assigned_to_me` deep link.
const improvementGroup = { id: groupId('improvementItems'), label: { ko: '개선 아이템', en: 'Improvement items' }, icon: UserRound, space: null };
const improvementItems = { ...filler, primary: true, id: 'improvement-items', group: groupId('improvementItems'), path: '/improvement-items' } as MenuEntry;
const improvementItem = { ...filler, primary: false, id: 'improvement-item', parent: 'improvement-items', navHidden: true, group: groupId('improvementItems'), path: '/improvement-items/:itemId', pageKeys: ['returnTo'] } as MenuEntry;

const SPACES = [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'filler' }];
const GROUPS = [
  { id: groupId('myActivity'), label: { ko: '내 활동', en: 'My activity' }, icon: UserRound, space: null },
  { id: groupId('noticeVoc'), label: { ko: '소통', en: 'Communication' }, icon: UserRound, space: null },
  { id: groupId('filler'), label: { ko: '채움', en: 'Filler' }, icon: UserRound, space: spaceId('mars') },
];
const MENUS = [...manifests, filler, notices, inbox];

export const registry = createRegistry({ spaces: SPACES, groups: GROUPS, menus: MENUS });

/** `registry` plus the 개선 아이템 menus, for tests that link into the improvement detail. */
export const improvementRegistry = createRegistry({
  spaces: SPACES,
  groups: [...GROUPS, improvementGroup],
  menus: [...MENUS, improvementItems, improvementItem],
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
export function switchableAdapter(initialUser = 'user-a', permissions: Permission[] = ['platform:view']) {
  const listeners = new Set<() => void>();
  let session = testSession(permissions, { user: { id: initialUser, name: initialUser, title: { ko: initialUser, en: initialUser } } });
  const adapter = testAdapter({ session: () => session, subscribe: onChange => { listeners.add(onChange); return () => { listeners.delete(onChange); }; } });
  return {
    adapter,
    setUser: (id: string) => { session = testSession(permissions, { user: { id, name: id, title: { ko: id, en: id } } }); },
    notify: () => { for (const listener of [...listeners]) listener(); },
  };
}

export function Harness() {
  const [shown, setShown] = useState(true);
  return <>
    <button type="button" onClick={() => setShown(value => !value)}>toggle</button>
    <ToastProbe />
    {shown && <Notifications />}
  </>;
}

export function mount(adapter: ReturnType<typeof testAdapter>, withRegistry: Registry = registry) {
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={withRegistry}><Harness /></PlatformProvider></I18nProvider>);
}

/** Renders the matched route's page component like the shell does (params included). */
export function TestRoutes() {
  const { route } = usePlatform();
  if (route === null) return null;
  const Page = route.menu.component;
  return Page ? <Suspense fallback={null}><Page key={route.menu.id} params={route.params} /></Suspense> : null;
}

/** The shell's docked detail slot, where `DetailDrawer` portals its content. */
function DetailSlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}

/** Mounts the platform at `url` (the real manifests, so path params and `returnTo` resolve as in the app), with the detail slot a page may open into. */
export function mountAt(adapter: ReturnType<typeof testAdapter>, url: string) {
  window.history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><ToastProbe /><TestRoutes /><DetailSlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
}
