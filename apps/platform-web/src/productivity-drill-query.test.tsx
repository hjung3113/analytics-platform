import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { MenuQuery, PlatformAdapter, Session } from '@ap/contracts';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { registry } from './menus';

// Same scope, period and room filter. Only the drill step differs, so a zero count is the format-error
// guard (canQuery requires drill.invalid === null, 06 §6.4) and not an unvalidated Scope.
const BASE = '/analytics/productivity?v=1&scopeId=ICH&from=2026-09-25T09:00:00&to=2026-09-26T09:00:00&roomNames=PHOTO';

// Per-test timeout must exceed the waitFor readiness cap (10s), or vitest (default 5s) ends the test before waitFor leaves its diagnosis.
const DRILL_TEST_TIMEOUT_MS = 15_000;

const session: Session = {
  user: {
    id: 'analyst',
    name: 'analyst',
    title: { ko: '분석가', en: 'Analyst' },
    permissions: ['analytics:view', 'platform:view'],
  },
  scopes: [{ id: 'ICH', label: 'ICH · Site A', grantedRooms: 1, totalRooms: 1 }],
};

const refused = {
  outcome: 'error' as const, data: null, assessments: [], trust: null, correlationId: 'fixture', message: 'fixture',
};

function countingAdapter(calls: MenuQuery[]): PlatformAdapter {
  return {
    menuQuery: async request => { calls.push(request); return refused; },
    session: () => session,
    validateScope: async () => ({ status: 'valid', grantedRooms: ['PHOTO'] }),
    publishedMetrics: () => [],
    defaultRangeTo: () => '2026-09-26T09:00:00',
    contextOptions: async () => ({ stgroup: [], team: [], makerModel: [] }),
    evaluateSelection: async () => ({ inCondition: [], outOfCondition: [] }),
    getEntity: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    auditTrail: async () => refused,
    entityAudit: async () => refused,
    accessDirectory: async () => refused,
    recordUsage: async () => ({ accepted: 0 }),
    usageSummary: async () => refused,
    listAnnotations: async () => ({ outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' }),
    saveAnnotation: async () => refused,
    reportClientError: async () => ({ accepted: true }),
    subscribe: () => () => {},
  };
}

function productivityPage() {
  const component = registry.menus.find(menu => menu.id === 'productivity-overview')?.component;
  if (!component) throw new Error('productivity-overview has no page component');
  return component;
}

/** Renders the real productivity page. `ready` is UI behind the Scope gate, so the count is after validation. */
async function mount(drill: string, ready: (calls: MenuQuery[]) => boolean): Promise<MenuQuery[]> {
  const Page = productivityPage();
  const calls: MenuQuery[] = [];
  window.history.replaceState(null, '', `${BASE}${drill}`);
  render(<I18nProvider>
    <PlatformProvider adapter={countingAdapter(calls)} registry={registry}>
      <Suspense fallback={null}><Page params={{}} /></Suspense>
    </PlatformProvider>
  </I18nProvider>);
  await waitFor(() => { expect(ready(calls)).toBe(true); }, { timeout: 10_000 });
  await act(async () => { await Promise.resolve(); });
  return calls;
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('productivity drill menuQuery (06 §6.4)', () => {
  it('calls menuQuery for drillRoom=PHOTO after Scope is valid', { timeout: DRILL_TEST_TIMEOUT_MS }, async () => {
    const calls = await mount('&drillRoom=PHOTO',
      readyCalls => readyCalls.length > 0 && screen.queryByRole('button', { name: '공정: PHOTO' }) !== null);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(call => call.endpoint.startsWith('analytics.productivity.'))).toBe(true);
  });

  it('does not call menuQuery when the URL has only drillStgroup', { timeout: DRILL_TEST_TIMEOUT_MS }, async () => {
    const calls = await mount('&drillStgroup=STG-PHOTO-A', () => screen.queryAllByRole('alert')
      .some(node => node.textContent?.includes('drillStgroup=STG-PHOTO-A') === true));
    expect(calls).toHaveLength(0);
  });
});
