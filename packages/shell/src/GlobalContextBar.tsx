import { CalendarDays, ChevronDown, Link2, RotateCcw, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { CONTEXT_LABELS, useAdapterRequest, useI18n, usePlatform } from '@ap/kernel';
import { type Capability, type Condition, type ConditionAxis, conditionLabel, type ContextKey, formatDateTime, type GlobalContext, parseDateTime, shift } from '@ap/contracts';
import { Button, cn, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { SegmentedRadio } from '@ap/components';

const hours = (g: GlobalContext) => (g.from && g.to ? (parseDateTime(g.to, 'to').getTime() - parseDateTime(g.from, 'from').getTime()) / 3_600_000 : null);
const short = (v: string) => v.replace('T', ' ').slice(5, 16);

export function GlobalContextBar() {
  const { route, global, setGlobal, resetContext, toast, url } = usePlatform();
  const { t, lang } = useI18n();
  if (!route) return null;
  const cap = route.menu.context;
  const has: Record<ContextKey, boolean> = {
    time: global.from !== null, roomNames: global.roomNames !== null, condition: global.condition !== null, selection: global.selection !== null,
    lot: global.lotIds !== null, ppid: global.ppid !== null, recipe: global.recipeIds !== null, metric: global.metricId !== null,
  };
  const keys: ContextKey[] = ['time', 'roomNames', 'condition', 'selection', 'lot', 'ppid', 'recipe', 'metric'];
  const shown = keys.filter(k => cap[k] !== 'unsupported' || has[k]);
  if (!shown.length) return null;
  const editable = (k: ContextKey) => cap[k] !== 'unsupported';

  return <div role="region" aria-label={t('globalContext')} className="sticky top-0 z-20 border-b border-border-subtle bg-surface-canvas/95 px-5 py-2 backdrop-blur">
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{t('globalContext')}</span>
      {shown.includes('time') && (editable('time') ? <PeriodControl cap={cap.time} /> : <CarriedChip k="time" cap={cap.time} value={global.from ? `${short(global.from)} → ${short(global.to!)}` : ''} onRemove={() => setGlobal({ from: null, to: null })} />)}
      {shown.includes('roomNames') && (editable('roomNames') ? <RoomEditor cap={cap.roomNames} /> : <CarriedChip k="roomNames" cap={cap.roomNames} value={setText(global.roomNames, t)} onRemove={() => setGlobal({ roomNames: null })} />)}
      {shown.includes('condition') && (editable('condition') ? <ConditionEditor cap={cap.condition} /> : <CarriedChip k="condition" cap={cap.condition} value={global.condition ? conditionLabel(global.condition) : ''} onRemove={() => setGlobal({ condition: null })} />)}
      {shown.includes('selection') && (editable('selection') ? <SelectionEditor cap={cap.selection} /> : <CarriedChip k="selection" cap={cap.selection} value={setText(global.selection, t)} onRemove={() => setGlobal({ selection: null })} />)}
      {has.lot && <CarriedChip k="lot" cap={cap.lot} value={setText(global.lotIds, t)} onRemove={() => setGlobal({ lotIds: null })} />}
      {has.ppid && <CarriedChip k="ppid" cap={cap.ppid} value={global.ppid!} onRemove={() => setGlobal({ ppid: null })} />}
      {has.recipe && <CarriedChip k="recipe" cap={cap.recipe} value={setText(global.recipeIds, t)} onRemove={() => setGlobal({ recipeIds: null })} />}
      {has.metric && <CarriedChip k="metric" cap={cap.metric} value={`${global.metricId}${global.metricVersion ? ` @ ${global.metricVersion}` : ` (${lang === 'ko' ? '버전 미정' : 'no version'})`}`} onRemove={() => setGlobal({ metricId: null, metricVersion: null })} />}
      <span className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[12px] text-text-secondary" onClick={() => { void navigator.clipboard?.writeText(window.location.origin + url); toast(lang === 'ko' ? '현재 Context가 담긴 링크를 복사했습니다. 받는 사람의 권한으로 서버가 다시 검증합니다.' : 'Copied a link with the current context. The server re-validates for the recipient.'); }}>
          <Link2 className="size-3.5" aria-hidden />{lang === 'ko' ? '링크 복사' : 'Copy link'}
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[12px] text-text-secondary" onClick={resetContext}>
          <RotateCcw className="size-3.5" aria-hidden />{t('reset')}
        </Button>
      </span>
    </div>
  </div>;

}

function setText(ids: string[] | null, t: (k: 'all' | 'explicitEmpty') => string): string {
  if (ids === null) return t('all');
  if (!ids.length) return t('explicitEmpty');
  return ids.length <= 2 ? ids.join(', ') : `${ids[0]} +${ids.length - 1}`;
}

function CapTag({ cap }: { cap: Capability }) {
  const { t } = useI18n();
  if (cap === 'apply') return null;
  return <span className={cn('rounded-xs px-1 text-[10px] font-semibold', cap === 'reference' ? 'bg-surface-sunken text-text-secondary' : 'bg-accent-warn-soft text-text-warning')}>
    {cap === 'reference' ? t('referenceOnly') : t('notUsed')}
  </span>;
}

function ChipShell({ label, value, cap, empty, children, ...rest }: { label: ReactNode; value: ReactNode; cap: Capability; empty?: boolean; children?: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...rest}
    className={cn('inline-flex h-8 max-w-[22rem] items-center gap-1.5 rounded-sm border px-2.5 text-[12px] hover:border-border-control',
      cap === 'unsupported' ? 'border-dashed border-border-strong bg-transparent text-text-muted' : 'border-border-strong bg-surface-card text-text-primary',
      empty && 'text-text-muted')}>
    <span className="text-text-muted">{label}</span>
    <span className="truncate font-medium tabular">{value}</span>
    <CapTag cap={cap} />
    {children}
  </button>;
}

/** Preserved context the current page does not edit: never silently dropped (§6); removable explicitly. */
function CarriedChip({ k, cap, value, onRemove }: { k: ContextKey; cap: Capability; value: string; onRemove: () => void }) {
  const { tx, t, lang } = useI18n();
  return <span className={cn('inline-flex h-8 items-center gap-1.5 rounded-sm border pl-2.5 pr-1 text-[12px]',
    cap === 'unsupported' ? 'border-dashed border-border-strong text-text-muted' : 'border-border-strong bg-surface-card')}
    title={cap === 'unsupported' ? (lang === 'ko' ? 'URL에 보존되며 지원 메뉴로 이동하면 재검증 후 적용됩니다.' : 'Kept in the URL; re-validated and applied on a supporting page.') : undefined}>
    <span className="text-text-muted">{tx(CONTEXT_LABELS[k])}</span>
    <span className="max-w-48 truncate font-medium tabular">{value}</span>
    <CapTag cap={cap} />
    <button type="button" onClick={onRemove} aria-label={`${t('clear')} ${tx(CONTEXT_LABELS[k])}`} className="grid size-6 place-items-center rounded-xs hover:bg-surface-sunken"><X className="size-3" aria-hidden /></button>
  </span>;
}

function PeriodControl({ cap }: { cap: Capability }) {
  const { global, setGlobal, defaultRangeTo } = usePlatform();
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const h = hours(global);
  const preset = global.to === defaultRangeTo && h === 24 ? '1d' : global.to === defaultRangeTo && h === 168 ? '7d' : global.from ? 'custom' : null;
  const presets = [{ id: '1d', label: t('preset1d'), h: 24 }, { id: '7d', label: t('preset7d'), h: 168 }, { id: 'custom', label: t('presetCustom'), h: 0 }] as const;
  const choose = (id: string) => {
    const p = presets.find(x => x.id === id)!;
    if (id === 'custom') { setOpen(true); return; }
    setGlobal({ from: shift(defaultRangeTo, -p.h), to: defaultRangeTo });
  };
  return <div className="flex items-center gap-1">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex h-8 min-w-[204px] items-center gap-2 rounded-sm border border-border-strong bg-surface-card px-2.5 text-[12px] hover:border-border-control" aria-label={`${t('period')}: ${global.from ?? ''} – ${global.to ?? ''}`}>
          <CalendarDays className="size-4 text-text-muted" aria-hidden />
          {global.from ? <span className="font-medium tabular">{short(global.from)} → {short(global.to!)}</span> : <span className="text-text-muted">{t('selectPeriod')}</span>}
          {h !== null && <span className="text-text-muted tabular">({h >= 48 ? `${Math.round(h / 24)}${lang === 'ko' ? '일' : 'd'}` : `${h}h`})</span>}
          <CapTag cap={cap} />
          <ChevronDown className="size-3.5 text-text-muted" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] rounded-md border border-border-strong bg-surface-card p-3 shadow-md">
        <CustomRange onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
    <SegmentedRadio
      label={t('period')}
      value={preset}
      onChange={id => choose(id)}
      className="flex h-8 items-center gap-0.5 rounded-sm border border-border-subtle bg-surface-card p-0.5"
      optionClassName={selected => cn('h-full rounded-xs px-2.5 text-[12px] font-medium', selected ? 'bg-accent-primary text-text-on-accent' : 'text-text-secondary hover:bg-surface-sunken')}
      options={presets.map(p => ({ value: p.id, label: p.label }))}
    />
  </div>;
}

/** Calendar dates are inclusive in the UI and become [D1T00:00:00, (D2+1)T00:00:00) in the URL (§6.3). */
function CustomRange({ onDone }: { onDone: () => void }) {
  const { global, setGlobal, defaultRangeTo } = usePlatform();
  const { t, lang } = useI18n();
  const [mode, setMode] = useState<'date' | 'time'>('date');
  const [start, setStart] = useState((global.from ?? shift(defaultRangeTo, -24)).slice(0, 10));
  const [end, setEnd] = useState(global.to ? shift(global.to, -24).slice(0, 10) : defaultRangeTo.slice(0, 10));
  const [fromT, setFromT] = useState(global.from ?? shift(defaultRangeTo, -24));
  const [toT, setToT] = useState(global.to ?? defaultRangeTo);
  let error: string | null = null;
  let result: { from: string; to: string } | null = null;
  try {
    if (mode === 'date') {
      const from = `${start}T00:00:00`;
      const to = formatDateTime(new Date(parseDateTime(`${end}T00:00:00`, 'end').getTime() + 86_400_000));
      if (from >= to) throw new Error(lang === 'ko' ? '시작일이 종료일보다 늦습니다.' : 'Start is after end.');
      result = { from, to };
    } else {
      const from = fromT.length === 16 ? `${fromT}:00` : fromT; const to = toT.length === 16 ? `${toT}:00` : toT;
      parseDateTime(from, 'from'); parseDateTime(to, 'to');
      if (from >= to) throw new Error(lang === 'ko' ? 'from < to 이어야 합니다.' : 'from must be before to.');
      result = { from, to };
    }
  } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const input = 'h-8 w-full rounded-md border border-border-control bg-surface-card px-2 text-[12px] tabular';
  return <form onSubmit={e => { e.preventDefault(); if (result) { setGlobal(result); onDone(); } }} onKeyDown={e => { if (e.key === 'Escape') onDone(); }} className="space-y-3 text-[12px]">
    <SegmentedRadio
      label={lang === 'ko' ? '입력 방식' : 'Input mode'}
      value={mode}
      onChange={setMode}
      className="flex gap-1"
      optionClassName={selected => cn('rounded-sm border px-2 py-1', selected ? 'border-accent-primary bg-accent-primary-soft text-accent-primary' : 'border-border-subtle')}
      options={[
        { value: 'date', label: lang === 'ko' ? '날짜 (양끝 포함)' : 'Dates (inclusive)' },
        { value: 'time', label: lang === 'ko' ? '시각 (초 단위)' : 'Date-time (seconds)' },
      ]}
    />
    {mode === 'date' ? <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1"><span className="text-text-muted">{lang === 'ko' ? '시작일' : 'Start date'}</span><input type="date" className={input} value={start} onChange={e => setStart(e.target.value)} /></label>
      <label className="space-y-1"><span className="text-text-muted">{lang === 'ko' ? '종료일 (포함)' : 'End date (inclusive)'}</span><input type="date" className={input} value={end} onChange={e => setEnd(e.target.value)} /></label>
    </div> : <div className="grid grid-cols-1 gap-2">
      <label className="space-y-1"><span className="text-text-muted">from</span><input type="datetime-local" step={1} className={input} value={fromT} onChange={e => setFromT(e.target.value)} /></label>
      <label className="space-y-1"><span className="text-text-muted">to ({lang === 'ko' ? '미포함' : 'exclusive'})</span><input type="datetime-local" step={1} className={input} value={toT} onChange={e => setToT(e.target.value)} /></label>
    </div>}
    <p aria-live="polite" className={cn('rounded-md px-2 py-1.5 tabular', error ? 'bg-accent-danger-soft text-text-danger' : 'bg-surface-sunken text-text-secondary')}>
      {error ?? `URL: [${result!.from}, ${result!.to})`}
    </p>
    <p className="text-[11px] text-text-muted">{lang === 'ko' ? '설비 wall-clock(naive) 기준이며 UTC로 변환하지 않습니다. 교대일/영업일 의미는 Open입니다.' : 'Equipment wall-clock (naive), never converted to UTC. Shift/business-day semantics are Open.'}</p>
    <div className="flex justify-end gap-2">
      <Button type="button" size="sm" variant="secondary" className="h-7 px-3 text-[12px]" onClick={onDone}>{t('cancel')}</Button>
      <Button type="submit" size="sm" className="h-7 px-3 text-[12px]" disabled={!result}>{t('apply')}</Button>
    </div>
  </form>;
}

type SetMode = 'absent' | 'some' | 'empty';
function modeOf(ids: string[] | null): SetMode { return ids === null ? 'absent' : ids.length ? 'some' : 'empty'; }

function SetEditor({ label, cap, value, options, absentLabel, onApply, note, search }: {
  label: string; cap: Capability; value: string[] | null; options: { id: string; hint?: string; outside?: boolean }[];
  absentLabel: string; onApply: (v: string[] | null) => void; note?: ReactNode; search?: boolean;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SetMode>(modeOf(value));
  const [picked, setPicked] = useState<string[]>(value ?? []);
  const [q, setQ] = useState('');
  const reset = (o: boolean) => { setOpen(o); if (o) { setMode(modeOf(value)); setPicked(value ?? []); setQ(''); } };
  const visible = options.filter(o => !q || o.id.toLowerCase().includes(q.toLowerCase()) || o.hint?.toLowerCase().includes(q.toLowerCase()));
  return <Popover open={open} onOpenChange={reset}>
    <PopoverTrigger asChild><ChipShell label={label} value={value === null ? absentLabel : value.length ? (value.length <= 2 ? value.join(', ') : `${value[0]} +${value.length - 1}`) : t('explicitEmpty')} cap={cap} empty={value === null}><ChevronDown className="size-3.5 text-text-muted" aria-hidden /></ChipShell></PopoverTrigger>
    <PopoverContent align="start" className="w-80 rounded-md border border-border-strong bg-surface-card p-3 text-[12px] shadow-md">
      <SegmentedRadio
        label={label}
        value={mode}
        onChange={setMode}
        className="mb-2 flex flex-wrap gap-1"
        optionClassName={selected => cn('rounded-sm border px-2 py-1', selected ? 'border-accent-primary bg-accent-primary-soft text-accent-primary' : 'border-border-subtle hover:bg-surface-sunken')}
        options={[
          { value: 'absent', label: absentLabel },
          { value: 'some', label: lang === 'ko' ? '명시 선택' : 'Explicit' },
          { value: 'empty', label: t('explicitEmpty') },
        ]}
      />
      {mode === 'some' && <>
        {search && <input value={q} onChange={e => setQ(e.target.value)} placeholder={lang === 'ko' ? '검색…' : 'Search…'} aria-label={lang === 'ko' ? '검색' : 'Search'} className="mb-2 h-7 w-full rounded-md border border-border-control px-2" />}
        <ul className="max-h-56 space-y-0.5 overflow-auto">
          {visible.map(o => <li key={o.id}><label className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-surface-sunken">
            <input type="checkbox" className="size-3.5 accent-[rgb(var(--accent-primary))]" checked={picked.includes(o.id)} onChange={() => setPicked(p => (p.includes(o.id) ? p.filter(x => x !== o.id) : [...p, o.id]))} />
            <span className="t-mono">{o.id}</span>
            {o.hint && <span className="truncate text-text-muted">{o.hint}</span>}
            {o.outside && <span className="ml-auto rounded-xs bg-accent-warn-soft px-1 text-[10px] text-text-warning">{lang === 'ko' ? '조건 밖' : 'outside'}</span>}
          </label></li>)}
        </ul>
      </>}
      {note && <div className="mt-2 rounded-md bg-surface-sunken px-2 py-1.5 text-[11px] text-text-secondary">{note}</div>}
      <div className="mt-3 flex justify-end gap-2">
        <Button size="sm" variant="secondary" className="h-7 px-3 text-[12px]" onClick={() => setOpen(false)}>{t('cancel')}</Button>
        <Button size="sm" className="h-7 px-3 text-[12px]" disabled={mode === 'some' && !picked.length}
          onClick={() => { onApply(mode === 'absent' ? null : mode === 'empty' ? [] : picked); setOpen(false); }}>{t('apply')}</Button>
      </div>
    </PopoverContent>
  </Popover>;
}

function RoomEditor({ cap }: { cap: Capability }) {
  const { global, setGlobal, scope } = usePlatform();
  const { t, lang } = useI18n();
  return <SetEditor label={t('roomNames')} cap={cap} value={global.roomNames} absentLabel={t('all')} onApply={v => setGlobal({ roomNames: v })}
    options={scope.grantedRooms.map(id => ({ id }))}
    note={lang === 'ko' ? 'room_name은 요청 Scope 안의 조회 범위를 좁힐 뿐 권한을 부여하지 않습니다.' : 'room_name narrows the requested scope; it never grants access.'} />;
}

function ConditionEditor({ cap }: { cap: Capability }) {
  const { global, setGlobal, adapter } = usePlatform();
  const { t, lang } = useI18n();
  const site = global.scopeId ?? '';
  const [open, setOpen] = useState(false);
  const [axis, setAxis] = useState<ConditionAxis>(global.condition?.axis ?? 'stgroup');
  const [val, setVal] = useState<string>(global.condition ? conditionLabel(global.condition) : '');
  // Choices come from the server per site (platform-packages.md §4); fetched only while the editor is open.
  const choices = useAdapterRequest(signal => adapter.contextOptions(site, signal), site, open);
  const all = choices.data;
  const options = !all ? [] : axis === 'stgroup' ? all.stgroup : axis === 'team' ? all.team : all.makerModel.map(m => `${m.maker} / ${m.model}`);
  const build = (): Condition | null => {
    if (!val) return null;
    if (axis === 'makerModel') { const [maker, model] = val.split(' / '); return { axis, maker, model }; }
    return { axis, id: val };
  };
  const axisLabel = { stgroup: 'StGroup', team: lang === 'ko' ? '분임조' : 'Team', makerModel: 'Maker+Model' };
  return <Popover open={open} onOpenChange={o => { setOpen(o); if (o) { setAxis(global.condition?.axis ?? 'stgroup'); setVal(global.condition ? conditionLabel(global.condition) : ''); } }}>
    <PopoverTrigger asChild><ChipShell label={t('condition')} cap={cap} empty={!global.condition}
      value={global.condition ? `${axisLabel[global.condition.axis]}: ${conditionLabel(global.condition)}` : t('none')}><ChevronDown className="size-3.5 text-text-muted" aria-hidden /></ChipShell></PopoverTrigger>
    <PopoverContent align="start" className="w-80 rounded-md border border-border-strong bg-surface-card p-3 text-[12px] shadow-md">
      <SegmentedRadio
        label={lang === 'ko' ? '조건 축 (하나만)' : 'Condition axis (one)'}
        value={axis}
        onChange={a => { setAxis(a); setVal(''); }}
        className="mb-2 flex gap-1"
        optionClassName={selected => cn('rounded-sm border px-2 py-1', selected ? 'border-accent-primary bg-accent-primary-soft text-accent-primary' : 'border-border-subtle hover:bg-surface-sunken')}
        options={(['stgroup', 'team', 'makerModel'] as const).map(a => ({ value: a, label: axisLabel[a] }))}
      />
      {choices.status !== 'done' && <p role="status" className="px-2 py-1 text-text-muted">{choices.status === 'error'
        ? <>{lang === 'ko' ? '선택지를 불러오지 못했습니다.' : 'Could not load choices.'} <button type="button" className="text-accent-primary underline" onClick={choices.retry}>{lang === 'ko' ? '다시 시도' : 'Retry'}</button></>
        : (lang === 'ko' ? '선택지를 불러오는 중…' : 'Loading choices…')}</p>}
      <ul role="listbox" aria-label={axisLabel[axis]} className="max-h-48 space-y-0.5 overflow-auto">
        {options.map(o => <li key={o} role="option" aria-selected={val === o}><button type="button" onClick={() => setVal(o)}
          className={cn('w-full rounded-sm px-2 py-1 text-left t-mono', val === o ? 'bg-accent-primary-soft text-accent-primary' : 'hover:bg-surface-sunken')}>{o}</button></li>)}
      </ul>
      <p className="mt-2 rounded-md bg-surface-sunken px-2 py-1.5 text-[11px] text-text-secondary">{lang === 'ko' ? 'live 조건: 재방문 시 현재 소속으로 다시 평가됩니다. 조건 변경은 고정 Selection을 바꾸지 않습니다.' : 'Live condition: membership is re-evaluated on revisit. Changing it never alters the fixed Selection.'}</p>
      <div className="mt-3 flex justify-between gap-2">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => { setGlobal({ condition: null }); setOpen(false); }}>{t('clear')}</Button>
        <span className="flex gap-2">
          <Button size="sm" variant="secondary" className="h-7 px-3 text-[12px]" onClick={() => setOpen(false)}>{t('cancel')}</Button>
          <Button size="sm" className="h-7 px-3 text-[12px]" disabled={!val} onClick={() => { setGlobal({ condition: build() }); setOpen(false); }}>{t('apply')}</Button>
        </span>
      </div>
    </PopoverContent>
  </Popover>;
}

function SelectionEditor({ cap }: { cap: Capability }) {
  const { global, setGlobal, scope, adapter } = usePlatform();
  const { t, lang } = useI18n();
  // Condition matching and grants are the server's job (platform-packages.md §4); the shell only shows the result.
  const input = { scopeId: global.scopeId, roomNames: global.roomNames, condition: global.condition, selection: global.selection };
  const evaluation = useAdapterRequest(signal => adapter.evaluateSelection(input, signal), [input, scope.status], scope.status === 'valid');
  const inCondition = evaluation.data?.inCondition ?? [];
  const outside = evaluation.data?.outOfCondition ?? [];
  const failed = evaluation.status === 'error';
  const options = [...inCondition.map(e => ({ id: e.equipmentId, hint: `${e.room} · ${e.model}` })), ...outside.map(id => ({ id, hint: undefined, outside: true }))];
  const count = failed ? (lang === 'ko' ? '확인 실패' : 'unavailable') : evaluation.status === 'done' ? String(inCondition.length) : '…';
  return <SetEditor label={t('selection')} cap={cap} value={global.selection} search
    absentLabel={global.condition ? (lang === 'ko' ? `조건 결과 전체 (${count})` : `All condition results (${count})`) : t('all')}
    onApply={v => setGlobal({ selection: v })} options={options}
    note={<>{lang === 'ko' ? 'Selection은 고정 EquipmentID 집합입니다.' : 'Selection is a fixed EquipmentID set.'}{failed && <span role="alert" className="mt-1 block text-text-danger">{lang === 'ko' ? '조건 결과를 확인하지 못했습니다.' : 'Could not evaluate the condition.'} <button type="button" className="text-accent-primary underline" onClick={evaluation.retry}>{lang === 'ko' ? '다시 시도' : 'Retry'}</button></span>}{outside.length > 0 && <b className="mt-1 block text-text-warning">{lang === 'ko' ? `현재 조건 결과 밖 ${outside.length}대 — 자동 제거하지 않습니다.` : `${outside.length} outside the current condition — not removed automatically.`}</b>}</>} />;
}
