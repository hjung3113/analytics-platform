// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { PlatformAdapter, Session } from '@ap/contracts';
import { House } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { manifests } from '../index';
import RegistryCatalog from './RegistryCatalog';
import UsageOverview from './UsageOverview';

afterEach(cleanup);

const registry = createRegistry({
  spaces: [{ id: 'operations', label: { ko: '운영 콘솔', en: 'Operations console' }, description: { ko: '목적', en: 'Purpose' }, permission: 'console:access', homeMenuId: 'admin-roles' }],
  groups: [{ id: 'admin', label: { ko: '관리·감사', en: 'Administration' }, icon: House, space: 'operations' }],
  menus: manifests,
});
const session: Session = { user: { id: 'admin-a', name: 'admin-a', title: { ko: '관리자', en: 'Administrator' }, permissions: ['console:access', 'platform:view'] }, scopes: [] };
const forbidden = async () => ({ outcome: 'forbidden' as const, data: null, assessments: [], trust: null, correlationId: 'fixture' });
const empty = async () => ({ outcome: 'empty' as const, data: null, assessments: [], trust: null, correlationId: 'fixture' });
const adapter: PlatformAdapter = {
  menuQuery: forbidden,
  session: () => session,
  validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
  publishedMetrics: () => [],
  defaultRangeTo: () => '2026-09-26T09:00:00',
  contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
  evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
  getEntity: empty,
  recordUsage: async () => ({ accepted: 0 }),
  listAnnotations: empty,
  saveAnnotation: forbidden,
  reportClientError: async () => ({ accepted: true }),
  usageSummary: forbidden,
  auditTrail: forbidden,
  entityAudit: forbidden,
  accessDirectory: forbidden,
  subscribe: () => () => undefined,
};

describe.each([
  ['UsageOverview', '/admin/usage', UsageOverview],
  ['RegistryCatalog', '/admin/registry', RegistryCatalog],
] as const)('%s invalid sort/page (ADR-0034 sentences)', (_name, path, Page) => {
  it('states both exact value sentences and Reset clears sort and page', async () => {
    window.history.replaceState(null, '', `${path}?sort=bogus&page=0`);
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><Page /></PlatformProvider></I18nProvider>);
    const alert = (await screen.findAllByRole('alert')).find(el => el.textContent?.includes('bogus'))!;
    expect([...alert.querySelectorAll('p')].map(p => p.textContent)).toEqual([
      '정렬 “bogus”은 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.',
      '페이지 “0”는 이 화면에서 쓸 수 없는 값입니다. 조건을 초기화하세요.',
    ]);
    fireEvent.click(within(alert).getByRole('button', { name: '초기화' }));
    const params = new URLSearchParams(window.location.search);
    expect(params.has('sort')).toBe(false);
    expect(params.has('page')).toBe(false);
  });
});
