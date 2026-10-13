// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Timer } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import type { QueryState } from '@ap/kernel';
import type { ApiResponse, PlatformAdapter, Session } from '@ap/contracts';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { manifests } from '../index';
import { ProductivityDrillBody } from './productivity-drill';
import type { DrillData } from '../endpoints';

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

function SlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}

const kpi: DrillData['kpi'] = {
  equipmentCount: 2, knownBuckets: 12,
  occupancy: { num: 1, den: 2, pct: 50 }, dwell: null,
  cycle: { jobs: 3, p50: 1, p95: 2 }, throughput: { jobs: 2, started: 3 },
};
const done = (data: DrillData): QueryState<DrillData> => ({
  status: 'done', refetch: vi.fn(),
  response: { outcome: 'ok', data, assessments: [], trust: null, correlationId: 'c' } as ApiResponse<DrillData>,
});
const drillData: DrillData = {
  roomFound: true, stgroupFound: true, kpi,
  stgroups: [{ stgroup: 'st-01', equipmentCount: 2, occupancyPct: 50, jobs: 4 }],
  equipment: [
    { equipmentId: 'EQ-01', occupancyPct: 40, jobs: 3, p95Min: 1.5 },
    { equipmentId: 'EQ-02', occupancyPct: 60, jobs: 5, p95Min: 2.5 },
  ],
};
const fmt = { n1: (v: number) => v.toFixed(1), ni: (v: number) => String(v) };

function mount(equipment: string | null) {
  return render(
    <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
      <DetailPanelSlotProvider>
        <SlotHost />
        <ProductivityDrillBody ko room="PHOTO" stgroup="st-01" equipment={equipment}
          stgroupQuery={done(drillData)} equipmentQuery={done(drillData)}
          onEnterStgroup={vi.fn()} onEnterEquipment={vi.fn()} onCloseEquipment={vi.fn()}
          equipmentHref="/" {...fmt} />
      </DetailPanelSlotProvider>
    </PlatformProvider></I18nProvider>,
  );
}

describe('equipment drill current row (#301)', () => {
  it('marks the drill target row with aria-current and a visible 2px accent bar, not colour alone', () => {
    mount('EQ-02');
    const rows = screen.getAllByRole('row');
    const current = rows.find(row => row.textContent?.includes('EQ-02'))!;
    const other = rows.find(row => row.textContent?.includes('EQ-01'))!;
    expect(current.getAttribute('aria-current')).toBe('true');
    expect(other.getAttribute('aria-current')).toBeNull();
    // Shape cue: an unfaded accent bar precedes the id; weight accompanies the selected surface.
    expect(current.querySelector('span.bg-accent-primary')).not.toBeNull();
  });

  it('leaves ordinary rows unmarked when nothing is current', () => {
    mount(null);
    for (const row of screen.getAllByRole('row')) expect(row.getAttribute('aria-current')).toBeNull();
  });
});
