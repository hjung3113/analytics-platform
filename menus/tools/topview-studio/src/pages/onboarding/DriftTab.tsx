import { ArrowRight } from 'lucide-react';
import type { evaluateDrift } from '@eqv/editor';
import { PlatformDataTable, RowAction, type PlatformColumn } from '@ap/components';
import { EmptyState } from '@ap/ui';
import { ShortRange } from './WallClock';
import type { EquipmentData } from './useEquipment';

export const DRIFT_UNKNOWN = 'Drift를 판단할 수 없습니다';

type Drift = NonNullable<ReturnType<typeof evaluateDrift>['drift']>;
type DriftRow = { id: string; change: string; alias: string; evidence: string };

const COLUMNS: PlatformColumn<DriftRow>[] = [
  { id: 'change', header: '변화', size: 240, value: (row) => row.change },
  { id: 'alias', header: 'alias', size: 200, value: (row) => row.alias, cell: (row) => <span className="font-mono text-xs">{row.alias}</span> },
  { id: 'evidence', header: '근거', size: 360, value: (row) => row.evidence },
];

/** One row per change, in spec A's order: new aliases, new slots, observed transfers without a Transfer Capability. */
function driftRows(drift: Drift): DriftRow[] {
  return [
    ...drift.newAliases.map((alias) => ({ id: `alias\u0000${alias}`, change: '새 alias', alias, evidence: 'Baseline Inventory에 없음' })),
    ...drift.newSlots.map(({ alias, slot }) => ({ id: `slot\u0000${alias}\u0000${slot}`, change: '새 slot', alias, evidence: `slot ${slot} · Baseline Inventory에 없음` })),
    ...drift.transfersWithoutCapability.map(({ from, to, count }) => ({ id: `transfer\u0000${from}\u0000${to}`, change: 'Transfer Capability 없음', alias: `${from} → ${to}`, evidence: `관측 이송 ${count}건` })),
  ];
}

/**
 * ⑦ Drift of the selected window against the latest Binding's Baseline Inventory (ONBOARDING §6). Unknown is its own state with the
 * reason, never «no drift»; nothing changes automatically. A drifted state is the «Drift 검토» table (spec A).
 */
export function DriftTab({ data, drift, onMapping }: { data: EquipmentData; drift: ReturnType<typeof evaluateDrift> | null; onMapping(): void }) {
  const body = data.bindings === null || data.bindings.bindings.length === 0 ? <EmptyState title="게시된 Mapping이 없습니다" body="게시한 뒤 새 Sample Window와 비교합니다." />
    : drift === null ? <EmptyState title={DRIFT_UNKNOWN} body={data.inventory === null ? '선택한 Sample Window의 Inventory가 없습니다.' : '최신 Binding의 Mapping Version이 없습니다.'} />
      : drift.drift === null ? <EmptyState title={DRIFT_UNKNOWN} body={drift.unknown ?? undefined} />
        : !drift.drifted ? <EmptyState title="기준 대비 Drift 없음" />
          : <PlatformDataTable title="Drift 검토" ariaLabel="Drift 검토" fill rows={driftRows(drift.drift)} columns={COLUMNS} getRowId={(row) => row.id} preferenceKey="eqv-onboarding-drift"
            rowAction={(row, { compact }) => <RowAction compact={compact} icon={ArrowRight} label={`${row.alias} Mapping에서 검토`} text="Mapping에서 검토" onClick={onMapping} />} />;
  return <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
    <p className="text-xs text-text-secondary">{data.window ? <>Sample Window <ShortRange from={data.window.from} to={data.window.to} /></> : 'Sample Window 없음'} · 최신 Binding의 Baseline Inventory와 비교합니다. 자동으로 바뀌지 않습니다.</p>
    {body}
  </div>;
}
