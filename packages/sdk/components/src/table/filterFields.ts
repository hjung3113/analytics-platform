import type { ColumnFilter, ColumnFilterSpec, Text } from '@ap/contracts';
import type { PlatformColumn } from './PlatformDataTable';

/**
 * A filterable field that is not a column (ADR-0105, 06 §15): the same wire spec as `PlatformColumn.filter`, plus the display
 * words. `id` is the server field and must be unique across columns and fields (no `:`). `pinned` shows its button on the filter line; a number is
 * its pinned position (1 first), `true` keeps declaration order after the numbered ones.
 */
export type TableFilterField = { id: string; label: Text; spec: ColumnFilterSpec; pinned?: boolean | number; entry?: InstantEntry };

/**
 * How the editor reads and shows an `instant` field's date-time inputs (display/entry only; the wire is the same ISO instant). Absent = unchanged:
 * the browser's zone, minute precision. `timeZone` is an IANA zone used to show AND parse the inputs; a local time that does not exist there
 * (DST gap) or exists twice (DST fold) is refused inline, never moved. `precision: 'second'` adds a seconds step to the inputs.
 */
export type InstantEntry = { timeZone?: string; precision?: 'minute' | 'second' };

/** One filterable field as the filter line and the editor see it, whether it came from a column or from `filterFields`. */
export type ResolvedFilterField = { id: string; label: string; spec: ColumnFilterSpec; pinned: boolean; /** Pinned position (lower first); `Infinity` for an unnumbered pin. */ pinRank: number; origin: 'column' | 'field'; entry?: InstantEntry };

const pinRankOf = (pinned: boolean | number | undefined): number => (typeof pinned === 'number' ? pinned : Number.POSITIVE_INFINITY);
/** The pinned fields in display order: numbered ones by position, then the rest in their given (column, then field) order. */
export const pinnedInRank = (fields: readonly ResolvedFilterField[]): ResolvedFilterField[] => fields.filter(f => f.pinned).sort((a, b) => (a.pinRank === b.pinRank ? 0 : a.pinRank < b.pinRank ? -1 : 1));

/** Columns with `filter` first (column order), then `filterFields`. A duplicate or `:`-containing id is a declaration bug and throws. */
export function resolveFilterFields<T>(columns: readonly PlatformColumn<T>[], fields: readonly TableFilterField[] | undefined, lang: 'ko' | 'en'): ResolvedFilterField[] {
  const out: ResolvedFilterField[] = [];
  const seen = new Set<string>();
  const add = (field: ResolvedFilterField) => {
    if (field.id.includes(':')) throw new Error(`PlatformDataTable: filter field id "${field.id}" must not contain ":"`);
    if (seen.has(field.id)) throw new Error(`PlatformDataTable: filter field id "${field.id}" is declared twice (columns and filterFields share one id space)`);
    seen.add(field.id);
    out.push(field);
  };
  // Every column id is taken, filterable or not: a field id may not shadow any column (the export and the wire share the id space).
  for (const c of columns) if (!c.filter) seen.add(c.id);
  for (const c of columns) if (c.filter) add({ id: c.id, label: c.filterLabel ?? c.header, spec: c.filter, pinned: c.filterPinned === true || typeof c.filterPinned === 'number', pinRank: pinRankOf(c.filterPinned), origin: 'column', ...(c.filterEntry ? { entry: c.filterEntry } : {}) });
  for (const f of fields ?? []) add({ id: f.id, label: f.label[lang], spec: f.spec, pinned: f.pinned === true || typeof f.pinned === 'number', pinRank: pinRankOf(f.pinned), origin: 'field', ...(f.entry ? { entry: f.entry } : {}) });
  return out;
}

/** Why a field cannot be added yet: the label of the first `requires` field that has no condition, or `null`. */
export function unmetRequirement(field: ResolvedFilterField, filters: readonly ColumnFilter[], all: readonly ResolvedFilterField[]): string | null {
  const missing = (field.spec.requires ?? []).find(id => !filters.some(f => f.id === id));
  return missing === undefined ? null : (all.find(f => f.id === missing)?.label ?? missing);
}

/** The conditions left after a change: any condition whose `requires` field lost its condition goes too (transitively). */
export function pruneUnmet(filters: ColumnFilter[], all: readonly ResolvedFilterField[]): ColumnFilter[] {
  let list = filters;
  for (;;) {
    const next = list.filter(f => (all.find(x => x.id === f.id)?.spec.requires ?? []).every(id => list.some(g => g.id === id)));
    if (next.length === list.length) return list;
    list = next;
  }
}
