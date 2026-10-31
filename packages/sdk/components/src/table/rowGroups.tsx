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
 * A group "continues" when the page starts inside it: its result-wide count exceeds its rows on this page and the page is not the
 * first. For the group that is the only one on a middle page the server's rows could also continue on the next page, so a page
 * filled by a single bigger group is treated as continued (the previous page's last row is the only way to know exactly).
 */
export function buildGroupedItems<R extends { id: string }>(rows: readonly R[], groups: readonly PageGroup[] | undefined, keyOfRow: (row: R) => string, collapsed: ReadonlySet<string>, page: number): GroupedItem<R>[] | null {
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
  let firstGroup = true;
  for (const row of rows) {
    const key = keyOfRow(row);
    if (key !== current) {
      current = key;
      const group = meta.get(key)!;
      const rowsOnPage = counts.get(key)!;
      items.push({ kind: 'group', key: `group:${key}`, group, rowsOnPage, collapsed: collapsed.has(key), continued: firstGroup && page > 0 && group.count > rowsOnPage });
      firstGroup = false;
    }
    if (!collapsed.has(key)) items.push({ kind: 'row', key: row.id, row });
  }
  return items;
}

/** Toolbar 「그룹」 select: only built when a groupable column exists (the table decides); 「그룹 없음」 is the default. */
export function GroupSelect({ lang, value, options, onChange }: { lang: Lang; value: string; options: { id: string; header: string }[]; onChange: (id: string) => void }) {
  const label = lang === 'ko' ? '그룹' : 'Group by';
  return <label className="flex items-center gap-1.5 text-xs text-text-secondary">
    <span>{label}</span>
    <select aria-label={label} data-row-group-select className="h-8 rounded-md border border-border-control bg-surface-card px-2 text-xs text-text-primary" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{lang === 'ko' ? '그룹 없음' : 'No grouping'}</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.header}</option>)}
    </select>
  </label>;
}

export const groupCountText = (count: number, lang: Lang) => lang === 'ko' ? `${count.toLocaleString()}행 (전체 결과)` : `${count.toLocaleString()} rows (whole result)`;
export const groupToggleName = (label: string, collapsed: boolean, lang: Lang) =>
  lang === 'ko' ? `${label} 그룹 ${collapsed ? '펼치기' : '접기'}` : `${collapsed ? 'Expand' : 'Collapse'} group ${label}`;

type HeaderProps = {
  lang: Lang;
  item: Extract<GroupedItem<unknown>, { kind: 'group' }>;
  /** Sticky leading cell spanning the select/pinned/leading columns (its width and `aria-colspan`). */
  lead: { style: CSSProperties; span: number };
  /** The cells after the leading one: subtotal cells under their columns, empty cells elsewhere. */
  trailing: { id: string; style: CSSProperties; subtotal: boolean; className?: string }[];
  onToggle: () => void;
  cellClassName: string;
};

/** A group header row's content: collapse button, label, result-wide count and subtotal cells (labelled as whole-result). */
export function GroupHeaderCells({ lang, item, lead, trailing, onToggle, cellClassName }: HeaderProps): ReactNode {
  const { group, collapsed, continued, rowsOnPage } = item;
  const label = group.label === '' ? EMPTY_GROUP_LABEL : group.label;
  const ko = lang === 'ko';
  return <>
    {/* eslint-disable-next-line shadcn/no-inline-styles -- width and sticky offset come from column sizing at runtime */}
    <div role="rowheader" aria-colspan={lead.span} style={lead.style} className={cn(cellClassName, 'sticky left-0 z-[2] gap-2 font-medium')}>
      <button type="button" aria-expanded={!collapsed} aria-label={groupToggleName(label, collapsed, lang)} onClick={onToggle}
        className="-ml-1 inline-flex size-6 shrink-0 items-center justify-center rounded-xs hover:bg-surface-row-hover">
        {collapsed ? <ChevronRight className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
      </button>
      <span className="min-w-0 truncate" title={label}>{label}</span>
      {continued && <span className="shrink-0 text-xs font-normal text-text-muted">{ko ? '(이어서)' : '(continued)'}</span>}
      <span className="shrink-0 text-xs font-normal text-text-secondary tabular" data-group-count>{groupCountText(group.count, lang)}</span>
      {collapsed && <span className="shrink-0 text-xs font-normal text-text-muted tabular">{ko ? `이 쪽 ${rowsOnPage.toLocaleString()}행 숨김` : `${rowsOnPage.toLocaleString()} rows on this page hidden`}</span>}
    </div>
    {trailing.map(cell => {
      const value = cell.subtotal ? group.subtotals?.[cell.id] : undefined;
      return <div role="cell" key={cell.id} data-column={cell.id} data-group-subtotal={cell.subtotal ? '' : undefined} style={cell.style}
        title={cell.subtotal ? (ko ? '전체 결과 기준 합계' : 'Whole-result total') : undefined}
        className={cn(cellClassName, 'justify-end text-right tabular', cell.className)}>
        {cell.subtotal && value !== undefined && <>
          <span className="sr-only">{ko ? '전체 결과 합계 ' : 'Whole-result total '}</span>
          <span className="mr-1 text-xs font-normal text-text-muted" aria-hidden>{ko ? '합계' : 'Total'}</span>
          {value === null ? '—' : value.toLocaleString()}
        </>}
      </div>;
    })}
  </>;
}
