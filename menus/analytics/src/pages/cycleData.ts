/**
 * Cycle-time page codecs (06 §6.1 page keys) and row keys. Computation lives in the server half (`src/mock/cycle.ts`);
 * what both halves share (metric resolution, anchors, bins, bucket ends, the execution key) lives in `../endpoints`.
 */
import { bucketStart, parseDateTime } from '@ap/contracts';
import { binIndex, isAnchor, type Granularity, type SlowExportFilter, type SlowFilter, type TailMode } from '../endpoints';

export const SORT_COLUMNS = ['cycleMin', 'delta', 'anchor', 'equipmentId', 'room', 'recipe', 'lotId', 'quality'] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];
export const DEFAULT_SORT = 'cycleMin:desc';

const ANCHOR = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

export function resolveGranularity(raw: string | null, hours: number | null): { ok: true; value: Granularity; explicit: boolean } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, value: hours !== null && hours <= 48 ? 'hour' : 'day', explicit: false };
  if (raw === 'hour' || raw === 'day' || raw === 'week') return { ok: true, value: raw, explicit: true };
  return { ok: false };
}

export function resolveTail(raw: string | null): { ok: true; value: TailMode; explicit: boolean } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, value: 'p95', explicit: false };
  if (raw === 'p50' || raw === 'p95' || raw === 'all') return { ok: true, value: raw, explicit: true };
  return { ok: false };
}

export function parseSortParam(raw: string | null): { ok: true; id: SortColumn; desc: boolean; explicit: boolean } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, id: 'cycleMin', desc: true, explicit: false };
  const match = /^([A-Za-z]+):(asc|desc)$/.exec(raw);
  if (!match || !SORT_COLUMNS.includes(match[1] as SortColumn)) return { ok: false };
  return { ok: true, id: match[1] as SortColumn, desc: match[2] === 'desc', explicit: true };
}

export function encodeSort(id: string, desc: boolean): string {
  return `${id}:${desc ? 'desc' : 'asc'}`;
}

/** §6.1 bucket: a naive datetime aligned to the grain boundary (bucketStart(bucket, grain) === bucket). No snapping; out-of-period but aligned stays valid. */
export function parseBucket(raw: string | null, granularity: Granularity): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, value: null };
  if (!ANCHOR.test(raw)) return { ok: false };
  try { parseDateTime(raw, 'bucket'); } catch { return { ok: false }; }
  return bucketStart(raw, granularity) === raw ? { ok: true, value: raw } : { ok: false };
}

/** §6.1 bin: one BINS id or `from..to` with index(from) ≤ index(to). */
export function parseBin(raw: string | null): { ok: true; value: { from: string; to: string } | null } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, value: null };
  const range = /^([A-Za-z0-9+-]+)\.\.([A-Za-z0-9+-]+)$/.exec(raw);
  if (!range) {
    if (binIndex(raw) < 0) return { ok: false };
    return { ok: true, value: { from: raw, to: raw } };
  }
  const from = binIndex(range[1]);
  const to = binIndex(range[2]);
  if (from < 0 || to < 0 || from > to) return { ok: false };
  return { ok: true, value: { from: range[1], to: range[2] } };
}

export function bucketContaining(instant: string, granularity: Granularity): string | null {
  if (!isAnchor(instant)) return null;
  return bucketStart(instant, granularity);
}

export { executionKey } from '../endpoints';

export function equipmentIdFromKey(key: string): string {
  const split = key.indexOf('|');
  return split === -1 ? key : key.slice(0, split);
}

/** Table-owned export params (#173): the page filters plus the selection execution keys (`null` = every filtered row). */
export function exportParams(filter: SlowFilter, scope: { kind: 'selected'; ids: string[] } | { kind: 'filtered' }): SlowExportFilter {
  return { ...filter, ids: scope.kind === 'selected' ? scope.ids : null };
}
