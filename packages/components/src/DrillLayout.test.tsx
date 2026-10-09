import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, type MenuEntry } from '@ap/kernel';
import { DrillLayout, ReturnLink } from './DrillLayout';
import { noContext, testAdapter, testSpace } from './test-support';

const features = { export: false, savedView: false, annotate: false, compare: false };
const keys = ['drillRoom', 'drillStgroup', 'drillLine', 'drillEquipment'] as const;
const level = (key: string, ko: string, en: string) => ({ key, label: { ko, en } });

function entry(partial: Pick<MenuEntry, 'id' | 'path'> & Partial<MenuEntry>): MenuEntry {
  return {
    group: 'overview', label: { ko: partial.id, en: partial.id }, description: { ko: '', en: '' }, icon: House,
    permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'overview', features, pageKeys: [],
    ...partial,
  };
}

const registry = createRegistry({
  spaces: [testSpace()],
  groups: [{ id: 'overview', label: { ko: '개요', en: 'Overview' }, icon: House, space: 'analytics' }],
  menus: [
    entry({ id: 'home', path: '/', primary: true, label: { ko: '홈', en: 'Home' } }),
    entry({
      id: 'source', path: '/source', label: { ko: '생산성 개요', en: 'Productivity overview' },
      pageKeys: [...keys], contextResetKeys: [...keys],
      drill: { levels: [
        level('drillRoom', '공정', 'Process'),
        level('drillStgroup', 'StGroup', 'StGroup'),
        level('drillLine', '라인', 'Line'),
        level('drillEquipment', '설비', 'Equipment'),
      ] },
    }),
    entry({ id: 'plain', path: '/plain', label: { ko: '사이클타임 상세', en: 'Cycle time detail' } }),
    entry({ id: 'detail', path: '/detail', parent: 'source', navHidden: true, pageKeys: ['returnTo'] }),
  ],
});

const session: Session = { user: { id: 'u1', name: 'u1', title: { ko: 'u1', en: 'u1' }, permissions: ['platform:view'] }, scopes: [] };
const adapter = testAdapter({ session: () => session });

let storage = new Map<string, string>();
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
    clear: () => storage.clear(),
    key: () => null,
    get length() { return storage.size; },
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mount(url: string, node: ReactNode) {
  window.history.replaceState(null, '', url);
  return render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}>{node}</PlatformProvider></I18nProvider>);
}

function openMenu(name: string) {
  const trigger = screen.getByRole('button', { name });
  act(() => { trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); });
}

const siblings = {
  drillRoom: [{ value: 'PHOTO', hint: '12.0%' }, { value: 'ETCH', hint: '1.0%' }],
  drillStgroup: [{ value: 'A', hint: '4.0%' }, { value: 'B', hint: '2.0%' }],
};

describe('DrillLayout (06 §12.7, ADR-0025)', () => {
  it('hides the path at depth 0 and shows the body', () => {
    mount('/source?v=1', <DrillLayout><p>본문</p></DrillLayout>);
    expect(screen.queryByRole('navigation', { name: '드릴 경로' })).toBeNull();
    expect(screen.getByText('본문')).toBeTruthy();
  });

  it('moves up from a chip and marks the last chip as the current step', () => {
    mount('/source?v=1&drillRoom=PHOTO&drillStgroup=A', <DrillLayout siblings={siblings}><p>본문</p></DrillLayout>);
    expect(screen.getByRole('navigation', { name: '드릴 경로' })).toBeTruthy();
    const current = screen.getByRole('button', { name: 'StGroup: A' });
    expect(current.getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('button', { name: '공정: PHOTO' }).getAttribute('aria-current')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '공정: PHOTO' }));
    expect(window.location.search).toBe('?v=1&drillRoom=PHOTO');
    expect(screen.queryByRole('button', { name: 'StGroup: A' })).toBeNull();
    expect(screen.getByText('본문')).toBeTruthy();
  });

  it('switches a sibling from the menu and clears later steps', async () => {
    mount('/source?v=1&drillRoom=PHOTO&drillStgroup=A', <DrillLayout siblings={siblings}><p>본문</p></DrillLayout>);
    openMenu('공정 바꾸기');
    expect((await screen.findByRole('menuitemradio', { name: /PHOTO/ })).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('menuitemradio', { name: /ETCH/ }));
    expect(window.location.search).toBe('?v=1&drillRoom=ETCH');
  });

  it('collapses depth 4 to All, a middle menu and the last two chips', async () => {
    mount('/source?v=1&drillRoom=PHOTO&drillStgroup=A&drillLine=L1&drillEquipment=E1', <DrillLayout><p>본문</p></DrillLayout>);
    expect(screen.queryByRole('button', { name: '공정: PHOTO' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'StGroup: A' })).toBeNull();
    expect(screen.getByRole('button', { name: '라인: L1' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('button', { name: '설비: E1' }).getAttribute('aria-current')).toBe('step');
    openMenu('가운데 단계');
    fireEvent.click(await screen.findByRole('menuitem', { name: '공정: PHOTO' }));
    expect(window.location.search).toBe('?v=1&drillRoom=PHOTO');
  });

  it('replaces the body on a format error and does not substitute a value', () => {
    mount('/source?v=1&drillStgroup=LATE', <DrillLayout notFound={{ key: 'drillRoom', value: 'NOPE' }}><p>본문</p></DrillLayout>);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('drillStgroup=LATE');
    expect(alert.textContent).toContain('앞 단계 없이');
    expect(screen.queryByText('본문')).toBeNull();
    expect(screen.queryByText(/없는 값/)).toBeNull();
    expect(window.location.search).toBe('?v=1&drillStgroup=LATE');
  });

  it('replaces the body when the step value is missing', () => {
    mount('/source?v=1&drillRoom=PHOTO', <DrillLayout notFound={{ key: 'drillRoom', value: 'NOPE' }}><p>본문</p></DrillLayout>);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('이 조건에서 없는 값: NOPE');
    expect(screen.queryByText('본문')).toBeNull();
  });

  it('names the path and the sibling control in English', () => {
    storage.set('platform:lang', 'en');
    mount('/source?v=1&drillRoom=PHOTO', <DrillLayout siblings={siblings}><p>Body</p></DrillLayout>);
    expect(screen.getByRole('navigation', { name: 'Drill path' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change Process' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
  });
});

describe('ReturnLink (06 §22, ADR-0025)', () => {
  it('names the origin menu and its drill trail', () => {
    const accepted = '/source?v=1&drillRoom=PHOTO&drillStgroup=A&drillLine=L1&drillEquipment=E';
    mount(`/detail?v=1&returnTo=${encodeURIComponent(accepted)}`, <ReturnLink />);
    const link = screen.getByRole('link', { name: '← 생산성 개요 (PHOTO › A › L1 › E)' });
    expect(link.getAttribute('href')).toBe(accepted);
  });

  it('names the parent menu when returnTo is absent', () => {
    mount('/detail?v=1', <ReturnLink />);
    const link = screen.getByRole('link', { name: '← 생산성 개요' });
    expect(link.getAttribute('href')).toBe('/source?v=1');
    expect(link.textContent).not.toContain('›');
  });
});
