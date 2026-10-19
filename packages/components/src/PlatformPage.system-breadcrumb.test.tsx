import { cleanup, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GroupId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { PlatformPage } from './PlatformPage';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';

function menu(id: string, group: GroupId, path: string, over: object = {}) {
  return { id, group, primary: true, label: { ko: id === 'home' ? '플랫폼 홈' : '설비 목록', en: id }, description: { ko: '', en: '' }, path, icon: House, permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'overview' as const, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], ...over };
}
const registry = createRegistry({
  spaces: [testSpace({ id: 'analytics', label: { ko: 'MARS', en: 'MARS' }, subtitle: { ko: '생산성 분석', en: 'Productivity analysis' }, homeMenuId: 'equipment' })],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: null }, { id: 'equipment', label: { ko: '설비', en: 'Equipment' }, icon: House, space: 'analytics' }],
  menus: [menu('home', 'overview', '/'), menu('equipment', 'equipment', '/equipment'), menu('equipment-detail', 'equipment', '/equipment/:id', { primary: false, navHidden: true, parent: 'equipment' })],
});
const adapter = () => { const session = testSession(['platform:view']); return testAdapter({ session: () => session }); };

function mount(url: string, crumbs?: { label: string; href?: string }[]) {
  window.history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider adapter={adapter()} registry={registry}><PlatformPage crumbs={crumbs}><p>body</p></PlatformPage></PlatformProvider></I18nProvider>);
}
const leftMin = (container: HTMLElement) => (container.querySelector('header')!.firstElementChild as HTMLElement).style.getPropertyValue('--header-left-min');

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('PlatformPage system breadcrumb (15 §3.2)', () => {
  it('puts the system name, as text and not a link, first in the breadcrumb of a space menu', () => {
    mount('/equipment?v=1');
    const nav = screen.getByRole('navigation', { name: '이동 경로' });
    expect(within(nav).getByText('MARS')).toBeTruthy();
    expect(within(nav).queryByRole('link')).toBeNull();
    expect(nav.textContent).toBe('MARS');
  });

  it('keeps the system name before the parent and crumbs', () => {
    mount('/equipment/E1?v=1', [{ label: 'EQP-1' }]);
    const nav = screen.getByRole('navigation', { name: '이동 경로' });
    expect(nav.textContent).toBe('MARS설비 목록EQP-1');
    expect(nav.firstElementChild).toHaveAttribute('data-breadcrumb-system');
    expect(within(nav).getAllByRole('link').map(link => link.textContent)).toEqual(['설비 목록']);
  });

  it('draws no breadcrumb for a global utility menu and keeps the no-breadcrumb width sum', () => {
    const view = mount('/?v=1');
    expect(screen.queryByRole('navigation', { name: '이동 경로' })).toBeNull();
    // title 7rem + star 1.5rem + one 0.5rem gap — the pre-#423 value, no breadcrumb item.
    expect(leftMin(view.container)).toBe('calc(7rem + 1.5rem + 0.5rem)');
  });

  it('counts the system breadcrumb as one left-group item and lets it shrink first', () => {
    const view = mount('/equipment?v=1');
    expect(leftMin(view.container)).toBe('calc(7rem + 1.5rem + 1rem)');
    expect(screen.getByRole('navigation', { name: '이동 경로' })).toHaveClass('min-w-0');
    expect(screen.getByRole('heading', { name: '설비 목록' })).toHaveClass('min-w-28', 'shrink', 'truncate');
  });
});
