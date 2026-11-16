import { useId, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { Button } from '../components/Button';
import { Checkbox } from '../components/shadcn/checkbox';
import { RadioGroup, RadioGroupItem } from '../components/shadcn/radio-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/shadcn/tooltip';
import { StatusBadge, type Tone } from '../components/StatusBadge';
import { InfoTip } from '../panel/InfoTip';
import { cn } from '../utils/cn';
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
};
/**
 * Copy of the opt-in presentation options (#2405). A separate type so that a full `GroupedSelectionMessages` object a consumer
 * already builds keeps compiling; the built-in tables fill every key.
 */
export type GroupedSelectionOptionMessages = {
  /** Toggle of the folded unavailable rows (`hideDisabled`). Name the reason, e.g. «로그인 세션에서만 쓰는 권한이라 토큰으로 못 받음 3개». */
  hiddenItems: (count: number) => string;
  /** Accessible name of a selection chip's remove button. */
  removeSelection: (label: string) => string;
  /** The chip that unfolds the chips past the collapsed limit. */
  moreSelected: (count: number) => string;
  /** The button that folds the unfolded chips again. */
  fewerSelected: string;
  /** Lead of a preset's preview: how many items it would add. */
  presetAdds: (count: number) => string;
  /** A preset's preview when everything it holds is already selected (or unavailable). */
  presetNothing: string;
  /** Accessible name of a compact row's ⓘ description tip. */
  description: (label: string) => string;
};
/**
 * ko/en copy. The piece takes copy as a prop instead of calling `useI18n` so that it stays in `@ap/ui`: feature packages
 * may import only `@ap/ui` from the platform (ADR-0097), and `@ap/ui` does not depend on the kernel (#1842).
 */
export const GROUPED_SELECTION_MESSAGES: Readonly<Record<'ko' | 'en', GroupedSelectionMessages & GroupedSelectionOptionMessages>> = {
  ko: { search: '검색…', clearSearch: '검색 지우기', clear: '모두 해제', all: '모두 선택', none: '선택 없음', empty: '검색 결과 없음',
    selectedCount: count => `선택 ${count}개`, selectedItem: label => `선택: ${label}`,
    hiddenItems: count => `선택할 수 없는 항목 ${count}개`, removeSelection: label => `${label} 선택 해제`, moreSelected: count => `+${count}`,
    fewerSelected: '접기', presetAdds: count => `+${count}개`, presetNothing: '추가할 항목 없음', description: label => `${label} 설명` },
  en: { search: 'Search…', clearSearch: 'Clear search', clear: 'Clear all', all: 'Select all', none: 'No selection', empty: 'No results',
    selectedCount: count => `${count} selected`, selectedItem: label => `Selected: ${label}`,
    hiddenItems: count => `${count} unavailable items`, removeSelection: label => `Deselect ${label}`, moreSelected: count => `+${count}`,
    fewerSelected: 'Show less', presetAdds: count => `+${count}`, presetNothing: 'Nothing to add', description: label => `About ${label}` },
};
/** Chips shown before the rest fold into «+N» (`selectionSummary: 'chips'`). */
const COLLAPSED_CHIPS = 6;
type GroupedSelectionCommonProps = {
  /** Set false when an owning form shows selection counts without live toggle announcements. */
  announceSelection?: boolean;
  groups: readonly GroupedSelectionGroup[];
  searchPlaceholder?: string;
  'aria-label': string;
  /** Overrides of the copy; unset keys fall back to Korean (`GROUPED_SELECTION_MESSAGES.ko`). */
  messages?: Partial<GroupedSelectionMessages & GroupedSelectionOptionMessages>;
  /** `compact`: one line per row; the description moves into an ⓘ tip, an unavailable row keeps its reason as visible text. Default `comfortable`. */
  density?: 'comfortable' | 'compact';
  /** Fold rows that cannot be selected (and are not selected) behind a toggle after the list; unfolded rows show their reason as text. Default off. */
  hideDisabled?: boolean;
};
/** Presets and bulk actions are multiple-only. The caller owns the single scroll layer. */
export type GroupedSelectionListProps = GroupedSelectionCommonProps & (
  | { mode: 'multiple'; value: readonly string[]; onChange: (ids: string[]) => void; presets?: readonly GroupedSelectionPreset[];
    /** `chips`: the sticky header lists the selection as removable chips, folding past six into «+N». Default `count`. */
    selectionSummary?: 'count' | 'chips';
    /** List every item a preset would add under it, with no ellipsis. Default off: the description stays in the tooltip. */
    presetPreview?: boolean }
  | { mode: 'single'; value: string | null; onChange: (id: string) => void; presets?: never; selectionSummary?: never; presetPreview?: never }
);
export function GroupedSelectionList(props: GroupedSelectionListProps) {
  const copy: GroupedSelectionMessages & GroupedSelectionOptionMessages = { ...GROUPED_SELECTION_MESSAGES.ko, ...props.messages };
  const prefix = useId();
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [chipsOpen, setChipsOpen] = useState(false);
  const compact = props.density === 'compact';
  const chips = props.mode === 'multiple' && props.selectionSummary === 'chips';
  const presetPreview = props.mode === 'multiple' && props.presetPreview === true;
  const query = search.trim().toLocaleLowerCase();
  const allItems = props.groups.flatMap(group => group.items);
  const selected = new Set(props.mode === 'multiple' ? props.value : props.value === null ? [] : [props.value]);
  const enabled = new Set(allItems.filter(item => !item.disabledReason).map(item => item.id));
  const matched = props.groups.map(group => ({ ...group, items: group.items.filter(item =>
    [group.label, item.label, item.description ?? '', item.id].some(text => text.toLocaleLowerCase().includes(query))) })).filter(group => group.items.length > 0);
  // A selected unavailable row stays in place: folding must not hide what the value holds.
  const folded = (item: GroupedSelectionItem) => props.hideDisabled === true && !!item.disabledReason && !selected.has(item.id);
  const filtered = matched.map(group => ({ ...group, items: group.items.filter(item => !folded(item)) })).filter(group => group.items.length > 0);
  const hidden = matched.map(group => ({ ...group, items: group.items.filter(folded) })).filter(group => group.items.length > 0);
  const hiddenCount = hidden.reduce((sum, group) => sum + group.items.length, 0);
  function toggle(ids: readonly string[], checked: boolean) {
    if (props.mode !== 'multiple') return;
    const next = new Set(props.value);
    for (const id of ids) if (enabled.has(id)) { if (checked) next.add(id); else next.delete(id); }
    props.onChange([...next]);
  }
  const statusText = props.mode === 'multiple'
    ? copy.selectedCount(props.value.length)
    : props.value ? copy.selectedItem(allItems.find(item => item.id === props.value)?.label ?? copy.none) : copy.none;
  const status = <p className="text-xs text-text-secondary" role={props.announceSelection === false ? undefined : 'status'}>{statusText}</p>;
  const searchField = <SearchInput size="toolbar" value={search} onValueChange={setSearch} placeholder={props.searchPlaceholder ?? copy.search} aria-label={props.searchPlaceholder ?? copy.search} clearLabel={copy.clearSearch} />;
  const clearButton = props.mode === 'multiple'
    ? <Button type="button" variant="ghost" size="toolbar" disabled={!props.value.some(id => enabled.has(id))} onClick={() => props.onChange(props.value.filter(id => !enabled.has(id)))}>{copy.clear}</Button> : null;
  const presetButton = (preset: GroupedSelectionPreset, describedBy: string, className?: string) => <Tooltip key={preset.id}><TooltipTrigger asChild>
    <Button type="button" variant="secondary" size="toolbar" className={className} aria-describedby={describedBy} onClick={() => toggle(preset.itemIds, true)}>{preset.label}</Button>
  </TooltipTrigger><TooltipContent>{preset.description}</TooltipContent><span id={`${prefix}-preset-${preset.id}`} className="sr-only">{preset.description}</span></Tooltip>;
  let header;
  if (props.mode === 'multiple' && (chips || presetPreview)) {
    const selectedItems = allItems.filter(item => selected.has(item.id));
    const shown = chipsOpen || selectedItems.length <= COLLAPSED_CHIPS ? selectedItems : selectedItems.slice(0, COLLAPSED_CHIPS);
    const chipClass = 'inline-flex h-6 max-w-full items-center gap-1 rounded-xs border border-border-subtle bg-surface-sunken px-2 text-xs';
    const chipRow = chips && selectedItems.length > 0 ? <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={statusText}>
      {shown.map(item => enabled.has(item.id)
        ? <button key={item.id} type="button" aria-label={copy.removeSelection(item.label)} onClick={() => toggle([item.id], false)}
          className={cn(chipClass, 'pr-1 text-text-primary hover:bg-surface-row-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring')}>
          <span className="truncate">{item.label}</span><X className="size-3 shrink-0 text-text-muted" aria-hidden /></button>
        : <span key={item.id} className={cn(chipClass, 'text-text-muted')}><span className="truncate">{item.label}</span></span>)}
      {selectedItems.length > COLLAPSED_CHIPS ? <Button type="button" variant="ghost" size="toolbar" className="h-6" aria-expanded={chipsOpen} onClick={() => setChipsOpen(open => !open)}>
        {chipsOpen ? copy.fewerSelected : copy.moreSelected(selectedItems.length - COLLAPSED_CHIPS)}</Button> : null}
    </div> : null;
    const presetRows = presetPreview && props.presets?.length ? <TooltipProvider><div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2">
      {props.presets.map(preset => {
        const adds = preset.itemIds.filter(id => enabled.has(id) && !selected.has(id)).map(id => allItems.find(item => item.id === id)?.label ?? id);
        const previewId = `${prefix}-preview-${preset.id}`;
        return [presetButton(preset, `${prefix}-preset-${preset.id} ${previewId}`, 'w-full justify-start'),
          <p key={`${preset.id}-preview`} id={previewId} className="min-h-8 py-1.5 text-xs text-text-secondary">
            {adds.length === 0 ? copy.presetNothing : <><span className="font-medium text-text-primary">{copy.presetAdds(adds.length)}</span>{' '}{adds.join(' · ')}</>}</p>];
      })}
    </div></TooltipProvider> : null;
    header = <>
      {presetRows}
      {/* The bottom border closes the sticky band so rows scrolling under it never show through below the search. */}
      <div className="sticky top-0 z-10 space-y-2 border-b border-border-subtle bg-surface-card pb-3 pt-1">
        <div className="flex items-center justify-between gap-2">{status}{clearButton}</div>
        {chipRow}
        {searchField}
        {!presetPreview && props.presets?.length ? <div className="flex flex-wrap items-center gap-2"><TooltipProvider>
          {props.presets.map(preset => presetButton(preset, `${prefix}-preset-${preset.id}`))}</TooltipProvider></div> : null}
      </div>
    </>;
  } else {
    header = <div className="sticky top-0 z-10 space-y-2 bg-surface-card pb-3">
      {status}{searchField}
      {props.mode === 'multiple' ? <div className="flex flex-wrap items-center gap-2"><TooltipProvider>
        {props.presets?.map(preset => presetButton(preset, `${prefix}-preset-${preset.id}`))}
      </TooltipProvider>{clearButton}</div> : null}
    </div>;
  }
  const control = (item: GroupedSelectionItem, describedBy: string | undefined) => props.mode === 'multiple'
    ? <Checkbox id={`${prefix}-item-${item.id}`} aria-labelledby={`${prefix}-label-${item.id}`} aria-describedby={describedBy} checked={selected.has(item.id)} disabled={!!item.disabledReason} onCheckedChange={value => toggle([item.id], value === true)} />
    : <RadioGroupItem id={`${prefix}-item-${item.id}`} value={item.id} aria-labelledby={`${prefix}-label-${item.id}`} aria-describedby={describedBy} disabled={!!item.disabledReason} />;
  const renderItem = (item: GroupedSelectionItem) => {
    const labelId = `${prefix}-label-${item.id}`;
    const descriptionId = `${prefix}-description-${item.id}`;
    const badge = item.badge ? <StatusBadge tone={item.badge.tone ?? 'neutral'}>{item.badge.label}</StatusBadge> : null;
    if (compact) {
      const reasonId = `${prefix}-reason-${item.id}`;
      const describedBy = [item.description ? descriptionId : null, item.disabledReason ? reasonId : null].filter(Boolean).join(' ') || undefined;
      return <div key={item.id} className="flex items-center gap-2 border-b border-border-subtle py-1.5">
        {control(item, describedBy)}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2"><label id={labelId} htmlFor={`${prefix}-item-${item.id}`} title={item.label}
            className={cn('min-w-0 truncate text-sm font-medium', item.disabledReason && 'text-text-muted')}>{item.label}</label>{badge}</div>
          {item.disabledReason ? <p id={reasonId} className="text-xs text-text-secondary">{item.disabledReason}</p> : null}
        </div>
        {/* Out of the Tab order: the checkbox already carries the description, so each row stays one tab stop. */}
        {item.description ? <InfoTip tabIndex={-1} label={copy.description(item.label)} descriptionId={descriptionId}>{item.description}</InfoTip> : null}
      </div>;
    }
    return <div key={item.id} className="flex items-start gap-3 border-b border-border-subtle py-3">
      {control(item, descriptionId)}
      <div className="min-w-0 flex-1 space-y-1"><div className="flex items-center gap-2"><label id={labelId} htmlFor={`${prefix}-item-${item.id}`} className="text-sm font-medium">{item.label}</label>
        {badge}</div>
        <div id={descriptionId} className="text-xs text-text-secondary">{item.description ? <p>{item.description}</p> : null}{item.disabledReason ? <p>{item.disabledReason}</p> : null}</div>
      </div>
    </div>;
  };
  const rows = filtered.map(group => {
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
  });
  const hiddenRows = showHidden ? hidden.map(group => <section key={group.id} className={compact ? 'space-y-1' : 'space-y-2'} aria-labelledby={`${prefix}-hidden-${group.id}`}>
    <h3 id={`${prefix}-hidden-${group.id}`} className="border-b border-border-subtle pb-1 text-sm font-semibold text-text-secondary">{group.label}</h3>
    {group.items.map(renderItem)}
  </section>) : null;
  const fold = hiddenCount > 0 ? <div className="space-y-3">
    <Button type="button" variant="ghost" size="toolbar" wrapText className="text-left" aria-expanded={showHidden} aria-controls={`${prefix}-hidden`} onClick={() => setShowHidden(open => !open)}>
      <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', showHidden && 'rotate-90')} aria-hidden />{copy.hiddenItems(hiddenCount)}</Button>
    <div id={`${prefix}-hidden`} className="space-y-4">{hiddenRows}</div>
  </div> : null;
  const body = props.mode === 'single'
    ? <RadioGroup aria-label={props['aria-label']} value={props.value ?? ''} onValueChange={id => { if (enabled.has(id)) props.onChange(id); }}>{rows}{fold}</RadioGroup>
    : <div role="group" aria-label={props['aria-label']} className="space-y-4">{rows}{fold}</div>;
  return <div className="space-y-4 break-keep">{header}{filtered.length === 0 && hiddenCount === 0 ? <p className="text-sm text-text-secondary">{copy.empty}</p> : null}{body}</div>;
}
