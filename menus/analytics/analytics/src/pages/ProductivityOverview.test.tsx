// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Timer } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import type { ApiResponse, PlatformAdapter, Session } from '@ap/contracts';
import { manifests } from '../index';
import ProductivityOverview from './ProductivityOverview';

afterEach(cleanup);

const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: 'analytics:view', homeMenuId: 'productivity-overview' }],
  groups: [{ id: 'analytics', label: { ko: '생산성 분석', en: 'Productivity' }, icon: Timer, space: 'analytics' }],
  menus: manifests,
});

const session: Session = {
  user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' }, permissions: ['analytics:view', 'platform:view'] },
  scopes: [],
};
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };
const adapter: PlatformAdapter = {
  menuQuery: async () => empty,
  session: () => session,
  validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
  publishedMetrics: () => [],
  defaultRangeTo: () => '2026-09-26T09:00:00',
  contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
  evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
  getEntity: async () => empty,
  recordUsage: async () => ({ accepted: 0 }),
  listAnnotations: async () => empty,
  saveAnnotation: async () => empty,
  reportClientError: async () => ({ accepted: true }),
  usageSummary: async () => empty,
  auditTrail: async () => empty,
  entityAudit: async () => empty,
  accessDirectory: async () => empty,
  subscribe: () => () => undefined,
};

function renderPage(path: string) {
  window.history.replaceState(null, '', path);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><ProductivityOverview params={{}} /></PlatformProvider></I18nProvider>);
}

// #304 FIX1: the invalid-page-key alert names each field's user name and the raw value as entered,
// one sentence per field — never `key=value`.
describe('ProductivityOverview invalid page key warnings (#304 FIX1)', () => {
  it('kpi=bogus names the 지표 field and the raw value, without key=value', async () => {
    renderPage('/analytics/productivity?v=1&scopeId=ICH&kpi=bogus');
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('지표');
    expect(alert.textContent).toContain('bogus');
    expect(alert.textContent).not.toContain('kpi=');
    expect(alert.textContent).toContain('초기화');
  });

  it('states each refusal as the exact ADR-0034 sentence plus the page own action (one paragraph per field)', async () => {
    renderPage('/analytics/productivity?v=1&scopeId=ICH&kpi=bogus&axis=zzz&sort=nope');
    const alert = await screen.findByRole('alert');
    expect([...alert.querySelectorAll('p')].map(p => p.textContent)).toEqual([
      '지표 “bogus”는 이 화면에서 쓸 수 없습니다. 주소를 고치거나 조건을 초기화하세요.',
      '축 “zzz”은 이 화면에서 쓸 수 없습니다. 주소를 고치거나 조건을 초기화하세요.',
      '정렬 “nope”은 이 화면에서 쓸 수 없습니다. 주소를 고치거나 조건을 초기화하세요.',
    ]);
  });
});

// UX-304-01: the overview guidance speaks in user operations and meanings — no URL keys, no page ownership.
describe('ProductivityOverview guidance wording (UX-304-01)', () => {
  it('explains card selection and delta comparison without URL keys or page ownership', async () => {
    renderPage('/analytics/productivity?v=1&scopeId=ICH&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00');
    // PlatformPage gates children behind the async scope validation — wait for the page itself to render.
    await screen.findByRole('radiogroup', { name: '집계 단위' });
    const body = document.body.textContent ?? '';
    expect(body).toContain('카드를 선택하면');
    expect(body).toContain('같은 길이 기간과 비교');
    expect(body).not.toContain('URL 키');
    expect(body).not.toContain('페이지 소유');
    expect(body).not.toContain('kpi');
    expect(body).not.toContain('axis');
    expect(body).not.toContain('sort');
  });

  it('an unknown grain keeps the raw value and states that the default grain is in effect', async () => {
    renderPage('/analytics/productivity?v=1&scopeId=ICH&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00&granularity=zzz');
    await screen.findByText(/“zzz”/);
    const body = document.body.textContent ?? '';
    expect(body).toContain('“zzz”');
    expect(body).toContain('기본');
    expect(body).not.toContain('granularity=');
  });
});
