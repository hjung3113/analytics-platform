import { act, lazy } from 'react';
import { Inbox } from 'lucide-react';
import { createRoot, type Root } from 'react-dom/client';
import { useQuery } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_FEATURES, contextCapabilities, carrySetId, groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { fetchNavCounts } from '@/lib/api/nav';
import { NAV_COUNTS_QUERY_KEY, invalidateNavCounts } from '@/lib/query/navCounts';
import { setFeatureApi } from './feature-api';
import { featureQueryClient } from './fo/session';
import { navCountsSlot } from './nav-counts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SPACE = spaceId('operations');
const GROUP = groupId('voc');
const registry = createRegistry({
  carrySets: [{ id: carrySetId('features'), pageKeys: ['managedSystem'] }],
  spaces: [{ id: SPACE, label: { ko: 'FeedbackOps', en: 'FeedbackOps' }, description: { ko: '목적', en: 'Purpose' }, permission: 'features:access', homeMenuId: 'inbox' }],
  groups: [{ id: GROUP, label: { ko: 'VOC', en: 'VOC' }, icon: Inbox, space: SPACE }],
  menus: [{
    id: 'inbox', primary: true, group: GROUP, label: { ko: '수신함', en: 'Inbox' }, description: { ko: '수신함', en: 'Inbox' },
    path: '/operations/inbox', icon: Inbox, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['managedSystem'], carrySet: carrySetId('features'), component: lazy(async () => ({ default: () => null })),
  }],
});

const Counts = navCountsSlot.For(SPACE, registry.menuById('inbox'))!;

/** What a FeedbackOps screen does (TriageScreen): an active observer of the same key on the shared client. */
function ScreenObserver() {
  useQuery({ queryKey: [...NAV_COUNTS_QUERY_KEY, undefined] as const, queryFn: ({ signal }) => fetchNavCounts({ signal }), retry: false }, featureQueryClient);
  return null;
}

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); featureQueryClient.clear(); setFeatureApi({ basePath: '/api/features', onSessionLost: vi.fn() }); });
afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null;
  host = null;
  setFeatureApi(null);
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('navCounts slot with an active FeedbackOps observer on the same key', () => {
  it('shows the refetched value after a triage-style invalidateNavCounts, never null in between', async () => {
    let n = 1;
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ counts: { 'voc.inbox': n } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const seen: Array<Record<string, number> | null> = [];
    window.history.replaceState(null, '', '/operations/inbox');
    const session = testSession(['platform:view', 'features:access'], { user: { id: 'admin', name: 'admin', title: { ko: 'admin', en: 'admin' } } });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <I18nProvider>
          <PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}>
            <ScreenObserver />
            <Counts>{counts => { seen.push(counts); return <p data-testid="counts">{JSON.stringify(counts)}</p>; }}</Counts>
          </PlatformProvider>
        </I18nProvider>,
      );
    });
    const text = () => host!.querySelector('[data-testid="counts"]')!.textContent;
    await act(async () => { await vi.waitFor(() => expect(text()).toBe('{"inbox":1}')); });
    expect(calls).toEqual(['/api/features/nav/counts']);
    n = 2;
    seen.length = 0;
    await act(async () => { invalidateNavCounts(featureQueryClient); });
    await act(async () => { await vi.waitFor(() => expect(text()).toBe('{"inbox":2}')); });
    expect(seen.filter(counts => counts === null)).toEqual([]);
    expect(calls).toEqual(['/api/features/nav/counts', '/api/features/nav/counts']);
  });

  it('maps surveys.all to the Survey 관리 menu (survey-management), next to findings.all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ counts: { 'findings.all': 3, 'surveys.all': 7 } }), { status: 200, headers: { 'content-type': 'application/json' } })));
    window.history.replaceState(null, '', '/operations/inbox');
    const session = testSession(['platform:view', 'features:access'], { user: { id: 'admin', name: 'admin', title: { ko: 'admin', en: 'admin' } } });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <I18nProvider>
          <PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}>
            <Counts>{counts => <p data-testid="counts">{JSON.stringify(counts)}</p>}</Counts>
          </PlatformProvider>
        </I18nProvider>,
      );
    });
    await act(async () => { await vi.waitFor(() => expect(host!.querySelector('[data-testid="counts"]')!.textContent).toBe('{"findings":3,"survey-management":7}')); });
  });
});
