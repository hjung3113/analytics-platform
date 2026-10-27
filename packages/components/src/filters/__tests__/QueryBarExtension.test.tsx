import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { PaneScreenProvider } from '@ap/kernel/host';
import { noContext, testAdapter, testSpace } from '@ap/kernel/testing';
import { QueryBarExtensionsProvider, usePublishQueryBarExtension, useQueryBarExtension } from '../QueryBarExtension';
import { groupId, spaceId } from '@ap/contracts';

const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }], menus: [{ id: 'home', primary: true, group: groupId('overview'), path: '/', label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: false, context: noContext, features: { export: false, annotate: false, compare: false, savedView: false }, pageType: 'analysis', pageKeys: [] }] });
function Publish({ value }: { value: string }) { usePublishQueryBarExtension({ pageSummary: [{ key: 'grain', label: '집계', value }], issues: [{ key: 'grain', label: '집계', reason: value }] }); return null; }
function Read() { return <p>{useQueryBarExtension()?.issues[0]?.reason ?? 'no extension'}</p>; }
function Pane({ id, children }: { id: string; children: React.ReactNode }) { return <PaneScreenProvider paneId={id} screen={{ menuId: 'home', params: {}, query: '' }} onChange={() => {}} onLeave={() => {}}>{children}</PaneScreenProvider>; }
afterEach(cleanup);
it('shares menu diagnostics across body/bar providers for one pane and clears them on unmount', async () => {
  function View({ publish, selected }: { publish: boolean; selected: string }) { return <I18nProvider><PlatformProvider registry={registry} adapter={testAdapter()}><QueryBarExtensionsProvider>{publish && <Pane id="p1"><Publish value="invalid grain" /></Pane>}<Pane id={selected}><Read /></Pane></QueryBarExtensionsProvider></PlatformProvider></I18nProvider>; }
  const tree = render(<View publish selected="p1" />);
  await waitFor(() => expect(screen.getByText('invalid grain')).toBeTruthy());
  tree.rerender(<View publish selected="p2" />);
  expect(screen.getByText('no extension')).toBeTruthy();
  tree.rerender(<View publish={false} selected="p1" />);
  expect(screen.getByText('no extension')).toBeTruthy();
});
it('preserves the pure historical formatter when sharing extension metadata between pane providers', async () => {
  const formatter = (_global: unknown, page: readonly [string, string][]) => [{ key: 'grain', label: '집계', value: page[0]?.[1] ?? 'hour' }];
  function Publisher() { usePublishQueryBarExtension({ pageSummary: [], issues: [], historyPageSummary: formatter }); return null; }
  function Reader() { const extension = useQueryBarExtension(); return <p>{extension?.historyPageSummary?.({} as never, [['grain', 'historical-day']])[0]?.value ?? 'waiting'}</p>; }
  render(<I18nProvider><PlatformProvider registry={registry} adapter={testAdapter()}><QueryBarExtensionsProvider><Pane id="p1"><Publisher /></Pane><Pane id="p1"><Reader /></Pane></QueryBarExtensionsProvider></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(screen.getByText('historical-day')).toBeTruthy());
});
