import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useI18n } from '@ap/kernel';
import { useCollapsePreference } from './useCollapsePreference';
import { Button, cn, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ap/ui';

export type PageFilterOption = { value: string; label: string };

type PageFilterFieldBase = {
  key: string;
  label: string;
  testId?: string;
};

export type PageFilterField =
  | (PageFilterFieldBase & {
      kind: 'search' | 'text';
      value: string;
      onValueChange: (value: string) => void;
      placeholder?: string;
    })
  | (PageFilterFieldBase & {
      kind: 'select';
      value: string;
      onValueChange: (value: string) => void;
      options: readonly PageFilterOption[];
      emptyOptionLabel?: string;
      placeholder?: string;
    })
  | (PageFilterFieldBase & {
      kind: 'custom';
      content: ReactNode;
    });

export type PageFilterSummaryItem = { key: string; label: string; value: string };

/** Applied values only; the consumer owns their state and optional immediate clear action. */
export type PageFilterAppliedChip = PageFilterSummaryItem & {
  title?: string;
  onClear?: () => void;
  clearLabel?: string;
};

type PageFilterBarShared = {
  /** Marks the query-draft (ADR-0037) controlled presentation; the bar has no apply dispatch of its own. */
  mode?: 'draft';
  label: string;
  fields: readonly PageFilterField[];
  actions?: ReactNode;
};

export type PageFilterBarProps = PageFilterBarShared & {
  /** The collapsed summary line replaces the always-visible field row (the row-only form was retired with #1218). */
  collapsible: true;
  /** Stable per-menu preference id; the collapse preference is stored per key. */
  preferenceKey: string;
  /** Consumer-provided label/value summary of every field; conditions are never dropped. */
  summaryItems: readonly PageFilterSummaryItem[];
  /** Reset/apply actions that stay visible while collapsed. */
  collapsedActions?: ReactNode;
  /** Marks unapplied changes beside expanded actions and at the end of the collapsed summary. */
  hasPendingChanges?: boolean;
  /** Optional applied-state row, also visible while collapsed. Omit to preserve the existing DOM. */
  appliedChips?: readonly PageFilterAppliedChip[];
};

const EMPTY_OPTION_VALUE = '__page_filter_empty__';

function emptyOptionValue(options: readonly PageFilterOption[]) {
  let value = EMPTY_OPTION_VALUE;
  while (options.some(option => option.value === value)) value += '_';
  return value;
}

function PageFilterFieldControl({ field, id }: { field: PageFilterField; id: string }) {
  const labelId = `${id}-label`;

  if (field.kind === 'custom') {
    return <div data-testid={field.testId} className="grid min-w-0 gap-1 text-xs text-text-secondary">
      <span id={labelId}>{field.label}</span>
      <div role="group" aria-labelledby={labelId}>{field.content}</div>
    </div>;
  }

  if (field.kind === 'select') {
    const options = field.value && !field.options.some(option => option.value === field.value)
      ? [...field.options, { value: field.value, label: field.value }]
      : field.options;
    const emptyValue = emptyOptionValue(options);
    const value = field.value === '' && field.emptyOptionLabel ? emptyValue : field.value;

    return <div className={'grid min-w-36 gap-1 text-xs text-text-secondary'}>
      <label htmlFor={id} id={labelId} onClick={event => { event.preventDefault(); event.currentTarget.control?.focus(); }}>{field.label}</label>
      <Select value={value} onValueChange={next => field.onValueChange(next === emptyValue ? '' : next)}>
        <SelectTrigger id={id} aria-labelledby={labelId} data-testid={field.testId} className={'min-w-36 border-border-control'}>
          <SelectValue placeholder={field.placeholder} />
        </SelectTrigger>
        <SelectContent>
          {field.emptyOptionLabel && <SelectItem value={emptyValue}>{field.emptyOptionLabel}</SelectItem>}
          {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>;
  }

  return <div className="grid min-w-0 gap-1 text-xs text-text-secondary">
    <label htmlFor={id} id={labelId} onClick={event => { event.preventDefault(); event.currentTarget.control?.focus(); }}>{field.label}</label>
    <span className={'relative block w-56 max-w-full'}>
      {field.kind === 'search' && <Search aria-hidden data-page-filter-search-icon className="pointer-events-none absolute left-2 top-3 size-4 text-text-secondary" />}
      <Input
        id={id}
        type={field.kind === 'search' ? 'search' : 'text'}
        aria-labelledby={labelId}
        data-testid={field.testId}
        placeholder={field.placeholder}
        value={field.value}
        onChange={event => field.onValueChange(event.target.value)}
        className={cn(
          'w-full border-border-control',
          // eslint-disable-next-line shadcn/no-restyle -- 32px left padding reserves the overlaid search icon
          field.kind === 'search' && 'pl-8',
        )}
      />
    </span>
  </div>;
}

/** Collapsible page filter bar: the page owns the draft values and their apply (`mode="draft"` is an inert marker), with an optional applied-chips row. */
export function PageFilterBar(props: PageFilterBarProps) {
  const storageKey = `platform:page-filter-collapsed:${props.preferenceKey}`;
  // Remount (and re-read the stored preference) when the preference key changes.
  return <CollapsiblePageFilterBar key={storageKey} {...props} storageKey={storageKey} />;
}

function AppliedConditionChip({ chip, lang, onClear }: { chip: PageFilterAppliedChip; lang: 'ko' | 'en'; onClear: (chip: PageFilterAppliedChip, button: HTMLButtonElement) => void }) {
  const text = `${chip.label} ${chip.value}`;
  // Same chip and clear-button vocabulary as table/filterLine.tsx; keep table output untouched.
  return <span role="group" aria-label={text} title={chip.title ?? text}
    className="inline-flex h-6 min-w-0 max-w-full items-center rounded-md border border-border-subtle bg-accent-primary-soft text-xs">
    <span className="inline-flex min-w-0 items-center gap-1 px-2">
      <span className="shrink-0 text-text-secondary">{chip.label}</span>{' '}
      <span className="max-w-[28ch] truncate font-medium text-text-primary">{chip.value}</span>
    </span>
    {chip.onClear && <button type="button" data-page-filter-chip-clear aria-label={chip.clearLabel ?? (lang === 'ko' ? `${chip.label} 필터 지우기` : `Clear ${chip.label} filter`)}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-r-md text-text-secondary hover:text-text-primary focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring"
      onClick={event => onClear(chip, event.currentTarget)}><X className="size-3" aria-hidden /></button>}
  </span>;
}

function CollapsiblePageFilterBar({ label, fields, actions, summaryItems, collapsedActions, hasPendingChanges, appliedChips, storageKey }: PageFilterBarShared & {
  summaryItems: readonly PageFilterSummaryItem[];
  collapsedActions?: ReactNode;
  hasPendingChanges?: boolean;
  appliedChips?: readonly PageFilterAppliedChip[];
  storageKey: string;
}) {
  const { t, lang } = useI18n();
  const id = useId();
  const panelId = `${id}-panel`;
  const summaryId = `${id}-summary`;
  const summaryText = `${summaryItems.map(item => `${item.label} ${item.value}`).join(' · ')}${hasPendingChanges ? ` · ${t('pageFilterPendingChanges')}` : ''}`;
  const { collapsed, toggle, expandRef, collapseRef, liveText } = useCollapsePreference(storageKey, summaryText);
  const barRef = useRef<HTMLFieldSetElement>(null);
  const clearedFocus = useRef<{ key: string; index: number } | null>(null);
  const clearChip = (chip: PageFilterAppliedChip, button: HTMLButtonElement) => {
    if (document.activeElement === button) {
      const buttons = Array.from(barRef.current?.querySelectorAll('[data-page-filter-chip-clear]') ?? []);
      clearedFocus.current = { key: chip.key, index: buttons.indexOf(button) };
    }
    chip.onClear?.();
  };
  useLayoutEffect(() => {
    const cleared = clearedFocus.current;
    clearedFocus.current = null;
    if (!cleared || appliedChips?.some(chip => chip.key === cleared.key) || document.activeElement !== document.body) return;
    // A removed clear button must not strand keyboard focus on the document body.
    const buttons = barRef.current?.querySelectorAll<HTMLButtonElement>('[data-page-filter-chip-clear]');
    (buttons?.[cleared.index] ?? buttons?.[cleared.index - 1] ?? (collapsed ? expandRef.current : collapseRef.current))?.focus();
  });

  return <fieldset ref={barRef} data-testid="page-filter-bar" className="mb-3 rounded-md border border-border-subtle bg-surface-card p-3">
    <legend className={collapsed ? 'sr-only' : 'px-1 text-xs text-text-secondary'}>{label}</legend>
    {collapsed && <div className="flex flex-wrap items-center gap-2">
      <Button ref={expandRef} type="button" variant="secondary" size="toolbar" wrapText onClick={() => toggle(false)}
        aria-expanded="false" aria-controls={panelId} aria-describedby={summaryId} aria-label={t('expandPageFilter', { label })}
        className="min-w-0 flex-1 basis-56 items-start justify-start text-left">
        <ChevronDown className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span className="shrink-0">{t('filters')}</span>
        <span id={summaryId} className="min-w-0">
          {summaryItems.map((item, index) => <span key={item.key} className="inline-block max-w-full [overflow-wrap:anywhere]">
            <span className="font-normal text-text-secondary">{item.label}</span> <span className="font-medium">{item.value}</span>
            {(index < summaryItems.length - 1 || hasPendingChanges) && <span aria-hidden className="mx-1.5 text-text-muted">·</span>}
          </span>)}
          {hasPendingChanges && <span className="inline-block">{t('pageFilterPendingChanges')}</span>}
        </span>
      </Button>
      {collapsedActions != null && <div className="flex flex-wrap items-center gap-2">{collapsedActions}</div>}
    </div>}
    {/* Shell stays mounted with the same id in both states so aria-controls never points at a missing element. */}
    <div id={panelId} hidden={collapsed} className={collapsed ? undefined : 'flex flex-wrap items-end gap-3'}>
      {!collapsed && <>
        {fields.map((field, index) => <PageFilterFieldControl key={field.key} field={field} id={`${id}-field-${index}`} />)}
        <div className="flex flex-wrap items-end gap-2">
          {actions}
          {hasPendingChanges && <span className="t-caption self-center text-text-secondary">{t('pageFilterPendingApplyHint')}</span>}
          <Button ref={collapseRef} type="button" variant="ghost" size="toolbar" onClick={() => toggle(true)}
            aria-expanded="true" aria-controls={panelId} aria-label={t('collapsePageFilter', { label })}>
            <ChevronUp className="size-3.5" aria-hidden />{t('collapseShort')}
          </Button>
        </div>
      </>}
    </div>
    {appliedChips && appliedChips.length > 0 && <div role="group" aria-label={lang === 'ko' ? '적용된 조건' : 'Applied conditions'}
      className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-border-subtle pt-2 text-xs">
      <span className="text-text-secondary">{lang === 'ko' ? '적용됨' : 'Applied'}</span>
      {appliedChips.map(chip => <AppliedConditionChip key={chip.key} chip={chip} lang={lang} onClear={clearChip} />)}
    </div>}
    {/* Always mounted; carries only real summary changes that happened while collapsed (see the baseline effect above). */}
    <div aria-live="polite" className="sr-only">{liveText}</div>
  </fieldset>;
}
