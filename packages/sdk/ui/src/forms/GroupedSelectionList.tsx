import { useId, useState } from 'react';
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
};
/**
 * ko/en copy. The piece takes copy as a prop instead of calling `useI18n` so that it stays in `@ap/ui`: feature packages
 * may import only `@ap/ui` from the platform (ADR-0097), and `@ap/ui` does not depend on the kernel (#1842).
 */
export const GROUPED_SELECTION_MESSAGES: Readonly<Record<'ko' | 'en', GroupedSelectionMessages>> = {
  ko: { search: '검색…', clearSearch: '검색 지우기', clear: '모두 해제', all: '모두 선택', none: '선택 없음', empty: '검색 결과 없음',
    selectedCount: count => `선택 ${count}개`, selectedItem: label => `선택: ${label}` },
  en: { search: 'Search…', clearSearch: 'Clear search', clear: 'Clear all', all: 'Select all', none: 'No selection', empty: 'No results',
    selectedCount: count => `${count} selected`, selectedItem: label => `Selected: ${label}` },
};
type GroupedSelectionCommonProps = {
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
export function GroupedSelectionList(props: GroupedSelectionListProps) {
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
    <p className="text-xs text-text-secondary" role="status">{props.mode === 'multiple'
      ? copy.selectedCount(props.value.length)
      : props.value ? copy.selectedItem(allItems.find(item => item.id === props.value)?.label ?? copy.none) : copy.none}</p>
    <SearchInput size="toolbar" value={search} onValueChange={setSearch} placeholder={props.searchPlaceholder ?? copy.search} aria-label={props.searchPlaceholder ?? copy.search} clearLabel={copy.clearSearch} />
    {props.mode === 'multiple' ? <div className="flex flex-wrap items-center gap-2"><TooltipProvider>
      {props.presets?.map(preset => <Tooltip key={preset.id}><TooltipTrigger asChild>
        <Button type="button" variant="secondary" size="toolbar" aria-describedby={`${prefix}-preset-${preset.id}`} onClick={() => toggle(preset.itemIds, true)}>{preset.label}</Button>
      </TooltipTrigger><TooltipContent>{preset.description}</TooltipContent><span id={`${prefix}-preset-${preset.id}`} className="sr-only">{preset.description}</span></Tooltip>)}
    </TooltipProvider><Button type="button" variant="ghost" size="toolbar" disabled={props.value.length === 0} onClick={() => props.onChange([])}>{copy.clear}</Button></div> : null}
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
