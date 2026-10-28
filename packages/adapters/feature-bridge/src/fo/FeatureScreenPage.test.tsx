import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { useHostSearch } from '@/lib/host/host-seam';
import { setFeatureApi } from '../feature-api';
import { FeatureScreenPage } from './FeatureScreenPage';
import { operatorRoute, routeHere, routeSearch } from './operator-route';

const route = operatorRoute({ foPath: '/vocs', foFixed: { view: 'inbox' }, menuId: 'fo-inbox', keys: { selected: 'focus', managedSystem: 'managedSystem' } });
const useSearch = routeSearch(route);
const useHere = routeHere(route);

const space = testSpace({ homeMenuId: 'fo-inbox', carriedPageKeys: ['managedSystem'] });
const registry = createRegistry({
  spaces: [space],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{
    id: 'fo-inbox', group: groupId('overview'), primary: true, label: { ko: 'inbox', en: 'inbox' }, description: { ko: '', en: '' }, path: '/inbox', icon: House,
    permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'overview' as const,
    features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['focus', 'managedSystem', 'returnTo'],
  }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

const mounted = vi.fn();
/** Reads the seam's search from inside `FeatureBridge`, so it renders only where the bridge does. */
function Screen({ label }: { label: string }) {
  const search = useHostSearch();
  mounted(label);
  return <p>{label} {JSON.stringify(search)}</p>;
}
const page = (isValid: (key: string, value: string) => boolean, detail?: ReactNode) =>
  <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <FeatureScreenPage route={route} isValid={isValid} useSearch={useSearch} useHere={useHere} detail={detail}><Screen label="screen" /></FeatureScreenPage>
  </PlatformProvider></I18nProvider>;

beforeEach(() => { setFeatureApi({ basePath: '/api/fo', onSessionLost: vi.fn() }); mounted.mockClear(); });
afterEach(() => { cleanup(); setFeatureApi(null); window.history.replaceState(null, '', '/'); });

describe('FeatureScreenPage', () => {
  it('draws RejectedPage for a refused value: nothing inside FeatureBridge mounts and the address is kept', async () => {
    window.history.replaceState(null, '', '/mars/fo-inbox?v=1&focus=bad');
    const url = window.location.href;
    render(page(() => false, <Screen label="detail" />));
    expect(await screen.findByText('주소의 focus 값이 올바르지 않습니다')).toBeTruthy();
    expect(mounted).not.toHaveBeenCalled();
    expect(window.location.href).toBe(url);
  });

  it('draws the screen and the detail inside FeatureBridge for an accepted value', async () => {
    window.history.replaceState(null, '', '/inbox?v=1&focus=ok');
    render(page(() => true, <Screen label="detail" />));
    expect(await screen.findByText(/^screen/)).toBeTruthy();
    expect(screen.getByText(/^detail/)).toBeTruthy();
    expect(screen.queryByText('값 지우기')).toBeNull();
  });

  it('asks isValid with the FeedbackOps key of the refused page key and its value', async () => {
    window.history.replaceState(null, '', '/inbox?v=1&focus=abc&managedSystem=ms1');
    const isValid = vi.fn((key: string) => key !== 'managedSystem');
    render(page(isValid));
    expect(await screen.findByText('주소의 managedSystem 값이 올바르지 않습니다')).toBeTruthy();
    expect(isValid).toHaveBeenCalledWith('selected', 'abc');
    expect(isValid).toHaveBeenCalledWith('managedSystem', 'ms1');
  });
});
