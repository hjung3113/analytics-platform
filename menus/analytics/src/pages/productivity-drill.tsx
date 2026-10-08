import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { QueryState } from '@ap/kernel';
import { PlatformLink } from '@ap/kernel';
import { DetailDrawer, Field, QueryView, StateMessage } from '@ap/components';
import { Button, cn } from '@ap/ui';
import type { DrillData, DrillEquipmentRow, DrillStgroupRow, KpiSet } from '../endpoints';

type Fmt = { n1: (value: number) => string; ni: (value: number) => string };

export function pctHint(ko: boolean, value: number | null, n1: Fmt['n1']): string {
  return value === null ? (ko ? '미확인' : 'unknown') : `${n1(value)}%`;
}

function KpiLine({ ko, kpi, n1, ni }: { ko: boolean; kpi: KpiSet } & Fmt) {
  const occ = pctHint(ko, kpi.occupancy?.pct ?? null, n1);
  const p95 = kpi.cycle.p95 === null ? (ko ? '미확인' : 'unknown') : `${n1(kpi.cycle.p95)}${ko ? '분' : 'min'}`;
  return <p className="text-xs text-text-secondary tabular">
    {ko
      ? `점유율 ${occ} · 완료 Job ${ni(kpi.throughput.jobs)} · 설비 ${ni(kpi.equipmentCount)} · P95 ${p95}`
      : `Occupancy ${occ} · completed jobs ${ni(kpi.throughput.jobs)} · equipment ${ni(kpi.equipmentCount)} · P95 ${p95}`}
  </p>;
}

function EnterButton({ ko, value, onClick }: { ko: boolean; value: string; onClick: () => void }) {
  return <button type="button" aria-label={ko ? `${value} 들어가기` : `Enter ${value}`} onClick={onClick}
    className="inline-flex size-6 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-sunken hover:text-text-primary">
    <ChevronRight className="size-3.5" aria-hidden />
  </button>;
}

function tableShell(caption: string, head: ReactNode, body: ReactNode) {
  return <div className="overflow-auto rounded-lg border border-border-subtle bg-surface-card">
    <table className="w-full text-xs">
      <caption className="sr-only">{caption}</caption>
      <thead className="bg-surface-sunken"><tr>{head}</tr></thead>
      <tbody className="tabular">{body}</tbody>
    </table>
  </div>;
}

function Th({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return <th scope="col" className={cn('t-table-header px-3 py-1.5 text-text-muted', align === 'right' ? 'text-right' : 'text-left')}>{children}</th>;
}

function StgroupTable({ ko, rows, onEnter, n1, ni }: { ko: boolean; rows: DrillStgroupRow[]; onEnter: (stgroup: string) => void } & Fmt) {
  return tableShell(ko ? 'StGroup 점유 구성' : 'StGroup occupancy', <>
    <Th>StGroup</Th>
    <Th align="right">{ko ? '설비 수' : 'Equipment'}</Th>
    <Th align="right">{ko ? '점유율' : 'Occupancy'}</Th>
    <Th align="right">{ko ? 'Job 수' : 'Jobs'}</Th>
    <Th><span className="sr-only">{ko ? '들어가기' : 'Enter'}</span></Th>
  </>, rows.map(row => <tr key={row.stgroup} className="border-t border-border-subtle">
    <td className="t-mono px-3 py-1.5">{row.stgroup}</td>
    <td className="px-3 py-1.5 text-right">{ni(row.equipmentCount)}</td>
    <td className="px-3 py-1.5 text-right">{pctHint(ko, row.occupancyPct, n1)}</td>
    <td className="px-3 py-1.5 text-right">{ni(row.jobs)}</td>
    <td className="px-2 py-1.5 text-right"><EnterButton ko={ko} value={row.stgroup} onClick={() => onEnter(row.stgroup)} /></td>
  </tr>));
}

function EquipmentTable({ ko, rows, current, onEnter, n1, ni }: {
  ko: boolean; rows: DrillEquipmentRow[]; current: string | null; onEnter: (equipmentId: string) => void;
} & Fmt) {
  return tableShell(ko ? '설비 점유' : 'Equipment occupancy', <>
    <Th>EquipmentID</Th>
    <Th align="right">{ko ? '점유율' : 'Occupancy'}</Th>
    <Th align="right">{ko ? 'Job 수' : 'Jobs'}</Th>
    <Th align="right">{ko ? 'P95 사이클타임' : 'P95 cycle time'}</Th>
    <Th><span className="sr-only">{ko ? '들어가기' : 'Enter'}</span></Th>
  </>, rows.map(row => <tr key={row.equipmentId} className={cn('border-t border-border-subtle', current === row.equipmentId && 'bg-accent-primary-soft')}>
    <td className="t-mono px-3 py-1.5">{row.equipmentId}</td>
    <td className="px-3 py-1.5 text-right">{pctHint(ko, row.occupancyPct, n1)}</td>
    <td className="px-3 py-1.5 text-right">{ni(row.jobs)}</td>
    <td className="px-3 py-1.5 text-right">{row.p95Min === null ? (ko ? '미확인' : 'unknown') : `${n1(row.p95Min)} ${ko ? '분' : 'min'}`}</td>
    <td className="px-2 py-1.5 text-right"><EnterButton ko={ko} value={row.equipmentId} onClick={() => onEnter(row.equipmentId)} /></td>
  </tr>));
}

function Stage({ title, kpi, ko, n1, ni, children }: { title: string; kpi: KpiSet; ko: boolean; children: ReactNode } & Fmt) {
  return <section className="space-y-2">
    <h2 className="t-section-title">{title}</h2>
    <KpiLine ko={ko} kpi={kpi} n1={n1} ni={ni} />
    {children}
  </section>;
}

export function ProductivityDrillBody({ ko, room, stgroup, equipment, stgroupQuery, equipmentQuery, onEnterStgroup, onEnterEquipment, onCloseEquipment, equipmentHref, n1, ni }: {
  ko: boolean;
  room: string;
  stgroup: string | null;
  equipment: string | null;
  stgroupQuery: QueryState<DrillData>;
  equipmentQuery: QueryState<DrillData>;
  onEnterStgroup: (stgroup: string) => void;
  onEnterEquipment: (equipmentId: string) => void;
  onCloseEquipment: () => void;
  equipmentHref: string;
} & Fmt) {
  return <QueryView widgetName={ko ? '공정 드릴' : 'Process drill'} query={stgroupQuery} skeletonRows={5}>
    {data => {
      if (stgroup === null) {
        return <Stage ko={ko} n1={n1} ni={ni} kpi={data.kpi} title={ko ? `${room} StGroup` : `${room} StGroups`}>
          <StgroupTable ko={ko} rows={data.stgroups} onEnter={onEnterStgroup} n1={n1} ni={ni} />
        </Stage>;
      }
      return <QueryView widgetName={ko ? 'StGroup 드릴' : 'StGroup drill'} query={equipmentQuery} skeletonRows={5}>
        {eq => {
          const row = equipment === null ? undefined : eq.equipment.find(item => item.equipmentId === equipment);
          return <>
            <Stage ko={ko} n1={n1} ni={ni} kpi={eq.kpi} title={stgroup}>
              <EquipmentTable ko={ko} rows={eq.equipment} current={equipment} onEnter={onEnterEquipment} n1={n1} ni={ni} />
            </Stage>
            {equipment !== null && <DetailDrawer
              title={<span className="t-mono">{equipment}</span>}
              subtitle={ko ? '설비 요약' : 'Equipment summary'}
              onClose={onCloseEquipment}
              tabs={[{
                id: 'summary',
                label: ko ? '요약' : 'Summary',
                content: row
                  ? <>
                    <dl>
                      <Field label="EquipmentID" mono>{row.equipmentId}</Field>
                      <Field label={ko ? '점유율' : 'Occupancy'}>{pctHint(ko, row.occupancyPct, n1)}</Field>
                      <Field label={ko ? '완료 Job' : 'Jobs'}>{ni(row.jobs)}</Field>
                      <Field label={ko ? 'P95 사이클타임' : 'P95 cycle time'}>{row.p95Min === null ? (ko ? '미확인' : 'unknown') : `${n1(row.p95Min)} ${ko ? '분' : 'min'}`}</Field>
                    </dl>
                    <div className="mt-3">
                      <Button size="sm" asChild>
                        <PlatformLink href={equipmentHref}>{ko ? '설비 상세로' : 'Equipment detail'}</PlatformLink>
                      </Button>
                    </div>
                  </>
                  : <StateMessage tone="warning" icon={<AlertTriangle className="size-4" aria-hidden />}
                    title={ko ? `이 조건에서 없는 값: ${equipment}` : `No value in this context: ${equipment}`}
                    body={ko ? '다른 값으로 바꾸지 않습니다.' : 'Nothing was substituted.'} />,
              }]}
            />}
          </>;
        }}
      </QueryView>;
    }}
  </QueryView>;
}
