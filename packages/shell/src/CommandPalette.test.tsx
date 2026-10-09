import { lazy } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry, usePlatform } from '@ap/kernel';
import { CommandPalette } from './CommandPalette';

const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };
const page = lazy(async () => ({ default: () => null }));
const menu = (id: string, group: 'overview' | 'equipment' | 'admin' | 'noticeVoc', path: string, label: { ko: string; en: string }, over: object = {}) => ({
  id, group, path, label, description: { ko: '', en: '' }, icon: House, permission: 'platform:view' as const,
  requiresScope: false, context: none, pageType: 'overview' as const, features: noFeatures, pageKeys: [], ...over,
});

const registry = createRegistry({
  spaces: [
    { id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'home' },
    { id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'roles' },
  ],
  groups: [
    { id: 'overview', label: { ko: '분석', en: 'Analytics' }, icon: House, space: 'analytics' },
    { id: 'equipment', label: { ko: '설비관리', en: 'Equipment' }, icon: House, space: 'analytics' },
    { id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' },
    { id: 'noticeVoc', label: { ko: '공지·VOC', en: 'Notice & VOC' }, icon: House, space: null },
  ],
  menus: [
    menu('home', 'overview', '/home', { ko: '홈', en: 'Home' }, { primary: true, pageType: 'overview', component: page }),
    menu('equipment', 'equipment', '/equipment', { ko: '설비', en: 'Equipment' }, { primary: true, pageType: 'analysis', component: page }),
    menu('roles', 'admin', '/admin/roles', { ko: '권한', en: 'Roles' }, { primary: true, permission: 'console:access', pageType: 'management', component: page }),
    menu('notices', 'noticeVoc', '/notices', { ko: '공지', en: 'Notices' }, { primary: true, permission: 'notice:view', pageType: 'catalog' }),
    menu('notices-detail', 'noticeVoc', '/notices/:id', { ko: '공지 상세', en: 'Notice detail' }, { permission: 'notice:view', navHidden: true, parent: 'notices' }),
  ],
});

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
    removeItem: (key: string) => { storage.delete(key); },
    clear: () => storage.clear(),
  });
  storage.set('platform:recent:u1', JSON.stringify([
    { menuId: 'equipment', url: '/equipment?v=1', at: 2 },
    { menuId: 'home', url: '/home?v=1', at: 1 },
  ]));
  window.history.replaceState(null, '', '/no-such-page');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Open() {
  const { setPaletteOpen } = usePlatform();
  return <button type="button" onClick={() => setPaletteOpen(true)}>open palette</button>;
}

function mount() {
  const session: Session = { user: { id: 'u1', name: 'u', title: { ko: 'u', en: 'u' }, permissions: ['platform:view', 'console:access', 'notice:view'] }, scopes: [] };
  const forbidden = { outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'fixture' };
  const adapter: PlatformAdapter = {
    menuQuery: async () => forbidden, session: () => session, validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [], defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => forbidden, auditTrail: async () => forbidden, entityAudit: async () => forbidden, accessDirectory: async () => forbidden,
    recordUsage: async () => ({ accepted: 0 }), usageSummary: async () => forbidden,
    listAnnotations: async () => forbidden, saveAnnotation: async () => forbidden,
    reportClientError: async () => ({ accepted: true }), subscribe: () => () => {},
  };
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Open /><CommandPalette /></PlatformProvider></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'open palette' }));
}

const subtitle = (id: string) => document.querySelector(`#${id} .text-tiny`)!.textContent;

/** Explicit role, or the implicit list/listitem of a role-less ul/ol/li. presentation and none are not roles. */
function ariaRole(el: Element): string | null {
  const explicit = el.getAttribute('role');
  if (explicit === 'presentation' || explicit === 'none') return null;
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === 'ul' || tag === 'ol') return 'list';
  if (tag === 'li') return 'listitem';
  return null;
}

function nearestRole(el: Element): { el: Element; role: string } | null {
  let current = el.parentElement;
  while (current) {
    const role = ariaRole(current);
    if (role) return { el: current, role };
    current = current.parentElement;
  }
  return null;
}

describe('CommandPalette space bundles (06 §9.1)', () => {
  it('groups accessible spaces in registry order, then 플랫폼, and drops page type from the subtitle', () => {
    mount();
    expect(screen.getByRole('combobox', { name: '메뉴 검색' })).toHaveAttribute('placeholder', '이동할 메뉴를 입력하세요…');
    expect(screen.getAllByRole('option').map(option => option.id)).toEqual([
      'palette-equipment', 'palette-home', 'palette-roles', 'palette-notices',
    ]);
    expect(screen.getByRole('group', { name: '분석' })).toHaveAttribute('aria-labelledby', 'palette-heading-analytics');
    expect(screen.getByRole('group', { name: '운영 콘솔' })).toHaveAttribute('aria-labelledby', 'palette-heading-operations');
    expect(screen.getByRole('group', { name: '플랫폼' })).toHaveAttribute('aria-labelledby', 'palette-heading-platform');
    expect(document.getElementById('palette-heading-analytics')).toHaveTextContent('분석');
    expect(subtitle('palette-home')).toBe('분석');
    expect(subtitle('palette-equipment')).toBe('분석 · 설비관리');
    expect(subtitle('palette-roles')).toBe('운영 콘솔 · 관리·감사');
    expect(subtitle('palette-notices')).toBe('플랫폼 · 공지·VOC · 예정');
    expect(screen.getByRole('option', { name: /홈/ }).textContent).not.toContain('Overview');
    expect(screen.getByRole('option', { name: /공지/ }).textContent).not.toContain('Catalog');
    expect(screen.queryByRole('option', { name: /공지 상세/ })).toBeNull();
  });

  it('finds global menus by 플랫폼 and hides empty bundles', () => {
    mount();
    fireEvent.change(screen.getByRole('combobox', { name: '메뉴 검색' }), { target: { value: '플랫폼' } });
    expect(screen.getAllByRole('group')).toHaveLength(1);
    expect(screen.getByRole('group', { name: '플랫폼' })).toBeTruthy();
    expect(screen.getAllByRole('option').map(option => option.id)).toEqual(['palette-notices']);
  });

  it('uses the English accessible name, heading and Platform search', () => {
    storage.set('platform:lang', 'en');
    mount();
    expect(screen.getByRole('combobox', { name: 'Search menus' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Platform' })).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Search menus' }), { target: { value: 'Platform' } });
    expect(screen.getAllByRole('option').map(option => option.id)).toEqual(['palette-notices']);
    expect(subtitle('palette-notices')).toBe('Platform · Notice & VOC · Planned');
  });

  it('exposes each option as group inside listbox, with no list or listitem between them', () => {
    mount();
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      const group = nearestRole(option);
      expect(group?.role).toBe('group');
      expect(group && nearestRole(group.el)?.role).toBe('listbox');
    }
    const heading = document.getElementById('palette-heading-analytics');
    expect(heading).toBeTruthy();
    expect(ariaRole(heading!)).toBeNull();
    expect(heading!.closest('[role="option"]')).toBeNull();
  });

  it('moves across bundles with the arrow keys and scrolls the active option into view', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    mount();
    const input = screen.getByRole('combobox', { name: '메뉴 검색' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input).toHaveAttribute('aria-activedescendant', 'palette-roles');
    expect(scroll).toHaveBeenLastCalledWith({ block: 'nearest' });
    expect(scroll.mock.instances.at(-1)).toBe(document.getElementById('palette-roles'));
  });
});
