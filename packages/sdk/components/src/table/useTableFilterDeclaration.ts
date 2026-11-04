import { useMemo } from 'react';
import type { ColumnFilterSpec, Text } from '@ap/contracts';
import type { PlatformColumn } from './PlatformDataTable';
import type { InstantEntry, TableFilterField } from './filterFields';
import type { FilterValueCheck, TableFilterOption } from './tableFilterUrl';

/** One URL/editor field. `column: false` puts it in `filterFields`; otherwise spread `filterColumnProps(id)` on its column. */
export type TableFilterDeclaration = {
  id: string;
  label: Text | string;
  /** Absent for a display-only column whose name should still appear in URL warnings. */
  spec?: ColumnFilterSpec;
  pinned?: boolean | number;
  entry?: InstantEntry;
  column?: boolean;
};
export type TableFilterColumnProps = Pick<PlatformColumn<unknown>, 'id' | 'header' | 'filterLabel' | 'filter' | 'filterPinned' | 'filterEntry'>;
type EnumOptions = Extract<ColumnFilterSpec, { kind: 'enum' }>['options'];

/** Memoize `fields` and `validate` on their inputs. Late enum options change only the column editor, never the URL wire rules. */
export function useTableFilterDeclaration(key: string, fields: readonly TableFilterDeclaration[], { lang, validate }: { lang: 'ko' | 'en'; validate?: FilterValueCheck }) {
  return useMemo(() => {
    const specs: Record<string, ColumnFilterSpec> = {};
    const labels: Record<string, string> = {};
    const columns = new Map<string, TableFilterColumnProps>();
    const filterFields: TableFilterField[] = [];
    const seen = new Set<string>();
    for (const field of fields) {
      if (seen.has(field.id) || field.id.includes(':')) throw new Error(`Table filter declaration: invalid or duplicate id "${field.id}"`);
      seen.add(field.id);
      const label = typeof field.label === 'string' ? field.label : field.label[lang];
      if (field.spec) Object.defineProperty(specs, field.id, { value: field.spec, enumerable: true });
      Object.defineProperty(labels, field.id, { value: label, enumerable: true });
      columns.set(field.id, {
        id: field.id, header: label,
        ...(field.spec ? { filterLabel: label, filter: field.spec } : {}),
        ...(field.pinned !== undefined ? { filterPinned: field.pinned } : {}),
        ...(field.entry ? { filterEntry: field.entry } : {}),
      });
      if (field.column === false && field.spec) filterFields.push({
        id: field.id, label: typeof field.label === 'string' ? { ko: field.label, en: field.label } : field.label, spec: field.spec,
        ...(field.pinned !== undefined ? { pinned: field.pinned } : {}),
        ...(field.entry ? { entry: field.entry } : {}),
      });
    }
    const urlFilters: TableFilterOption = { key, specs, labels, ...(validate ? { validate } : {}) };
    const filterColumnProps = (id: string, options?: EnumOptions): TableFilterColumnProps => {
      const props = columns.get(id);
      if (!props) throw new Error(`Table filter declaration: undeclared id "${id}"`);
      return options && props.filter?.kind === 'enum' ? { ...props, filter: { ...props.filter, options } } : props;
    };
    return { urlFilters, filterColumnProps, filterFields };
  }, [key, fields, lang, validate]);
}
