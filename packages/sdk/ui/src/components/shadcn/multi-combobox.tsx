import { Check, ChevronsUpDown, Loader2, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '../Button.js';
import { cn } from '../../utils/cn.js';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './popover.js';

export interface MultiComboboxOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface MultiComboboxBaseProps {
  values: readonly string[];
  onValuesChange: (values: string[]) => void;
  options: readonly MultiComboboxOption[];
  getLabel?: (value: string) => string;
  listboxLabel: string;
  emptyText: string;
  selectedSummaryLabel: (count: number) => string;
  moreLabel: string;
  clearAllLabel: string;
  removeLabel: (label: string) => string;
  placeholder?: string;
  searchPlaceholder?: string;
  search?: string;
  onSearchChange?: (search: string) => void;
  loading?: boolean;
  loadingText: string;
  error?: string;
  onRetry?: () => void;
  retryLabel: string;
  hasMore?: boolean;
  onLoadMore?: () => void;
  maxVisibleChips?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-invalid'?: React.AriaAttributes['aria-invalid'];
  'aria-describedby'?: string;
}

export type MultiComboboxProps = MultiComboboxBaseProps & (
  | { label: string; 'aria-labelledby'?: string }
  | { label?: string; 'aria-labelledby': string }
) & (
  | { maxSelected?: undefined; maxSelectedText?: string }
  | { maxSelected: number; maxSelectedText: string }
);

/**
 * Controlled selection is independent of the current result page. Text belongs to callers.
 * Supply search/onSearchChange together for server search; options are then shown as given.
 * Without search, filtering is local. getLabel resolves selections outside the current page.
 * maxVisibleChips controls only the collapsed display, never the selection limit.
 */
export function MultiCombobox({
  values, onValuesChange, options, getLabel, label, 'aria-labelledby': labelledBy,
  listboxLabel, emptyText, selectedSummaryLabel, moreLabel, clearAllLabel, removeLabel,
  placeholder, searchPlaceholder, search: controlledSearch, onSearchChange,
  loading, loadingText, error, onRetry, retryLabel, hasMore, onLoadMore,
  maxVisibleChips = 2, maxSelected, maxSelectedText, disabled, id, className,
  'aria-invalid': invalid, 'aria-describedby': describedBy,
}: MultiComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [activeValue, setActiveValue] = React.useState<string | null>(null);
  const [selectedView, setSelectedView] = React.useState(false);
  const summaryRef = React.useRef<HTMLDivElement>(null);
  const [localSearch, setLocalSearch] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listId = React.useId();
  const summaryId = React.useId();
  const popupId = React.useId();
  const search = controlledSearch ?? localSearch;
  const filtered = controlledSearch !== undefined ? options : options.filter(option =>
    option.label.toLowerCase().includes(search.toLowerCase()));
  const activeIndex = filtered.findIndex(option => option.value === activeValue && !option.disabled);
  const activeId = activeIndex < 0 ? undefined : `${listId}-option-${activeIndex}`;
  function move(from: number, direction: 1 | -1) {
    for (let step = 1; step <= filtered.length; step += 1) {
      const index = (from + direction * step + filtered.length) % filtered.length;
      const option = filtered[index];
      if (option && !option.disabled) { setActiveValue(option.value); return; }
    }
    setActiveValue(null);
  }
  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); move(activeIndex, 1); break;
      case 'ArrowUp': event.preventDefault(); move(activeIndex < 0 ? 0 : activeIndex, -1); break;
      case 'Home': event.preventDefault(); move(-1, 1); break;
      case 'End': event.preventDefault(); move(0, -1); break;
      case 'Enter':
      case ' ':
        if (activeIndex >= 0) {
          event.preventDefault();
          const option = filtered[activeIndex];
          if (option) toggle(option);
        } else if (event.key === 'Enter') event.preventDefault();
        break;
      case 'Backspace':
        if (search === '' && values.length > 0) {
          event.preventDefault();
          const last = values.at(-1);
          if (last !== undefined) remove(last);
        }
        break;
      case 'Escape': event.preventDefault(); setOpen(false); break;
    }
  }
  const selectedValues = new Set(values);
  const labels = new Map(options.map(option => [option.value, option.label]));
  const valueLabel = (value: string) => labels.get(value) ?? getLabel?.(value) ?? value;
  const remove = (value: string) => onValuesChange(values.filter(item => item !== value));
  function toggle(option: MultiComboboxOption) {
    if (disabled || option.disabled) return;
    if (selectedValues.has(option.value)) remove(option.value);
    else if (maxSelected === undefined || values.length < maxSelected) {
      onValuesChange([...values, option.value]);
    }
    inputRef.current?.focus();
  }
  return (
    <Popover open={open && !disabled} onOpenChange={next => { setOpen(next); if (next) { setSelectedView(false); setActiveValue(null); } }}>
      <PopoverAnchor asChild>
        <div className={cn('flex min-h-10 w-full flex-wrap items-center gap-1 rounded-md border border-border-control bg-surface-field px-3 py-2 text-sm text-text-primary', className)}>
          {values.slice(0, Math.max(0, maxVisibleChips)).map(value => (
            <Button key={value} type="button" variant="secondary" size="toolbar" disabled={disabled}
              aria-label={removeLabel(valueLabel(value))} onClick={() => { remove(value); triggerRef.current?.focus(); }}>
              <span className="max-w-28 truncate">{valueLabel(value)}</span><X className="size-3" aria-hidden="true" />
            </Button>
          ))}
          {values.length > Math.max(0, maxVisibleChips) && (
            <Button type="button" variant="ghost" size="toolbar" disabled={disabled}
              aria-label={selectedSummaryLabel(values.length)} aria-haspopup="dialog" aria-controls={open && !disabled ? popupId : undefined} aria-expanded={open && !disabled}
              onClick={() => { setSelectedView(true); setOpen(true); }}>+{values.length - Math.max(0, maxVisibleChips)}</Button>
          )}
          <PopoverTrigger asChild>
            <button ref={triggerRef} id={id} type="button" disabled={disabled}
              aria-label={label} aria-labelledby={labelledBy} aria-haspopup="dialog"
              aria-expanded={open && !disabled} aria-controls={open && !disabled ? popupId : undefined}
              aria-invalid={invalid} aria-describedby={describedBy}
              onKeyDown={event => {
                if (!disabled && !open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
                  event.preventDefault(); setSelectedView(false); setOpen(true);
                  move(event.key === 'ArrowUp' ? 0 : -1, event.key === 'ArrowUp' ? -1 : 1);
                }
              }}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-sm text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-50">
              <span className="truncate">{placeholder ?? label ?? listboxLabel}</span><ChevronsUpDown className="size-4 shrink-0" aria-hidden="true" />
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>
      <PopoverContent id={popupId} aria-label={label} aria-labelledby={labelledBy} padding="none" className="w-(--radix-popover-trigger-width)"
        onOpenAutoFocus={event => { event.preventDefault(); (selectedView ? summaryRef.current : inputRef.current)?.focus(); }}>
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          <Button type="button" variant="ghost" size="sm" aria-pressed={!selectedView}
            onClick={() => { setSelectedView(false); }}>{listboxLabel}</Button>
          <Button type="button" variant="ghost" size="sm" aria-pressed={selectedView}
            onClick={() => setSelectedView(true)}>{selectedSummaryLabel(values.length)}</Button>
        </div>
        {selectedView ? (
          <div ref={summaryRef} id={summaryId} role="region" aria-label={selectedSummaryLabel(values.length)} tabIndex={-1}
            className="max-h-60 overflow-y-auto px-3 py-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">
            {values.map(value => (
              <div key={value} className="flex items-center justify-between gap-2 py-1">
                <span className="min-w-0 break-words text-sm">{valueLabel(value)}</span>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={removeLabel(valueLabel(value))}
                  onClick={() => { remove(value); summaryRef.current?.focus(); }}><X className="size-4" aria-hidden="true" /></Button>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => { onValuesChange([]); summaryRef.current?.focus(); }}>{clearAllLabel}</Button>
          </div>
        ) : <>
        <div className="border-b border-border-subtle px-3 py-2">
          <input ref={inputRef} role="combobox" value={search} aria-label={label} aria-labelledby={labelledBy}
            aria-expanded={open} aria-controls={listId} aria-activedescendant={activeId} onKeyDown={handleKeyDown} aria-autocomplete="list" placeholder={searchPlaceholder}
            onChange={event => { setActiveValue(null); setLocalSearch(event.target.value); onSearchChange?.(event.target.value); }}
            className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-secondary outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring" />
        </div>
        <div id={listId} role="listbox" aria-label={listboxLabel} aria-multiselectable="true" aria-busy={loading}
          className="max-h-60 overflow-y-auto py-1">
          {filtered.map((option, index) => {
            const selected = selectedValues.has(option.value);
            return (
            <button key={option.value} ref={node => { if (activeIndex === index) node?.scrollIntoView?.({ block: 'nearest' }); }} id={`${listId}-option-${index}`} type="button" role="option" aria-selected={selected}
              aria-disabled={option.disabled} tabIndex={-1} onMouseDown={event => event.preventDefault()}
              onClick={() => toggle(option)} onMouseEnter={() => { if (!option.disabled) setActiveValue(option.value); }}
              className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-text-primary outline-hidden hover:bg-surface-card',
                activeIndex === index && 'bg-surface-card ring-2 ring-inset ring-focus-ring',
                selected && 'font-medium',
                option.disabled && 'cursor-not-allowed opacity-50')}>
              <Check className={cn('size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
              <span><span className="block">{option.label}</span>{option.description && <span className="block text-xs text-text-secondary">{option.description}</span>}</span>
            </button>
            );
          })}
          {filtered.length === 0 && !loading && !error && <p className="px-3 py-2 text-sm text-text-secondary">{emptyText}</p>}
        </div>
        {loading && <div role="status" className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{loadingText}</div>}
        {error && <div className="px-3 py-2"><p role="alert" className="text-sm text-text-danger-label">{error}</p>{onRetry && <Button type="button" variant="ghost" size="sm" onClick={onRetry}>{retryLabel}</Button>}</div>}
        {hasMore && onLoadMore && <Button type="button" variant="ghost" size="sm" disabled={loading} onMouseDown={event => event.preventDefault()} onClick={() => { inputRef.current?.focus(); onLoadMore(); }}>{moreLabel}</Button>}
        </>}
        {maxSelected !== undefined && values.length >= maxSelected && <p role="note" className="px-3 py-2 text-xs text-text-secondary">{maxSelectedText}</p>}
      </PopoverContent>
    </Popover>
  );
}
