/**
 * The filter line of PlatformDataTable (ADR-0105, 06 §15): pinned field buttons that become chips when set, the other conditions as
 * chips, `+ 필터` (searchable field list), 모두 지우기 — and the header funnel. Every entry opens the same editor (`filterEditor.tsx`).
 * Internal module: renders only when the table has at least one filterable field.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, ListFilter, Plus, X } from 'lucide-react';
import type { ColumnFilter } from '@ap/contracts';
import { Button, cn, Input, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { describeFilter } from './columnFilters';
import { FilterEditorContent, FilterEditorForm } from './filterEditor';
import { unmetRequirement, type ResolvedFilterField } from './filterFields';

type Lang = 'ko' | 'en';
type Apply = (id: string, next: ColumnFilter | null) => void;

const chipClass = 'inline-flex h-6 items-center rounded-md border text-xs';
const slotFocus = 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring';

/** Chip text: a set reads 「필드: 값, 값」, everything else 「필드 연산자 값」 (R2 captions). */
function ChipText({ field, filter, lang }: { field: ResolvedFilterField; filter: ColumnFilter; lang: Lang }) {
  const value = describeFilter(filter, field.spec, lang);
  return <>
    <span className="text-text-secondary">{field.label}{filter.op === 'in' ? ':' : ''}</span>{' '}
    <span className="font-medium text-text-primary">{value}</span>
  </>;
}

/** One condition's slot: an empty pinned button, or the chip (body button = edit, × = remove). The body button is the popover trigger in both states, so focus stays put when a pinned button turns into a chip. */
function FieldSlot({ field, active, lang, onApply, onRemove }: {
  field: ResolvedFilterField; active: ColumnFilter | undefined; lang: Lang; onApply: (next: ColumnFilter | null) => void; onRemove: () => void;
}) {
  const ko = lang === 'ko';
  const [open, setOpen] = useState(false);
  return <span data-filter-slot={field.id} data-column-filter-chip={active ? field.id : undefined}
    className={cn(chipClass, active ? 'border-border-subtle bg-accent-primary-soft' : 'border-dashed border-border-control')}>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" data-filter-body={field.id} className={cn('inline-flex h-full min-w-0 items-center gap-1 px-2', active ? 'rounded-l-md' : 'rounded-md text-text-secondary', slotFocus)}>
          {active ? <ChipText field={field} filter={active} lang={lang} /> : <>{field.label}<ChevronDown className="size-3" aria-hidden /></>}
        </button>
      </PopoverTrigger>
      {open && <FilterEditorContent field={field} active={active} lang={lang} onApply={next => { setOpen(false); onApply(next); }} />}
    </Popover>
    {active && <button type="button" data-filter-remove={field.id} aria-label={ko ? `${field.label} 필터 지우기` : `Clear ${field.label} filter`}
      className={cn('inline-flex size-6 items-center justify-center rounded-r-md text-text-secondary hover:text-text-primary', slotFocus)} onClick={onRemove}><X className="size-3" aria-hidden /></button>}
  </span>;
}

const GROUP_LABEL = { pinned: { ko: '고정', en: 'Pinned' }, column: { ko: '열', en: 'Columns' }, field: { ko: '기타', en: 'Other' } } as const;
const SEARCH_FROM = 8;

/** `+ 필터`: a searchable list of every filterable field (grouped), then the editor for the chosen one in the same popover. */
function AddFilter({ fields, filters, lang, onApply }: { fields: readonly ResolvedFilterField[]; filters: readonly ColumnFilter[]; lang: Lang; onApply: Apply }) {
  const ko = lang === 'ko';
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const pickTitle = useId();
  const editTitle = useId();
  const list = useRef<HTMLDivElement>(null);
  const field = fields.find(f => f.id === chosen);
  const needle = query.trim().toLowerCase();
  const shown = fields.filter(f => f.label.toLowerCase().includes(needle));
  const groups = (['pinned', 'column', 'field'] as const).map(key => ({ key, items: shown.filter(f => (f.pinned ? 'pinned' : f.origin) === key) })).filter(g => g.items.length > 0);
  const move = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...(list.current?.querySelectorAll<HTMLElement>('[data-filter-pick]') ?? [])];
    if (items.length === 0) return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? (at + 1) % items.length : (at <= 0 ? items.length - 1 : at - 1);
    items[next].focus();
  };
  return <Popover open={open} onOpenChange={next => { setOpen(next); setChosen(null); setQuery(''); }}>
    <PopoverTrigger asChild>
      <button type="button" data-filter-add className={cn(chipClass, 'gap-1 border-border-control px-2 text-text-secondary hover:text-text-primary', slotFocus)}>
        <Plus className="size-3" aria-hidden />{ko ? '필터' : 'Filter'}
      </button>
    </PopoverTrigger>
    {open && <PopoverContent align="start" className={field ? 'w-80' : 'w-72'} aria-labelledby={field ? editTitle : pickTitle}>
      {field
        ? <FilterEditorForm field={field} active={filters.find(f => f.id === field.id)} lang={lang} titleId={editTitle} onApply={next => { setOpen(false); setChosen(null); onApply(field.id, next); }} />
        : <div ref={list} className="space-y-2" onKeyDown={move}>
          <p id={pickTitle} className="t-card-title">{ko ? '필터 추가' : 'Add filter'}</p>
          {fields.length > SEARCH_FROM && <Input autoFocus type="search" aria-label={ko ? '필드 찾기' : 'Find field'} placeholder={ko ? '필드 찾기' : 'Find field'} value={query} onChange={e => setQuery(e.target.value)} />}
          {groups.map(g => <div key={g.key} role="group" aria-label={GROUP_LABEL[g.key][lang]} className="space-y-0.5">
            <p className="px-1 text-xs text-text-muted" aria-hidden>{GROUP_LABEL[g.key][lang]}</p>
            {g.items.map(f => {
              const current = filters.find(c => c.id === f.id);
              const missing = unmetRequirement(f, filters, fields);
              return <button key={f.id} type="button" data-filter-pick={f.id} aria-disabled={missing !== null || undefined}
                className={cn('flex min-h-7 w-full items-center gap-2 rounded-xs px-1 text-left text-xs hover:bg-surface-sunken aria-disabled:cursor-not-allowed aria-disabled:text-text-muted', slotFocus)}
                onClick={() => { if (missing === null) setChosen(f.id); }}>
                <span className="min-w-0 flex-1 truncate">{f.label}</span>
                {missing !== null && <span className="text-text-muted">{ko ? `먼저 ${missing} 조건이 필요합니다` : `Needs ${missing} first`}</span>}
                {current && <><Check className="size-3 shrink-0" aria-hidden /><span className="max-w-24 truncate text-text-secondary">{describeFilter(current, f.spec, lang)}</span></>}
              </button>;
            })}
          </div>)}
          {shown.length === 0 && <p className="text-xs text-text-muted">{ko ? '일치하는 필드가 없습니다' : 'No matching fields'}</p>}
        </div>}
    </PopoverContent>}
  </Popover>;
}

export function FilterLine({ fields, filters, lang, onApply, onClear }: {
  fields: readonly ResolvedFilterField[]; filters: readonly ColumnFilter[]; lang: Lang; onApply: Apply; onClear: () => void;
}) {
  const ko = lang === 'ko';
  const root = useRef<HTMLDivElement>(null);
  const [refocus, setRefocus] = useState<string | null>(null);
  // A removed chip takes its focus with it: hand focus to what is left (after Radix's own close focus, hence the timeout).
  useEffect(() => {
    if (refocus === null) return;
    const timer = setTimeout(() => { root.current?.querySelector<HTMLElement>(refocus)?.focus(); setRefocus(null); }, 0);
    return () => clearTimeout(timer);
  }, [refocus]);
  const change = (field: ResolvedFilterField, next: ColumnFilter | null) => {
    const wasActive = filters.some(f => f.id === field.id);
    onApply(field.id, next);
    if (next === null && wasActive) setRefocus(field.pinned ? `[data-filter-body="${field.id}"]` : '[data-filter-add]');
  };
  const pinned = fields.filter(f => f.pinned);
  const others = filters.flatMap(f => { const field = fields.find(x => x.id === f.id); return field && !field.pinned ? [{ field, filter: f }] : []; });
  return <div ref={root} role="group" aria-label={ko ? '필터' : 'Filters'} data-filter-line className="flex flex-wrap items-center gap-2 border-t border-border-subtle px-3 py-1.5 text-xs">
    {pinned.map(f => <FieldSlot key={f.id} field={f} active={filters.find(c => c.id === f.id)} lang={lang} onApply={next => change(f, next)} onRemove={() => change(f, null)} />)}
    {others.map(({ field, filter }) => <FieldSlot key={field.id} field={field} active={filter} lang={lang} onApply={next => change(field, next)} onRemove={() => change(field, null)} />)}
    <AddFilter fields={fields} filters={filters} lang={lang} onApply={(id, next) => change(fields.find(f => f.id === id)!, next)} />
    {filters.length > 0 && <Button type="button" variant="ghost" size="toolbar" className="h-6" onClick={() => { onClear(); setRefocus('[data-filter-add]'); }}>{ko ? '모두 지우기' : 'Clear all'}</Button>}
  </div>;
}

/** The funnel in a filterable column header: the same editor, anchored to the header. Quiet until the header is hovered, focused or the column is filtered. */
export function HeaderFunnel({ field, active, lang, onApply }: { field: ResolvedFilterField; active: ColumnFilter | undefined; lang: Lang; onApply: (next: ColumnFilter | null) => void }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={lang === 'ko' ? `${field.label} 필터` : `${field.label} filter`} aria-pressed={active !== undefined} data-column-filter={field.id} data-active={active ? '' : undefined}
        className={cn('ml-1 inline-flex size-6 shrink-0 items-center justify-center rounded-xs hover:text-text-primary focus-visible:opacity-100', slotFocus,
          active ? 'text-accent-primary' : 'opacity-0 group-hover/head:opacity-100 data-[state=open]:opacity-100')}>
        <ListFilter className="size-3" aria-hidden />
      </button>
    </PopoverTrigger>
    {open && <FilterEditorContent field={field} active={active} lang={lang} onApply={next => { setOpen(false); onApply(next); }} />}
  </Popover>;
}
