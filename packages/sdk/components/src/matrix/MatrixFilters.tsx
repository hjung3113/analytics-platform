import { useMemo } from 'react';
import { encodeFilterParams, type ColumnFilter, type ColumnFilterSpec, type Text } from '@ap/contracts';
import { useI18n, useMessages } from '@ap/kernel';
import { Button } from '@ap/ui';
import { filterListLimit, proposeFilters } from '../table/columnFilters';
import { resolveFilterFields } from '../table/filterFields';
import { FilterLine, useDroppedNote } from '../table/filterLine';
import { readTableFilters, type FilterValueCheck } from '../table/tableFilterUrl';
import { useTableFilterDeclaration } from '../table/useTableFilterDeclaration';
import { MATRIX_MESSAGES } from './messages';

export type MatrixFilterField = {
  id: string;
  label: string | Text;
  spec: Extract<ColumnFilterSpec, { kind: 'text' | 'number' | 'enum' }>;
  pinned?: boolean | number;
};
export type MatrixFiltersProps = {
  fields: readonly MatrixFilterField[];
  filters?: readonly ColumnFilter[];
  /** Consumer-declared repeated page key; the consumer writes encodeFilterParams(next) in onChange. */
  filterKey?: string;
  /** Raw repeated values from the consumer's page key. When supplied, takes precedence over filters. Never repaired. */
  filterValues?: readonly string[];
  onChange: (filters: ColumnFilter[]) => void;
  validate?: FilterValueCheck;
};
const EMPTY_FILTERS: readonly ColumnFilter[] = [];

/** Table filter chips, picker, FilterEditorContent and filterOps vocabulary, reused without a second editor or URL codec. */
export function MatrixFilters({ fields, filters = EMPTY_FILTERS, filterKey = 'filters', filterValues, onChange, validate }: MatrixFiltersProps) {
  const { lang } = useI18n();
  const m = useMessages(MATRIX_MESSAGES);
  const declarations = useMemo(() => fields.map(field => ({ ...field, column: false })), [fields]);
  const declaration = useTableFilterDeclaration(filterKey, declarations, { lang, validate });
  const resolved = useMemo(() => resolveFilterFields([], declaration.filterFields, lang, 'TreeMatrix'), [declaration.filterFields, lang]);
  const read = readTableFilters(declaration.urlFilters, filterValues ?? encodeFilterParams(filters), []);
  const active = read.ok ? read.filters : EMPTY_FILTERS;
  const apply = (id: string, next: ColumnFilter | null) => onChange(proposeFilters(active, id, next, resolved));
  const note = useDroppedNote(resolved, active, apply);
  if (!read.ok) return <div role="alert" className="flex items-center gap-2 text-sm text-text-danger-label break-keep">
    <span>{m('invalidFilters')}</span><Button type="button" variant="secondary" size="toolbar" onClick={() => onChange([])}>{m('clearAll')}</Button>
  </div>;
  return <FilterLine fields={resolved} filters={active} lang={lang} dropped={note.dropped} onChange={note.change}
    onClear={() => { note.reset(); onChange([]); }} limit={(id, next) => filterListLimit(proposeFilters(active, id, next, resolved))} check={validate} />;
}
