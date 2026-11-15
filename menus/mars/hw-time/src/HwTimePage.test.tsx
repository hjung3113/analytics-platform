// @vitest-environment jsdom
import { Suspense } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupId, menuPermission, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, usePlatform } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from './index';
import HwTimePage from './HwTimePage';
import { HW_TIME_VIEWS } from './views';
import { HW_TIME_CARRY_SET } from './test-support';
vi.mock('./pages/overview/OverviewPage', () => ({ default: () => <p>overview body</p> }));
vi.mock('./pages/steps/StepsPage', () => ({ default: () => <p>steps body</p> }));
vi.mock('./pages/compare/ComparePage', () => ({ default: () => <p>compare body</p> }));
vi.mock('./pages/table/TablePage', () => ({ default: () => <p>table body</p> }));
const registry = createRegistry({ permissions: [menuPermission('analytics:view')], carrySets: [HW_TIME_CARRY_SET],
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
describe('HW Time legacy routing and shell', () => {
  it.each(HW_TIME_VIEWS.flatMap(({ id }) => [
    [id, `/mars/hw-time-${id}`], [id, `/hw-time/${id}`],
  ] as const))('maps legacy %s at %s with Context and page state', async (view, path) => {
    const replace = vi.spyOn(window.history, 'replaceState');
    setup(`${path}?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00&equipmentGroup=${encodeURIComponent(JSON.stringify({ maker: ['SYNTHETIC'] }))}&selectedEquipmentIds=EQ-001&drillModule=PM1&sort=total-desc`);
    await waitFor(() => expect(window.location.pathname).toBe('/mars/hw-time'));
    const query = new URLSearchParams(window.location.search);
    expect(query.get('view')).toBe(view);
    expect(query.get('scopeId')).toBe('MEM');
    expect(query.get('from')).toBe('2026-09-19T09:00:00');
    expect(query.get('equipmentGroup')).toContain('SYNTHETIC');
    expect(query.get('selectedEquipmentIds')).toBe('EQ-001');
    expect(query.get('drillModule')).toBe('PM1');
    expect(query.get('sort')).toBe('total-desc');
    expect(replace.mock.calls.filter(call => String(call[2]).startsWith('/mars/hw-time?'))).toHaveLength(1);
    replace.mockRestore();
  });
  it('carries the drill and the filter panel through a sidebar View link, never the View-local keys (#2328)', async () => {
    let href = '';
    function Probe() {
      const { linkTo } = usePlatform();
      href = linkTo('hw-time', { page: { view: 'compare' } });
      return null;
    }
    setup('/mars/hw-time?v=1&scopeId=MEM&view=steps&drillModule=PM1&moduleType=PM&module=PM2&motion=PM/Vent&motion=PM/Pump&trend=EQ-001.H1', <Probe />);
    await waitFor(() => expect(href).not.toBe(''));
    const query = new URLSearchParams(href.slice(href.indexOf('?')));
    expect(query.get('view')).toBe('compare');
    expect(query.get('drillModule')).toBe('PM1');
    expect(query.get('moduleType')).toBe('PM');
    expect(query.getAll('module')).toEqual(['PM2']);
    expect(query.getAll('motion')).toEqual(['PM/Vent', 'PM/Pump']);
    expect(query.get('trend')).toBeNull();
  });
  it('rejects an invalid View without repairing it or mounting a body', async () => {
    setup('/mars/hw-time?v=1&scopeId=MEM&view=bogus', <HwTimePage params={{}} />);
    expect(await screen.findByText(/bogus/)).toBeTruthy();
    expect(screen.queryByText('overview body')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('view')).toBe('bogus');
  });
  it('keeps Context and filter state on a tab switch and rejects bad filters before mounting a View', async () => {
    setup('/mars/hw-time?v=1&scopeId=MEM&selectedEquipmentIds=EQ-001&module=PM2&view=overview', <HwTimePage params={{}} />);
    await screen.findByText('overview body');
    fireEvent.mouseDown(screen.getByRole('tab', { name: '단계별' }), { button: 0, ctrlKey: false });
    await screen.findByText('steps body');
    expect(new URLSearchParams(window.location.search).has('module')).toBe(false);
    expect(screen.getByRole('checkbox', { name: 'PM2' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('checkbox', { name: 'PM1' }).getAttribute('aria-checked')).toBe('false');
    expect(new URLSearchParams(window.location.search).get('selectedEquipmentIds')).toBe('EQ-001');
    cleanup();
    setup('/mars/hw-time?v=1&scopeId=MEM&split=recipe', <HwTimePage params={{}} />);
    await act(async () => {});
    expect(screen.queryByText('overview body')).toBeNull();
    expect(screen.getByText(/recipe/)).toBeTruthy();
  });
  it('shows «선택한 항목 없음» instead of any View body for an explicit empty selection (#2336 §2.3)', async () => {
    setup('/mars/hw-time?v=1&scopeId=MEM&view=steps&motion=~none', <HwTimePage params={{}} />);
    expect(await screen.findByText('선택한 항목 없음')).toBeTruthy();
    expect(screen.queryByText('steps body')).toBeNull();
  });
});
