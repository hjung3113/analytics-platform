import type { ReactNode } from 'react';
import { formatText, useMessages, type Lang } from '@ap/kernel';
import { Button, cn, Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@ap/ui';
import { COMPONENTS_MESSAGES } from '../messages';

/** Rows per page of the canvas charts' table view: the table is a text alternative, not a data grid. */
export const INTERVAL_TABLE_PAGE_SIZE = 20;

/** `nowrap` keeps a time or length on one line; the table scrolls sideways in a narrow panel instead. */
export type IntervalTableColumn = { label: string; numeric?: boolean; nowrap?: boolean };
export type IntervalTableRow = { key: string; cells: ReactNode[]; selected?: boolean };

/**
 * The `표로 보기` table of `LaneTimeline` and `OrderedIntervalTrack` (#2792): one row per interval, paged by
 * `INTERVAL_TABLE_PAGE_SIZE`. `rows(from, to)` builds only the shown page, so a large lane model stays lazy.
 */
export function IntervalTable({ title, columns, count, rows, page, onPage, caption, describedBy }: {
  title: ReactNode;
  columns: IntervalTableColumn[];
  count: number;
  rows: (from: number, to: number) => IntervalTableRow[];
  page: number;
  onPage: (page: number) => void;
  caption?: ReactNode;
  describedBy?: string;
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const pages = Math.max(1, Math.ceil(count / INTERVAL_TABLE_PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const from = current * INTERVAL_TABLE_PAGE_SIZE;
  return <>
    <p className="px-4 py-2 t-caption">{title} · {current + 1}/{pages}</p>
    <div className="mx-4 mb-2 overflow-x-auto rounded-md border border-border-subtle tabular">
      <Table density="compact" aria-describedby={describedBy}>
        {caption && <TableCaption className="text-left">{caption}</TableCaption>}
        <TableHeader><TableRow>
          {columns.map(column => <TableHead key={column.label} scope="col" align={column.numeric ? 'end' : undefined}>{column.label}</TableHead>)}
        </TableRow></TableHeader>
        <TableBody>{rows(from, Math.min(count, from + INTERVAL_TABLE_PAGE_SIZE)).map(row => <TableRow key={row.key} aria-selected={row.selected} current={row.selected}>
          {row.cells.map((cell, index) => <TableCell key={index} align={columns[index]?.numeric ? 'end' : undefined} className={cn(columns[index]?.nowrap && 'whitespace-nowrap')}>{cell}</TableCell>)}
        </TableRow>)}</TableBody>
      </Table>
    </div>
    <div className="px-4 pb-2">
      <Button type="button" size="toolbar" variant="ghost" disabled={current === 0} onClick={() => onPage(current - 1)}>{m('intervalPreviousPage')}</Button>
      <Button type="button" size="toolbar" variant="ghost" disabled={current === pages - 1} onClick={() => onPage(current + 1)}>{m('intervalNextPage')}</Button>
    </div>
  </>;
}

const DURATION_UNITS = [
  [86_400_000, COMPONENTS_MESSAGES.durationDays],
  [3_600_000, COMPONENTS_MESSAGES.durationHours],
  [60_000, COMPONENTS_MESSAGES.durationMinutes],
  [1_000, COMPONENTS_MESSAGES.durationSeconds],
] as const;

/** A wall-clock length in its whole units, largest first (`1시간 5분`, `1h 5m`); under a second it reads in ms, a positive length under 1ms as `<1ms`. */
export function formatDurationMs(ms: number, lang: Lang): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1_000) return formatText(COMPONENTS_MESSAGES.durationMilliseconds, lang, { n: ms > 0 && ms < 1 ? '<1' : Math.round(ms) });
  let rest = Math.floor(ms / 1_000) * 1_000;
  const parts: string[] = [];
  for (const [size, text] of DURATION_UNITS) {
    const n = Math.floor(rest / size);
    rest -= n * size;
    if (n > 0) parts.push(formatText(text, lang, { n }));
  }
  return parts.join(' ');
}
