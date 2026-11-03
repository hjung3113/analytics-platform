/**
 * Test harness for the feature bridge menus (`@ap/feature-bridge/testing`, test files and `test-support` only; the root never re-exports it, so the production
 * bundle carries no `@testing-library/react`). Each menu's `test-support.tsx` calls `createFeatureMenuHarness` with its own manifests; this package never imports a menu.
 */
import { Suspense, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform, type MenuEntry } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { featureQueryClient } from './feature/session';
import { carrySetId, groupId, menuPermissions, spaceId, type Permission } from '@ap/contracts';

type Group = { id: string; label: { ko: string; en: string }; icon: LucideIcon };

/** First lazy chunk mount can pass the default 1 s `findBy*` timeout under CI load. */
export const LAZY_MOUNT_WAIT = { timeout: 5000 } as const;

/** The shell's detail aside: a `DetailDrawer` portals its content here. */
function SlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}

/** Renders the matched route's page like the shell does, and nothing for a menu the session lacks the permission for (the shell draws its permission state instead). */
function Routes() {
  const { route, can } = usePlatform();
  if (route === null || !menuPermissions(route.menu).every(can)) return null;
  const Page = route.menu.component;
  return Page ? <Suspense fallback={null}><Page key={route.menu.id} params={route.params} /></Suspense> : null;
}

/** The space a harness registry builds: menu paths are canonical under its id (`/flow/…` by default). */
type HarnessSpace = { id: string; label: { ko: string; en: string } };
const FLOW_SPACE: HarnessSpace = { id: 'flow', label: { ko: '업무 흐름', en: 'Workflow' } };

/**
 * A `flow` space (or the given `space`) with one group holding `manifests` (plus the `globalGroups` a manifest may declare, such as 내 Task's `myActivity`), and `mountAt(url)` to render the matched page on a platform with an admin session.
 * `permissions` (default `platform:view` and `features:access`) are the session's. `space` (default `flow`) is the one space the menu paths live under (the 운영 콘솔 `operations` for the access menus). `detailSlot` (default on) adds the shell's detail slot a `DetailDrawer` portals into. `options.registry` mounts a different registry; `options.extra` renders beside the page.
 */
export function createFeatureMenuHarness({ manifests, homeMenuId, group, globalGroups = [], detailSlot = true, permissions = ['platform:view', 'features:access'], space = FLOW_SPACE }: {
  manifests: readonly MenuEntry[]; homeMenuId: string; group: Group; globalGroups?: readonly Group[]; detailSlot?: boolean; permissions?: readonly Permission[]; space?: HarnessSpace;
}) {
  const registry = createRegistry({
    carrySets: [{ id: carrySetId('features'), pageKeys: ['managedSystem', 'returnTo'] }],
    spaces: [{ id: spaceId(space.id), label: space.label, description: { ko: '목적', en: 'Purpose' }, homeMenuId }],
    groups: [{ id: groupId(group.id), label: group.label, icon: group.icon, space: spaceId(space.id) }, ...globalGroups.map(global => ({ id: groupId(global.id), label: global.label, icon: global.icon, space: null }))],
    menus: manifests,
  });
  const session = testSession([...permissions], { user: { id: 'admin', name: 'admin', title: { ko: 'admin', en: 'admin' } } });
  const adapter = () => testAdapter({ session: () => session });

  function mountAt(url: string, options: { registry?: typeof registry; extra?: ReactNode } = {}) {
    window.history.replaceState(null, '', url);
    const page = detailSlot ? <DetailPanelSlotProvider><Routes /><SlotHost /></DetailPanelSlotProvider> : <Routes />;
    return render(<I18nProvider><PlatformProvider adapter={adapter()} registry={options.registry ?? registry}>{page}{options.extra}</PlatformProvider></I18nProvider>);
  }

  return { registry, mountAt };
}

/** Resets the feature session module state so cases do not share one epoch (test files only; not part of the root API). */
export { resetFeatureSessionForTests } from './feature/session';

type FetchMock = { mock: { calls: unknown[][]; results: { type: string; value: unknown }[] } };

/**
 * An observable "the server answered and the screen drew it" signal for an absence assertion: waits until a request whose URL contains `urlPart` (any request
 * when omitted) was made, then until the feature query client has no query in flight (a query settles only after the response body was read and parsed), then
 * runs one timer turn inside `act` so React Query's scheduled observer notification renders. Use it instead of a fixed sleep: a sleep passes on a slow machine
 * before the answer arrives, and the fetch promise alone resolves before the body is consumed.
 */
export async function settleFetch(request: FetchMock, urlPart?: string): Promise<void> {
  const asked = () => request.mock.calls.some(([input]) => urlPart === undefined || String(input).includes(urlPart));
  await waitFor(() => expect(asked()).toBe(true));
  await waitFor(() => expect(featureQueryClient.isFetching()).toBe(0));
  await act(async () => { await new Promise<void>(resolve => { setTimeout(resolve, 0); }); });
  await act(async () => {});
}

/** The button a screen hands the platform page head: found by accessible `name` or by `testId`. */
export type HeadPrimaryActionLocator = { name: string } | { testId: string };
const locateButtons = (locate: HeadPrimaryActionLocator) => ('name' in locate ? screen.queryAllByRole('button', { name: locate.name }) : screen.queryAllByTestId(locate.testId));

/**
 * The shared check of a screen's one primary button (#1291 B2), after `mountAt(...)`.
 * `drawn: true` waits for the button and asserts it sits in the platform page head's `[data-feature-primary-action]` and is the only one on the page.
 * `drawn: false` first awaits `settled` (the signal that the list rendered and the permission answer was consumed, e.g. `settleFetch`; for a menu gate that
 * refuses the page, the lazily imported page) and then asserts no such button is in the head or anywhere; `noSlot` also asserts the slot itself is not drawn.
 */
export async function expectHeadPrimaryAction({ container, locate, drawn, settled, noSlot = false }: {
  container: HTMLElement; locate: HeadPrimaryActionLocator; drawn: boolean; settled?: () => Promise<unknown>; noSlot?: boolean;
}): Promise<void> {
  if (drawn) {
    const button = await ('name' in locate ? screen.findByRole('button', { name: locate.name }, LAZY_MOUNT_WAIT) : screen.findByTestId(locate.testId, undefined, LAZY_MOUNT_WAIT));
    expect(container.querySelector('header [data-feature-primary-action]')?.contains(button)).toBe(true);
    expect(locateButtons(locate)).toHaveLength(1);
    return;
  }
  await settled?.();
  expect(locateButtons(locate)).toHaveLength(0);
  expect(container.querySelector('header [data-feature-primary-action] button')).toBeNull();
  if (noSlot) expect(container.querySelector('[data-feature-primary-action]')).toBeNull();
}
