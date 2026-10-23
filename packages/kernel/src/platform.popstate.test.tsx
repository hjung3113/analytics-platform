import { act, cleanup, render } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from './index';
import { noContext, testAdapter, testSession, testSpace } from './testing';
import { groupId, spaceId } from '@ap/contracts';

const features = { export: false, savedView: false, annotate: false, compare: false };
const entry = (partial: { id: string; path: string; pageKeys: string[]; primary?: boolean; parent?: string; navHidden?: boolean }) => ({
  group: groupId('equipment'), label: { ko: partial.id, en: partial.id }, description: { ko: '', en: '' }, icon: House,
  permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'overview' as const, features,
  ...partial,
});

const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'equipment' })],
  groups: [{ id: groupId('equipment'), label: { ko: '설비', en: 'Equipment' }, icon: House, space: spaceId('analytics') }],
  menus: [
    entry({ id: 'equipment', path: '/equipment', pageKeys: ['focus'], primary: true }),
    entry({ id: 'detail', path: '/detail', pageKeys: ['returnTo'], parent: 'equipment', navHidden: true }),
  ],
});

const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

let platform: ReturnType<typeof usePlatform>;
function Probe() {
  platform = usePlatform();
  return null;
}
function mount(url: string) {
  window.history.replaceState(null, '', url);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
}

afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('Back/Forward arrival focus (#356 FIX1)', () => {
  it('treats a popstate across menus as a menu arrival: the title claims focus, focus= does not', () => {
    mount('/detail?v=1&returnTo=%2Fequipment%3Fv%3D1');
    act(() => {
      window.history.replaceState(null, '', '/equipment?v=1&focus=EQ-1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(platform.route?.menu.id).toBe('equipment');
    expect(platform.pageNavigation.claimsDetailFocus()).toBe(false);
    expect(platform.pageNavigation.consume('/equipment')).toBe('page');
  });

  it('keeps the same-screen history rule: a focus change claims the close button, without a request', () => {
    mount('/equipment?v=1');
    act(() => {
      window.history.replaceState(null, '', '/equipment?v=1&focus=EQ-1');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(platform.route?.menu.id).toBe('equipment');
    expect(platform.pageNavigation.claimsDetailFocus()).toBe(true);
    expect(platform.pageNavigation.consume('/equipment')).toBeNull();
  });
});
