import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { House } from 'lucide-react';
import { afterEach, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { AppSidebar } from '../AppSidebar';
import { SIDEBAR_GROUP_TITLE } from '../SidebarHierarchy';

const base = 'relative flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary';
const active = 'bg-surface-row-selected font-semibold text-text-primary';
const view = 'relative flex min-h-8 items-center gap-2 rounded-md py-1.5 pl-9 pr-3 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each(['AppSidebar.tsx', 'PlatformSidebar.tsx', 'SidebarHierarchy.tsx'])('%s shares the navigation group typography constant', file => {
  expect(SIDEBAR_GROUP_TITLE.split(' ')).toContain('t-nav-group');
  expect(SIDEBAR_GROUP_TITLE).not.toMatch(/text-caption|font-semibold|uppercase|tracking-wide/);
  const source = readFileSync(join(process.cwd(), 'src/frame', file), 'utf8');
  const titles = source.match(/<p className=\{cn\(SIDEBAR_GROUP_TITLE/g) ?? [];
  expect(titles).toHaveLength(file === 'AppSidebar.tsx' ? 5 : 1);
});
it.each([false, true])('pins existing NavItem, NavViewItem and feature row classes (collapsed=%s)', async collapsed => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  window.history.replaceState(null, '', '/?v=1&tab=x');
  const registry = createRegistry({
    spaces: [testSpace({ homeMenuId: 'fixture-home' })],
    groups: [{ id: groupId('fixture-group'), space: spaceId('mars'), label: { ko: '그룹', en: 'Group' }, icon: House }],
    menus: [{ id: 'fixture-home', path: '/', primary: true, group: groupId('fixture-group'), label: { ko: '메뉴', en: 'Menu' }, description: { ko: '', en: '' }, icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['tab'], navViews: [{ id: 'x', label: { ko: '하위', en: 'View' }, page: { tab: 'x' } }] }],
  });
  const session = testSession(['platform:view']);
  render(<I18nProvider><PlatformProvider adapter={testAdapter({ session: () => session })} registry={registry} slots={{ features: { entriesFor: () => [{ key: 'fixture-feature', menuId: 'fixture-home', label: { ko: '기능', en: 'Feature' }, icon: House }] } }}><AppSidebar collapsed={collapsed} onToggle={() => {}} /></PlatformProvider></I18nProvider>);
  await waitFor(() => expect(screen.getByRole('link', { name: '메뉴' })).toBeTruthy());
  expect(screen.getByRole('link', { name: '메뉴' }).className).toBe(collapsed ? `${base.replace('px-3 ', '').replace('text-text-secondary ', '')} justify-center px-0 ${active}` : base);
  if (!collapsed) expect(screen.getByRole('link', { name: '하위' }).className).toBe(`${view.replace('text-text-secondary ', '')} ${active}`);
  expect(screen.getByRole('link', { name: /^기능 —/ }).className).toBe(`flex min-h-8 items-center gap-2 rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-row-hover hover:text-text-primary${collapsed ? ' justify-center px-0' : ''}`.replace(collapsed ? 'px-3 ' : '__absent__', ''));
});
