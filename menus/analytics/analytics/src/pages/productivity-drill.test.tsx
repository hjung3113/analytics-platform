// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Timer } from 'lucide-react';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import type { QueryState } from '@ap/kernel';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { manifests } from '../index';
import { ProductivityDrillBody } from './productivity-drill';
import type { DrillData } from '../endpoints';
import { groupId, menuPermission, spaceId, type ApiResponse } from '@ap/contracts';
import { TEST_AXES } from '../test-axes';

afterEach(cleanup);

const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'productivity-overview' }],
  groups: [{ id: groupId('analytics'), label: { ko: '생산성 분석', en: 'Productivity' }, icon: Timer, space: spaceId('analytics') }],
  menus: manifests,
});
const session = testSession(['analytics:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } } });
const empty: ApiResponse<never> = { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' };
const adapter = testAdapter({
  session: () => session,
  menuQuery: async () => empty,
  saveAnnotation: async () => empty,
  usageSummary: async () => empty,
  auditTrail: async () => empty,
  entityAudit: async () => empty,
  accessDirectory: async () => empty,
});

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
  status: 'done', missing: [], completedAt: null, refetch: vi.fn(),
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
    <I18nProvider><PlatformProvider equipmentAxes={TEST_AXES} adapter={adapter} registry={registry}>
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
    // FIX1: the bar is drawn out of the text flow (absolute) inside a relative first cell, so the
    // current row's EquipmentID aligns with every other row instead of being pushed aside.
    const bar = current.querySelector('span.bg-accent-primary')!;
    expect(bar.classList.contains('absolute')).toBe(true);
    expect(bar.closest('td')!.classList.contains('relative')).toBe(true);
  });

  it('leaves ordinary rows unmarked when nothing is current', () => {
    mount(null);
    for (const row of screen.getAllByRole('row')) expect(row.getAttribute('aria-current')).toBeNull();
  });
});
