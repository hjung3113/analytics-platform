// #1291 B2 — the real Milestones screen through the bridge: Milestone 생성 is drawn in the platform page head, once, and not in the toolbar; a user without features:access gets no page.
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { ClipboardList, UserRound } from 'lucide-react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuEntry } from '@ap/kernel';
import { memoryStorage } from '@ap/kernel/testing';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { createFeatureMenuHarness, LAZY_MOUNT_WAIT } from '@ap/feature-bridge/testing';
import { manifests } from '../index';
import { mountAt } from '../test-support';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
/** Same hidden 내 활동 stand-in as `test-support`, so a harness without `features:access` can be built here. */
const myActivityStub: MenuEntry = { ...manifests.find((menu) => menu.id === 'my-tasks')!, id: 'my-activity-stub', primary: true, navHidden: true, path: '/my-activity-stub', pageKeys: [], carrySet: undefined };
const MILESTONES = '/operations/milestones';

function installFetch() {
  const request = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/api/features/me')) return json({ actor: { id: 'a1', external_id: 'a1', email: 'a@x', display_name: 'Admin', role_level: 'admin' }, workspace_id: 'w1' });
    return json({ items: [], total: 0 });
  });
  vi.stubGlobal('fetch', request);
  return request;
}

beforeAll(() => import('./FeatureMilestones'), 60_000);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
});
afterEach(() => { cleanup(); setFeatureApi(null); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('Milestone 생성 through the bridge', () => {
  it('is drawn once in the page head, not in the toolbar, and opens the create block', async () => {
    installFetch();
    const { container } = mountAt(MILESTONES);
    const button = await screen.findByRole('button', { name: 'Milestone 생성' }, LAZY_MOUNT_WAIT);
    expect(container.querySelector('header [data-feature-primary-action]')?.contains(button)).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Milestone 생성' })).toHaveLength(1);
    fireEvent.click(button);
    expect(await screen.findByRole('complementary', { name: '상세 패널' })).toBeTruthy();
  });

  it('is absent for a user without features:access (the menu gate refuses the page)', async () => {
    const request = installFetch();
    const { mountAt: mountPlain } = createFeatureMenuHarness({ manifests: [...manifests, myActivityStub], homeMenuId: 'tasks', globalGroups: [{ id: 'myActivity', label: { ko: '내 활동', en: 'My activity' }, icon: UserRound }], group: { id: 'tasks', label: { ko: 'Tasks', en: 'Tasks' }, icon: ClipboardList }, permissions: ['platform:view'] });
    const { container } = mountPlain(MILESTONES);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole('button', { name: 'Milestone 생성' })).toBeNull();
    expect(container.querySelector('[data-feature-primary-action]')).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
