// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider, type MenuEntry } from '@ap/kernel';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { manifests } from '../index';
import AccessDirectory from './AccessDirectory';
import AuditTrail from './AuditTrail';
import RegistryCatalog from './RegistryCatalog';
import { groupId, spaceId, type AccessPrincipal, type ApiResponse, type AuditEvent } from '@ap/contracts';

// ADR-0037 compact action column: a scrollport between 192px and 248px keeps the action pinned as an icon with today's name.
const none = { time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' } as const;
const detailMenu: MenuEntry = {
  id: 'equipment-detail', group: groupId('admin'), label: { ko: '설비 상세', en: 'Equipment detail' }, description: { ko: '', en: '' },
  path: '/admin/fixture-detail/:equipmentId', icon: House, permission: 'platform:view', requiresScope: true, pageType: 'catalog',
  context: none, features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: ['tab'],
};
const registry = createRegistry({
  spaces: [{ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'admin-roles' }],
  groups: [{ id: groupId('admin'), label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: spaceId('operations') }],
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
  auditTrail: async () => ok({ items: [event('a1', 'MEM'), event('a2', null)], total: 2 }),
});

function DetailSlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}
function mount(path: string, page: React.ReactElement) {
  window.history.replaceState(null, '', path);
  render(<I18nProvider><PlatformProvider equipmentAxes={equipmentAxes} adapter={adapter} registry={registry}><DetailPanelSlotProvider>{page}<DetailSlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
}

let restoreGeometry: () => void;
beforeEach(() => {
  restoreGeometry = stubCompactTableGeometry();
});
afterEach(() => {
  cleanup(); restoreGeometry(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

const focusParam = () => new URLSearchParams(window.location.search).get('focus');

describe('admin compact row actions', () => {
  it('AccessDirectory: icon-only 보기 keeps its name and opens the drawer', async () => {
    mount('/admin/roles', <AccessDirectory />);
    const button = await screen.findByRole('button', { name: 'engineer 보기' });
    fireEvent.click(button);
    expect(focusParam()).toBe('engineer');
  });

  it('RegistryCatalog: icon-only 보기 keeps its name and opens the drawer', async () => {
    mount('/admin/registry', <RegistryCatalog />);
    const [button] = await screen.findAllByRole('button', { name: /^.+ 보기$/ });
    const id = button.getAttribute('aria-label')!.replace(/ 보기$/, '');
    fireEvent.click(button);
    expect(focusParam()).toBe(id);
  });

  it('AuditTrail: 상세 is an icon link with the right href; a target without a page gets a muted non-interactive mark', async () => {
    mount('/admin/audit', <AuditTrail />);
    const link = await screen.findByRole('link', { name: 'EQ-a1 상세' });
    expect(link.getAttribute('href')).toContain('/admin/fixture-detail/EQ-a1');
    const none = (await screen.findByText('상세 화면 없음')).closest('span[title]')!;
    expect(none.getAttribute('title')).toBe('이 대상의 상세 화면이 없습니다.');
    expect(none.querySelector('svg')).not.toBeNull();
    expect(none.closest('button, a')).toBeNull();
  });
});

const equipmentAxes = [
  { id: 'stgroup', label: { ko: 'StGroup', en: 'StGroup' }, membershipHistory: false },
  { id: 'team', label: { ko: '분임조', en: 'Team' }, membershipHistory: false },
  { id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false },
  { id: 'model', label: { ko: 'Model', en: 'Model' }, membershipHistory: false, dependsOn: 'maker' },
];
