// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { manifests } from '../index';
import AuditTrail from './AuditTrail';
import RegistryCatalog from './RegistryCatalog';
import UsageOverview from './UsageOverview';
import { groupId, spaceId, type ApiResponse, type AuditEvent, type UsageSummary } from '@ap/contracts';

// #1167 B-1·B-2: the page head already carries the page title, so the table repeats it only for the
// outline (sr-only) with its accessible name on ariaLabel; long declaration cells stay on one line.
const registry = createRegistry({
  spaces: [{ id: spaceId('operations'), label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'admin-roles' }],
  groups: [{ id: groupId('admin'), label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: spaceId('operations') }],
  menus: [...manifests, {
    // The row link's destination (audit-destination → equipment-detail); the admin manifests alone don't register it.
    id: 'equipment-detail', group: groupId('admin'), label: { ko: '설비 상세', en: 'Equipment detail' }, description: { ko: '', en: '' },
    path: '/admin/fixture-detail/:equipmentId', icon: House, permission: 'platform:view', requiresScope: true, pageType: 'catalog',
    context: { time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' },
    features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [], navHidden: true,
  }],
});
const session = testSession(['console:access', 'platform:view'], { user: { id: 'admin-a', name: 'admin-a', title: { ko: '관리자', en: 'Administrator' } } });
const ok = <T,>(data: T): ApiResponse<T> => ({ outcome: 'ok', data, assessments: [], trust: null, correlationId: 'fixture' });
const event: AuditEvent = {
  id: 'a1', at: '2026-09-26T02:10:00.000Z', actor: 'admin-a', action: 'update', source: 'user',
  target: { type: 'equipment', id: 'MEM-ETCH-0101', scopeId: 'MEM' }, changes: { status: ['idle', 'maintenance'] },
};
const usage: UsageSummary = {
  preset: 'all',
  menus: [{ menuId: 'admin-roles', visits: 7, distinctUsers: 2, lastUsedAt: 1_760_000_000_000 }],
};
const adapter = testAdapter({
  session: () => session,
  auditTrail: async () => ok({ items: [event], total: 1 }),
  usageSummary: async () => ok(usage),
});

function mount(path: string, page: React.ReactElement) {
  window.history.replaceState(null, '', path);
  render(<I18nProvider><PlatformProvider equipmentAxes={[]} adapter={adapter} registry={registry}>{page}</PlatformProvider></I18nProvider>);
}

let restoreGeometry: () => void;
beforeEach(() => {
  restoreGeometry = stubCompactTableGeometry();
});

afterEach(() => {
  cleanup();
  restoreGeometry();
  window.history.replaceState(null, '', '/');
});

describe('table does not repeat the page title visibly (#1167 B-1)', () => {
  const cases: [path: string, name: string, title: string, page: React.ReactElement][] = [
    ['/admin/audit', '변경 감사 목록', '변경 감사', <AuditTrail />],
    ['/admin/usage', '메뉴 활용률 목록', '메뉴 활용률', <UsageOverview />],
    ['/admin/registry', '메뉴 레지스트리 목록', '메뉴 레지스트리', <RegistryCatalog />],
  ];
  it.each(cases)('%s: the table heading is outline-only and the accessible name stays', async (path, name, title, page) => {
    mount(path, page);
    const table = await screen.findByRole('table', { name });
    const section = table.closest('section');
    expect(section).not.toBeNull();
    const heading = within(section as HTMLElement).getByRole('heading', { level: 2 });
    expect(heading.textContent).toBe(title);
    // The visible duplicate is gone: the heading's content is sr-only, the name lives on the table's aria-label.
    expect(heading.firstElementChild?.classList.contains('sr-only')).toBe(true);
  });
});

describe('registry declaration cells (#1167 B-2)', () => {
  it('keeps Context and page-key cells on one line with the full value in title', async () => {
    mount('/admin/registry', <RegistryCatalog />);
    const table = await screen.findByRole('table', { name: '메뉴 레지스트리 목록' });
    await within(table).findByText('admin-audit');
    const cells = table.querySelectorAll('span.truncate');
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) expect(cell.getAttribute('title')).toBe(cell.textContent);
  });

  it('keeps the long ID and PATH cells on one line with the full value in title too (#1167 UX-2)', async () => {
    mount('/admin/registry', <RegistryCatalog />);
    const table = await screen.findByRole('table', { name: '메뉴 레지스트리 목록' });
    const idCell = within(table).getByText('equipment-detail');
    expect(idCell.classList.contains('truncate')).toBe(true);
    expect(idCell.getAttribute('title')).toBe('equipment-detail');
    // createRegistry rewrites an in-space menu's path to the canonical /{space}/{slug} form (ADR-0093); the cell shows that value.
    const pathCell = within(table).getByText('/operations/equipment-detail/:equipmentId');
    expect(pathCell.classList.contains('truncate')).toBe(true);
    expect(pathCell.getAttribute('title')).toBe('/operations/equipment-detail/:equipmentId');
  });
});
