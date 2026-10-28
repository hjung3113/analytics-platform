import { act, cleanup, render } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, useHostPlatform } from '../platform';
import { createRegistry, type MenuEntry, type PlatformMenuEntry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';
import { groupId, spaceId, type Permission, type Session } from '@ap/contracts';

// `dual` sits in an UNGATED space (no `permission` on the space) and needs C (`console:access`, primary) AND F (`features:access`, additional):
// no space gate masks the extra grant, so resume, entry and return-origin admission are decided by the menu predicate alone.
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const base = { icon: House, requiresScope: false, context: noContext, pageType: 'management', features: noFeatures, description: { ko: '', en: '' } } as const;
const menu = (over: Partial<PlatformMenuEntry> & Pick<PlatformMenuEntry, 'id' | 'path' | 'permission' | 'group' | 'pageKeys'>): MenuEntry => ({ label: { ko: over.id, en: over.id }, ...base, ...over });
const registry = createRegistry({
  spaces: [testSpace({ id: spaceId('mars'), homeMenuId: 'mars-home' })],
  groups: [
    { id: groupId('home'), label: { ko: '홈', en: 'Home' }, icon: House, space: spaceId('mars') },
    { id: groupId('utility'), label: { ko: '유틸', en: 'Utility' }, icon: House, space: null },
  ],
  menus: [
    menu({ id: 'mars-home', path: '/mars-home', permission: 'platform:view', group: groupId('home'), pageKeys: [], primary: true }),
    menu({ id: 'dual', path: '/dual', permission: 'console:access', additionalPermissions: ['features:access'], group: groupId('home'), pageKeys: [] }),
    menu({ id: 'plain', path: '/plain', permission: 'platform:view', group: groupId('utility'), pageKeys: ['returnTo'], primary: true }),
  ],
});

const F: Permission = 'features:access';
const C: Permission = 'console:access';
const BOTH: Session['user']['permissions'] = ['platform:view', C, F];
const REVOKED: ReadonlyArray<[string, Session['user']['permissions']]> = [
  ['the extra grant (F)', ['platform:view', C]],
  ['the primary grant (C)', ['platform:view', F]],
];
const STORED_KEY = 'platform:space-last:u1';
const ORIGIN = '/dual?v=1';

let host!: ReturnType<typeof useHostPlatform>;
function Probe() {
  host = useHostPlatform();
  return null;
}

function mount(url: string, permissions: Session['user']['permissions']) {
  let session = testSession(permissions);
  const listeners = new Set<() => void>();
  const adapter = testAdapter({ session: () => session, subscribe: l => { listeners.add(l); return () => { listeners.delete(l); }; } });
  window.history.replaceState(null, '', url);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
  return { revoke: (next: Session['user']['permissions']) => act(async () => { session = testSession(next); for (const l of listeners) l(); }) };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('a stored resume target with additionalPermissions in an ungated space', () => {
  const stored = () => sessionStorage.setItem(STORED_KEY, JSON.stringify({ mars: ORIGIN }));

  it('is resumed while both grants are held', () => {
    stored();
    mount('/plain?v=1', BOTH);
    expect(host.spaceResume(spaceId('mars'))?.menuId).toBe('dual');
    expect(host.spaceEntry(spaceId('mars'))).toMatchObject({ menuId: 'dual', resumed: true });
  });

  it.each(REVOKED)('is rejected once %s is revoked through the adapter subscription: entry falls back to the permitted home', async (_name, after) => {
    stored();
    const view = mount('/plain?v=1', BOTH);
    expect(host.spaceResume(spaceId('mars'))?.menuId).toBe('dual');
    await view.revoke(after);
    expect(host.canOpen('dual')).toBe(false);
    expect(host.spaceResume(spaceId('mars'))).toBeNull();
    expect(host.spaceEntry(spaceId('mars'))).toMatchObject({ menuId: 'mars-home', resumed: false });
  });

  it.each(REVOKED)('is never resumed when %s was missing from the start', (_name, permissions) => {
    stored();
    mount('/plain?v=1', permissions);
    expect(host.spaceResume(spaceId('mars'))).toBeNull();
    expect(host.spaceEntry(spaceId('mars'))).toMatchObject({ menuId: 'mars-home', resumed: false });
  });
});

describe('a returnTo candidate with additionalPermissions in an ungated space', () => {
  const url = `/plain?v=1&returnTo=${encodeURIComponent(ORIGIN)}`;

  it('is the accepted origin while both grants are held', () => {
    mount(url, BOTH);
    const origin = host.returnOrigin();
    expect(origin).toMatchObject({ accepted: true, href: ORIGIN });
    expect(host.returnTarget()).toBe(origin.href);
  });

  it.each(REVOKED)('stops being accepted once %s is revoked: origin and target fall back to an openable home', async (_name, after) => {
    const view = mount(url, BOTH);
    expect(host.returnOrigin().accepted).toBe(true);
    await view.revoke(after);
    const origin = host.returnOrigin();
    expect(origin.accepted).toBe(false);
    expect(origin.href).not.toContain('/dual');
    expect(origin.menuLabel).toEqual({ ko: 'mars-home', en: 'mars-home' });
    expect(origin.href).toBe(host.resolveLink('mars-home').href);
    expect(host.returnTarget()).toBe(origin.href);
  });

  it.each(REVOKED)('is not accepted when %s was missing from the start, though the route still matches', (_name, permissions) => {
    mount(url, permissions);
    expect(host.returnOrigin().accepted).toBe(false);
    expect(host.resolveLink('dual').allowed).toBe(false);
  });
});
