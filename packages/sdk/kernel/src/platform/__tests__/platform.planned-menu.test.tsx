import { act, cleanup, render } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, useHostPlatform, useRecentVisits, type HostPlatform, type Recent } from '../platform';
import { createRegistry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace, testScreen } from '../../testing';

// #1944: a menu registered without a screen (no `component`, no `moduleScreen`) is shown but never remembered:
// not in the recent visits and not as the space's last screen, so 이어서 and 최근 방문 never point at an empty place.

const features = { export: false, savedView: false, annotate: false, compare: false };
const entry = (id: string, path: string, over: object = {}) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, pageType: 'overview' as const, features, pageKeys: [], ...over,
});
const registry = createRegistry({
  spaces: [testSpace({ id: spaceId('mars'), homeMenuId: 'built' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: spaceId('mars') }],
  menus: [entry('built', '/built', { primary: true, component: testScreen }), entry('planned', '/planned')],
});

let host: HostPlatform;
let visits: readonly Recent[];
function Consumer() { host = useHostPlatform(); visits = useRecentVisits(); return null; }

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  window.history.replaceState(null, '', '/built?v=1');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('planned menus leave no trace (#1944)', () => {
  it('records neither a recent visit nor the space resume for a menu without a screen', async () => {
    const session = testSession(['platform:view']);
    render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry}><Consumer /></PlatformProvider></I18nProvider>);
    expect(visits.map(v => v.menuId)).toEqual(['built']);
    await act(async () => { host.navigate('/planned?v=1'); });
    expect(host.route?.menu.id).toBe('planned');
    expect(visits.map(v => v.menuId)).toEqual(['built']);
    expect(host.spaceResume(spaceId('mars'))?.menuId).toBe('built');
    expect(host.spaceEntry(spaceId('mars'))).toMatchObject({ menuId: 'built', resumed: true });
  });
});
