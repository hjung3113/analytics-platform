/**
 * Column filters of PlatformDataTable (#556b, ADR-0104, ADR-0105, 06 §15). Internal module: the filter state and the words for a
 * condition (`describeFilter`, `filterInfoRows`). The editor, chips and filter line are `filterEditor.tsx` / `filterLine.tsx`.
 * The table never filters rows itself — it only sends `ColumnFilter[]` to the server (`loadPage`, `exportRows`).
 */
import { useCallback, useState } from 'react';
import { formatInstant, type ColumnFilter, type ColumnFilterSpec } from '@ap/contracts';
import { FILTER_OP_LABELS } from './filterOps';
import { pruneUnmet, type ResolvedFilterField } from './filterFields';
import type { TableUrlState } from './PlatformDataTable';

type Lang = 'ko' | 'en';

/** Wall-clock `YYYY-MM-DD` ± days (UTC arithmetic on the calendar date only — never an instant, 06 §6.3). */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const WALL_CLOCK_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** An instant bound in the viewer's zone (06 §6.3); an unreadable value shows as given instead of failing the render. */
function instantText(value: string, lang: Lang): string {
  try { return formatInstant(value, lang); } catch { return value; }
}

/** The exclusive wire `to` of a date range as the inclusive day the user typed; anything that is not a plain day (an instant) is not calendar arithmetic. */
export const inclusiveDay = (to: string): string => (WALL_CLOCK_DAY.test(to) ? addDays(to, -1) : to);

/**
 * One filter per column. A change returns a controlled table to page 1 itself (the table owns this state, the page owns the URL keys).
 * A page that opts in with `urlState.filters` (ADR-0105) owns the filter state too: the table reads it and writes a change through
 * `urlState.onChange({ filters })` (page 1 in the same call); without it the table keeps its own state.
 */
export function useColumnFilters(urlState: TableUrlState | undefined, fields: readonly ResolvedFilterField[]) {
  const [own, setOwn] = useState<ColumnFilter[]>([]);
  const controlled = urlState?.filters;
  const filters = controlled ?? own;
  const resetPage = useCallback(() => {
    if (urlState && urlState.page !== null) urlState.onChange({ sorting: urlState.sorting, page: null }, 'reset');
  }, [urlState]);
  const write = useCallback((next: ColumnFilter[], reason: 'user' | 'reset') => {
    if (urlState && controlled) urlState.onChange({ sorting: urlState.sorting, page: null, filters: next }, reason);
  }, [urlState, controlled]);
  const apply = useCallback((id: string, next: ColumnFilter | null) => {
    // A condition whose `requires` field just lost its condition goes with it (the server would refuse it).
    const at = filters.findIndex(f => f.id === id);
    const kept = next === null ? filters.filter(f => f.id !== id) : at >= 0 ? filters.map((f, i) => (i === at ? next : f)) : [...filters, next];
    const list = pruneUnmet(kept, fields);
    if (controlled) { write(list, 'user'); return; }
    setOwn(list);
    resetPage();
  }, [filters, fields, controlled, write, resetPage]);
  const clear = useCallback(() => {
    if (controlled) { write([], 'reset'); return; }
    setOwn([]); resetPage();
  }, [controlled, write, resetPage]);
  return { filters, apply, clear };
}

/** Readable value of a filter as the user set it (a date range reads inclusive: the wire's exclusive `to` is shown as the day before). */
export function describeFilter(filter: ColumnFilter, spec: ColumnFilterSpec | undefined, lang: Lang): string {
  const ko = lang === 'ko';
  switch (filter.op) {
    case 'contains': return ko ? `포함 "${filter.value}"` : `contains "${filter.value}"`;
    case 'equals': return ko ? `같음 "${filter.value}"` : `equals "${filter.value}"`;
    case 'eq': return `= ${filter.value}`;
    case 'gte': return `≥ ${filter.value}`;
    case 'lte': return `≤ ${filter.value}`;
    // Operators beyond the first editor's two per kind (ADR-0105 vocabulary).
    case 'notContains': case 'startsWith': case 'endsWith': case 'notEquals': case 'neq': case 'gt': case 'lt': case 'before': case 'after':
      return `${FILTER_OP_LABELS[filter.op][lang]} ${String(filter.value)}`;
    case 'isEmpty': case 'isNotEmpty': return FILTER_OP_LABELS[filter.op][lang];
    case 'notIn': case 'in': {
      const labels = spec?.kind === 'enum' ? new Map(spec.options.map(o => [o.value, o.label])) : new Map<string, string>();
      const text = filter.value.map(v => labels.get(v) ?? v).join(', ');
      return filter.op === 'in' ? text : `${FILTER_OP_LABELS.notIn[lang]} ${text}`;
    }
    case 'between': {
      if (Array.isArray(filter.value)) return `${filter.value[0]} ~ ${filter.value[1]}`;
      if (spec?.kind === 'instant') return `${filter.value.from ? instantText(filter.value.from, lang) : ''} ~ ${filter.value.to ? instantText(filter.value.to, lang) : ''}`.trim();
      const from = filter.value.from ?? '';
      const to = filter.value.to ? inclusiveDay(filter.value.to) : '';
      return `${from} ~ ${to}`.trim();
    }
  }
}

/** A filterable field as the XLSX sheet names it: a column (`header`) or a non-column field (`label`). The label comes from exactly one of the two. */
export type FilterInfoField = { id: string; filter?: ColumnFilterSpec } & ({ header: string } | { label: string });

/** Rows for the XLSX 조회 정보 sheet: one `[필터 · <label>, value]` per active condition, column or not (the id when no field is known). */
export function filterInfoRows(filters: readonly ColumnFilter[], fields: readonly FilterInfoField[], lang: Lang): [string, string][] {
  return filters.map(f => {
    const field = fields.find(c => c.id === f.id);
    const label = field ? ('label' in field ? field.label : field.header) : f.id;
    return [`${lang === 'ko' ? '필터' : 'Filter'} · ${label}`, describeFilter(f, field?.filter, lang)];
  });
}
