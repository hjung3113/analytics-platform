import { ChevronDown, ChevronRight } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { EMPTY_GROUP_LABEL, type PageGroup } from '@ap/contracts';
import { cn } from '@ap/ui';

type Lang = 'ko' | 'en';

/** One virtual item of a grouped table: a group header row (key `group:<key>`) or a data row (key = row id). */
export type GroupedItem<R> =
  | { kind: 'row'; key: string; row: R }
  | { kind: 'group'; key: string; group: PageGroup; continued: boolean; collapsed: boolean; rowsOnPage: number };

const isMissing = (v: unknown) => v === null || v === undefined || v === '';
export const groupKeyOf = (value: unknown) => (isMissing(value) ? '' : String(value));

/**
 * Interleaves group header rows into the page's rows (#556d, ADR-0104). The server orders rows by group; this only walks them and
 * reads the result-wide numbers from `groups` — it never groups or sums client-side. Returns null (render flat, as today) when the
 * response has no `groups` or a row's group is missing from it.
 *
 * A group is "continued" only when the server says so (`PageGroup.continued`): only the server knows whether a row of the group sits
 * before this page's slice, so the table never guesses it from counts.
 */
export function buildGroupedItems<R extends { id: string }>(rows: readonly R[], groups: readonly PageGroup[] | undefined, keyOfRow: (row: R) => string, collapsed: ReadonlySet<string>): GroupedItem<R>[] | null {
  if (!groups || groups.length === 0 || rows.length === 0) return null;
  const meta = new Map(groups.map(g => [g.key, g]));
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = keyOfRow(row);
    if (!meta.has(key)) return null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const items: GroupedItem<R>[] = [];
  let current: string | null = null;
  for (const row of rows) {
    const key = keyOfRow(row);
    if (key !== current) {
      current = key;
      const group = meta.get(key)!;
      const rowsOnPage = counts.get(key)!;
      items.push({ kind: 'group', key: `group:${key}`, group, rowsOnPage, collapsed: collapsed.has(key), continued: group.continued === true });
    }
    if (!collapsed.has(key)) items.push({ kind: 'row', key: row.id, row });
  }
  return items;
}

/**
 * Splits the DISPLAYED column order (left-pinned, centre, right-pinned — the order of header and row cells) for a group header row.
 * The leading label cell covers every column before the first subtotal column, so no subtotal column is swallowed by it; right-pinned
 * columns stay separate cells. When the first displayed column is itself a subtotal column there is nothing before it: that column
 * becomes the leading cell and carries its own total beside the label (`leadSubtotal`).
 */
export function groupHeaderLayout<C extends { id: string }>(displayed: readonly C[], isRightPinned: (c: C) => boolean, subtotalIds: ReadonlySet<string>): { leading: C[]; trailing: C[]; leadSubtotal: C | null } {
  const firstSubtotal = displayed.findIndex(c => subtotalIds.has(c.id));
  const end = firstSubtotal >= 0 ? firstSubtotal : displayed.filter(c => !isRightPinned(c)).length;
  if (end === 0 && displayed.length > 0) return { leading: [displayed[0]], trailing: displayed.slice(1), leadSubtotal: subtotalIds.has(displayed[0].id) ? displayed[0] : null };
  return { leading: displayed.slice(0, end), trailing: displayed.slice(end), leadSubtotal: null };
}

export const groupCountText = (count: number, lang: Lang) => lang === 'ko' ? `${count.toLocaleString()}행 (전체 결과)` : `${count.toLocaleString()} rows (whole result)`;
export const groupToggleName = (label: string, collapsed: boolean, lang: Lang) =>
  lang === 'ko' ? `${label} 그룹 ${collapsed ? '펼치기' : '접기'}` : `${collapsed ? 'Expand' : 'Collapse'} group ${label}`;

type HeaderProps = {
  lang: Lang;
  item: Extract<GroupedItem<unknown>, { kind: 'group' }>;
  /**
   * The leading band spans the select/pinned/leading columns (its width and `aria-colspan`). `stickyLeft` is the width of the left-pinned
   * region the row cells use (selection column included): the label content is a row-level sticky anchor at that offset, so it stays at
   * the visible left edge for the whole horizontal scroll instead of leaving with the band.
   */
  lead: { style: CSSProperties; span: number; stickyLeft: number; /** Set when the leading cell is itself a subtotal column: its total follows the label. */ subtotal?: { id: string } };
  /** The cells after the leading one: subtotal cells under their columns, empty cells elsewhere. */
  trailing: { id: string; style: CSSProperties; subtotal: boolean; className?: string }[];
  /** Typography of the sticky label (the size step's font); default 보통. */
  labelClassName?: string;
  onToggle: () => void;
  cellClassName: string;
};

/** A group header row's content: collapse button, label, result-wide count and subtotal cells (labelled as whole-result). */
export function GroupHeaderCells({ lang, item, lead, trailing, onToggle, cellClassName, labelClassName = 'text-sm' }: HeaderProps): ReactNode {
  const { group, collapsed, continued, rowsOnPage } = item;
  const ko = lang === 'ko';
  const total = (id: string) => {
    const value = group.subtotals?.[id];
    return value === undefined ? null : <>
      <span className="sr-only">{ko ? '전체 결과 합계 ' : 'Whole-result total '}</span>
      <span className="mr-1 text-xs font-normal text-text-muted" aria-hidden>{ko ? '합계' : 'Total'}</span>
      {value === null ? '—' : value.toLocaleString()}
    </>;
  };
  const label = group.label === '' ? EMPTY_GROUP_LABEL : group.label;
  return <>
    {/* Row-level zero-width sticky anchor (like the active-row marker): its containing block is the whole row, so the content keeps the visible left edge across the full scroll. The content paints from x=0 (opaque, covering the pinned region) and its text starts at the pinned width. */}
    {/* eslint-disable-next-line shadcn/no-inline-styles -- the sticky offset is the left-pinned width at runtime */}
    <div role="rowheader" data-group-lead style={{ position: 'sticky', left: lead.stickyLeft, zIndex: 3, width: 0, flexShrink: 0 }}>
      {/* eslint-disable-next-line shadcn/no-inline-styles -- the content extends back over the pinned region by its runtime width */}
      <div data-group-lead-content style={{ left: -lead.stickyLeft, paddingLeft: lead.stickyLeft }} className={cn('absolute top-0 flex h-full max-w-[min(48rem,100vw)] items-center gap-2 whitespace-nowrap bg-surface-sunken px-4 font-medium', labelClassName)}>
        <button type="button" aria-expanded={!collapsed} aria-label={groupToggleName(label, collapsed, lang)} onClick={onToggle}
          className="-ml-1 inline-flex size-6 shrink-0 items-center justify-center rounded-xs hover:bg-surface-row-hover">
          {collapsed ? <ChevronRight className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
        </button>
        <span className="min-w-0 truncate" title={label}>{label}</span>
        {continued && <span className="shrink-0 text-xs font-normal text-text-muted">{ko ? '(이어서)' : '(continued)'}</span>}
        <span className="shrink-0 text-xs font-normal text-text-secondary tabular" data-group-count>{groupCountText(group.count, lang)}</span>
        {collapsed && <span className="shrink-0 text-xs font-normal text-text-muted tabular">{ko ? `이 쪽 ${rowsOnPage.toLocaleString()}행 숨김` : `${rowsOnPage.toLocaleString()} rows on this page hidden`}</span>}
      </div>
    </div>
    {/* eslint-disable-next-line shadcn/no-inline-styles -- band width comes from column sizing at runtime */}
    <div role="cell" aria-colspan={lead.span} data-column={lead.subtotal?.id} data-group-subtotal={lead.subtotal ? '' : undefined} style={lead.style} className={cn(cellClassName, 'gap-2 font-medium')}>
      {lead.subtotal && <span className="ml-auto shrink-0 text-right tabular" title={ko ? '전체 결과 기준 합계' : 'Whole-result total'}>{total(lead.subtotal.id)}</span>}
    </div>
    {trailing.map(cell => {
      return <div role="cell" key={cell.id} data-column={cell.id} data-group-subtotal={cell.subtotal ? '' : undefined} style={cell.style}
        title={cell.subtotal ? (ko ? '전체 결과 기준 합계' : 'Whole-result total') : undefined}
        className={cn(cellClassName, 'justify-end text-right tabular', cell.className)}>
        {cell.subtotal && total(cell.id)}
      </div>;
    })}
  </>;
}
