import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useId, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../utils/cn';
import { InfoTip } from '../panel/InfoTip';
import { Button } from '../components/Button';
import { Checkbox } from '../components/shadcn/checkbox';
import { RadioGroup, RadioGroupItem } from '../components/shadcn/radio-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/shadcn/tooltip';
import { StatusBadge, type Tone } from '../components/StatusBadge';
import { SearchInput } from './SearchInput';

export type GroupedSelectionItem = {
  id: string;
  label: string;
  description?: string;
  badge?: { label: string; tone?: Tone };
  disabledReason?: string;
};
export type GroupedSelectionGroup = { id: string; label: string; items: readonly GroupedSelectionItem[] };
export type GroupedSelectionPreset = { id: string; label: string; description: string; itemIds: readonly string[] };
/** The list's own copy. Built-in ko/en tables below; a menu that uses `useI18n` passes `GROUPED_SELECTION_MESSAGES[lang]`. */
export type GroupedSelectionMessages = {
  search: string; clearSearch: string; clear: string; all: string; none: string; empty: string;
  selectedCount: (count: number) => string; selectedItem: (label: string) => string;
  /** Opt-in options only. */
  showHidden: (count: number, reason: string) => string; hideHidden: string; removeChip: (label: string) => string; presetAdds: (count: number) => string; presetNothing: string; description: string;
};
/**
 * ko/en copy. The piece takes copy as a prop instead of calling `useI18n` so that it stays in `@ap/ui`: feature packages
 * may import only `@ap/ui` from the platform (ADR-0097), and `@ap/ui` does not depend on the kernel (#1842).
 */
export const GROUPED_SELECTION_MESSAGES: Readonly<Record<'ko' | 'en', GroupedSelectionMessages>> = {
  ko: { search: '검색…', clearSearch: '검색 지우기', clear: '모두 해제', all: '모두 선택', none: '선택 없음', empty: '검색 결과 없음',
    selectedCount: count => `선택 ${count}개`, selectedItem: label => `선택: ${label}`,
    showHidden: (count, reason) => `숨긴 ${count}개(${reason}) 보기`, hideHidden: '숨긴 항목 접기', removeChip: label => `${label} 선택 해제`, presetAdds: count => `+${count}개`, presetNothing: '추가할 항목 없음', description: '설명' },
  en: { search: 'Search…', clearSearch: 'Clear search', clear: 'Clear all', all: 'Select all', none: 'No selection', empty: 'No results',
    selectedCount: count => `${count} selected`, selectedItem: label => `Selected: ${label}`,
    showHidden: (count, reason) => `Show ${count} hidden (${reason})`, hideHidden: 'Fold hidden', removeChip: label => `Deselect ${label}`, presetAdds: count => `+${count}`, presetNothing: 'Nothing to add', description: 'Description' },
};
/** Opt-in presentation options (multiple mode). Every default keeps the original look. */
export type GroupedSelectionPresentation = {
  /** `compact`: one line per row, the description moves into an ⓘ tip beside the label. */
  density?: 'comfortable' | 'compact';
  /** `2`: the categories flow into two columns. */
  columns?: 1 | 2;
  /** Fold rows that cannot be selected behind a toggle in the header; `hiddenReason` names why, e.g. 「토큰 불가」. */
  hideDisabled?: boolean; hiddenReason?: string;
  /** `chips`: the header lists what is selected as removable chips. */
  selectionSummary?: 'count' | 'chips';
  /** Show what each preset would add under its button. */
  presetPreview?: boolean;
  /** `rail`: a category list on the left, the picked category's rows on the right. `switch` draws the rows as switches. */
  layout?: 'stacked' | 'rail'; control?: 'checkbox' | 'switch';
};
type GroupedSelectionCommonProps = GroupedSelectionPresentation & {
  /** Set false when an owning form shows selection counts without live toggle announcements. */
  announceSelection?: boolean;
  groups: readonly GroupedSelectionGroup[];
  searchPlaceholder?: string;
  'aria-label': string;
  /** Overrides of the copy; unset keys fall back to Korean (`GROUPED_SELECTION_MESSAGES.ko`). */
  messages?: Partial<GroupedSelectionMessages>;
};
/** Presets and bulk actions are multiple-only. The caller owns the single scroll layer. */
export type GroupedSelectionListProps = GroupedSelectionCommonProps & (
  | { mode: 'multiple'; value: readonly string[]; onChange: (ids: string[]) => void; presets?: readonly GroupedSelectionPreset[] }
  | { mode: 'single'; value: string | null; onChange: (id: string) => void; presets?: never }
);
/** Prototype-only (#2405 V3): the repo has no Switch primitive yet (ADR-0155 reopen condition). */
function SwitchControl({ checked, disabled, onCheckedChange, ...rest }: { checked: boolean; disabled?: boolean; onCheckedChange: (checked: boolean) => void; id?: string; 'aria-labelledby'?: string; 'aria-describedby'?: string }) {
  return <button {...rest} type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onCheckedChange(!checked)}
    className={cn('inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
      checked ? 'border-transparent bg-accent-primary' : 'border-border-strong bg-surface-sunken')}>
    <span aria-hidden className={cn('size-3.5 rounded-full transition-transform', checked ? 'translate-x-[1.125rem] bg-text-on-accent' : 'translate-x-0.5 bg-text-muted')} />
  </button>;
}
export function GroupedSelectionList(props: GroupedSelectionListProps) {
  const copy: GroupedSelectionMessages = { ...GROUPED_SELECTION_MESSAGES.ko, ...props.messages };
  const prefix = useId();
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [railGroup, setRailGroup] = useState<string | null>(null);
  const multiple = props.mode === 'multiple';
  const compact = multiple && props.density === 'compact';
  const folding = multiple && props.hideDisabled === true && !showHidden;
  const chips = multiple && props.selectionSummary === 'chips';
  const rail = multiple && props.layout === 'rail';
  const asSwitch = multiple && props.control === 'switch';
  const query = search.trim().toLocaleLowerCase();
  const allItems = props.groups.flatMap(group => group.items);
  const selected = new Set(props.mode === 'multiple' ? props.value : props.value === null ? [] : [props.value]);
  const enabled = new Set(allItems.filter(item => !item.disabledReason).map(item => item.id));
  const hiddenCount = allItems.filter(item => item.disabledReason && !selected.has(item.id)).length;
  const matched = props.groups.map(group => ({ ...group, items: group.items.filter(item =>
    [group.label, item.label, item.description ?? '', item.id].some(text => text.toLocaleLowerCase().includes(query))) })).filter(group => group.items.length > 0);
  const filtered = folding ? matched.map(group => ({ ...group, items: group.items.filter(item => !item.disabledReason || selected.has(item.id)) })).filter(group => group.items.length > 0) : matched;
  function toggle(ids: readonly string[], checked: boolean) {
    if (props.mode !== 'multiple') return;
    const next = new Set(props.value);
    for (const id of ids) if (enabled.has(id)) { if (checked) next.add(id); else next.delete(id); }
    props.onChange([...next]);
  }
  const clearButton = props.mode === 'multiple'
    ? <Button type="button" variant="ghost" size="toolbar" disabled={!props.value.some(id => enabled.has(id))} onClick={() => props.onChange(props.value.filter(id => !enabled.has(id)))}>{copy.clear}</Button> : null;
  const presetButtons = props.mode === 'multiple' ? props.presets?.map(preset => {
    const adds = preset.itemIds.filter(id => enabled.has(id) && !selected.has(id));
    const preview = props.presetPreview ? <p id={`${prefix}-preview-${preset.id}`} className="line-clamp-2 text-xs text-text-secondary">
      {adds.length === 0 ? copy.presetNothing : <><span className="font-medium text-text-primary">{copy.presetAdds(adds.length)}</span>{' '}{adds.map(id => allItems.find(item => item.id === id)?.label ?? id).join(' · ')}</>}</p> : null;
    return <div key={preset.id} className={cn(props.presetPreview && 'min-w-0 space-y-1')}><Tooltip><TooltipTrigger asChild>
      <Button type="button" variant="secondary" size="toolbar" className={cn(props.presetPreview && 'w-full')} aria-describedby={`${prefix}-preset-${preset.id}${preview ? ` ${prefix}-preview-${preset.id}` : ''}`} onClick={() => toggle(preset.itemIds, true)}>{preset.label}</Button>
    </TooltipTrigger><TooltipContent>{preset.description}</TooltipContent><span id={`${prefix}-preset-${preset.id}`} className="sr-only">{preset.description}</span></Tooltip>{preview}</div>;
  }) : null;
  const statusText = props.mode === 'multiple'
    ? copy.selectedCount(props.value.length)
    : props.value ? copy.selectedItem(allItems.find(item => item.id === props.value)?.label ?? copy.none) : copy.none;
  const status = <p className="text-xs text-text-secondary" role={props.announceSelection === false ? undefined : 'status'}>{statusText}</p>;
  const searchField = (className?: string) => <SearchInput className={className} size="toolbar" value={search} onValueChange={setSearch} placeholder={props.searchPlaceholder ?? copy.search} aria-label={props.searchPlaceholder ?? copy.search} clearLabel={copy.clearSearch} />;
  const chipRow = props.mode === 'multiple' && chips ? <div className="flex max-h-[4.25rem] flex-wrap items-center gap-1.5 overflow-y-auto" role="group" aria-label={statusText}>
    {allItems.filter(item => selected.has(item.id)).map(item => item.disabledReason
      ? <span key={item.id} className="inline-flex h-6 items-center rounded-xs bg-surface-sunken px-2 text-xs text-text-muted">{item.label}</span>
      : <button key={item.id} type="button" aria-label={copy.removeChip(item.label)} onClick={() => toggle([item.id], false)}
        className="inline-flex h-6 items-center gap-1 rounded-xs border border-border-subtle bg-surface-sunken pl-2 pr-1 text-xs text-text-primary hover:bg-surface-row-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
        {item.label}<X className="size-3 text-text-muted" aria-hidden /></button>)}
  </div> : null;
  const hiddenToggle = multiple && props.hideDisabled && hiddenCount > 0 ? <Button type="button" variant="ghost" size="toolbar" aria-expanded={showHidden} onClick={() => setShowHidden(value => !value)}>
    {showHidden ? copy.hideHidden : copy.showHidden(hiddenCount, props.hiddenReason ?? '')}</Button> : null;
  const header = multiple && (chips || props.presetPreview || compact)
    ? <>
      {presetButtons ? <TooltipProvider><div className={cn('grid gap-2', props.presetPreview ? 'grid-cols-[repeat(3,minmax(0,1fr))]' : 'flex flex-wrap items-center')}>{presetButtons}</div></TooltipProvider> : null}
      <div className="sticky top-0 z-10 space-y-2 bg-surface-card pb-2 pt-1">
        {chips ? <div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1 space-y-1.5">{status}{chipRow}</div>{clearButton}</div>
          : <div className="flex items-center justify-between gap-2">{status}{clearButton}</div>}
        <div className="flex items-center gap-2">{searchField('min-w-0 flex-1')}{hiddenToggle}</div>
      </div></>
    : <div className="sticky top-0 z-10 space-y-2 bg-surface-card pb-3">
      {status}{searchField()}
      {props.mode === 'multiple' ? <div className="flex flex-wrap items-center gap-2"><TooltipProvider>{presetButtons}</TooltipProvider>{clearButton}{hiddenToggle}</div> : null}
    </div>;
  const control = (item: GroupedSelectionItem, labelledBy: string, describedBy?: string) => props.mode === 'multiple'
    ? asSwitch
      ? <SwitchControl id={`${prefix}-item-${item.id}`} aria-labelledby={labelledBy} aria-describedby={describedBy} checked={selected.has(item.id)} disabled={!!item.disabledReason} onCheckedChange={value => toggle([item.id], value)} />
      : <Checkbox id={`${prefix}-item-${item.id}`} aria-labelledby={labelledBy} aria-describedby={describedBy} checked={selected.has(item.id)} disabled={!!item.disabledReason} onCheckedChange={value => toggle([item.id], value === true)} />
    : <RadioGroupItem id={`${prefix}-item-${item.id}`} value={item.id} aria-labelledby={labelledBy} aria-describedby={describedBy} disabled={!!item.disabledReason} />;
  const renderItem = (item: GroupedSelectionItem) => {
    const labelId = `${prefix}-label-${item.id}`;
    const descriptionId = `${prefix}-description-${item.id}`;
    if (compact) {
      const hasTip = !!(item.description || item.disabledReason);
      return <div key={item.id} className="flex items-center gap-2 border-b border-border-subtle py-1.5">
        {control(item, labelId, hasTip ? descriptionId : undefined)}
        <label id={labelId} htmlFor={`${prefix}-item-${item.id}`} className={cn('min-w-0 truncate text-sm font-medium', item.disabledReason && 'text-text-muted')}>{item.label}</label>
        {item.badge ? <StatusBadge tone={item.badge.tone ?? 'neutral'}>{item.badge.label}</StatusBadge> : null}
        {hasTip ? <InfoTip label={copy.description} descriptionId={descriptionId} className="ml-auto">{item.description ? <p>{item.description}</p> : null}{item.disabledReason ? <p>{item.disabledReason}</p> : null}</InfoTip> : null}
      </div>;
    }
    return <div key={item.id} className="flex items-start gap-3 border-b border-border-subtle py-3">
      {control(item, labelId, descriptionId)}
      <div className="min-w-0 flex-1 space-y-1"><div className="flex items-center gap-2"><label id={labelId} htmlFor={`${prefix}-item-${item.id}`} className="text-sm font-medium">{item.label}</label>
        {item.badge ? <StatusBadge tone={item.badge.tone ?? 'neutral'}>{item.badge.label}</StatusBadge> : null}</div>
        <div id={descriptionId} className="text-xs text-text-secondary">{item.description ? <p>{item.description}</p> : null}{item.disabledReason ? <p>{item.disabledReason}</p> : null}</div>
      </div>
    </div>;
  };
  const renderGroup = (group: GroupedSelectionGroup) => {
    const available = group.items.filter(item => !item.disabledReason).map(item => item.id);
    const count = available.filter(id => selected.has(id)).length;
    const checked = count === 0 ? false : count === available.length ? true : 'indeterminate';
    return <section key={group.id} className={compact ? 'space-y-1' : 'space-y-2'} aria-labelledby={`${prefix}-group-${group.id}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-1">
        <div className="flex items-center gap-2">{props.mode === 'multiple' ? <Checkbox aria-label={`${group.label} ${copy.all}`} checked={checked} disabled={available.length === 0} onCheckedChange={value => toggle(available, value === true)} /> : null}
          <h3 id={`${prefix}-group-${group.id}`} className="text-sm font-semibold">{group.label}</h3></div>
        {props.mode === 'multiple' ? <span className="text-xs text-text-secondary">{count}/{available.length}</span> : null}
      </div>
      {group.items.map(renderItem)}
    </section>;
  };
  let body: ReactNode;
  if (rail) {
    const active = filtered.find(group => group.id === railGroup) ?? filtered[0];
    const move = (event: ReactKeyboardEvent, index: number) => {
      const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      const next = filtered[(index + step + filtered.length) % filtered.length];
      if (next) { setRailGroup(next.id); document.getElementById(`${prefix}-tab-${next.id}`)?.focus(); }
    };
    body = <div role="group" aria-label={props['aria-label']} className="grid grid-cols-[10.5rem_minmax(0,1fr)] gap-4">
      <div role="tablist" aria-orientation="vertical" aria-label={props['aria-label']} className="space-y-0.5 self-start">
        {filtered.map((group, index) => {
          const available = group.items.filter(item => !item.disabledReason);
          const count = available.filter(item => selected.has(item.id)).length;
          return <button key={group.id} id={`${prefix}-tab-${group.id}`} type="button" role="tab" aria-selected={group.id === active?.id} aria-controls={`${prefix}-panel`} tabIndex={group.id === active?.id ? 0 : -1}
            onClick={() => setRailGroup(group.id)} onKeyDown={event => move(event, index)}
            className={cn('flex w-full items-center justify-between gap-2 rounded-xs px-2 py-1.5 text-left text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring',
              group.id === active?.id ? 'bg-surface-sunken font-semibold text-text-primary' : 'text-text-secondary hover:bg-surface-row-hover', available.length === 0 && 'text-text-muted')}>
            <span className="min-w-0 truncate">{group.label}</span>
            <span className={cn('shrink-0 text-xs', count > 0 ? 'rounded-xs bg-accent-primary px-1.5 font-medium text-text-on-accent' : 'text-text-muted')}>{count}/{available.length}</span>
          </button>;
        })}
      </div>
      <div id={`${prefix}-panel`} role="tabpanel" aria-labelledby={active ? `${prefix}-tab-${active.id}` : undefined}>{active ? renderGroup(active) : null}</div>
    </div>;
  } else if (props.mode === 'single') {
    body = <RadioGroup aria-label={props['aria-label']} value={props.value ?? ''} onValueChange={id => { if (enabled.has(id)) props.onChange(id); }}>{filtered.map(renderGroup)}</RadioGroup>;
  } else {
    const split: GroupedSelectionGroup[][] = [[], []];
    if (props.columns === 2) {
      const half = filtered.reduce((sum, group) => sum + group.items.length + 1, 0) / 2;
      let used = 0;
      for (const group of filtered) { split[used < half ? 0 : 1]!.push(group); used += group.items.length + 1; }
    }
    body = props.columns === 2
      ? <div role="group" aria-label={props['aria-label']} className="grid grid-cols-[repeat(2,minmax(0,1fr))] items-start gap-x-6">{split.map((column, index) => <div key={index} className="min-w-0 space-y-3">{column.map(renderGroup)}</div>)}</div>
      : <div role="group" aria-label={props['aria-label']} className="space-y-4">{filtered.map(renderGroup)}</div>;
  }
  return <div className="space-y-4 break-keep">{header}{filtered.length === 0 ? <p className="text-sm text-text-secondary">{copy.empty}</p> : null}{body}</div>;
}
