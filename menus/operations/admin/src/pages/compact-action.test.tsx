// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AccessPrincipal, ApiResponse, AuditEvent } from '@ap/contracts';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider, type MenuEntry } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { manifests } from '../index';
import AccessDirectory from './AccessDirectory';
import AuditTrail from './AuditTrail';
import RegistryCatalog from './RegistryCatalog';

// ADR-0037 compact action column: a scrollport between 192px and 248px keeps the action pinned as an icon with today's name.
const none = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const detailMenu: MenuEntry = {
  id: 'equipment-detail', group: 'admin', label: { ko: '설비 상세', en: 'Equipment detail' }, description: { ko: '', en: '' },
  path: '/admin/fixture-detail/:equipmentId', icon: House, permission: 'platform:view', requiresScope: true, pageType: 'catalog',
  context: none, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['tab'],
};
const registry = createRegistry({
  spaces: [{ id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'admin-roles' }],
  groups: [{ id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' }],
  menus: [...manifests, detailMenu],
});
const session = testSession(['console:access', 'platform:view'], { user: { id: 'admin-a', name: 'admin-a', title: { ko: '관리자', en: 'Administrator' } } });
const ok = <T,>(data: T): ApiResponse<T> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fixture' });
const principal: AccessPrincipal = { id: 'engineer', name: 'Process Engineer', title: { ko: '공정 엔지니어', en: 'Process engineer' }, role: 'engineer', permissions: ['platform:view'], sites: [] };
const event = (id: string, scopeId: string | null): AuditEvent => ({
  id, at: '2026-09-26T02:10:00.000Z', actor: 'admin-a', action: 'update', source: 'user',
  target: { type: 'equipment', id: `EQ-${id}`, scopeId }, changes: { status: ['idle', 'maintenance'] },
});
const adapter = testAdapter({
  session: () => session,
  accessDirectory: async () => ok({ items: [principal], total: 1 }),
  auditTrail: async () => ok({ items: [event('a1', 'ICH'), event('a2', null)], total: 2 }),
});

function DetailSlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}
function mount(path: string, page: React.ReactElement) {
  window.history.replaceState(null, '', path);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider>{page}<DetailSlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
}

const clientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return 800; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 1280; } });
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get() { return /^(스크롤 가능한 행 영역|Scrollable rows)$/.test((this as Element).getAttribute('aria-label') ?? '') ? 220 : 0; } });
  vi.stubGlobal('ResizeObserver', class { constructor(private cb: ResizeObserverCallback) {} observe(target: Element) { this.cb([{ target, contentRect: { width: 1280, height: 800 } } as ResizeObserverEntry], this as unknown as ResizeObserver); } unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: 1280, height: 800, x: 0, y: 0, top: 0, left: 0, right: 1280, bottom: 800, toJSON() {} }));
});
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (clientWidth) Object.defineProperty(Element.prototype, 'clientWidth', clientWidth); else delete (Element.prototype as unknown as Record<string, unknown>).clientWidth;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth;
  window.history.replaceState(null, '', '/');
});

const focusParam = () => new URLSearchParams(window.location.search).get('focus');

describe('admin compact row actions', () => {
  it('AccessDirectory: icon-only 보기 keeps its name and opens the drawer', async () => {
    mount('/admin/roles', <AccessDirectory />);
    const button = await screen.findByRole('button', { name: 'engineer 보기' });
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.textContent).toBe('');
    fireEvent.click(button);
    expect(focusParam()).toBe('engineer');
  });

  it('RegistryCatalog: icon-only 보기 keeps its name and opens the drawer', async () => {
    mount('/admin/registry', <RegistryCatalog />);
    const [button] = await screen.findAllByRole('button', { name: /^.+ 보기$/ });
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.textContent).toBe('');
    const id = button.getAttribute('aria-label')!.replace(/ 보기$/, '');
    fireEvent.click(button);
    expect(focusParam()).toBe(id);
  });

  it('AuditTrail: 상세 is an icon link with the right href; a target without a page gets a muted non-interactive mark', async () => {
    mount('/admin/audit', <AuditTrail />);
    const link = await screen.findByRole('link', { name: 'EQ-a1 상세' });
    expect(link.querySelector('svg')).not.toBeNull();
    expect(link.textContent).toBe('');
    expect(link.getAttribute('href')).toContain('/admin/fixture-detail/EQ-a1');
    const none = (await screen.findByText('상세 화면 없음')).closest('span[title]')!;
    expect(none.getAttribute('title')).toBe('이 대상의 상세 화면이 없습니다.');
    expect(none.querySelector('svg')).not.toBeNull();
    expect(none.closest('button, a')).toBeNull();
  });
});
