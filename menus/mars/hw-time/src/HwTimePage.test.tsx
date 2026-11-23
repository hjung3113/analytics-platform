// @vitest-environment jsdom
import { Suspense } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyGlobal, groupId, menuPermission, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, usePlatform } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { useQueryBarExtension } from '@ap/components';
import { manifests } from './index';
import HwTimePage from './HwTimePage';
vi.mock('./pages/analysis/AnalysisWorkspace', () => ({ AnalysisWorkspace: () => <p>linked analysis</p> }));
const registry = createRegistry({ permissions: [menuPermission('analytics:view')], 
  spaces: [{ id: spaceId('mars'), label: { ko: 'MARS', en: 'MARS' }, description: { ko: '분석', en: 'Analysis' }, homeMenuId: 'hw-time' }],
  groups: [{ id: groupId('hwTime'), label: { ko: 'HW Time', en: 'HW Time' }, icon: manifests[0].icon, space: spaceId('mars') }], menus: manifests });
const session = testSession(['analytics:view', 'platform:view']);
const adapter = testAdapter({ session: () => session });
function Route() {
  const { route } = usePlatform();
  const Page = route?.menu.component;
  return <Suspense>{Page && <Page params={{}} />}</Suspense>;
}
function setup(url: string, children = <Route />) {
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{children}</PlatformProvider></I18nProvider>);
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('HW Time obsolete keys and shell', () => {
  it.each(['overview', 'steps', 'compare', 'table', 'bogus'])('ignores obsolete view=%s and renders the same screen', async view => {
    setup(`/mars/hw-time?v=1&scopeId=MEM&view=${view}&minmax=bad&scroll=bad`, <HwTimePage params={{}} />);
    expect(await screen.findByText('linked analysis')).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
  });
  it('declares one navigation entry without a View key', () => {
    const main = manifests.find(menu => menu.id === 'hw-time')!;
    expect(main.navViews).toBeUndefined();
    expect(main.carrySet).toBeUndefined();
    expect(main.pageKeys).not.toContain('view');
  });
  it('gives query history the candidate page values and opts into the SDK drill steps (#2691, #2770)', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    window.history.replaceState(null, '', '/mars/hw-time?v=1&scopeId=MEM');
    function Summary() {
      const extension = useQueryBarExtension();
      const items = extension?.historyPageSummary?.(emptyGlobal, [['moduleType', 'TR'], ['verdict', 'under']]).map(item => `${item.label} ${item.value}`).join(' · ');
      return <p>{items === undefined ? 'missing formatter' : `${extension?.historyDrill ? 'drill · ' : ''}${items}`}</p>;
    }
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry} slots={{ contextBar: <Summary /> }}><HwTimePage params={{}} /></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('drill · 판정 하한 미달')).toBeTruthy();
  });
});
