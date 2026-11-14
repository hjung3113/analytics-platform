import { act, cleanup, render } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { PlatformProvider, useHostPlatform, usePlatform } from '../platform';
import { createRegistry } from '../../registry/registry';
import { memoryStorage, noContext, testAdapter, testSession, testSpace, testScreen } from '../../testing';

// C2 (#2033 review): browser-storage mode, reads work and writes throw (quota). A visit must not drop the earlier ones kept in memory.
const features = { export: false, savedView: false, annotate: false, compare: false, board: true };
const entry = (id: string) => ({
  id, group: groupId('equipment'), label: { ko: id, en: id }, description: { ko: '', en: '' }, path: `/${id}`, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: noContext, component: testScreen, pageType: 'analysis' as const, features, pageKeys: [],
});
const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'main' })],
  groups: [{ id: groupId('equipment'), label: { ko: '그룹', en: 'Group' }, icon: House, space: testSpace().id }],
  menus: [{ ...entry('main'), primary: true }, entry('plain'), entry('third')],
});
let menu: ReturnType<typeof usePlatform>;
let host: ReturnType<typeof useHostPlatform>;
function Consumer() { menu = usePlatform(); host = useHostPlatform(); return null; }

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); window.history.replaceState(null, '', '/main'); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('recent visits when the browser-storage write fails (C2)', () => {
  it('keeps the visit made before a failed write when the next one arrives', () => {
    const session = testSession(['platform:view']);
    const userId = session.user.id;
    localStorage.setItem(`platform:recent:${userId}`, JSON.stringify([{ menuId: 'plain', url: '/mars/plain', at: 1 }]));
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    render(<I18nProvider><PlatformProvider serverPreferences={false} adapter={testAdapter({ session: () => session })} registry={registry}><Consumer /></PlatformProvider></I18nProvider>);
    act(() => { menu.navigate('/mars/third'); });
    expect(host.readRecent().map(r => r.menuId)).toEqual(['third', 'main', 'plain']);
  });
});
