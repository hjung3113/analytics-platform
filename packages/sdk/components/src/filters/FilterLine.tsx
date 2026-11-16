import { useEffect, useMemo, useRef } from 'react';
import type { ColumnFilter, Text } from '@ap/contracts';
import { useI18n } from '@ap/kernel';
import { filterListLimit, proposeFilters } from '../table/columnFilters';
import { resolveFilterFields, type TableFilterField } from '../table/filterFields';
import { FilterLine as FilterLineView, useDroppedNote } from '../table/filterLine';
import type { FilterValueCheck } from '../table/tableFilterUrl';

/**
 * Props of the public filter line (06 §15, ADR-0105, #2334). Controlled: `filters` is the whole condition list and every gesture
 * (chip ×, an editor's 적용/지우기, `+ 필터`, 모두 지우기) calls `onChange` with the next whole list.
 */
export type FilterLineProps = {
  /** The filterable fields, the same declaration as `PlatformDataTable.filterFields` (ids unique, no `:`; a clash throws at render). */
  fields: readonly TableFilterField[];
  /** The current conditions (wire `ColumnFilter`s). */
  filters: readonly ColumnFilter[];
  /** The next whole list. A removal also drops conditions whose `requires` field lost its condition, and says so on the line. */
  onChange: (next: ColumnFilter[]) => void;
  /** The page's value check: the editor refuses a draft it rejects, inline (same as the table's `urlState.validate`). */
  validate?: FilterValueCheck;
  /** A visible scope marker before the conditions, e.g. 「이 패널만」. Absent = none. */
  scopeLabel?: Text;
  /** The group's accessible name. Absent = the shared 「필터」 word. */
  'aria-label'?: string;
};

/**
 * The table's filter line, without a table: pinned field buttons that become chips, other conditions as chips, `+ 필터`, 모두 지우기,
 * and the same editor and codec caps (20 conditions, 50 list items, 2400 encoded characters). It only edits the list: what the
 * conditions mean for the screen (narrowing an inherited menu filter, which rows or points they hide) is the consumer's.
 */
export function FilterLine({ fields, filters, onChange, validate, scopeLabel, 'aria-label': ariaLabel }: FilterLineProps) {
  const { lang } = useI18n();
  const resolved = useMemo(() => resolveFilterFields([], fields, lang, 'FilterLine'), [fields, lang]);
  // The list this line last proposed: the removal note belongs to it, so a list the consumer sets from elsewhere
  // (a restored view, a reset) clears a note that would no longer be true.
  const proposed = useRef<string | null>(null);
  const apply = (id: string, next: ColumnFilter | null) => {
    const list = proposeFilters(filters, id, next, resolved);
    proposed.current = JSON.stringify(list);
    onChange(list);
  };
  const dropped = useDroppedNote(resolved, filters, apply);
  const current = JSON.stringify(filters);
  const { reset } = dropped;
  useEffect(() => { if (proposed.current !== null && current !== proposed.current) { proposed.current = null; reset(); } }, [current, reset]);
  return <FilterLineView fields={resolved} filters={filters} lang={lang} dropped={dropped.dropped} onChange={dropped.change}
    onClear={() => { onChange([]); dropped.reset(); }} limit={(id, next) => filterListLimit(proposeFilters(filters, id, next, resolved))}
    check={validate} ariaLabel={ariaLabel} scope={scopeLabel?.[lang]} />;
}
