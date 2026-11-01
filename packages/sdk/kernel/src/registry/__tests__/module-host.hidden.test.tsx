import { act, cleanup, render } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { spaceId, type ModuleHost, type ModuleManifest, type ModuleScreenMeta } from '@ap/contracts';
import { I18nProvider } from '../../i18n';
import { mountModule } from '../module';
import { useModuleHost, type ModuleShellPorts } from '../module-host';
import { PlatformProvider, useHostPlatform } from '../../platform/platform';
import { createRegistry } from '../registry';
import { noContext, testAdapter, testSession, testSpace } from '../../testing';

/** A module screen that declares hidden and repeated page keys (ADR-0105); params and ports are stable, as in the shell. */
const meta: ModuleScreenMeta = {
  id: 'list', group: 'fx:main', label: { ko: 'l', en: 'l' }, description: { ko: '', en: '' }, path: '', permission: 'fx:view', requiresScope: false,
  context: noContext, pageType: 'catalog', features: { export: false, savedView: false, annotate: false, compare: false }, primary: true,
  pageKeys: ['q', 'filter', 'mode'], hiddenPageKeys: ['filter', 'mode'], repeatedPageKeys: ['filter'],
};
const manifest: ModuleManifest = { module: { id: 'fx', label: { ko: '모듈', en: 'Module' }, contract: 1, languages: ['ko', 'en'] }, requires: [], optional: [], config: [], groups: [{ id: 'fx:main', label: { ko: '메인', en: 'Main' } }], screens: [meta] };
const { menus, groups } = mountModule(manifest, { list: () => null }, { prefix: '/fx', groupSpace: { 'fx:main': spaceId('mars') }, config: {}, icons: { groups: { 'fx:main': House }, screens: { list: House } } });
const registry = createRegistry({ spaces: [testSpace({ homeMenuId: 'fx:list' })], groups: groups.map(g => ({ ...g, space: spaceId('mars') })) as never, menus });
const session = testSession(['fx:view']);
const adapter = testAdapter({ session: () => session });
const params = {};
const ports: ModuleShellPorts = { status: vi.fn(), focusTarget: vi.fn() };
let host: ModuleHost;
function Probe() { host = useModuleHost(registry.menuById('fx:list') as never, params, ports); useHostPlatform(); return null; }
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

it('a hidden-only update rebuilds the host: reads, a second patch and subscribers see the new hidden pairs (F3)', () => {
  window.history.replaceState(null, '', '/mars/fx-list?v=1&q=a');
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Probe /></PlatformProvider></I18nProvider>);
  const heard = vi.fn();
  host.subscribe(heard);
  act(() => host.setPage({ filter: ['x', 'y'] }));
  expect(host.pages?.('filter')).toEqual(['x', 'y']);
  expect(window.location.search).toBe('?v=1&q=a');
  act(() => host.setPage({ mode: 'dense' }));
  expect(host.pages?.('filter')).toEqual(['x', 'y']);
  expect(host.page('mode')).toBe('dense');
  expect(heard).toHaveBeenCalled();
  heard.mockClear();
  act(() => { window.history.replaceState({ apHidden: { v: 1, pairs: [['filter', 'z']] } }, '', window.location.pathname + window.location.search); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(host.pages?.('filter')).toEqual(['z']);
  expect(heard).toHaveBeenCalled();
});
