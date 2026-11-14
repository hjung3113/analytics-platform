import { cleanup, render, waitFor } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { createRegistry, type PlatformMenuEntry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '../../testing';
import { PlatformProvider, usePlatform } from '../platform';
import type { MenuPlatform } from '../types';

const menu = (id: string, path: string, extra: Partial<PlatformMenuEntry> = {}): PlatformMenuEntry => ({
  id, path, group: groupId('objects'), label: { ko: id, en: id }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis',
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...extra,
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'source' })],
  groups: [{ id: groupId('objects'), label: { ko: '객체', en: 'Objects' }, icon: House, space: spaceId('mars') }],
  menus: [
    menu('source', '/source', { primary: true, opensObject: { equipment: { pageKey: 'eqp' } }, pageKeys: ['eqp'] }),
    menu('path', '/objects/:id', { opensObject: { equipment: { param: 'id' } }, pageKeys: ['returnTo', 'tab'] }),
    menu('page', '/page', { opensObject: { equipment: { pageKey: 'eqp' } }, pageKeys: ['eqp', 'returnTo'] }),
    menu('denied', '/denied/:id', { permission: 'console:access', opensObject: { equipment: { param: 'id' } } }),
    menu('ordinary', '/ordinary'),
  ],
});
let platform: MenuPlatform;
function Probe() { platform = usePlatform(); return null; }
async function mount() {
  for (const name of ['localStorage', 'sessionStorage'] as const) vi.stubGlobal(name, memoryStorage());
  window.history.replaceState(null, '', '/source?v=1&scopeId=MEM&selectedEquipmentIds=E1&roomNames=PHOTO');
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter({ session: () => session })}><Probe /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(platform.route?.menu.id).toBe('source'));
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('objectLinks (06 §22, #1930)', () => {
  it('preserves Registry order and manifest labels, excludes self and undeclared destinations, keeps denied', async () => {
    await mount();
    const links = platform.objectLinks({ kind: 'equipment', id: 'E2' });
    expect(links.map(link => [link.menuId, link.label, link.allowed])).toEqual([
      ['path', registry.menuById('path').label, true], ['page', registry.menuById('page').label, true], ['denied', registry.menuById('denied').label, false],
    ]);
    expect(platform.objectLinks({ kind: 'unknown', id: 'E2' })).toEqual([]);
    expect(platform.objectLinks({ kind: 'equipment', id: '' })).toEqual([]);
  });
  it('reuses resolveLink for path/page placement, returnTo, per-destination dropped keys and scope boundary', async () => {
    await mount();
    const options = { returnTo: true, page: { tab: 'history', unknown: 'drop', eqp: 'wrong' }, global: { scopeId: 'FDRY' } };
    const links = platform.objectLinks({ kind: 'equipment', id: 'E/2' }, options);
    expect(links[0]).toMatchObject(platform.resolveLink('path', { ...options, params: { id: 'E/2' } }));
    expect(links[1]).toMatchObject(platform.resolveLink('page', { ...options, page: { ...options.page, eqp: 'E/2' } }));
    expect(new URL(links[0]!.href, 'http://localhost').pathname).toBe('/mars/path/E%2F2');
    const q = new URL(links[1]!.href, 'http://localhost').searchParams;
    expect(q.get('eqp')).toBe('E/2');
    expect(q.get('scopeId')).toBe('FDRY');
    expect(q.has('selectedEquipmentIds')).toBe(false);
    expect(q.has('roomNames')).toBe(false);
    expect(q.get('returnTo')).toContain('/source');
    expect(links[1]!.droppedPageKeys).toEqual(['tab', 'unknown']);
  });
  it('uses the prebuilt index and excludes none resolutions without scanning menus', async () => {
    await mount();
    const has = registry.has;
    vi.spyOn(registry, 'has').mockImplementation(id => id !== 'page' && has(id));
    const scan = vi.spyOn(registry.menus, 'flatMap');
    expect(platform.objectLinks({ kind: 'equipment', id: 'E2' }).map(link => link.menuId)).toEqual(['path', 'denied']);
    platform.objectLinks({ kind: 'equipment', id: 'E3' });
    expect(scan).not.toHaveBeenCalled();
  });
});
