import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useI18n } from '@ap/kernel';
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

type PageFilterBarShared = {
  label: string;
  fields: readonly PageFilterField[];
  actions?: ReactNode;
};

export type PageFilterBarProps =
  | (PageFilterBarShared & { collapsible?: false; orientation?: 'row' | 'column' })
  | (PageFilterBarShared & {
      /** Row orientation only: the collapsed summary line replaces the always-visible field row. */
      collapsible: true;
      /** Stable per-menu preference id; the collapse preference is stored per key. */
      preferenceKey: string;
      /** Consumer-provided label/value summary of every field; conditions are never dropped. */
      summaryItems: readonly PageFilterSummaryItem[];
      /** Reset/apply actions that stay visible while collapsed. */
      collapsedActions?: ReactNode;
      /** Marks unapplied changes at the end of the collapsed summary. */
      hasPendingChanges?: boolean;
    });

const EMPTY_OPTION_VALUE = '__page_filter_empty__';

function emptyOptionValue(options: readonly PageFilterOption[]) {
  let value = EMPTY_OPTION_VALUE;
  while (options.some(option => option.value === value)) value += '_';
  return value;
}

function PageFilterFieldControl({ field, id, column }: { field: PageFilterField; id: string; column: boolean }) {
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

    return <div className={cn('grid gap-1 text-xs text-text-secondary', column ? 'min-w-0 w-full' : 'min-w-36')}>
      <label htmlFor={id} id={labelId} onClick={event => { event.preventDefault(); event.currentTarget.control?.focus(); }}>{field.label}</label>
      <Select value={value} onValueChange={next => field.onValueChange(next === emptyValue ? '' : next)}>
        <SelectTrigger id={id} aria-labelledby={labelId} data-testid={field.testId} className={cn('h-8 border-border-control', column ? 'min-w-0 w-full' : 'min-w-36')}>
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
    <span className={cn('relative block max-w-full', column ? 'w-full' : 'w-56')}>
      {field.kind === 'search' && <Search aria-hidden data-page-filter-search-icon className="pointer-events-none absolute left-2 top-2 size-4 text-text-secondary" />}
      <Input
        id={id}
        type={field.kind === 'search' ? 'search' : 'text'}
        aria-labelledby={labelId}
        data-testid={field.testId}
        placeholder={field.placeholder}
        value={field.value}
        onChange={event => field.onValueChange(event.target.value)}
        className={cn(
          'h-8 w-full border-border-control',
          // eslint-disable-next-line shadcn/no-restyle -- 32px left padding reserves the overlaid search icon
          field.kind === 'search' && 'pl-8',
        )}
      />
    </span>
  </div>;
}

/** A visible, wrapping row for page-owned filters. Values, URL keys, and actions stay with the consumer. */
export function PageFilterBar(props: PageFilterBarProps) {
  if (!props.collapsible) return <StaticPageFilterBar {...props} />;
  const storageKey = `platform:page-filter-collapsed:${props.preferenceKey}`;
  // Remount (and re-read the stored preference) when the preference key changes.
  return <CollapsiblePageFilterBar key={storageKey} {...props} storageKey={storageKey} />;
}

function StaticPageFilterBar({ label, fields, actions, orientation = 'row' }: PageFilterBarShared & { collapsible?: false; orientation?: 'row' | 'column' }) {
  const id = useId();
  const column = orientation === 'column';

  return <fieldset data-testid="page-filter-bar" className={column ? 'min-w-0 w-full' : 'mb-3 rounded-md border border-border-subtle bg-surface-card p-3'}>
    <legend className={column ? 'sr-only' : 'px-1 text-xs text-text-secondary'}>{label}</legend>
    <div className={column ? 'grid min-w-0 gap-3' : 'flex flex-wrap items-end gap-3'}>
      {fields.map((field, index) => <PageFilterFieldControl key={field.key} field={field} column={column} id={`${id}-field-${index}`} />)}
      {!column && actions != null && <div className="flex flex-wrap items-end gap-2">{actions}</div>}
    </div>
    {column && actions != null && <div className="sticky bottom-0 mt-3 flex flex-wrap items-end gap-2 border-t border-border-subtle bg-surface-card py-3">{actions}</div>}
  </fieldset>;
}

function readCollapsedPreference(key: string): boolean {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'false') === true;
  } catch { return false; }
}

function CollapsiblePageFilterBar({ label, fields, actions, summaryItems, collapsedActions, hasPendingChanges, storageKey }: PageFilterBarShared & {
  summaryItems: readonly PageFilterSummaryItem[];
  collapsedActions?: ReactNode;
  hasPendingChanges?: boolean;
  storageKey: string;
}) {
  const { t } = useI18n();
  const id = useId();
  const panelId = `${id}-panel`;
  const summaryId = `${id}-summary`;
  const [collapsed, setCollapsed] = useState(() => readCollapsedPreference(storageKey));
  const pendingFocus = useRef<'expand' | 'collapse' | null>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const collapseRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (pendingFocus.current === 'expand') expandRef.current?.focus();
    else if (pendingFocus.current === 'collapse') collapseRef.current?.focus();
    pendingFocus.current = null;
  });

  function toggle(nextCollapsed: boolean) {
    pendingFocus.current = nextCollapsed ? 'expand' : 'collapse';
    setCollapsed(nextCollapsed);
    try { localStorage.setItem(storageKey, JSON.stringify(nextCollapsed)); } catch { /* preference stays in memory */ }
  }

  const liveText = `${summaryItems.map(item => `${item.label} ${item.value}`).join(' · ')}${hasPendingChanges ? ` · ${t('pageFilterPendingChanges')}` : ''}`;

  return <fieldset data-testid="page-filter-bar" className="mb-3 rounded-md border border-border-subtle bg-surface-card p-3">
    <legend className={collapsed ? 'sr-only' : 'px-1 text-xs text-text-secondary'}>{label}</legend>
    {collapsed ? <div className="flex flex-wrap items-center gap-2">
      <Button ref={expandRef} type="button" variant="secondary" size="toolbar" wrapText onClick={() => toggle(false)}
        aria-expanded="false" aria-controls={panelId} aria-describedby={summaryId} aria-label={t('expandPageFilter', { label })}
        className="min-w-0 flex-1 basis-56 justify-start">
        <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        <span className="shrink-0">{t('filters')}</span>
        <span id={summaryId} className="min-w-0">
          {summaryItems.map((item, index) => <span key={item.key} className="inline-block max-w-full [overflow-wrap:anywhere]">
            {index > 0 && <span aria-hidden className="mx-1.5 text-text-muted">·</span>}
            <span className="text-text-secondary">{item.label}</span> <span>{item.value}</span>
          </span>)}
          {hasPendingChanges && <span className="inline-block">
            {summaryItems.length > 0 && <span aria-hidden className="mr-1.5 text-text-muted">·</span>}{t('pageFilterPendingChanges')}
          </span>}
        </span>
      </Button>
      {collapsedActions != null && <div className="flex flex-wrap items-center gap-2">{collapsedActions}</div>}
    </div> : <div id={panelId} className="flex flex-wrap items-end gap-3">
      {fields.map((field, index) => <PageFilterFieldControl key={field.key} field={field} column={false} id={`${id}-field-${index}`} />)}
      <div className="flex flex-wrap items-end gap-2">
        {actions}
        <Button ref={collapseRef} type="button" variant="ghost" size="toolbar" onClick={() => toggle(true)}
          aria-expanded="true" aria-controls={panelId} aria-label={t('collapsePageFilter', { label })}>
          <ChevronUp className="size-3.5" aria-hidden />{t('collapseShort')}
        </Button>
      </div>
    </div>}
    {/* Always mounted so summary changes (e.g. reset while collapsed) are announced without re-mount churn. */}
    <div aria-live="polite" className="sr-only">{collapsed ? liveText : ''}</div>
  </fieldset>;
}
