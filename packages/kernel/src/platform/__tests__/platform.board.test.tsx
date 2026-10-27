import { act, cleanup, render } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { PaneScreenProvider, PlatformProvider, useHostPlatform, useRecentVisits } from '../platform';
import { createRegistry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';
import { groupId, spaceId, type UsageEvent } from '@ap/contracts';

const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'main' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }],
  menus: [
    { id: 'main', group: groupId('equipment'), primary: true, label: { ko: '본', en: 'Main' }, description: { ko: '', en: '' }, path: '/main', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features, pageKeys: [] },
    { id: 'boards', group: groupId('equipment'), label: { ko: '보드들', en: 'Boards' }, description: { ko: '', en: '' }, path: '/boards', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features, pageKeys: [] },
  ],
});

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    vi.stubGlobal(name, memoryStorage());
  }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Platform = ReturnType<typeof useHostPlatform>;
let seen: Platform | null = null;
let paneSeen: Platform | null = null;
let seenRecent: ReturnType<typeof useRecentVisits> | null = null;
function Probe() { seen = useHostPlatform(); seenRecent = useRecentVisits(); return null; }
function PaneProbe() { paneSeen = useHostPlatform(); return null; }

function mountAt(url: string) {
  window.history.replaceState(null, '', url);
  const events: UsageEvent[] = [];
  const session = testSession(['platform:view']);
  const adapter = testAdapter({ session: () => session, recordUsage: async batch => { events.push(...batch); return { accepted: batch.length }; } });
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe />
    <PaneScreenProvider paneId="p" screen={{ menuId: 'main', params: {}, query: '' }} onChange={() => {}} onLeave={() => {}}><PaneProbe /></PaneScreenProvider>
  </PlatformProvider></I18nProvider>);
  return { events };
}
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 10)); }); };

describe('/board is a platform screen (#497, docs/16 §7)', () => {
  it('is neither not-found nor a contract error, has an empty main Context, and leaves pane screens out of it', async () => {
    mountAt('/board?sheet=s1');
    await flush();
    expect(seen!.platformScreen).toBe('board');
    expect(seen!.route).toBeNull();
    expect(seen!.contractError).toBeNull();
    expect(seen!.global.scopeId).toBeNull();
    expect(paneSeen!.platformScreen).toBeNull();
  });

  it('writes no recent entry, space-last URL or usage event for the board screen', async () => {
    const { events } = mountAt('/board?sheet=s1');
    await flush();
    expect(seenRecent).toEqual([]);
    expect(sessionStorage.getItem(`platform:space-last:${seen!.user.id}`)).toBeNull();
    expect(events.filter(e => e.source !== 'board')).toEqual([]);
  });

  it('a menu screen is not a platform screen, and /boards (a different segment) stays an ordinary menu', async () => {
    mountAt('/boards');
    await flush();
    expect(seen!.platformScreen).toBeNull();
    expect(seen!.route?.menu.id).toBe('boards');
  });

  it('arriving at /board keeps its page-arrival focus request instead of cancelling it', async () => {
    mountAt('/main');
    await flush();
    act(() => { seen!.navigate('/board?sheet=s1', { focus: 'page' }); });
    await flush();
    expect(seen!.platformScreen).toBe('board');
    expect(seen!.pageNavigation.consume('/board')).toBe('page');
  });

  it('an unknown menu path is still not-found, not a platform screen', async () => {
    mountAt('/nope');
    await flush();
    expect(seen!.platformScreen).toBeNull();
    expect(seen!.route).toBeNull();
  });
});

describe('a second reader of a pane that opts out of usage (the board Context bar, #497)', () => {
  it('counts one stay for the pane, not two', async () => {
    window.history.replaceState(null, '', '/board?sheet=s1');
    const events: UsageEvent[] = [];
    const session = testSession(['platform:view']);
    const adapter = testAdapter({ session: () => session, recordUsage: async batch => { events.push(...batch); return { accepted: batch.length }; } });
    const screen = { menuId: 'main', params: {}, query: '' };
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <PaneScreenProvider paneId="p" screen={screen} onChange={() => {}} onLeave={() => {}}><PaneProbe /></PaneScreenProvider>
      <PaneScreenProvider paneId="p" screen={screen} countUsage={false} onChange={() => {}} onLeave={() => {}}><PaneProbe /></PaneScreenProvider>
    </PlatformProvider></I18nProvider>);
    await flush();
    expect(events.filter(e => e.name === 'entry' && e.source === 'board')).toHaveLength(1);
  });
});
