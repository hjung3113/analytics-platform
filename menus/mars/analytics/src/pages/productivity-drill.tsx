import type { TextParams } from '@ap/kernel';
import { formatText } from '@ap/kernel';
import { ANALYTICS_MESSAGES } from '../messages';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { QueryState } from '@ap/kernel';
import { PlatformLink } from '@ap/kernel';
import { DetailDrawer, QueryView } from '@ap/components';
import { Button, cn, FieldList, FieldRow, Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@ap/ui';
import type { DrillData, DrillEquipmentRow, DrillStgroupRow, KpiSet } from '../endpoints';

type Fmt = { n1: (value: number) => string; ni: (value: number) => string };

export function pctHint(ko: boolean, value: number | null, n1: Fmt['n1']): string {
  return value === null ? (formatText(ANALYTICS_MESSAGES.productivityDrillNotConfirmed, (ko ? 'ko' : 'en'))) : `${n1(value)}%`;
}

function KpiLine({ ko, kpi, n1, ni }: { ko: boolean; kpi: KpiSet } & Fmt) {
  const m = (key: keyof typeof ANALYTICS_MESSAGES, params?: TextParams) => formatText(ANALYTICS_MESSAGES[key], (ko ? 'ko' : 'en'), params);
  const occ = pctHint(ko, kpi.occupancy?.pct ?? null, n1);
  const p95 = kpi.cycle.p95 === null ? (m('productivityDrillNotConfirmed2')) : `${n1(kpi.cycle.p95)}${m('productivityDrillMin')}`;
  return <p className="text-xs text-text-secondary tabular">
    {m('productivityDrillOccupancyCompletedJobsEquipmentP95', { occ: String(occ), value: String(ni(kpi.throughput.jobs)), value3: String(ni(kpi.equipmentCount)), p95: String(p95) })}
  </p>;
}

function EnterButton({ ko, value, onClick }: { ko: boolean; value: string; onClick: () => void }) {
  const m = (key: keyof typeof ANALYTICS_MESSAGES, params?: TextParams) => formatText(ANALYTICS_MESSAGES[key], (ko ? 'ko' : 'en'), params);
  return <button type="button" aria-label={m('productivityDrillEnter', { value: String(value) })} onClick={onClick}
    className="inline-flex size-6 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-sunken hover:text-text-primary">
    <ChevronRight className="size-3.5" aria-hidden />
  </button>;
}

function tableShell(caption: string, head: ReactNode, body: ReactNode) {
  return <div className="overflow-auto rounded-lg border border-border-subtle bg-surface-card elevation-panel">
    <Table density="compact">
      <TableCaption srOnly>{caption}</TableCaption>
      <TableHeader><TableRow>{head}</TableRow></TableHeader>
      <TableBody>{body}</TableBody>
    </Table>
  </div>;
}

function Th({ children, align = 'start' }: { children: ReactNode; align?: 'start' | 'end' }) {
  return <TableHead scope="col" align={align}>{children}</TableHead>;
}

function StgroupTable({ ko, rows, onEnter, n1, ni }: { ko: boolean; rows: DrillStgroupRow[]; onEnter: (stgroup: string) => void } & Fmt) {
  const m = (key: keyof typeof ANALYTICS_MESSAGES, params?: TextParams) => formatText(ANALYTICS_MESSAGES[key], (ko ? 'ko' : 'en'), params);
  return tableShell(m('productivityDrillStgroupOccupancy'), <>
    <Th>StGroup</Th>
    <Th align="end">{m('productivityDrillEquipment')}</Th>
    <Th align="end">{m('productivityDrillOccupancy')}</Th>
    <Th align="end">{m('productivityDrillJobs')}</Th>
    <Th><span className="sr-only">{m('productivityDrillEnter2')}</span></Th>
  </>, rows.map(row => <TableRow key={row.stgroup}>
    <TableCell><span className="t-mono">{row.stgroup}</span></TableCell>
    <TableCell align="end">{ni(row.equipmentCount)}</TableCell>
    <TableCell align="end">{pctHint(ko, row.occupancyPct, n1)}</TableCell>
    <TableCell align="end">{ni(row.jobs)}</TableCell>
    <TableCell align="end"><EnterButton ko={ko} value={row.stgroup} onClick={() => onEnter(row.stgroup)} /></TableCell>
  </TableRow>));
}

function EquipmentTable({ ko, rows, current, onEnter, n1, ni }: {
  ko: boolean; rows: DrillEquipmentRow[]; current: string | null; onEnter: (equipmentId: string) => void;
} & Fmt) {
  const m = (key: keyof typeof ANALYTICS_MESSAGES, params?: TextParams) => formatText(ANALYTICS_MESSAGES[key], (ko ? 'ko' : 'en'), params);
  return tableShell(m('productivityDrillEquipmentOccupancy'), <>
    <Th>EquipmentID</Th>
    <Th align="end">{m('productivityDrillOccupancy2')}</Th>
    <Th align="end">{m('productivityDrillJobs2')}</Th>
    <Th align="end">{m('productivityDrillP95CycleTime')}</Th>
    <Th><span className="sr-only">{m('productivityDrillEnter3')}</span></Th>
  </>, rows.map(row => {
    const isCurrent = current === row.equipmentId;
    return <TableRow key={row.equipmentId} current={isCurrent}>
      {/* Shape + weight accompany the selected surface (06 §26, DESIGN Shell visual rules): 2px accent bar,
          drawn out of the text flow so the current row's ID keeps its column alignment. */}
      <TableCell className="relative">
        {isCurrent && <span aria-hidden className="absolute left-0 inset-y-1 w-0.5 rounded-full bg-accent-primary" />}
        <span className={cn('t-mono', isCurrent && 'font-medium')}>{row.equipmentId}</span>
      </TableCell>
      <TableCell align="end">{pctHint(ko, row.occupancyPct, n1)}</TableCell>
      <TableCell align="end">{ni(row.jobs)}</TableCell>
      <TableCell align="end">{row.p95Min === null ? (m('productivityDrillNotConfirmed3')) : `${n1(row.p95Min)} ${m('productivityDrillMin2')}`}</TableCell>
      <TableCell align="end"><EnterButton ko={ko} value={row.equipmentId} onClick={() => onEnter(row.equipmentId)} /></TableCell>
    </TableRow>;
  }));
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
  const m = (key: keyof typeof ANALYTICS_MESSAGES, params?: TextParams) => formatText(ANALYTICS_MESSAGES[key], (ko ? 'ko' : 'en'), params);
  return <QueryView widgetName={m('productivityDrillProcessDrill')} query={stgroupQuery} skeletonRows={5}>
    {data => {
      if (stgroup === null) {
        return <Stage ko={ko} n1={n1} ni={ni} kpi={data.kpi} title={m('productivityDrillStgroups', { room: String(room) })}>
          <StgroupTable ko={ko} rows={data.stgroups} onEnter={onEnterStgroup} n1={n1} ni={ni} />
        </Stage>;
      }
      return <QueryView widgetName={m('productivityDrillStgroupDrill')} query={equipmentQuery} skeletonRows={5}>
        {eq => {
          const row = equipment === null ? undefined : eq.equipment.find(item => item.equipmentId === equipment);
          return <>
            <Stage ko={ko} n1={n1} ni={ni} kpi={eq.kpi} title={stgroup}>
              <EquipmentTable ko={ko} rows={eq.equipment} current={equipment} onEnter={onEnterEquipment} n1={n1} ni={ni} />
            </Stage>
            {row && <DetailDrawer
              title={<span className="t-mono">{row.equipmentId}</span>}
              subtitle={m('productivityDrillEquipmentSummary')}
              onClose={onCloseEquipment}
              tabs={[{
                id: 'summary',
                label: m('productivityDrillSummary'),
                content: <>
                  <FieldList>
                    <FieldRow layout="detail" label="EquipmentID" mono>{row.equipmentId}</FieldRow>
                    <FieldRow layout="detail" label={m('productivityDrillOccupancy3')}>{pctHint(ko, row.occupancyPct, n1)}</FieldRow>
                    <FieldRow layout="detail" label={m('productivityDrillJobs3')}>{ni(row.jobs)}</FieldRow>
                    <FieldRow layout="detail" label={m('productivityDrillP95CycleTime2')}>{row.p95Min === null ? (m('productivityDrillNotConfirmed4')) : `${n1(row.p95Min)} ${m('productivityDrillMin3')}`}</FieldRow>
                  </FieldList>
                  <div className="mt-3">
                    <Button size="sm" asChild>
                      <PlatformLink href={equipmentHref}>{m('productivityDrillEquipmentDetail')}</PlatformLink>
                    </Button>
                  </div>
                </>,
              }]}
            />}
          </>;
        }}
      </QueryView>;
    }}
  </QueryView>;
}
