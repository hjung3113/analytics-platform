/**
 * Cycle-time page codecs (06 §6.1 page keys) and row keys. Computation lives in the server half (`src/mock/cycle.ts`);
 * what both halves share (metric resolution, anchors, bins, bucket ends, the execution key) lives in `../endpoints`.
 */
import { bucketStart, parseDateTime, type PageSort } from '@ap/contracts';
import { BINS, bucketEnd, binIndex, isAnchor, type Granularity, type SlowExportFilter, type SlowFilter, type SlowRow, type TailMode } from '../endpoints';

export const SORT_COLUMNS = ['cycleMin', 'delta', 'anchor', 'equipmentId', 'room', 'recipe', 'lotId', 'quality'] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];
export const DEFAULT_SORT = 'cycleMin:desc';

export function cycleTailFilterLabel(lang: 'ko' | 'en') {
  return lang === 'ko' ? '느린 실행 기준' : 'Slow-execution predicate';
}

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

/** Quality badge text (#173 P3-7): one source for the cell badge and the export value, so the two cannot drift. */
export function qualityLabel(quality: SlowRow['quality'], ko: boolean): string {
  return quality === 'review' ? (ko ? '검토 표시' : 'Review flag') : (ko ? '미확정' : 'Unconfirmed');
}

/** Table-owned export params (#173): the page filters, the selection execution keys (`null` = every filtered row) and the table's active sort. */
export function exportParams(
  filter: SlowFilter,
  request: { scope: { kind: 'selected'; ids: string[] } | { kind: 'filtered' }; sorting: PageSort[] },
): SlowExportFilter {
  return { ...filter, ids: request.scope.kind === 'selected' ? request.scope.ids : null, sorting: request.sorting };
}

/** Readable page filters for the XLSX 조회 정보 sheet (#173 review P2-3), labeled as the screen labels them. */
export function exportFilterSummary({ tail, granularity, bucket, bin }: SlowFilter, ko: boolean): [string, string][] {
  const rows: [string, string][] = [];
  rows.push([ko ? '꼬리' : 'Tail', tail === 'p95' ? '≥ P95' : tail === 'p50' ? '≥ P50' : (ko ? '전체 실행' : 'All executions')]);
  rows.push([ko ? '집계' : 'Grain', granularity === 'hour' ? (ko ? '시간' : 'Hour') : granularity === 'day' ? (ko ? '일' : 'Day') : (ko ? '주' : 'Week')]);
  if (bucket !== null) rows.push([ko ? '버킷' : 'Bucket', `${bucket.replace('T', ' ')} → ${bucketEnd(bucket, granularity).replace('T', ' ')}`]);
  if (bin !== null) rows.push([ko ? '분포 구간' : 'Histogram', bin.from === bin.to ? bin.from : `${bin.from} – ${bin.to}`]);
  return rows;
}

/**
 * #173 D-9: the export reader only while the metric pair has a confirmed computation version. Without one the table
 * gets `exportRows={undefined}` — no export menu — instead of a header-only file.
 */
export function exportRowsWhenConfirmed<F>(cycleVersion: string | null, read: F): F | undefined {
  return cycleVersion === null ? undefined : read;
}
