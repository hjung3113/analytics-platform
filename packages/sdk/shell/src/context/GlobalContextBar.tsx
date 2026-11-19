import { TargetPicker, TARGET_KEYS } from './TargetPicker';
import { QueryHistoryControl } from './QueryHistoryControl';
import { SavedViewControl } from '../saved-view/SavedViewControl';
import { QueryBar } from './QueryBar';
import { CalendarDays, ChevronDown, RotateCcw, X } from 'lucide-react';
import { useEffect, useId, type ReactNode } from 'react';
import { ContextBarLayout, useContextEditorState, useContextEditorFocusRecovery } from './ContextBarLayout';
import { CONTEXT_LABELS, labelledCondition, useEquipmentAxes, useI18n, useMessages, useConditionPreset } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';
import { type Capability, type ContextKey, formatPeriod, periodDates, periodFromDates, type GlobalContext } from '@ap/contracts';
import { Button, cn, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { ShareControl } from './ShareControl';
import { PeriodFields, type PeriodDates } from './PeriodFields';
import { useSessionKey } from '../frame/sessionKey';
import { SHELL_MESSAGES } from '../messages';

const CONTEXT_KEYS: ContextKey[] = ['time', 'roomNames', 'line', 'prcGroup', 'condition', 'selection', 'lot', 'ppid', 'recipe', 'metric'];

export function contextHasValue(global: GlobalContext): Record<ContextKey, boolean> {
  return {
    line: global.lineNames !== null, prcGroup: global.prcGroups !== null, time: global.from !== null, roomNames: global.roomNames !== null, condition: global.condition !== null, selection: global.selection !== null,
    lot: global.lotIds !== null, ppid: global.ppid !== null, recipe: global.recipeIds !== null, metric: global.metricId !== null,
  };
}

/** A context bar is drawn when any key is usable on this screen (06 §11). Values of keys this screen
 * does not use stay in the URL and Kernel and are shown again on a screen that uses them (#1944). */
export function contextBarVisible(context: Record<ContextKey, Capability>): boolean {
  return CONTEXT_KEYS.some(k => context[k] !== 'unsupported');
}

export function GlobalContextBar({ label, whenEmpty = null }: {
  /** Board only: names the bar after its pane (visible text and region name). */
  label?: { visible: string; region: string };
  /** Board only: drawn where the bar would collapse to nothing, so the row keeps its height. */
  whenEmpty?: ReactNode;
} = {}) {
  const { route, screenMode } = useHostPlatform();
  const hideViewSlot = screenMode === 'pane' && route?.menu.query?.mode === 'apply' && route.menu.query.autoApplyDefault === true;
  return route?.menu.query?.mode === 'apply' ? <QueryBar label={label} historySlot={<QueryHistoryControl />} viewSlot={hideViewSlot ? null : <SavedViewControl />} /> : <LiveContextBar label={label} whenEmpty={whenEmpty} />;
}

function LiveContextBar({ label, whenEmpty }: { label?: { visible: string; region: string }; whenEmpty: ReactNode }) {
  const { route, global, setGlobal, resetContext } = useHostPlatform();
  const { t, lang } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const axes = useEquipmentAxes();
  const basisText = global.membershipBasis === 'asOf' ? ` · ${t('membershipAsOf')}` : '';
  const preset = useConditionPreset();
  if (!route) return whenEmpty;
  const cap = route.menu.context;
  const has = contextHasValue(global);
  if (!contextBarVisible(cap)) return whenEmpty;
  const shown = CONTEXT_KEYS.filter(k => cap[k] !== 'unsupported' || has[k]);
  const editable = (k: ContextKey) => cap[k] !== 'unsupported';

  const controls = (target: ReactNode) => [
    ...(shown.includes('time') ? [{ key: 'time' as const, applied: has.time, node: (editable('time') ? <PeriodControl cap={cap.time} /> : <CarriedChip k="time" cap={cap.time} value={global.from ? formatPeriod(global.from, global.to, lang) : ''} onRemove={() => setGlobal({ from: null, to: null })} />), compactNode: editable('time') ? <PeriodControl cap={cap.time} compact /> : <CarriedChip k="time" cap={cap.time} value={global.from ? formatPeriod(global.from, global.to, lang) : ''} onRemove={() => setGlobal({ from: null, to: null })} /> }] : []),
    ...(TARGET_KEYS.some(key => cap[key] === 'apply') ? [{ key: 'target' as const, applied: TARGET_KEYS.some(key => cap[key] === 'apply' && has[key]), node: target }] : []),
    ...(has.roomNames && cap.roomNames !== 'apply' ? [{ key: 'roomNames' as const, applied: true, node: <CarriedChip k="roomNames" cap={cap.roomNames} value={setText(global.roomNames, t)} onRemove={() => setGlobal({ roomNames: null })} /> }] : []),
    ...(has.line && cap.line !== 'apply' ? [{ key: 'line' as const, applied: true, node: <CarriedChip k="line" cap={cap.line} value={setText(global.lineNames, t)} onRemove={() => setGlobal({ lineNames: null })} /> }] : []),
    ...(has.prcGroup && cap.prcGroup !== 'apply' ? [{ key: 'prcGroup' as const, applied: true, node: <CarriedChip k="prcGroup" cap={cap.prcGroup} value={setText(global.prcGroups, t) + basisText} onRemove={() => setGlobal({ prcGroups: null })} /> }] : []),
    ...(has.condition && cap.condition !== 'apply' ? [{ key: 'condition' as const, applied: true, node: <CarriedChip k="condition" cap={cap.condition} value={labelledCondition(global.condition!, axes, lang) + basisText} onRemove={() => setGlobal({ condition: null })} /> }] : []),
    ...(has.selection && cap.selection !== 'apply' ? [{ key: 'selection' as const, applied: true, node: <CarriedChip k="selection" cap={cap.selection} value={setText(global.selection, t)} onRemove={() => setGlobal({ selection: null })} /> }] : []),
    ...(has.lot ? [{ key: 'lot' as const, applied: has.lot, node: <CarriedChip k="lot" cap={cap.lot} value={setText(global.lotIds, t)} onRemove={() => setGlobal({ lotIds: null })} /> }] : []),
    ...(has.ppid ? [{ key: 'ppid' as const, applied: has.ppid, node: <CarriedChip k="ppid" cap={cap.ppid} value={global.ppid!} onRemove={() => setGlobal({ ppid: null })} /> }] : []),
    ...(has.recipe ? [{ key: 'recipe' as const, applied: has.recipe, node: <CarriedChip k="recipe" cap={cap.recipe} value={setText(global.recipeIds, t)} onRemove={() => setGlobal({ recipeIds: null })} /> }] : []),
    ...(has.metric ? [{ key: 'metric' as const, applied: has.metric, node: <CarriedChip k="metric" cap={cap.metric} value={`${global.metricId}${global.metricVersion ? ` @ ${global.metricVersion}` : ` (${m('metricNoVersion')})`}`} onRemove={() => setGlobal({ metricId: null, metricVersion: null })} /> }] : []),
  ];
  const layout = (target: ReactNode, targetOpen = false, openTargetEditor?: () => void) => <ContextBarLayout activeControl={targetOpen ? 'target' : undefined} openTargetEditor={openTargetEditor} hasPeriodEditor={editable('time')} regionName={label?.region} controls={controls(target)} revision={JSON.stringify([global, cap, lang, shown, label])} actions={compact => <span className="flex items-center gap-1">
        <ShareControl compact={compact} align="end" />
        <Button type="button" variant="ghost" size="toolbar" aria-label={t('resetContext')} title={t('resetContext')} onClick={resetContext}>
          <RotateCcw className="size-3.5" aria-hidden />{!compact && t('reset')}
        </Button>
  </span>} />;
  return TARGET_KEYS.some(key => cap[key] === 'apply')
    ? <TargetPicker global={global} cap={cap} onChange={setGlobal} presetAxes={preset?.presets.find(item => item.id === preset.activeId)?.axes}>{layout}</TargetPicker>
    : layout(null);
}

function setText(ids: string[] | null, t: (k: 'all' | 'explicitEmpty') => string): string {
  if (ids === null) return t('all');
  if (!ids.length) return t('explicitEmpty');
  return ids.length <= 2 ? ids.join(', ') : `${ids[0]} +${ids.length - 1}`;
}

/** Exception status for names that replace the chip text (period button and group): applied adds nothing. */
function capStatus(cap: Capability, t: (k: 'referenceOnly' | 'notUsed') => string): string {
  return cap === 'reference' ? `, ${t('referenceOnly')}` : cap === 'unsupported' ? `, ${t('notUsed')}` : '';
}

function CapTag({ cap }: { cap: Capability }) {
  const { t } = useI18n();
  if (cap === 'apply') return null;

  return <span className={cn('shrink-0 rounded-xs px-1 t-badge', cap !== 'unsupported' ? 'bg-surface-sunken text-text-secondary' : 'bg-accent-warn-soft text-text-warning-label')}>
    {cap === 'reference' ? t('referenceOnly') : t('notUsed')}
  </span>;
}

/** Preserved context the current page does not edit: never silently dropped (§6); removable explicitly. */
function CarriedChip({ k, cap, value, onRemove }: { k: ContextKey; cap: Capability; value: string; onRemove: () => void }) {
  const { tx, t, lang } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const { global } = useHostPlatform();
  const fullValue = k === 'time' ? (global.from ? formatPeriod(global.from, global.to, lang) : t('selectPeriod')) : value;
  return <span role={k === 'time' ? 'group' : undefined} aria-label={k === 'time' ? `${tx(CONTEXT_LABELS[k])}: ${fullValue}${capStatus(cap, t)}` : undefined} className={cn('inline-flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-md border pl-2.5 pr-1 whitespace-nowrap text-xs',
    cap === 'unsupported' ? 'border-dashed border-border-control text-text-muted' : 'border-border-control bg-surface-card on-canvas-band:bg-transparent')}
    title={cap === 'unsupported' ? m('carriedUnsupportedTitle') : undefined}>
    <span className="text-text-muted">{tx(CONTEXT_LABELS[k])}</span>
    <span className="min-w-0 max-w-48 truncate font-medium tabular" title={fullValue}>{value}</span>
    <CapTag cap={cap} />
    <button type="button" onClick={onRemove} aria-label={`${t('clear')} ${tx(CONTEXT_LABELS[k])}`} className="grid size-6 place-items-center rounded-xs hover:bg-surface-sunken"><X className="size-3" aria-hidden /></button>
  </span>;
}

function PeriodControl({ cap, compact = false }: { cap: Capability; compact?: boolean }) {
  const { global } = useHostPlatform();
  const { t, lang } = useI18n();
  const [open, setOpen] = useContextEditorState('open', false);
  const preserveRelocationFocus = useContextEditorFocusRecovery();
  const summary = global.from ? formatPeriod(global.from, global.to, lang) : t('selectPeriod');
  const periodName = `${t('period')}: ${summary}`;
  return <div className="flex min-w-0 items-center gap-1">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn('inline-flex h-8 items-center gap-2 rounded-md border border-border-control bg-surface-card on-canvas-band:bg-transparent px-2.5 whitespace-nowrap text-xs hover:border-border-control', compact ? 'w-full min-w-0' : 'min-w-[204px]')} title={periodName} aria-label={`${periodName}${capStatus(cap, t)}`}>
          <CalendarDays className="size-4 shrink-0 text-text-muted" aria-hidden />
          <span className={cn('min-w-0 truncate tabular', global.from ? 'font-medium' : 'text-text-muted')}>{summary}</span>
          <CapTag cap={cap} />
          <ChevronDown className="size-3.5 shrink-0 text-text-muted" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent onFocusOutside={preserveRelocationFocus} align="start" aria-label={t('period')} className="w-max max-w-[var(--radix-popover-content-available-width)]">
        <CustomRange onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  </div>;
}

function CustomRange({ onDone }: { onDone(): void }) {
  const { global, setGlobal, paneId, url } = useHostPlatform();
  const source = JSON.stringify([useSessionKey(), paneId, global.scopeId, url]);
  const { t } = useI18n();
  const m = useMessages(SHELL_MESSAGES);
  const id = useId();
  const [edit, setEdit] = useContextEditorState<{ source: string; dates: PeriodDates } | null>('periodDates', null);
  const activeEdit = edit?.source === source ? edit : null;
  useEffect(() => {
    if (edit && !activeEdit) setEdit(null);
  }, [edit, activeEdit, setEdit]);
  const dates = activeEdit?.dates ?? periodDates(global);
  const result = activeEdit === null ? null : periodFromDates(dates);
  const invalid = activeEdit !== null && result === null;
  return <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (result) { setGlobal(result); onDone(); } }}>
    <PeriodFields dates={dates} onChange={next => setEdit({ source, dates: next })} invalid={invalid} reasonId={id} />
    {invalid && <p id={id} role="status" className="text-xs text-text-danger-label">{m('queryInvalidPeriodInput')}</p>}
    <div className="flex justify-end gap-2">
      <Button type="button" size="toolbar" variant="secondary" onClick={onDone}>{t('cancel')}</Button>
      <Button type="submit" size="toolbar" disabled={result === null}>{t('apply')}</Button>
    </div>
  </form>;
}
