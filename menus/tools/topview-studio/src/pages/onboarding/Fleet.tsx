import { ArrowRight } from 'lucide-react';
import type { ColumnFilterSpec } from '@ap/contracts';
import { useMenuQuery, usePlatform } from '@ap/kernel';
import { PlatformDataTable, PlatformPage, QueryView, RowAction, type PlatformColumn } from '@ap/components';
import { EmptyState, StatusBadge } from '@ap/ui';
import { FLEET_STATUSES, fleetEndpoint, type FleetRowDto } from '../../endpoints';
import { FLEET_STATUS_LABEL, FLEET_STATUS_TONE, percent } from '../../model/onboarding';
import { rowsOf } from '../../model/query';
import { ShortRange } from './WallClock';

/** Where onboarding data comes from while the platform has no upload path (lead 2026-11-11, CHANGELOG «Not implemented»). */
export const DATA_SOURCE_LINE = '설비 등록과 Sample Window 가져오기는 아직 EV 개발 도구에서 합니다.';

const STATUS_FILTER: ColumnFilterSpec = { kind: 'enum', options: FLEET_STATUSES.map((value) => ({ value, label: FLEET_STATUS_LABEL[value] })), ops: ['in', 'notIn'] };

// Sizes fit the 1440 body (≈1114 px) beside the pinned 동작 column (≈128 px): 120+110+110+150+90+120+100+180 = 980.
const COLUMNS: PlatformColumn<FleetRowDto>[] = [
  { id: 'equipmentId', header: '설비', size: 120, value: (row) => row.equipmentId, cell: (row) => <span className="font-mono text-xs">{row.equipmentId}</span> },
  { id: 'vendorName', header: '설비사', size: 110, value: (row) => row.vendorName },
  { id: 'modelName', header: 'Model', size: 110, value: (row) => row.modelName },
  {
    id: 'status', header: '상태', size: 150, value: (row) => row.status, filter: STATUS_FILTER, filterPinned: 1,
    exportValue: (row) => FLEET_STATUS_LABEL[row.status], cell: (row) => <StatusBadge tone={FLEET_STATUS_TONE[row.status]}>{FLEET_STATUS_LABEL[row.status]}</StatusBadge>,
  },
  { id: 'coverage', header: '커버리지', size: 90, align: 'right', value: (row) => row.coverage?.referenceRatio ?? null, cell: (row) => percent(row.coverage?.referenceRatio) },
  { id: 'assumed', header: 'assumed 비율', size: 120, align: 'right', value: (row) => row.coverage?.assumedRatio ?? null, cell: (row) => percent(row.coverage?.assumedRatio) },
  { id: 'unmapped', header: '미매핑 참조', size: 100, align: 'right', value: (row) => row.unmappedReferences, cell: (row) => row.unmappedReferences ?? '—' },
  {
    id: 'window', header: '최근 Sample Window', size: 180, sortable: false, value: (row) => row.latestWindow?.from ?? null,
    cell: (row) => (row.latestWindow ? <span className="text-xs tabular-nums"><ShortRange from={row.latestWindow.from} to={row.latestWindow.to} /></span> : '—'),
  },
];

/** ① Fleet (Management archetype): one table with column filters and the pinned `동작` column; a row opens the equipment's step tabs. */
export function Fleet() {
  const { setPage } = usePlatform();
  const fleetQ = useMenuQuery(fleetEndpoint, {});
  const rows = rowsOf(fleetQ);
  return <PlatformPage layout="fill" title="설비 온보딩">
    <div className="flex min-h-0 flex-1 flex-col break-keep">
      {rows === null ? <QueryView query={fleetQ}>{() => null}</QueryView>
        : rows.length === 0 ? <EmptyState title="등록된 설비가 없습니다" body={DATA_SOURCE_LINE} />
          : <PlatformDataTable title="Fleet" ariaLabel="Fleet" fill rows={rows} columns={COLUMNS} getRowId={(row) => row.equipmentId} preferenceKey="eqv-onboarding-fleet"
            subtitle={DATA_SOURCE_LINE}
            rowAction={(row, { compact }) => <RowAction compact={compact} icon={ArrowRight} label={`${row.equipmentId} 열기`} text="열기"
              onClick={() => setPage({ equipment: row.equipmentId, step: null, window: null })} />} />}
    </div>
  </PlatformPage>;
}
