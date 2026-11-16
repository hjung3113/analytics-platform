import { useId, useState } from 'react';
import { Button } from '../components/Button';
import { Checkbox } from '../components/shadcn/checkbox';
import { RadioGroup, RadioGroupItem } from '../components/shadcn/radio-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/shadcn/tooltip';
import { StatusBadge, type Tone } from '../components/StatusBadge';
import { SearchInput } from './SearchInput';
import { InfoTip } from '../panel/InfoTip';
import { X } from 'lucide-react';

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
type PrototypeSelectionMessages = {
  hiddenCount: (count: number) => string; hideUnavailable: string; removeItem: (label: string) => string;
  previewItems: (labels: string) => string; presetComplete: string; categories: string;
};
/**
 * ko/en copy. The piece takes copy as a prop instead of calling `useI18n` so that it stays in `@ap/ui`: feature packages
 * may import only `@ap/ui` from the platform (ADR-0097), and `@ap/ui` does not depend on the kernel (#1842).
 */
export const GROUPED_SELECTION_MESSAGES: Readonly<Record<'ko' | 'en', GroupedSelectionMessages & PrototypeSelectionMessages>> = {
  ko: { search: '검색…', clearSearch: '검색 지우기', clear: '모두 해제', all: '모두 선택', none: '선택 없음', empty: '검색 결과 없음',
    selectedCount: count => `선택 ${count}개`, selectedItem: label => `선택: ${label}`,
    hiddenCount: count => `숨긴 ${count}개(선택 불가)`, hideUnavailable: '선택 불가 항목 접기', removeItem: label => `${label} 선택 해제`,
    previewItems: labels => `추가할 항목: ${labels}`, presetComplete: '모두 선택됨', categories: '분류' },
  en: { search: 'Search…', clearSearch: 'Clear search', clear: 'Clear all', all: 'Select all', none: 'No selection', empty: 'No results',
    selectedCount: count => `${count} selected`, selectedItem: label => `Selected: ${label}`,
    hiddenCount: count => `${count} hidden (unavailable)`, hideUnavailable: 'Hide unavailable items', removeItem: label => `Remove ${label}`,
    previewItems: labels => `Will add: ${labels}`, presetComplete: 'All selected', categories: 'Categories' },
};
type GroupedSelectionCommonProps = {
  /** Throwaway #2405 options; omission retains the existing list markup. */
  density?: 'compact';
  hideDisabled?: boolean;
  selectionSummary?: 'chips';
  presetPreview?: boolean;
  layout?: 'stacked' | 'columns' | 'category-pane';
  /** Set false when an owning form shows selection counts without live toggle announcements. */
  announceSelection?: boolean;
  groups: readonly GroupedSelectionGroup[];
  searchPlaceholder?: string;
  'aria-label': string;
  /** Overrides of the copy; unset keys fall back to Korean (`GROUPED_SELECTION_MESSAGES.ko`). */
  messages?: Partial<GroupedSelectionMessages & PrototypeSelectionMessages>;
};
/** Presets and bulk actions are multiple-only. The caller owns the single scroll layer. */
export type GroupedSelectionListProps = GroupedSelectionCommonProps & (
  | { mode: 'multiple'; value: readonly string[]; onChange: (ids: string[]) => void; presets?: readonly GroupedSelectionPreset[] }
  | { mode: 'single'; value: string | null; onChange: (id: string) => void; presets?: never }
);
export function GroupedSelectionList(props: GroupedSelectionListProps) {
  if (props.density || props.hideDisabled || props.selectionSummary || props.presetPreview || props.layout) return <SelectionPrototype {...props} />;
  return <DefaultSelectionList {...props} />;
}
function DefaultSelectionList(props: GroupedSelectionListProps) {
  const copy: GroupedSelectionMessages = { ...GROUPED_SELECTION_MESSAGES.ko, ...props.messages };
  const prefix = useId();
  const [search, setSearch] = useState('');
  const query = search.trim().toLocaleLowerCase();
  const allItems = props.groups.flatMap(group => group.items);
  const selected = new Set(props.mode === 'multiple' ? props.value : props.value === null ? [] : [props.value]);
  const enabled = new Set(allItems.filter(item => !item.disabledReason).map(item => item.id));
  const filtered = props.groups.map(group => ({ ...group, items: group.items.filter(item =>
    [group.label, item.label, item.description ?? '', item.id].some(text => text.toLocaleLowerCase().includes(query))) })).filter(group => group.items.length > 0);
  function toggle(ids: readonly string[], checked: boolean) {
    if (props.mode !== 'multiple') return;
    const next = new Set(props.value);
    for (const id of ids) if (enabled.has(id)) { if (checked) next.add(id); else next.delete(id); }
    props.onChange([...next]);
  }
  const header = <div className="sticky top-0 z-10 space-y-2 bg-surface-card pb-3">
    <p className="text-xs text-text-secondary" role={props.announceSelection === false ? undefined : 'status'}>{props.mode === 'multiple'
      ? copy.selectedCount(props.value.length)
      : props.value ? copy.selectedItem(allItems.find(item => item.id === props.value)?.label ?? copy.none) : copy.none}</p>
    <SearchInput size="toolbar" value={search} onValueChange={setSearch} placeholder={props.searchPlaceholder ?? copy.search} aria-label={props.searchPlaceholder ?? copy.search} clearLabel={copy.clearSearch} />
    {props.mode === 'multiple' ? <div className="flex flex-wrap items-center gap-2"><TooltipProvider>
      {props.presets?.map(preset => <Tooltip key={preset.id}><TooltipTrigger asChild>
        <Button type="button" variant="secondary" size="toolbar" aria-describedby={`${prefix}-preset-${preset.id}`} onClick={() => toggle(preset.itemIds, true)}>{preset.label}</Button>
      </TooltipTrigger><TooltipContent>{preset.description}</TooltipContent><span id={`${prefix}-preset-${preset.id}`} className="sr-only">{preset.description}</span></Tooltip>)}
    </TooltipProvider><Button type="button" variant="ghost" size="toolbar" disabled={!props.value.some(id => enabled.has(id))} onClick={() => props.onChange(props.value.filter(id => !enabled.has(id)))}>{copy.clear}</Button></div> : null}
  </div>;
  const rows = filtered.map(group => {
    const available = group.items.filter(item => !item.disabledReason).map(item => item.id);
    const count = available.filter(id => selected.has(id)).length;
    const checked = count === 0 ? false : count === available.length ? true : 'indeterminate';
    return <section key={group.id} className="space-y-2" aria-labelledby={`${prefix}-group-${group.id}`}>
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-1">
        <div className="flex items-center gap-2">{props.mode === 'multiple' ? <Checkbox aria-label={`${group.label} ${copy.all}`} checked={checked} disabled={available.length === 0} onCheckedChange={value => toggle(available, value === true)} /> : null}
          <h3 id={`${prefix}-group-${group.id}`} className="text-sm font-semibold">{group.label}</h3></div>
        {props.mode === 'multiple' ? <span className="text-xs text-text-secondary">{count}/{available.length}</span> : null}
      </div>
      {group.items.map(item => <div key={item.id} className="flex items-start gap-3 border-b border-border-subtle py-3">
        {props.mode === 'multiple'
          ? <Checkbox id={`${prefix}-item-${item.id}`} aria-labelledby={`${prefix}-label-${item.id}`} aria-describedby={`${prefix}-description-${item.id}`} checked={selected.has(item.id)} disabled={!!item.disabledReason} onCheckedChange={value => toggle([item.id], value === true)} />
          : <RadioGroupItem id={`${prefix}-item-${item.id}`} value={item.id} aria-labelledby={`${prefix}-label-${item.id}`} aria-describedby={`${prefix}-description-${item.id}`} disabled={!!item.disabledReason} />}
        <div className="min-w-0 flex-1 space-y-1"><div className="flex items-center gap-2"><label id={`${prefix}-label-${item.id}`} htmlFor={`${prefix}-item-${item.id}`} className="text-sm font-medium">{item.label}</label>
          {item.badge ? <StatusBadge tone={item.badge.tone ?? 'neutral'}>{item.badge.label}</StatusBadge> : null}</div>
          <div id={`${prefix}-description-${item.id}`} className="text-xs text-text-secondary">{item.description ? <p>{item.description}</p> : null}{item.disabledReason ? <p>{item.disabledReason}</p> : null}</div>
        </div>
      </div>)}
    </section>;
  });
  return <div className="space-y-4 break-keep">{header}{filtered.length === 0 ? <p className="text-sm text-text-secondary">{copy.empty}</p> : null}
    {props.mode === 'single' ? <RadioGroup aria-label={props['aria-label']} value={props.value ?? ''} onValueChange={id => { if (enabled.has(id)) props.onChange(id); }}>{rows}</RadioGroup> : <div role="group" aria-label={props['aria-label']} className="space-y-4">{rows}</div>}
  </div>;
}

/** Isolated opt-in prototype. No routing, token vocabulary, or exported Switch primitive. */
function SelectionPrototype(props: GroupedSelectionListProps) {
  const copy = { ...GROUPED_SELECTION_MESSAGES.ko, ...props.messages };
  const prefix = useId();
  const [search, setSearch] = useState('');
  const [showDisabled, setShowDisabled] = useState(false);
  const [category, setCategory] = useState(props.groups[0]?.id ?? '');
  const allItems = props.groups.flatMap(group => group.items);
  const selectedIds = props.mode === 'multiple' ? props.value : [props.value].filter((id): id is string => id !== null);
  const selected = new Set(selectedIds);
  const enabled = new Set(allItems.filter(item => !item.disabledReason).map(item => item.id));
  const disabledCount = allItems.filter(item => item.disabledReason).length;
  const query = search.trim().toLocaleLowerCase();
  const filtered = props.groups.map(group => ({ ...group, items: group.items.filter(item =>
    (!props.hideDisabled || showDisabled || !item.disabledReason) &&
    [group.label, item.label, item.description ?? '', item.id, item.disabledReason ?? ''].some(text => text.toLocaleLowerCase().includes(query))) })).filter(group => group.items.length);
  const active = filtered.find(group => group.id === category) ?? filtered[0];
  const pane = props.layout === 'category-pane';
  function toggle(ids: readonly string[], checked: boolean) {
    if (props.mode !== 'multiple') return;
    const next = new Set(props.value);
    for (const id of ids) if (enabled.has(id)) { if (checked) next.add(id); else next.delete(id); }
    props.onChange([...next]);
  }
  function renderGroup(group: GroupedSelectionGroup) {
    const available = group.items.filter(item => !item.disabledReason).map(item => item.id);
    const count = available.filter(id => selected.has(id)).length;
    const checked = count > 0 && (count === available.length ? true : 'indeterminate');
    return <section key={group.id} className="min-w-0 space-y-1" aria-labelledby={`${prefix}-group-${group.id}`}>
      <div className="flex min-h-8 items-center justify-between gap-2 border-b border-border-subtle">
        <div className="flex min-w-0 items-center gap-2">
          {props.mode === 'multiple' ? <Checkbox aria-label={`${group.label} ${copy.all}`} checked={checked} disabled={!available.length} onCheckedChange={value => toggle(available, value === true)} /> : null}
          <h3 id={`${prefix}-group-${group.id}`} className="text-sm font-semibold">{group.label}</h3>
        </div>
        {props.mode === 'multiple' ? <span className="shrink-0 text-xs tabular-nums text-text-secondary">{count}/{available.length}</span> : null}
      </div>
      {group.items.map(item => {
        const descriptionId = `${prefix}-description-${item.id}`;
        const itemId = `${prefix}-item-${item.id}`;
        const labelId = `${prefix}-label-${item.id}`;
        const description = [item.description, item.disabledReason].filter(Boolean).join(' · ');
        const compact = props.density === 'compact';
        let control;
        if (props.mode === 'single') control = <RadioGroupItem id={itemId} value={item.id} aria-labelledby={labelId} aria-describedby={descriptionId} disabled={!!item.disabledReason} />;
        else if (pane) control = <PrototypeSwitch id={itemId} labelId={labelId} descriptionId={descriptionId} checked={selected.has(item.id)} disabled={!!item.disabledReason} onChange={() => toggle([item.id], !selected.has(item.id))} />;
        else control = <Checkbox id={itemId} aria-labelledby={labelId} aria-describedby={descriptionId} checked={selected.has(item.id)} disabled={!!item.disabledReason} onCheckedChange={value => toggle([item.id], value === true)} />;
        return <div key={item.id} className={compact ? 'flex min-h-9 items-center gap-2 border-b border-border-subtle py-1' : 'flex items-start gap-3 border-b border-border-subtle py-3'}>
          {!pane ? control : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <label id={labelId} htmlFor={itemId} className="min-w-0 truncate text-sm font-medium">{item.label}</label>
              {compact && description ? <InfoTip label={item.label} descriptionId={descriptionId}>{description}</InfoTip> : null}
              {item.badge ? <StatusBadge tone={item.badge.tone ?? 'neutral'}>{item.badge.label}</StatusBadge> : null}
            </div>
            {!compact ? <p id={descriptionId} className="text-xs text-text-secondary">{description}</p> : null}
            {compact && item.disabledReason ? <p className="text-xs text-text-secondary">{item.disabledReason}</p> : null}
          </div>
          {pane ? control : null}
        </div>;
      })}
    </section>;
  }
  let rowsClass = 'space-y-4';
  if (props.layout === 'columns') rowsClass = 'grid grid-cols-1 items-start gap-4 @min-sm:grid-cols-2';
  if (pane) rowsClass = 'grid grid-cols-3 items-start gap-3';
  const rows = <div className={rowsClass}>
    {pane ? <div className="space-y-1" role="group" aria-label={copy.categories}>
      {filtered.map(group => {
        const available = (props.groups.find(entry => entry.id === group.id)?.items ?? []).filter(item => !item.disabledReason);
        return <Button key={group.id} type="button" variant={active?.id === group.id ? 'secondary' : 'ghost'} size="sm" wrapText
          className="h-auto min-h-9 w-full justify-between gap-1 px-2 py-2 text-left" aria-pressed={active?.id === group.id} aria-controls={`${prefix}-pane`} onClick={() => setCategory(group.id)}>
          <span className="min-w-0 truncate" title={group.label}>{group.label}</span><span className="shrink-0 text-xs tabular-nums">{available.filter(item => selected.has(item.id)).length}/{available.length}</span>
        </Button>;
      })}
    </div> : null}
    {pane ? <div id={`${prefix}-pane`} className="col-span-2 min-w-0">{active ? renderGroup(active) : null}</div> : filtered.map(renderGroup)}
  </div>;
  return <div className="@container space-y-3 break-keep">
    <div className="sticky top-0 z-10 space-y-2 border-b border-border-subtle bg-surface-card pb-3 pt-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-text-secondary" role={props.announceSelection === false ? undefined : 'status'}>{copy.selectedCount(selected.size)}</p>
        {props.mode === 'multiple' ? <Button type="button" variant="ghost" size="toolbar" disabled={!props.value.some(id => enabled.has(id))} onClick={() => props.onChange(props.value.filter(id => !enabled.has(id)))}>{copy.clear}</Button> : null}
      </div>
      {props.selectionSummary === 'chips' ? <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto" tabIndex={0} role="group" aria-label={copy.selectedCount(selected.size)}>
        {[...selected].map(id => {
          const item = allItems.find(entry => entry.id === id);
          const label = item?.label ?? id;
          return <Button key={id} type="button" variant="secondary" size="toolbar" className="max-w-full" aria-label={copy.removeItem(label)} disabled={props.mode !== 'multiple' || !enabled.has(id)} onClick={() => toggle([id], false)}>
            <span className="truncate">{label}</span><X className="size-3 shrink-0" aria-hidden />
          </Button>;
        })}
        {!selected.size ? <p className="text-xs text-text-secondary">{copy.none}</p> : null}
      </div> : null}
      <SearchInput size="toolbar" value={search} onValueChange={setSearch} placeholder={props.searchPlaceholder ?? copy.search} aria-label={props.searchPlaceholder ?? copy.search} clearLabel={copy.clearSearch} />
      {props.hideDisabled && disabledCount ? <Button type="button" variant="ghost" size="toolbar" aria-expanded={showDisabled} onClick={() => setShowDisabled(value => !value)}>{showDisabled ? copy.hideUnavailable : copy.hiddenCount(disabledCount)}</Button> : null}
    </div>
    {props.mode === 'multiple' && props.presets?.length ? <div className={props.presets.length === 2 ? 'grid grid-cols-1 gap-3 @min-sm:grid-cols-2' : 'grid grid-cols-1 gap-3 @min-sm:grid-cols-3'}>
      {props.presets.map(preset => {
        const additions = allItems.filter(item => preset.itemIds.includes(item.id) && enabled.has(item.id) && !selected.has(item.id));
        const preview = additions.length ? copy.previewItems(additions.map(item => item.label).join(' · ')) : copy.presetComplete;
        return <div key={preset.id} className="space-y-1">
          <Button type="button" variant="secondary" size="toolbar" aria-describedby={`${prefix}-preset-${preset.id}`} onClick={() => toggle(preset.itemIds, true)}>{preset.label}</Button>
          <p id={`${prefix}-preset-${preset.id}`} className="text-xs text-text-secondary">{props.presetPreview ? preview : preset.description}</p>
        </div>;
      })}
    </div> : null}
    {!filtered.length ? <p className="text-sm text-text-secondary">{copy.empty}</p> : null}
    {props.mode === 'single' ? <RadioGroup aria-label={props['aria-label']} value={props.value ?? ''} onValueChange={id => { if (enabled.has(id)) props.onChange(id); }}>{rows}</RadioGroup> : <div role="group" aria-label={props['aria-label']} className={props.layout === 'columns' ? 'grid grid-cols-1 items-start gap-4 @min-sm:grid-cols-2' : undefined}>{props.layout === 'columns' ? filtered.map(renderGroup) : rows}</div>}
  </div>;
}

/** Local prototype only: native button keyboard behavior, explicit switch semantics. */
function PrototypeSwitch({ id, labelId, descriptionId, checked, disabled, onChange }: {
  id: string; labelId: string; descriptionId: string; checked: boolean; disabled: boolean; onChange: () => void;
}) {
  return <Button id={id} type="button" variant="ghost" size="icon-sm" role="switch" aria-checked={checked} aria-labelledby={labelId} aria-describedby={descriptionId} disabled={disabled} onClick={onChange} className="shrink-0">
    <span className={checked ? 'flex h-5 w-8 items-center rounded-full border border-border-selected bg-accent-primary px-0.5' : 'flex h-5 w-8 items-center rounded-full border border-border-control bg-surface-sunken px-0.5'}>
      <span className={checked ? 'size-3.5 translate-x-3 rounded-full bg-surface-card' : 'size-3.5 rounded-full bg-text-secondary'} />
    </span>
  </Button>;
}
