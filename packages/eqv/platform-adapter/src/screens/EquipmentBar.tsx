import { useEffect, useId, useRef, useState } from 'react';
import type { ModuleHost } from '@ap/contracts';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ap/ui';
import { millisToWallClock, parseWallClockRange, wallClockToMillis } from '@eqv/core';
import { wallClockText } from '@eqv/replay';
import { equipmentOptions, type EquipmentOptions } from '../endpoints.js';
import type { HostProps } from '../host-props.js';
import { EQV_MAX_WINDOW_HOURS } from '../limits.js';

type OptionsState = { kind: 'ready'; options: EquipmentOptions['options'] } | { kind: 'message'; message: string };
const FAILED = '설비 목록을 불러오지 못했습니다';
const MAX_MILLIS = EQV_MAX_WINDOW_HOURS * 3_600_000;

function DataWindow({ host, props, range, focusTrigger }: { host: ModuleHost; props: HostProps; range: EquipmentOptions['options'][number]['dataRange']; focusTrigger: () => void }) {
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
    {host.setTime
      ? <Button type="button" variant="secondary" size="toolbar" className={needsTime ? undefined : 'invisible'} aria-hidden={!needsTime} disabled={!needsTime} tabIndex={needsTime ? 0 : -1}
          onClick={() => { focusTrigger(); host.setTime?.(target); }}>이 구간 보기</Button>
      : needsTime && <span>컨텍스트 바에서 {clamped ? `마지막 ${EQV_MAX_WINDOW_HOURS}시간을` : '이 구간을'} 적용하세요.</span>}
  </>;
}

/** Context-free discovery stays local to this bar; it never changes the replay board's status. */
export function useEquipmentOptions(host: ModuleHost) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ host: ModuleHost; attempt: number; state: OptionsState } | null>(null);
  const state = settled?.host === host && settled.attempt === attempt ? settled.state : null;
  useEffect(() => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (host.signal.aborted) abort();
    else host.signal.addEventListener('abort', abort, { once: true });
    const finish = (state: OptionsState) => {
      if (!controller.signal.aborted) setSettled({ host, attempt, state });
    };
    void (async () => {
      try {
        if (!host.query || controller.signal.aborted) { finish({ kind: 'message', message: FAILED }); return; }
        const answer = await host.query(equipmentOptions, {}, controller.signal);
        if (answer.outcome === 'ok' && Array.isArray(answer.data?.options)) finish({ kind: 'ready', options: answer.data.options });
        else finish({ kind: 'message', message: answer.outcome === 'empty' ? '등록된 설비가 없습니다'
          : answer.outcome === 'forbidden' ? '설비 목록 접근 권한이 필요합니다' : FAILED });
      } catch {
        finish({ kind: 'message', message: FAILED });
      }
    })();
    return () => { controller.abort(); host.signal.removeEventListener('abort', abort); };
  }, [host, attempt]);
  return { state, failed: state?.kind === 'message' && state.message === FAILED, retry: () => setAttempt(value => value + 1) };
}

export function EquipmentBar({ host, props, state, retry }: { host: ModuleHost; props: HostProps; state: OptionsState | null; retry: () => void }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  // URL writes replace the host and briefly disable discovery. Radix cannot focus a disabled trigger on close.
  useEffect(() => {
    if (state === null || !restoreFocus.current) return;
    if (document.activeElement === document.body) trigger.current?.focus();
    restoreFocus.current = false;
  }, [state, props.time]);
  const focusTrigger = () => { restoreFocus.current = true; trigger.current?.focus(); };
  const options = state?.kind === 'ready' ? state.options : [];
  const chosen = options.find(option => option.id === props.equipment);
  return <section aria-label="설비 선택" className="mb-4 space-y-3 border-b border-border-subtle pb-3 text-sm text-text-secondary">
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={id} className="font-medium text-text-primary">설비</label>
      <Select value={props.equipment ?? ''} onValueChange={equipment => host.setPage({ equipment })} disabled={options.length === 0}>
        <SelectTrigger ref={trigger} id={id} density="compact" className="w-56" aria-describedby={`${id}-window`}><SelectValue placeholder="설비 선택" /></SelectTrigger>
        <SelectContent onCloseAutoFocus={event => {
          if (trigger.current?.disabled) { restoreFocus.current = true; event.preventDefault(); }
        }}>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <div id={`${id}-window`} role="status" className="flex min-h-8 flex-wrap items-center gap-3">
      {state === null ? '설비 목록을 불러오는 중…' : state.kind === 'message' ? state.message : options.length === 0 ? '등록된 설비가 없습니다'
        : chosen && <DataWindow host={host} props={props} range={chosen.dataRange} focusTrigger={focusTrigger} />}
      {state?.kind === 'message' && state.message === FAILED && <Button type="button" variant="secondary" size="toolbar" onClick={retry}>다시 시도</Button>}
    </div>
  </section>;
}
