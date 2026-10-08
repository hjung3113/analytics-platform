// THROWAWAY #225 — never merge.
// Three drill layouts on /analytics/productivity, switched with ?variant=A|B|C. Step URL is shared; each layout is its own tree.
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { QueryState } from '@ap/kernel';
import { PlatformLink } from '@ap/kernel';
import { DetailDrawer, Field, QueryView, StateMessage } from '@ap/components';
import {
  Button, cn,
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from '@ap/ui';
import type { BreakdownRow, DrillData, DrillEquipmentRow, DrillStgroupRow, KpiSet } from '../endpoints';

export type DrillStep = 0 | 1 | 2 | 3;

export type DrillActions = {
  enterRoom: (room: string) => void;
  enterStgroup: (stgroup: string) => void;
  enterEquipment: (equipmentId: string) => void;
  /** Push to an earlier step and drop every later key. */
  goTo: (step: 0 | 1 | 2) => void;
  switchRoom: (room: string) => void;
  switchStgroup: (stgroup: string) => void;
};

type Fmt = { n1: (value: number) => string; ni: (value: number) => string };

type Sibling = { value: string; occupancyPct: number | null };

const focusItem = 'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring';

function missingValue(ko: boolean, value: string): string {
  return ko ? `이 조건에서 없는 값: ${value}` : `No value in this context: ${value}`;
}

function Missing({ ko, value }: { ko: boolean; value: string }) {
  return <StateMessage tone="warning" icon={<AlertTriangle className="size-4" aria-hidden />} title={missingValue(ko, value)}
    body={ko ? '다른 값으로 바꾸지 않습니다.' : 'Nothing was substituted.'} />;
}

function pctText(ko: boolean, value: number | null, n1: Fmt['n1']): string {
  return value === null ? (ko ? '미확인' : 'unknown') : `${n1(value)}%`;
}

export function KpiLine({ ko, kpi, n1, ni }: { ko: boolean; kpi: KpiSet } & Fmt) {
  const occ = pctText(ko, kpi.occupancy?.pct ?? null, n1);
  const p95 = kpi.cycle.p95 === null ? (ko ? '미확인' : 'unknown') : `${n1(kpi.cycle.p95)}${ko ? '분' : 'min'}`;
  return <p className="text-xs text-text-secondary tabular-nums">
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
      <tbody className="tabular tabular-nums">{body}</tbody>
    </table>
  </div>;
}

function Th({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return <th scope="col" className={cn('t-table-header px-3 py-1.5 text-text-muted', align === 'right' ? 'text-right' : 'text-left')}>{children}</th>;
}

export function StgroupTable({ ko, rows, onEnter, n1, ni }: { ko: boolean; rows: DrillStgroupRow[]; onEnter: (stgroup: string) => void } & Fmt) {
  return tableShell(ko ? 'StGroup 점유 구성' : 'StGroup occupancy', <>
    <Th>StGroup</Th>
    <Th align="right">{ko ? '설비 수' : 'Equipment'}</Th>
    <Th align="right">{ko ? '점유율' : 'Occupancy'}</Th>
    <Th align="right">{ko ? 'Job 수' : 'Jobs'}</Th>
    <Th><span className="sr-only">{ko ? '들어가기' : 'Enter'}</span></Th>
  </>, rows.map(row => <tr key={row.stgroup} className="border-t border-border-subtle">
    <td className="t-mono px-3 py-1.5">{row.stgroup}</td>
    <td className="px-3 py-1.5 text-right">{ni(row.equipmentCount)}</td>
    <td className="px-3 py-1.5 text-right">{pctText(ko, row.occupancyPct, n1)}</td>
    <td className="px-3 py-1.5 text-right">{ni(row.jobs)}</td>
    <td className="px-2 py-1.5 text-right"><EnterButton ko={ko} value={row.stgroup} onClick={() => onEnter(row.stgroup)} /></td>
  </tr>));
}

export function EquipmentTable({ ko, rows, current, onEnter, n1, ni }: {
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
    <td className="px-3 py-1.5 text-right">{pctText(ko, row.occupancyPct, n1)}</td>
    <td className="px-3 py-1.5 text-right">{ni(row.jobs)}</td>
    <td className="px-3 py-1.5 text-right">{row.p95Min === null ? (ko ? '미확인' : 'unknown') : `${n1(row.p95Min)} ${ko ? '분' : 'min'}`}</td>
    <td className="px-2 py-1.5 text-right"><EnterButton ko={ko} value={row.equipmentId} onClick={() => onEnter(row.equipmentId)} /></td>
  </tr>));
}

function SiblingMenu({ ko, label, value, items, onSwitch, n1 }: {
  ko: boolean; label: string; value: string; items: Sibling[]; onSwitch: (value: string) => void; n1: Fmt['n1'];
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label={ko ? `${label} 형제 바꾸기` : `Switch ${label} sibling`}
        className="inline-flex size-6 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-sunken hover:text-text-primary">
        <ChevronDown className="size-3.5" aria-hidden />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="w-56">
      <DropdownMenuRadioGroup value={value} onValueChange={onSwitch}>
        {items.map(item => <DropdownMenuRadioItem key={item.value} value={item.value} className={focusItem}>
          <span className="t-mono">{item.value}</span>
          <span className="ml-2 text-text-secondary tabular-nums">{pctText(ko, item.occupancyPct, n1)}</span>
        </DropdownMenuRadioItem>)}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}

function PathChip({ current, label, onUp, menu }: {
  current: boolean; label: string; onUp: () => void; menu?: ReactNode;
}) {
  return <span className="inline-flex items-center">
    <button type="button" aria-current={current ? 'step' : undefined} onClick={() => { if (!current) onUp(); }}
      className={cn('rounded-md px-2 py-1', current ? 'bg-accent-primary-soft font-medium text-text-primary' : 'text-text-secondary hover:bg-surface-sunken')}>
      {label}
    </button>
    {menu}
  </span>;
}

export function DrillPath({ ko, step, room, stgroup, equipment, actions, siblings, n1 }: {
  ko: boolean; step: DrillStep; room: string | null; stgroup: string | null; equipment: string | null;
  actions: DrillActions; siblings: { rooms: Sibling[]; stgroups: Sibling[] } | null; n1: Fmt['n1'];
}) {
  if (step === 0 || room === null) return null;
  return <nav aria-label={ko ? '드릴 경로' : 'Drill path'} className="flex flex-wrap items-center gap-1 text-xs">
    <button type="button" onClick={() => actions.goTo(0)}
      className="rounded-md px-2 py-1 text-text-secondary hover:bg-surface-sunken">{ko ? '전체' : 'All'}</button>
    <ChevronRight className="size-3 text-text-muted" aria-hidden />
    <PathChip current={step === 1} label={`${ko ? '공정' : 'Room'}: ${room}`} onUp={() => actions.goTo(1)}
      menu={siblings ? <SiblingMenu ko={ko} label={ko ? '공정' : 'room'} value={room} items={siblings.rooms} onSwitch={actions.switchRoom} n1={n1} /> : undefined} />
    {stgroup !== null && <>
      <ChevronRight className="size-3 text-text-muted" aria-hidden />
      <PathChip current={step === 2} label={`StGroup: ${stgroup}`} onUp={() => actions.goTo(2)}
        menu={siblings ? <SiblingMenu ko={ko} label="StGroup" value={stgroup} items={siblings.stgroups} onSwitch={actions.switchStgroup} n1={n1} /> : undefined} />
    </>}
    {equipment !== null && <>
      <ChevronRight className="size-3 text-text-muted" aria-hidden />
      <PathChip current={step === 3} label={`${ko ? '설비' : 'Equipment'}: ${equipment}`} onUp={() => undefined} />
    </>}
  </nav>;
}

function Stage({ title, kpi, ko, n1, ni, children }: { title: string; kpi: KpiSet; ko: boolean; children: ReactNode } & Fmt) {
  return <section className="space-y-2">
    <h2 className="t-section-title">{title}</h2>
    <KpiLine ko={ko} kpi={kpi} n1={n1} ni={ni} />
    {children}
  </section>;
}

export function VariantA({ ko, step, room, stgroup, equipment, stgroupQuery, equipmentQuery, actions, n1, ni }: {
  ko: boolean; step: DrillStep; room: string; stgroup: string | null; equipment: string | null;
  stgroupQuery: QueryState<DrillData>; equipmentQuery: QueryState<DrillData>; actions: DrillActions;
} & Fmt) {
  return <QueryView widgetName={ko ? '공정 드릴' : 'Room drill'} query={stgroupQuery} skeletonRows={5}>
    {data => {
      if (!data.roomFound) return <Missing ko={ko} value={room} />;
      if (step === 1 || stgroup === null) {
        return <Stage ko={ko} n1={n1} ni={ni} kpi={data.kpi} title={ko ? `${room} StGroup` : `${room} StGroups`}>
          <StgroupTable ko={ko} rows={data.stgroups} onEnter={actions.enterStgroup} n1={n1} ni={ni} />
        </Stage>;
      }
      return <QueryView widgetName={ko ? 'StGroup 드릴' : 'StGroup drill'} query={equipmentQuery} skeletonRows={5}>
        {eq => eq.stgroupFound
          ? <Stage ko={ko} n1={n1} ni={ni} kpi={eq.kpi} title={stgroup}>
            <EquipmentTable ko={ko} rows={eq.equipment} current={equipment} onEnter={actions.enterEquipment} n1={n1} ni={ni} />
          </Stage>
          : <Missing ko={ko} value={stgroup} />}
      </QueryView>;
    }}
  </QueryView>;
}

function columnButtonClass(selected: boolean): string {
  return cn('flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs',
    selected ? 'bg-accent-primary-soft font-medium text-text-primary' : 'text-text-secondary hover:bg-surface-sunken');
}

export function VariantB({ ko, step, room, stgroup, equipment, roomsQuery, stgroupQuery, equipmentQuery, actions, n1, ni }: {
  ko: boolean; step: DrillStep; room: string; stgroup: string | null; equipment: string | null;
  roomsQuery: QueryState<BreakdownRow[]>; stgroupQuery: QueryState<DrillData>; equipmentQuery: QueryState<DrillData>;
  actions: DrillActions;
} & Fmt) {
  return <div className="grid items-start gap-3 lg:grid-cols-3">
    <section aria-label={ko ? '공정 목록' : 'Rooms'} className="min-w-0 overflow-hidden rounded-lg border border-border-subtle bg-surface-card">
      <h2 className="t-card-title px-3 pt-3">{ko ? '공정' : 'Room'}</h2>
      <QueryView widgetName={ko ? '공정 목록' : 'Rooms'} hideWidgetName query={roomsQuery} skeletonRows={4}>
        {rows => <ul className="mt-2 divide-y divide-border-subtle">
          {rows.map(row => {
            const pct = row.observableHours > 0 ? (row.occupiedHours / row.observableHours) * 100 : null;
            return <li key={row.key}>
              <button type="button" aria-current={row.key === room ? 'true' : undefined} aria-label={ko ? `${row.key} 들어가기` : `Enter ${row.key}`}
                onClick={() => actions.enterRoom(row.key)} className={columnButtonClass(row.key === room)}>
                <span className="t-mono">{row.key}</span>
                <span className="tabular-nums">{pctText(ko, pct, n1)}</span>
              </button>
            </li>;
          })}
        </ul>}
      </QueryView>
    </section>
    <section aria-label={ko ? 'StGroup 목록' : 'StGroups'} className="min-w-0 overflow-hidden rounded-lg border border-border-subtle bg-surface-card">
      <h2 className="t-card-title px-3 pt-3">StGroup</h2>
      <QueryView widgetName="StGroup" hideWidgetName query={stgroupQuery} skeletonRows={4}>
        {data => data.roomFound ? <>
          {step === 1 && <div className="px-3 pt-1"><KpiLine ko={ko} kpi={data.kpi} n1={n1} ni={ni} /></div>}
          <ul className="mt-2 divide-y divide-border-subtle">
            {data.stgroups.map(row => <li key={row.stgroup}>
              <button type="button" aria-current={row.stgroup === stgroup ? 'true' : undefined} aria-label={ko ? `${row.stgroup} 들어가기` : `Enter ${row.stgroup}`}
                onClick={() => actions.enterStgroup(row.stgroup)} className={columnButtonClass(row.stgroup === stgroup)}>
                <span className="t-mono">{row.stgroup}</span>
                <span className="tabular-nums">{pctText(ko, row.occupancyPct, n1)}</span>
              </button>
            </li>)}
          </ul>
        </> : <div className="p-3"><Missing ko={ko} value={room} /></div>}
      </QueryView>
    </section>
    <section aria-label={ko ? '설비 목록' : 'Equipment'} className="min-w-0 overflow-hidden rounded-lg border border-border-subtle bg-surface-card">
      <h2 className="t-card-title px-3 pt-3">EquipmentID</h2>
      {step < 2 || stgroup === null
        ? <p className="px-3 py-3 text-xs text-text-secondary">{ko ? 'StGroup을 고르면 설비가 여기에 나옵니다.' : 'Pick a StGroup to list equipment.'}</p>
        : <QueryView widgetName={ko ? '설비 목록' : 'Equipment'} hideWidgetName query={equipmentQuery} skeletonRows={4}>
          {data => data.stgroupFound ? <>
            <div className="px-3 pt-1"><KpiLine ko={ko} kpi={data.kpi} n1={n1} ni={ni} /></div>
            <ul className="mt-2 divide-y divide-border-subtle">
              {data.equipment.map(row => <li key={row.equipmentId}>
                <button type="button" aria-current={row.equipmentId === equipment ? 'true' : undefined} aria-label={ko ? `${row.equipmentId} 들어가기` : `Enter ${row.equipmentId}`}
                  onClick={() => actions.enterEquipment(row.equipmentId)} className={columnButtonClass(row.equipmentId === equipment)}>
                  <span className="t-mono">{row.equipmentId}</span>
                  <span className="tabular-nums">{pctText(ko, row.occupancyPct, n1)}</span>
                </button>
              </li>)}
            </ul>
          </> : <div className="p-3"><Missing ko={ko} value={stgroup} /></div>}
        </QueryView>}
    </section>
  </div>;
}

function summaryLine(ko: boolean, kind: 'room' | 'stgroup', name: string, kpi: KpiSet, count: number, n1: Fmt['n1']): string {
  const occ = pctText(ko, kpi.occupancy?.pct ?? null, n1);
  if (kind === 'room') {
    return ko ? `공정 ${name} · 점유율 ${occ} · StGroup ${count}개` : `Room ${name} · occupancy ${occ} · ${count} StGroups`;
  }
  return ko ? `StGroup ${name} · 점유율 ${occ} · 설비 ${count}개` : `StGroup ${name} · occupancy ${occ} · ${count} equipment`;
}

export function VariantC({ ko, step, room, stgroup, equipment, stgroupQuery, equipmentQuery, actions, n1, ni }: {
  ko: boolean; step: DrillStep; room: string; stgroup: string | null; equipment: string | null;
  stgroupQuery: QueryState<DrillData>; equipmentQuery: QueryState<DrillData>; actions: DrillActions;
} & Fmt) {
  const [opened, setOpened] = useState<{ step: DrillStep; room: boolean; stgroup: boolean }>({ step, room: false, stgroup: false });
  const roomOpen = opened.step === step && opened.room;
  const stgroupOpen = opened.step === step && opened.stgroup;
  const scrolledFor = useRef<DrillStep | null>(null);
  const currentRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (scrolledFor.current === step) return;
    if (!currentRef.current) return;
    currentRef.current.scrollIntoView({ block: 'start' });
    scrolledFor.current = step;
  });
  const pastRoom = step > 1 && !roomOpen;
  const pastStgroup = step > 2 && !stgroupOpen;
  return <div className="space-y-2">
    <QueryView widgetName={ko ? '공정 섹션' : 'Room section'} query={stgroupQuery} skeletonRows={4}>
      {data => {
        if (!data.roomFound) return <section ref={currentRef} className="scroll-mt-16"><Missing ko={ko} value={room} /></section>;
        return <>
          <section ref={step === 1 ? currentRef : undefined} className="scroll-mt-16 rounded-lg border border-border-subtle bg-surface-card">
            <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <h2 className="text-sm font-medium text-text-primary">
                {pastRoom ? summaryLine(ko, 'room', room, data.kpi, data.stgroups.length, n1) : (ko ? `공정 ${room}` : `Room ${room}`)}
              </h2>
              {pastRoom && <Button size="sm" variant="secondary" onClick={() => setOpened({ step, room: true, stgroup: stgroupOpen })}>{ko ? '펼치기' : 'Expand'}</Button>}
            </header>
            {!pastRoom && <div className="space-y-2 px-4 pb-4">
              <KpiLine ko={ko} kpi={data.kpi} n1={n1} ni={ni} />
              <StgroupTable ko={ko} rows={data.stgroups} onEnter={actions.enterStgroup} n1={n1} ni={ni} />
            </div>}
          </section>
          {step >= 2 && stgroup !== null && <QueryView widgetName={ko ? 'StGroup 섹션' : 'StGroup section'} query={equipmentQuery} skeletonRows={4}>
            {eq => eq.stgroupFound ? <>
              <section ref={step === 2 ? currentRef : undefined} className="scroll-mt-16 rounded-lg border border-border-subtle bg-surface-card">
                <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                  <h2 className="text-sm font-medium text-text-primary">
                    {pastStgroup ? summaryLine(ko, 'stgroup', stgroup, eq.kpi, eq.equipment.length, n1) : `StGroup ${stgroup}`}
                  </h2>
                  {pastStgroup && <Button size="sm" variant="secondary" onClick={() => setOpened({ step, room: roomOpen, stgroup: true })}>{ko ? '펼치기' : 'Expand'}</Button>}
                </header>
                {!pastStgroup && <div className="space-y-2 px-4 pb-4">
                  <KpiLine ko={ko} kpi={eq.kpi} n1={n1} ni={ni} />
                  <EquipmentTable ko={ko} rows={eq.equipment} current={equipment} onEnter={actions.enterEquipment} n1={n1} ni={ni} />
                </div>}
              </section>
              {step === 3 && equipment !== null && (eq.equipment.some(row => row.equipmentId === equipment)
                ? <section ref={currentRef} className="scroll-mt-16 rounded-lg border border-border-subtle bg-surface-card px-4 py-3">
                  <h2 className="text-sm font-medium text-text-primary">{ko ? `설비 ${equipment}` : `Equipment ${equipment}`}</h2>
                  <p className="mt-1 text-xs text-text-secondary">{ko ? '요약과 설비 상세 링크는 오른쪽 상세에 있습니다.' : 'The summary and equipment link are in the detail slot.'}</p>
                </section>
                : <section ref={currentRef} className="scroll-mt-16"><Missing ko={ko} value={equipment} /></section>)}
            </> : <section ref={currentRef} className="scroll-mt-16"><Missing ko={ko} value={stgroup} /></section>}
          </QueryView>}
        </>;
      }}
    </QueryView>
  </div>;
}

export function DrillEquipmentSlot({ ko, equipmentId, query, href, onClose, n1, ni }: {
  ko: boolean; equipmentId: string; query: QueryState<DrillData>; href: string; onClose: () => void;
} & Fmt) {
  return <DetailDrawer
    title={<span className="t-mono">{equipmentId}</span>}
    subtitle={ko ? '설비 요약' : 'Equipment summary'}
    onClose={onClose}
    tabs={[{
      id: 'summary',
      label: ko ? '요약' : 'Summary',
      content: <QueryView widgetName={ko ? '설비 요약' : 'Equipment summary'} hideWidgetName query={query} skeletonRows={4}>
        {data => {
          const row = data.stgroupFound ? data.equipment.find(item => item.equipmentId === equipmentId) : undefined;
          if (!row) return <Missing ko={ko} value={equipmentId} />;
          return <>
            <dl>
              <Field label="EquipmentID" mono>{row.equipmentId}</Field>
              <Field label={ko ? '점유율' : 'Occupancy'}>{pctText(ko, row.occupancyPct, n1)}</Field>
              <Field label={ko ? '완료 Job' : 'Jobs'}>{ni(row.jobs)}</Field>
              <Field label={ko ? 'P95 사이클타임' : 'P95 cycle time'}>{row.p95Min === null ? (ko ? '미확인' : 'unknown') : `${n1(row.p95Min)} ${ko ? '분' : 'min'}`}</Field>
            </dl>
            <div className="mt-3">
              <Button size="sm" asChild>
                <PlatformLink href={href}>{ko ? '설비 상세로' : 'Equipment detail'}</PlatformLink>
              </Button>
            </div>
          </>;
        }}
      </QueryView>,
    }]}
  />;
}
