// #1291 B2 — the real Milestones screen through the bridge: Milestone 생성 is drawn in the platform page head, once, and not in the toolbar; a user without features:access gets no page.
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { ClipboardList, UserRound } from 'lucide-react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { MenuEntry } from '@ap/kernel';
import { memoryStorage } from '@ap/kernel/testing';
import { featureQueryClient } from '@ap/feature-bridge';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { createFeatureMenuHarness, expectHeadPrimaryAction, settleFetch } from '@ap/feature-bridge/testing';
import { manifests } from '../index';
import { mountAt } from '../test-support';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
/** Same hidden 내 활동 stand-in as `test-support`, so a harness without `features:access` can be built here. */
const myActivityStub: MenuEntry = { ...manifests.find((menu) => menu.id === 'my-tasks')!, id: 'my-activity-stub', primary: true, navHidden: true, path: '/my-activity-stub', pageKeys: [], carrySet: undefined };
const MILESTONES = '/flow/milestones';

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
    await expectHeadPrimaryAction({ container, locate: { name: 'Milestone 생성' }, drawn: true });
    const button = screen.getByRole('button', { name: 'Milestone 생성' });
    fireEvent.click(button);
    expect(await screen.findByRole('complementary', { name: '상세 패널' })).toBeTruthy();
  });

  it('is absent for a user without features:access (the menu gate refuses the page)', async () => {
    const request = installFetch();
    const { mountAt: mountPlain } = createFeatureMenuHarness({ manifests: [...manifests, myActivityStub], homeMenuId: 'tasks', globalGroups: [{ id: 'myActivity', label: { ko: '내 활동', en: 'My activity' }, icon: UserRound }], group: { id: 'tasks', label: { ko: 'Tasks', en: 'Tasks' }, icon: ClipboardList }, permissions: ['platform:view'] });
    const { container } = mountPlain(MILESTONES);
    // Nothing is requested for a refused page, so the signal is the (already imported) page chunk having had its chance to mount.
    await expectHeadPrimaryAction({ container, locate: { name: 'Milestone 생성' }, drawn: false, noSlot: true, settled: async () => { await import('./FeatureMilestones'); await act(async () => {}); } });
    expect(request).not.toHaveBeenCalled();
  });
});

it.each(['without', 'with'] as const)('keeps a cross-System creation selected %s a cached arrival denial', async (cache) => {
  const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  onTestFinished(() => {
    if (scroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scroll);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  });
  const source = '11111111-1111-4111-8111-111111111111';
  const arrival = '22222222-2222-4222-8222-222222222222';
  const date = '2026-07-10T00:00:00.000Z';
  const created = {
    id: '33333333-3333-4333-8333-333333333333', workspace_id: source,
    display_id: 'MLS-1099', title: 'Launch review hardening', why: 'Prepare the launch.',
    primary_managed_system_id: arrival, status: 'planning', owner_actor_id: arrival,
    analytics_area_id: null, start_date: '2026-08-01', target_date: '2026-09-01',
    created_by: arrival, created_at: date, updated_at: date,
    progress: { released_done: 0, in_flight: 0, queued: 0, total: 0, percent: 0 },
  };
  const blocked = { state: 'blocked_non_requestable', decision: { allow: false } };
  let sourceAllowed = true;
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), window.location.origin);
    const path = url.pathname.replace('/api/features', '');
    const system = url.searchParams.get('managed_system_id');
    if (path === '/me') return json({ actor: { id: arrival, external_id: 'dev', email: 'dev@example.test', display_name: 'Developer', role_level: 'developer' }, workspace_id: source });
    if (path === '/me/permissions/check') {
      return json(system === source && !sourceAllowed ? blocked : { state: 'approved', decision: { allow: true } });
    }
    if (path === '/managed-systems') return json({ items: [source, arrival].map((id) => ({
      id, workspace_id: source, slug: id === source ? 'source' : 'arrival',
      name: id === source ? 'Source System' : 'Arrival System', archived_at: null,
      external_key: null, default_owner_actor_id: null, default_owner_team_id: null,
      default_reviewer_actor_id: null, default_reviewer_team_id: null,
      archived_by_actor_id: null, created_at: date, updated_at: date,
    })), total: 2 });
    if (path === '/milestones' && init?.method === 'POST') return json(created);
    if (path === '/milestones') return json({ items: system === arrival && cache === 'without' ? [created] : [] });
    if (path === `/milestones/${created.id}`) return json({ ...created, source_finding: null });
    return json({ items: [], total: 0 });
  });
  vi.stubGlobal('fetch', request);
  mountAt(`${MILESTONES}?managedSystem=${source}`);
  await settleFetch(request, 'capability=finding.manage');
  fireEvent.click(screen.getByRole('button', { name: 'Milestone 생성' }));
  fireEvent.click(await screen.findByRole('combobox', { name: '시스템' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Arrival System' }));
  for (const [label, value] of ([
    ['제목', created.title], ['이 Milestone의 목적', created.why],
    ['시작일', created.start_date], ['목표일', created.target_date],
  ] as const)) fireEvent.change(await screen.findByLabelText(label), { target: { value } });

  sourceAllowed = false;
  await act(async () => {
    await featureQueryClient.invalidateQueries({ queryKey: ['permission-check', 'finding.manage', source] });
  });
  await screen.findByText('Milestone 목록을 볼 권한이 없습니다.');
  if (cache === 'with') {
    featureQueryClient.setQueryData(['milestones', 'list', arrival, 'all'], { items: [] });
    featureQueryClient.setQueryData(['milestones', 'counts', arrival], { items: [] });
    featureQueryClient.setQueryData(['permission-check', 'finding.manage', arrival], blocked);
  }

  const sourceUrl = window.location.pathname + window.location.search;
  const push = vi.spyOn(window.history, 'pushState');
  const replace = vi.spyOn(window.history, 'replaceState');
  onTestFinished(() => { push.mockRestore(); replace.mockRestore(); });
  fireEvent.click(screen.getByRole('button', { name: '생성' }));
  await settleFetch(request, `/milestones?managed_system_id=${arrival}`);
  expect(Object.fromEntries(new URLSearchParams(window.location.search))).toMatchObject({
    managedSystem: arrival, focus: created.id,
  });
  await settleFetch(request, `/milestones/${created.id}`);
  const detail = await screen.findByTestId('milestone-detail-scroll');
  expect(detail).toBeTruthy();
  expect(await within(detail).findByRole('heading', { name: created.title })).toBeTruthy();
  expect(push.mock.calls.map(([, , url]) => url)).toEqual([window.location.pathname + window.location.search]);
  // The kernel records outgoing history metadata using the same source URL.
  expect(replace.mock.calls.every(([, , url]) => url === sourceUrl)).toBe(true);
});
