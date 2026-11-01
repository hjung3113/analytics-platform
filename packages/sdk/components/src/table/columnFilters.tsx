/**
 * Column filters of PlatformDataTable (#556b, ADR-0104, 06 §15). Internal module: state, the header filter popover and the
 * active-filter chips. The table never filters rows itself — it only sends `ColumnFilter[]` to the server (`loadPage`,
 * `exportRows`); a table without `PlatformColumn.filter` renders none of this.
 */
import { useCallback, useId, useState } from 'react';
import { ListFilter, X } from 'lucide-react';
import { formatInstant, type ColumnFilter, type ColumnFilterSpec } from '@ap/contracts';
import { Button, Checkbox, cn, Input, Label, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { FILTER_OP_LABELS } from './filterOps';
import type { TableUrlState } from './PlatformDataTable';

type Lang = 'ko' | 'en';
type Named = { id: string; header: string };

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
const inclusiveDay = (to: string): string => (WALL_CLOCK_DAY.test(to) ? addDays(to, -1) : to);

/**
 * One filter per column. A change returns a controlled table to page 1 itself (the table owns this state, the page owns the URL keys).
 * A page that opts in with `urlState.filters` (ADR-0105) owns the filter state too: the table reads it and writes a change through
 * `urlState.onChange({ filters })` (page 1 in the same call); without it the table keeps its own state.
 */
export function useColumnFilters(urlState: TableUrlState | undefined) {
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
    const list = [...filters.filter(f => f.id !== id), ...(next ? [next] : [])];
    if (controlled) { write(list, 'user'); return; }
    setOwn(list);
    resetPage();
  }, [filters, controlled, write, resetPage]);
  const clear = useCallback(() => {
    if (controlled) { write([], 'reset'); return; }
    setOwn([]); resetPage();
  }, [controlled, write, resetPage]);
  return { filters, apply, clear };
}

const OPS: Record<'text' | 'number', { op: string; ko: string; en: string }[]> = {
  text: [{ op: 'contains', ko: '포함', en: 'contains' }, { op: 'equals', ko: '같음', en: 'equals' }],
  number: [{ op: 'eq', ko: '같음 (=)', en: 'equals (=)' }, { op: 'gte', ko: '이상 (≥)', en: 'at least (≥)' }, { op: 'lte', ko: '이하 (≤)', en: 'at most (≤)' }, { op: 'between', ko: '범위 (이상~이하)', en: 'between (inclusive)' }],
};

/** Readable value of a filter as the user set it (a date range reads inclusive: the wire's exclusive `to` is shown as the day before). */
export function describeFilter(filter: ColumnFilter, spec: ColumnFilterSpec | undefined, lang: Lang): string {
  const ko = lang === 'ko';
  switch (filter.op) {
    case 'contains': return ko ? `포함 "${filter.value}"` : `contains "${filter.value}"`;
    case 'equals': return ko ? `같음 "${filter.value}"` : `equals "${filter.value}"`;
    case 'eq': return `= ${filter.value}`;
    case 'gte': return `≥ ${filter.value}`;
    case 'lte': return `≤ ${filter.value}`;
    // Operators the current UI never produces (ADR-0105 vocabulary); readable fallback until the filter editor node.
    case 'notContains': case 'startsWith': case 'endsWith': case 'notEquals': case 'neq': case 'gt': case 'lt': case 'before': case 'after':
      return `${FILTER_OP_LABELS[filter.op][lang]} ${String(filter.value)}`;
    case 'isEmpty': case 'isNotEmpty': return FILTER_OP_LABELS[filter.op][lang];
    case 'notIn': return `${FILTER_OP_LABELS.notIn[lang]} ${filter.value.join(', ')}`;
    case 'in': {
      const labels = spec?.kind === 'enum' ? new Map(spec.options.map(o => [o.value, o.label])) : new Map<string, string>();
      return filter.value.map(v => labels.get(v) ?? v).join(', ');
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

type Draft = { op: string; a: string; b: string; picked: string[] };
function initialDraft(spec: ColumnFilterSpec, active: ColumnFilter | undefined): Draft {
  const empty: Draft = { op: spec.kind === 'number' ? 'eq' : 'contains', a: '', b: '', picked: [] };
  if (!active) return empty;
  if (active.op === 'in') return { ...empty, op: 'in', picked: active.value };
  if (active.op === 'between') {
    if (Array.isArray(active.value)) return { ...empty, op: 'between', a: String(active.value[0]), b: String(active.value[1]) };
    return { ...empty, op: 'between', a: active.value.from ?? '', b: active.value.to ? inclusiveDay(active.value.to) : '' };
  }
  // Operators without a single scalar value are never produced by this UI; open them as an empty draft.
  if (!('value' in active) || Array.isArray(active.value) || typeof active.value === 'object') return empty;
  return { ...empty, op: active.op, a: String(active.value) };
}

/** The filter a draft means, or `null` when it is empty/incomplete (Apply is disabled; for an enum an empty pick clears). */
function toFilter(id: string, spec: ColumnFilterSpec, d: Draft): ColumnFilter | null {
  switch (spec.kind) {
    case 'text': { const v = d.a.trim(); return v ? { id, op: d.op as 'contains' | 'equals', value: v } : null; }
    case 'number': {
      const a = d.a.trim() === '' ? NaN : Number(d.a); const b = d.b.trim() === '' ? NaN : Number(d.b);
      if (d.op === 'between') return Number.isFinite(a) && Number.isFinite(b) ? { id, op: 'between', value: [Math.min(a, b), Math.max(a, b)] } : null;
      return Number.isFinite(a) ? { id, op: d.op as 'eq' | 'gte' | 'lte', value: a } : null;
    }
    case 'date': {
      if (!d.a && !d.b) return null;
      return { id, op: 'between', value: { ...(d.a ? { from: d.a } : {}), ...(d.b ? { to: addDays(d.b, 1) } : {}) } };
    }
    case 'enum': return d.picked.length > 0 ? { id, op: 'in', value: d.picked } : null;
    case 'instant': return null; // no editor for instant ranges yet (ADR-0105)
  }
}

const selectClass = 'h-8 w-full rounded-md border border-border-control bg-surface-card px-2 text-xs';

/** Header filter button + popover (operator and typed value; 적용 / 지우기). */
export function ColumnFilterButton({ column, spec, active, lang, onApply }: {
  column: Named; spec: ColumnFilterSpec; active: ColumnFilter | undefined; lang: Lang; onApply: (next: ColumnFilter | null) => void;
}) {
  const ko = lang === 'ko';
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(spec, active));
  const filter = toFilter(column.id, spec, draft);
  const patch = (next: Partial<Draft>) => setDraft(d => ({ ...d, ...next }));
  const inputId = `colfilter-${column.id}`;
  const titleId = useId();
  const label = ko ? `${column.header} 필터` : `Filter ${column.header}`;
  return <Popover open={open} onOpenChange={next => { if (next) setDraft(initialDraft(spec, active)); setOpen(next); }}>
    <PopoverTrigger asChild>
      <button type="button" aria-label={label} data-column-filter={column.id} data-active={active ? '' : undefined}
        className={cn('ml-1 inline-flex shrink-0 items-center rounded-xs p-0.5 hover:text-text-primary', active ? 'text-accent-primary' : 'opacity-60')}>
        <ListFilter className="size-3" aria-hidden />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-64" aria-labelledby={titleId}>
      <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (!filter) return; onApply(filter); setOpen(false); }}>
        <p id={titleId} className="t-card-title">{label}</p>
        {(spec.kind === 'text' || spec.kind === 'number') && <select aria-label={ko ? '연산자' : 'Operator'} className={selectClass} value={draft.op} onChange={e => patch({ op: e.target.value })}>
          {OPS[spec.kind].map(o => <option key={o.op} value={o.op}>{o[lang]}</option>)}
        </select>}
        {spec.kind === 'text' && <Input id={inputId} aria-label={ko ? '값' : 'Value'} value={draft.a} onChange={e => patch({ a: e.target.value })} />}
        {spec.kind === 'number' && <div className="flex items-center gap-1">
          <Input id={inputId} type="number" aria-label={draft.op === 'between' ? (ko ? '최솟값' : 'Minimum') : (ko ? '값' : 'Value')} value={draft.a} onChange={e => patch({ a: e.target.value })} />
          {draft.op === 'between' && <><span aria-hidden>~</span><Input type="number" aria-label={ko ? '최댓값' : 'Maximum'} value={draft.b} onChange={e => patch({ b: e.target.value })} /></>}
        </div>}
        {spec.kind === 'date' && <div className="space-y-1">
          <Label htmlFor={inputId}>{ko ? '~부터' : 'From'}</Label>
          <Input id={inputId} type="date" value={draft.a} onChange={e => patch({ a: e.target.value })} />
          <Label htmlFor={`${inputId}-to`}>{ko ? '~까지 (포함)' : 'To (inclusive)'}</Label>
          <Input id={`${inputId}-to`} type="date" value={draft.b} onChange={e => patch({ b: e.target.value })} />
        </div>}
        {spec.kind === 'enum' && <ul className="space-y-1">{spec.options.map(o => <li key={o.value} className="flex items-center gap-2">
          <Checkbox id={`${inputId}-${o.value}`} className="size-3.5 border-border-control" checked={draft.picked.includes(o.value)}
            onCheckedChange={v => patch({ picked: v === true ? [...draft.picked, o.value] : draft.picked.filter(x => x !== o.value) })} />
          <Label htmlFor={`${inputId}-${o.value}`}>{o.label}</Label>
        </li>)}</ul>}
        <div className="flex items-center gap-2">
          <Button type="submit" size="toolbar" disabled={!filter}>{ko ? '적용' : 'Apply'}</Button>
          <Button type="button" variant="secondary" size="toolbar" onClick={() => { onApply(null); setOpen(false); }}>{ko ? '지우기' : 'Clear'}</Button>
        </div>
      </form>
    </PopoverContent>
  </Popover>;
}

/** Active column filters above the table: one removable chip each, and 「필터 모두 해제」. Renders nothing without filters. */
export function ColumnFilterChips({ filters, columns, lang, onRemove, onClear }: {
  filters: readonly ColumnFilter[]; columns: readonly (Named & { filter?: ColumnFilterSpec })[]; lang: Lang; onRemove: (id: string) => void; onClear: () => void;
}) {
  if (filters.length === 0) return null;
  const ko = lang === 'ko';
  return <div role="group" aria-label={ko ? '적용된 열 필터' : 'Applied column filters'} data-column-filter-chips className="flex flex-wrap items-center gap-2 border-t border-border-subtle px-3 py-2 text-xs">
    {filters.map(f => {
      const column = columns.find(c => c.id === f.id);
      const name = column?.header ?? f.id;
      return <span key={f.id} data-column-filter-chip={f.id} className="inline-flex items-center gap-1 rounded-md border border-border-control bg-surface-sunken py-0.5 pl-2 pr-0.5">
        <span><span className="text-text-secondary">{name}</span> {describeFilter(f, column?.filter, lang)}</span>
        <button type="button" aria-label={ko ? `${name} 필터 해제` : `Remove ${name} filter`} className="inline-flex rounded-xs p-0.5 hover:text-text-primary" onClick={() => onRemove(f.id)}><X className="size-3" aria-hidden /></button>
      </span>;
    })}
    <Button type="button" variant="ghost" size="toolbar" onClick={onClear}>{ko ? '필터 모두 해제' : 'Clear all filters'}</Button>
  </div>;
}
