import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { PaneScreenProvider } from '@ap/kernel/host';
import { memoryStorage, noContext, testAdapter, testSpace } from '@ap/kernel/testing';
import { PlatformPage, type PlatformPageProps } from './PlatformPage';
import { groupId, spaceId } from '@ap/contracts';

function view(result: PlatformPageProps['queryResult'], apply = true, pane = false) {
  const registry = createRegistry({ spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }], menus: [{ id: 'home', group: groupId('overview'), primary: true, path: '/', label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: false, context: { ...noContext, time: 'apply', roomNames: 'apply' }, ...(apply ? { query: { mode: 'apply' as const } } : {}), features: { export: false, annotate: false, compare: false, savedView: false }, pageType: 'analysis', pageKeys: [] }] });
  window.history.replaceState(null, '', '/?from=2026-01-01T01:00:00&to=2026-01-02T01:00:00&roomNames=PHOTO');
  const page = <PlatformPage queryResult={result}>body</PlatformPage>;
  return <I18nProvider><PlatformProvider registry={registry} adapter={testAdapter()}>{pane ? <PaneScreenProvider paneId="p1" screen={{ menuId: 'home', params: {}, query: '?from=2026-01-01T01:00:00&to=2026-01-02T01:00:00&roomNames=PHOTO' }} onChange={() => {}} onLeave={() => {}}>{page}</PaneScreenProvider> : page}</PlatformProvider></I18nProvider>;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('hides the strip for absent inputs and live screens', () => {
  const tree = render(view(undefined));
  expect(screen.queryByRole('region', { name: '적용된 조회 조건' })).toBeNull();
  tree.rerender(view({ status: 'done', completedAt: 0 }, false));
  expect(screen.queryByRole('region', { name: '적용된 조회 조건' })).toBeNull();
});
it.each(['idle', 'loading'] as const)('hides prior completion during %s/new identity', status => {
  render(view({ status, completedAt: null }));
  expect(screen.queryByText(/요약 조회 완료/)).toBeNull();
});
it.each(['done', 'refreshing'] as const)('shows the authoritative completed response during %s, including terminal errors', status => {
  vi.stubGlobal('localStorage', memoryStorage());
  render(view({ status, completedAt: 1_800_000_000_000 }));
  expect(screen.getByText(/요약 조회 완료/)).toBeTruthy();
  expect(screen.getByRole('region', { name: '적용된 조회 조건' })).toHaveTextContent('공정 PHOTO');
});
it('puts the result strip inside a pane without adding a page header', () => {
  render(view({ status: 'done', completedAt: 1_800_000_000_000 }, true, true));
  expect(screen.getByRole('region', { name: '적용된 조회 조건' })).toBeTruthy();
  expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
});

it('places the apply editor outside the sticky page header', () => {
  const tree = view(undefined);
  // Supply an actual context slot without coupling components tests to the shell.
  const provider = tree.props.children;
  render({ ...tree, props: { ...tree.props, children: { ...provider, props: { ...provider.props, slots: { contextBar: <div data-testid="query-editor">Editor</div> } } } } });
  expect(screen.getByTestId('query-editor').closest('[data-page-sticky-header]')).toBeNull();
  expect(screen.getByRole('heading', { level: 1 }).closest('[data-page-sticky-header]')).toBeTruthy();
});

it('counts only the collapsed query row in the sticky offset', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const height = this.hasAttribute('data-page-sticky-header') ? 50 : 48;
    return { x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: height, width: 1200, height, toJSON() {} };
  });
  const tree = view(undefined);
  const provider = tree.props.children;
  const slot = (collapsed: boolean) => ({ ...tree, props: { ...tree.props, children: { ...provider, props: { ...provider.props, slots: { contextBar: <section data-query-bar data-query-bar-collapsed={collapsed ? '' : undefined}>Editor</section> } } } } });
  const result = render(slot(true));
  expect(result.container.querySelector<HTMLElement>('[data-platform-page]')?.style.getPropertyValue('--page-sticky-offset')).toBe('98px');
  result.unmount();
  const expanded = render(slot(false));
  expect(expanded.container.querySelector<HTMLElement>('[data-platform-page]')?.style.getPropertyValue('--page-sticky-offset')).toBe('50px');
  vi.restoreAllMocks();
});
