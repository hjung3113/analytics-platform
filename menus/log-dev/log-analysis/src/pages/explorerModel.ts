import type { OrderedTrackItem, OrderedTrackMarker } from '@ap/components';
import type { EvidenceRef, InvestigationFilters, PeriodRow, SampleSet, SourceQuery } from '../endpoints';
export const sourceReadable = (state: string | undefined) => state === 'ok' || state === 'partial' || state === 'truncated';
export function queryFrom(filters: InvestigationFilters): SourceQuery {
  const query: SourceQuery = {};
  for (const k of ['text', 'logType', 'module', 'event'] as const) if (typeof filters[k] === 'string' && filters[k]) query[k] = filters[k] as string;
  if (typeof filters.contextKey === 'string' && filters.contextKey && typeof filters.contextValue === 'string' && filters.contextValue) query.context = { [filters.contextKey]: filters.contextValue };
  return query;
}
export function selectionOf(value: string | null, set: SampleSet) {
  if (!value || !/^[1-9]\d*:[1-9]\d*$/.test(value)) return null;
  const [order, line] = value.split(':').map(Number);
  const file = set.files.find(f => f.order === order);
  return file && Number.isSafeInteger(line) ? { fileRef: file.fileRef, fileOrder: order, line } : null;
}
export function evidenceFor(set: SampleSet, row: { fileRef: string; line: number }): EvidenceRef | null {
  const file = set.files.find(f => f.fileRef === row.fileRef);
  return file ? { fileRef: file.fileRef, line: row.line, fileSha256: file.sha256 } : null;
}
export function periodSelectionOf(set: SampleSet, rows: PeriodRow[], focus: string | null): string | null {
  const selection = selectionOf(focus, set);
  if (!selection) return null;
  const period = rows.find(row => row.fileRef === selection.fileRef && row.startLine <= selection.line && (row.endLine === null || selection.line <= row.endLine));
  return period ? `${selection.fileOrder}:${period.startLine}` : null;
}
export function sequenceData(set: SampleSet, rows: PeriodRow[]) {
  const ordered = [...set.files].sort((a, b) => a.order - b.order);
  let offset = 0;
  const segments = ordered.map(file => { const start = offset; const extent = Math.max(1, ...rows.filter(r => r.fileRef === file.fileRef).map(r => r.endLine ?? r.startLine)); offset += extent + 1; return { file, offset: start, extent }; });
  const items: OrderedTrackItem[] = rows.flatMap(row => { const file = set.files.find(f => f.fileRef === row.fileRef); return file ? [{ id: `${file.order}:${row.startLine}`, laneKey: row.fileRef, orderStart: segments.find(s => s.file.order === file.order)!.offset + row.startLine, ...(row.endLine === null ? {} : { orderEnd: segments.find(s => s.file.order === file.order)!.offset + row.endLine }), state: row.incomplete ? 'incomplete' : 'period', label: `${row.fileRef}:${row.startLine} · ${row.state}`, carryover: row.incomplete }] : []; }).sort((a, b) => a.orderStart - b.orderStart);
  const markers: OrderedTrackMarker[] = segments.slice(1).map(segment => ({ order: segment.offset + 1, kind: 'boundary', label: '파일 경계' }));
  const formatTick = (value: number) => { const segment = [...segments].reverse().find(s => value > s.offset) ?? segments[0]; return segment ? `${segment.file.order}:${Math.max(1, Math.round(value - segment.offset))}` : String(value); };
  return { formatTick, items, lanes: ordered.map(f => ({ laneKey: f.fileRef, label: f.fileRef })), markers, domain: [1, Math.max(2, ...items.map(i => i.orderEnd ?? i.orderStart))] as [number, number] };
}
export const exportRange = (rows: number) => Number.isSafeInteger(rows) && rows >= 1 && rows <= 10000 ? { rows } : null;
