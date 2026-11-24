import { useState } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, useHostPlatform, useQueryEngine } from '../platform';
import type { QueryEngine } from '../../query/query-engine';
import { createRegistry, type MenuEntry, type PlatformMenuEntry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace, testScreen } from '../../testing';
import { defineEndpoint, groupId, menuPermission, spaceId, type MenuQuery, type Permission, type Session, type UsageEvent } from '@ap/contracts';
import { useMenuQuery } from '../../query/query';

// A synthetic ungated global menu needs C (`console:access`, its primary) AND F (`features:access`, additional).
// No space gate exists to mask the extra grant, so each single-grant actor is denied by that branch alone.
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const base = { icon: House, component: testScreen, requiresScope: false, context: noContext, pageType: 'management', features: noFeatures, pageKeys: [], description: { ko: '', en: '' } } as const;
const menu = (over: Partial<PlatformMenuEntry> & Pick<PlatformMenuEntry, 'id' | 'path' | 'permission'>): MenuEntry => ({ group: groupId('utility'), label: { ko: over.id, en: over.id }, ...base, ...over });
const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [testSpace({ id: spaceId('mars'), homeMenuId: 'mars-home' })],
  groups: [
    { id: groupId('utility'), label: { ko: '유틸', en: 'Utility' }, icon: House, space: null },
    { id: groupId('home'), label: { ko: '홈', en: 'Home' }, icon: House, space: spaceId('mars') },
  ],
  menus: [
    menu({ id: 'mars-home', path: '/mars-home', permission: 'platform:view', group: groupId('home'), primary: true }),
    menu({ id: 'both', path: '/both', permission: 'console:access', additionalPermissions: ['features:access'], primary: true }),
    menu({ id: 'plain', path: '/plain', permission: 'platform:view' }),
  ],
});

const F: Permission = 'features:access';
const C: Permission = 'console:access';
const MATRIX: ReadonlyArray<[string, Session['user']['permissions'], boolean]> = [
  ['neither', ['platform:view'], false],
  ['F only', ['platform:view', F], false],
  ['C only', ['platform:view', C], false],
  ['F and C', ['platform:view', F, C], true],
];

function Probe() {
  const { canOpen, globalMenus, resolveLink, route, readRecent } = useHostPlatform();
  const [, tick] = useState(0);
  return <div>
    <p data-testid="open">{String(canOpen('both'))}</p>
    <p data-testid="listed">{globalMenus.map(m => m.id).join(',')}</p>
    <p data-testid="allowed">{String(resolveLink('both').allowed)}</p>
    <p data-testid="route">{route?.menu.id ?? 'none'}</p>
    <p data-testid="recent">{readRecent().map(r => r.menuId).join(',')}</p>
    <button type="button" data-testid="tick" onClick={() => tick(n => n + 1)}>tick</button>
  </div>;
}

function mount(url: string, permissions: Session['user']['permissions'], events: UsageEvent[] = []) {
  window.history.replaceState(null, '', url);
  const session = testSession(permissions);
  const adapter = testAdapter({ session: () => session, recordUsage: async batch => { events.push(...batch); return { accepted: batch.length }; } });
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
}

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('additionalPermissions are ANDed with the primary permission', () => {
  it.each(MATRIX)('%s: canOpen, resolveLink.allowed and the global list agree', (_name, permissions, open) => {
    mount('/plain', permissions);
    expect(screen.getByTestId('open').textContent).toBe(String(open));
    expect(screen.getByTestId('allowed').textContent).toBe(String(open));
    expect(screen.getByTestId('listed').textContent?.split(',').includes('both')).toBe(open);
  });

  it.each(MATRIX)('%s: a direct URL is recorded as a recent visit only with both grants', (_name, permissions, open) => {
    mount('/both', permissions);
    act(() => screen.getByTestId('tick').click());
    expect(screen.getByTestId('route').textContent).toBe('both');
    expect(screen.getByTestId('recent').textContent === 'both').toBe(open);
  });

  it.each(MATRIX)('%s: usage entry is sent only with both grants', async (_name, permissions, open) => {
    vi.useFakeTimers();
    const events: UsageEvent[] = [];
    mount('/both', permissions, events);
    await act(async () => { vi.advanceTimersByTime(0); await Promise.resolve(); });
    vi.useRealTimers();
    expect(events.some(e => e.menuId === 'both')).toBe(open);
  });

  it('a menu with a single grant keeps its one-grant behaviour', () => {
    mount('/plain', ['platform:view']);
    expect(screen.getByTestId('listed').textContent).toBe('plain');
  });

  it('revoking one grant mid-session closes the menu again', async () => {
    let session = testSession(['platform:view', F, C]);
    const listeners = new Set<() => void>();
    window.history.replaceState(null, '', '/plain');
    const adapter = testAdapter({ session: () => session, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; } });
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
    expect(screen.getByTestId('open').textContent).toBe('true');
    session = testSession(['platform:view', C]);
    await act(async () => { for (const l of listeners) l(); });
    expect(screen.getByTestId('open').textContent).toBe('false');
  });
  it('revoking the open menu\'s grant mid-session (same user) closes it and leaves no earlier-generation query result (#2895)', async () => {
    let session = testSession(['platform:view', F, C]);
    const listeners = new Set<() => void>();
    const requests: MenuQuery[] = [];
    const endpoint = defineEndpoint<Record<string, never>, number>({
      id: 'both.list', menuId: 'both', paramKeys: {}, permission: 'platform:view', requiresScope: false,
      context: {}, kinds: ['collection'], mergeTimeDomain: false,
    });
    let engine!: QueryEngine;
    function QueryProbe() {
      engine = useQueryEngine();
      const q = useMenuQuery(endpoint, {});
      return <p data-testid="query">{q.status}:{q.response?.outcome === 'ok' ? q.response.data : '-'}</p>;
    }
    window.history.replaceState(null, '', '/both');
    const adapter = testAdapter({
      session: () => session,
      subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; },
      menuQuery: async request => {
        requests.push(request);
        return { outcome: 'ok', data: requests.length, assessments: [{ kind: 'collection', state: 'clear' }], trust: null, correlationId: `r${requests.length}` };
      },
    });
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /><QueryProbe /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('done:1')).toBeTruthy();
    expect(screen.getByTestId('listed').textContent?.split(',')).toContain('both');
    const before = engine.gen;
    expect(engine.client.getQueryCache().findAll().map(q => q.queryKey[1])).toContain(before);

    // Same user id, one grant fewer: the server's next session snapshot after a revocation.
    session = testSession(['platform:view', C]);
    await act(async () => { for (const l of listeners) l(); });
    expect(screen.getByTestId('open').textContent).toBe('false');
    expect(screen.getByTestId('allowed').textContent).toBe('false');
    expect(screen.getByTestId('listed').textContent?.split(',')).not.toContain('both');
    // The earlier generation's answer is gone from memory, not only hidden behind a new key.
    expect(engine.gen).not.toBe(before);
    expect(engine.client.getQueryCache().findAll().map(q => q.queryKey[1])).not.toContain(before);
    expect(screen.getByTestId('query').textContent).not.toBe('done:1');
  });
});
