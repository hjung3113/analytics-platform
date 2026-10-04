import { useId, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { cn, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ap/ui';

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

export type PageFilterBarProps = {
  label: string;
  fields: readonly PageFilterField[];
  actions?: ReactNode;
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

    return <div className="grid min-w-36 gap-1 text-xs text-text-secondary">
      <label htmlFor={id} id={labelId} onClick={event => event.currentTarget.control?.focus()}>{field.label}</label>
      <Select value={value} onValueChange={next => field.onValueChange(next === emptyValue ? '' : next)}>
        <SelectTrigger id={id} aria-labelledby={labelId} data-testid={field.testId} className="h-8 min-w-36 border-border-control bg-surface-card text-text-primary">
          <SelectValue placeholder={field.placeholder} />
        </SelectTrigger>
        <SelectContent className="text-text-secondary">
          {field.emptyOptionLabel && <SelectItem value={emptyValue}>{field.emptyOptionLabel}</SelectItem>}
          {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>;
  }

  return <div className="grid min-w-0 gap-1 text-xs text-text-secondary">
    <label htmlFor={id} id={labelId} onClick={event => event.currentTarget.control?.focus()}>{field.label}</label>
    <span className="relative block w-56 max-w-full">
      {field.kind === 'search' && <Search aria-hidden data-page-filter-search-icon className="pointer-events-none absolute left-2 top-2 size-4 text-text-secondary" />}
      <Input
        id={id}
        type={field.kind === 'search' ? 'search' : 'text'}
        aria-labelledby={labelId}
        data-testid={field.testId}
        placeholder={field.placeholder}
        value={field.value}
        onChange={event => field.onValueChange(event.target.value)}
        className={cn('h-8 w-full border-border-control bg-surface-card text-xs text-text-primary placeholder:text-text-secondary', field.kind === 'search' && 'pl-8')}
      />
    </span>
  </div>;
}

/** A visible, wrapping row for page-owned filters. Values, URL keys, and actions stay with the consumer. */
export function PageFilterBar({ label, fields, actions }: PageFilterBarProps) {
  const id = useId();

  return <fieldset data-testid="page-filter-bar" className="mb-3 rounded-md border border-border-subtle bg-surface-card p-3">
    <legend className="px-1 text-xs text-text-secondary">{label}</legend>
    <div className="flex flex-wrap items-end gap-3">
      {fields.map((field, index) => <PageFilterFieldControl key={field.key} field={field} id={`${id}-field-${index}`} />)}
      {actions != null && <div className="flex flex-wrap items-end gap-2">{actions}</div>}
    </div>
  </fieldset>;
}
