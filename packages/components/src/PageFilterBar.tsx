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
  orientation?: 'row' | 'column';
};

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
export function PageFilterBar({ label, fields, actions, orientation = 'row' }: PageFilterBarProps) {
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
