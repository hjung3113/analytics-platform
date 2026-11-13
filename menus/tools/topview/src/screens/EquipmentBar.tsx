import { useEffect, useId, useRef, useState } from 'react';
import { useMenuQuery, usePlatform } from '@ap/kernel';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ap/ui';
import { millisToWallClock, parseWallClockRange, wallClockToMillis } from '@eqv/core';
import { wallClockText } from '@eqv/replay';
import { equipmentOptions, type EquipmentOptions } from '../endpoints.js';
import type { HostProps } from '../host-props.js';
import { EQV_MAX_WINDOW_HOURS } from '../limits.js';

export type OptionsState = { kind: 'ready'; options: EquipmentOptions['options'] } | { kind: 'message'; message: string };
const FAILED = '설비 목록을 불러오지 못했습니다';
const MAX_MILLIS = EQV_MAX_WINDOW_HOURS * 3_600_000;

function DataWindow({ props, range, focusTrigger }: { props: HostProps; range: EquipmentOptions['options'][number]['dataRange']; focusTrigger: () => void }) {
  const { setGlobal } = usePlatform();
  if (range === null) return <>이 설비에는 표시할 데이터 구간이 없습니다</>;
  const parsed = parseWallClockRange(`${range.from}.000`, `${range.to}.000`);
  if (!parsed.ok) return <>데이터 구간을 확인하지 못했습니다</>;
  const from = wallClockToMillis(parsed.from);
  const to = wallClockToMillis(parsed.to);
  const clamped = to - from > MAX_MILLIS;
  const applied = props.time.kind === 'applied' ? props.time : null;
  const needsTime = applied === null || applied.from < parsed.from || applied.to > parsed.to
    || wallClockToMillis(applied.to) - wallClockToMillis(applied.from) > MAX_MILLIS;
  const target = { from: clamped ? millisToWallClock(to - MAX_MILLIS).slice(0, 19) : range.from, to: range.to };
  return <>
    <span>데이터 구간 {wallClockText(parsed.from)} ~ {wallClockText(parsed.to)}</span>
    {clamped && <span>마지막 {EQV_MAX_WINDOW_HOURS}시간을 적용합니다.</span>}
    <Button type="button" variant="secondary" size="toolbar" className={needsTime ? undefined : 'invisible'} aria-hidden={!needsTime} disabled={!needsTime} tabIndex={needsTime ? 0 : -1}
      onClick={() => { focusTrigger(); setGlobal({ from: target.from, to: target.to }); }}>이 구간 보기</Button>
  </>;
}

/** Context-free discovery stays local to this bar. The Kernel keeps a received list across URL writes (the read applies no Context) and marks a re-read `refreshing`. */
export function useEquipmentOptions() {
  const query = useMenuQuery(equipmentOptions, {});
  const { response } = query;
  // A retry after a failure or an empty answer starts over (the Kernel keeps the prior reply while it re-reads); a received list stays usable.
  const retrying = query.status === 'refreshing' && !(response?.outcome === 'ok' && Array.isArray(response.data?.options));
  const state: OptionsState | null = response === null || retrying ? null
    : response.outcome === 'ok' && Array.isArray(response.data?.options) ? { kind: 'ready', options: response.data.options }
    : { kind: 'message', message: response.outcome === 'empty' ? '등록된 설비가 없습니다' : response.outcome === 'forbidden' ? '설비 목록 접근 권한이 필요합니다' : FAILED };
  return { state, refreshing: query.status === 'refreshing' && state?.kind === 'ready', failed: state?.kind === 'message' && state.message === FAILED, retry: query.refetch };
}

export function EquipmentBar({ props, state, refreshing, retry }: { props: HostProps; state: OptionsState | null; refreshing: boolean; retry: () => void }) {
  const { setPage } = usePlatform();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const statusRow = useRef<HTMLDivElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  // URL writes replace the host and briefly disable discovery. Radix cannot focus a disabled trigger on close.
  // The status row holds focus while the list loads; once settled, focus goes to the select, the retry action or the row.
  useEffect(() => {
    if (state === null || refreshing || !restoreFocus.current) return;
    const active = document.activeElement;
    if (active === document.body || active === statusRow.current || active === trigger.current) {
      const target = trigger.current && !trigger.current.disabled ? trigger.current : retryButton.current ?? statusRow.current;
      target?.focus();
    }
    restoreFocus.current = false;
  }, [state, refreshing, props.time]);
  const retryList = () => { restoreFocus.current = true; statusRow.current?.focus(); retry(); };
  const focusTrigger = () => { restoreFocus.current = true; trigger.current?.focus(); };
  const options = state?.kind === 'ready' ? state.options : [];
  const chosen = options.find(option => option.id === props.equipment);
  return <section aria-label="설비 선택" className="mb-4 space-y-3 border-b border-border-subtle pb-3 text-sm text-text-secondary">
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={id} className="font-medium text-text-primary">설비</label>
      <Select value={props.equipment ?? ''} onValueChange={equipment => { restoreFocus.current = true; setPage({ equipment }); }} disabled={options.length === 0}>
        <SelectTrigger ref={trigger} id={id} density="compact" className="w-56" aria-describedby={`${id}-window`}><SelectValue placeholder="설비 선택" /></SelectTrigger>
        <SelectContent onCloseAutoFocus={event => {
          if (trigger.current?.disabled) { restoreFocus.current = true; event.preventDefault(); }
        }}>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <div id={`${id}-window`} ref={statusRow} tabIndex={-1} role="status" className="flex min-h-8 flex-wrap items-center gap-3">
      {state === null ? '설비 목록을 불러오는 중…' : state.kind === 'message' ? state.message : options.length === 0 ? '등록된 설비가 없습니다'
        : chosen && <DataWindow props={props} range={chosen.dataRange} focusTrigger={focusTrigger} />}
      {state?.kind === 'message' && state.message === FAILED && <Button ref={retryButton} type="button" variant="secondary" size="toolbar" onClick={retryList}>다시 시도</Button>}
    </div>
  </section>;
}
