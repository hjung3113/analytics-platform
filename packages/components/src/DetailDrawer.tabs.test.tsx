import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, spaceId } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { memoryStorage, noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { DetailDrawer } from './DetailDrawer';

const registry = createRegistry({
  spaces: [testSpace({ homeMenuId: 'home' })],
  groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
  menus: [{
    id: 'home', primary: true, group: groupId('overview'), label: { ko: 'home', en: 'home' }, description: { ko: '', en: '' }, path: '/', icon: House,
    permission: 'platform:view' as const, requiresScope: false, context: noContext, pageType: 'overview' as const,
    features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
  }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function SlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}
const tree = (ui: ReactNode) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider>{ui}<SlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>;

describe('DetailDrawer tab row (06 §13, #886 UX-8)', () => {
  it('draws no tab row for a single tab and shows its content', async () => {
    render(tree(<DetailDrawer title="상세" onClose={() => {}} tabs={[{ id: 'a', label: '속성', content: <p>속성 내용</p> }]} />));
    expect(await screen.findByText('속성 내용')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('tabpanel')).toBeNull();
    // Still a keyboard-scrollable region, named by the drawer title (as the tabpanel was focusable).
    expect(screen.getByRole('region', { name: '상세' }).getAttribute('tabindex')).toBe('0');
  });

  it('keeps the tab row for two or more tabs', async () => {
    render(tree(<DetailDrawer title="상세" onClose={() => {}} tab="b" tabs={[{ id: 'a', label: '속성', content: <p>속성 내용</p> }, { id: 'b', label: '이력', content: <p>이력 내용</p> }]} />));
    expect(await screen.findByText('이력 내용')).toBeTruthy();
    const list = screen.getByRole('tablist', { name: '상세 탭' });
    expect(list.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: '이력' }).getAttribute('aria-selected')).toBe('true');
  });
});

// The aside clips its overflow, so an outset ring shows only its top edge (#914 A1). jsdom has no layout: pin the classes.
describe('DetailDrawer focus ring stays inside the clipped aside (#914 A1)', () => {
  it.each([
    ['one tab (region)', [{ id: 'a', label: '속성', content: <p>속성 내용</p> }], 'region'],
    ['several tabs (tabpanel)', [{ id: 'a', label: '속성', content: <p>속성 내용</p> }, { id: 'b', label: '이력', content: <p>이력 내용</p> }], 'tabpanel'],
  ] as const)('%s', async (_name, tabs, role) => {
    render(tree(<DetailDrawer title="상세" onClose={() => {}} tabs={[...tabs]} />));
    await screen.findByText('속성 내용');
    const panel = screen.getByRole(role, { name: role === 'region' ? '상세' : undefined });
    expect(panel.className).toContain('focus-visible:ring-inset');
    expect(panel.className).toContain('focus-visible:ring-offset-0');
    expect(panel.className).not.toContain('focus-visible:ring-offset-2');
  });
});
