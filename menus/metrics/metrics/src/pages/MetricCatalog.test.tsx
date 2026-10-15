// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Gauge } from 'lucide-react';
import type { ApiResponse, MenuQuery, PlatformAdapter, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { manifests } from '../index';
import MetricCatalogPage from './MetricCatalog';

afterEach(cleanup);

// Real manifests so /metrics keeps its declared pageKeys; only the group/space wiring is added.
const registry = createRegistry({
  spaces: [{ id: 'analytics', label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, homeMenuId: 'metric-catalog' }],
  groups: [{ id: 'metrics', label: { ko: '지표관리', en: 'Metrics' }, icon: Gauge, space: 'analytics' }],
  menus: manifests,
});

const session: Session = { user: { id: 'user-a', name: 'user-a', title: { ko: 'a', en: 'a' }, permissions: ['platform:view', 'metrics:view'] }, scopes: [] };

/** The catalog count query (`metrics.catalog.list`) fails; every other menu query answers empty. */
function fixture(): PlatformAdapter {
  return {
    menuQuery: async (request: MenuQuery): Promise<ApiResponse<unknown>> =>
      request.endpoint === 'metrics.catalog.list'
        ? { outcome: 'error', data: null, message: 'catalog unavailable', assessments: [], trust: null, correlationId: 'fixture' }
        : { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' },
    session: () => session,
    validateScope: async () => ({ status: 'valid', grantedRooms: [] }),
    publishedMetrics: () => [],
    defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    auditTrail: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    entityAudit: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    accessDirectory: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    recordUsage: async () => ({ accepted: 0 }),
    listAnnotations: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    saveAnnotation: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    reportClientError: async () => ({ accepted: true }),
    usageSummary: async () => ({ outcome: 'forbidden', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    subscribe: () => () => undefined,
  };
}

describe('metric catalog count under a failed list query (UXA-4)', () => {
  /** Same as `fixture()`, but the `metrics.catalog.list` response is held until the test releases it. */
  function deferredFixture(): { adapter: PlatformAdapter; release: (response: ApiResponse<unknown>) => void } {
    let release!: (response: ApiResponse<unknown>) => void;
    const pending = new Promise<ApiResponse<unknown>>(resolve => { release = resolve; });
    const base = fixture();
    return {
      release,
      adapter: {
        ...base,
        menuQuery: (request: MenuQuery) =>
          request.endpoint === 'metrics.catalog.list' ? pending : base.menuQuery(request),
      },
    };
  }

  it('shows the pending count (…) until the failing response lands, then drops the number', async () => {
    window.history.replaceState(null, '', '/metrics');
    const { adapter, release } = deferredFixture();
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><MetricCatalogPage params={{}} /></PlatformProvider></I18nProvider>);
    // No response yet: the count stays pending, it is neither a number nor a failure statement.
    const pending = await screen.findByText(/게시 포인터는 레코드에 저장된 값/);
    expect(pending.textContent).toContain('합성 …건');
    expect(pending.textContent).not.toContain('합성 지표입니다');
    await act(async () => {
      release({ outcome: 'error', data: null, message: 'catalog unavailable', assessments: [], trust: null, correlationId: 'fixture' });
    });
    expect(await screen.findByText(/합성 지표입니다/)).toBeTruthy();
    expect(screen.getByText(/게시 포인터는 레코드에 저장된 값/).textContent).not.toContain('…');
  });

  it('drops the numeric count (no …) once the count query failed', async () => {
    window.history.replaceState(null, '', '/metrics');
    render(<I18nProvider><PlatformProvider adapter={fixture()} registry={registry}><MetricCatalogPage params={{}} /></PlatformProvider></I18nProvider>);
    // The count line first paints as pending (…) — wait for the failure itself, not the first paint.
    await screen.findByText(/합성 지표입니다/);
    const subtitle = screen.getByText(/게시 포인터는 레코드에 저장된 값/);
    expect(subtitle.textContent).toContain('합성 지표입니다');
    expect(subtitle.textContent).not.toContain('…');
  });
});
