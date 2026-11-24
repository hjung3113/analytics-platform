import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { FeatureDetailDrawer } from '@ap/feature-bridge';
import { setFeatureApi } from '@ap/feature-bridge/feature-api';
import { LAZY_MOUNT_WAIT } from '@ap/feature-bridge/testing';
import { memoryStorage } from '@ap/kernel/testing';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { mountAt, warmPages } from '../../test-support';

vi.mock('@ap/feature-bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ap/feature-bridge')>();
  return { ...actual, FeatureDetailDrawer: vi.fn(actual.FeatureDetailDrawer) };
});

const SYSTEM = '33333333-3333-4333-8333-333333333333';
const BLOCKED_SYSTEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FINDING = {
  id: '99999999-9999-4999-8999-99999999999a',
  workspace_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  display_id: 'FND-101',
  primary_managed_system_id: SYSTEM,
  title: 'Pump fault',
  summary: 'Pump fault summary',
  source_type: 'voc_cluster',
  source_id: '22222222-2222-4222-8222-222222222222',
  owner_actor_id: null,
  owner_team_id: null,
  evidence_count: 0,
  severity: 'high',
  confidence: 'medium',
  status: 'active',
  analytics_area_id: null,
  linked_task_id: null,
  linked_milestone_id: null,
  created_by: SYSTEM,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  source: null,
};
const PATH = '/flow/findings';
const request = vi.fn(async (input: RequestInfo | URL) => {
  const { pathname, searchParams } = new URL(String(input), window.location.origin);
  if (pathname.endsWith('/findings')) {
    if (searchParams.get('managed_system_id') === BLOCKED_SYSTEM) {
      return Response.json({ code: 'permission.denied', message: 'denied', detail: { reason: 'role_required' } }, { status: 403 });
    }
    return Response.json({ items: [FINDING], page: { total: 1, has_more: false } });
  }
  if (pathname.endsWith(`/findings/${FINDING.id}`)) return Response.json(FINDING);
  return Response.json({ items: [], actors: [] });
});

beforeAll(warmPages, 60_000);
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('fetch', request);
  request.mockClear();
  vi.mocked(FeatureDetailDrawer).mockClear();
  setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setFeatureApi(null);
  window.history.replaceState(null, '', '/');
});

async function openFinding() {
  mountAt(PATH);
  fireEvent.click(await screen.findByText(FINDING.title, undefined, LAZY_MOUNT_WAIT));
  return screen.findByRole('button', { name: '상세 닫기' });
}

it('moves focus to the list denial card after an expanded Finding closes', async () => {
  const nativeFocus = HTMLElement.prototype.focus;
  // JSDOM allows focus in an inert subtree. A browser ignores that call.
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options) {
    if (!this.closest('[inert]')) nativeFocus.call(this, options);
  });
  await openFinding();
  fireEvent.click(screen.getByRole('button', { name: '크게 보기' }));
  (await screen.findByRole('button', { name: '원래 크기로' })).focus();
  const body = document.querySelector('[data-platform-page-body]')!;
  expect(body.hasAttribute('inert')).toBe(true);
  window.history.replaceState(null, '', `${PATH}?focus=${FINDING.id}&managedSystem=${BLOCKED_SYSTEM}`);
  act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });

  const heading = await screen.findByRole('heading', { name: '전체 Finding', level: 2 });
  const card = heading.closest('[tabindex="-1"]')!;
  const target = card.querySelector('a[href], button:not([disabled])') ?? card;
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(body.hasAttribute('inert')).toBe(false);
  await waitFor(() => expect(document.activeElement === target, `Focused ${document.activeElement?.tagName}`).toBe(true));
});

it('keeps the drawer focus ref and leaves focus on the list during search and filter changes', async () => {
  const close = await openFinding();
  const initialFocus = vi.spyOn(close, 'focus');
  const drawerCalls = vi.mocked(FeatureDetailDrawer).mock.calls;
  const firstRef = drawerCalls.at(-1)?.[0].listFocusRef;
  const search = screen.getByPlaceholderText('제목 또는 ID');
  const askedFor = (key: string, value: string) => request.mock.calls.some(([input]) => {
    const url = new URL(String(input), window.location.origin);
    return url.pathname.endsWith('/findings') && url.searchParams.get(key) === value;
  });
  for (const term of ['pump', 'pump fault']) {
    search.focus();
    fireEvent.change(search, { target: { value: term } });
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => expect(askedFor('q', term)).toBe(true));
    expect(document.activeElement).toBe(search);
  }
  const filter = screen.getByRole('checkbox', { name: '진행 중' });
  filter.focus();
  fireEvent.click(filter);
  await waitFor(() => expect(askedFor('status', 'active')).toBe(true));
  await within(document.querySelector<HTMLElement>('[data-platform-page-body]')!).findByText(FINDING.title);
  expect(document.activeElement).toBe(filter);
  expect(screen.getByRole('button', { name: '상세 닫기' })).toBe(close);
  expect(initialFocus).not.toHaveBeenCalled();
  expect(firstRef).toBeDefined();
  expect(drawerCalls.every(([props]) => props.listFocusRef === firstRef)).toBe(true);
});
