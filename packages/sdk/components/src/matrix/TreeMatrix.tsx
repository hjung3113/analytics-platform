import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { MatrixCell, MatrixColumn, MatrixEmphasisRule, MatrixNode, MatrixWindow } from '@ap/contracts';
import { useMessages } from '@ap/kernel';
import { Button, cn, useHorizontalOverflow, useImeEnterGuard } from '@ap/ui';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useRegisterPageBound } from '../pageFlow';
import { BASE_ROW_HEIGHT, TABLE_SIZE_STEPS, useTableSize } from '../table/tableSize';
import { FADE_BASE } from '../table/useColumnGroupLayout';
import { MatrixRowMenu } from './MatrixRowMenu';
import type { MatrixValueOf } from './emphasis';
import { MATRIX_MESSAGES } from './messages';
import { MATRIX_TONE_CLASS, type MatrixCellTone } from './tones';
import { gridKeyTarget } from '../grid/gridKeyTarget';
import { useMatrixMatches } from './useMatrixMatches';

export type TreeMatrixProps<N extends MatrixNode = MatrixNode> = Omit<MatrixWindow<N>, 'nodes'> & {
  nodes: readonly N[];
  columns: readonly MatrixColumn[];
  /** Consumer's identity cell. Always visible and pinned left; the remainder is rendered by renderCell. */
  identityColumn: string;
  label: string;
  /** The server query's limit, independent of the length of a partial or final returned window. */
  windowSize: number;
  renderCell: (node: N, column: MatrixColumn) => ReactNode;
  cellTone?: (node: N, column: MatrixColumn) => MatrixCellTone | undefined;
  onWindowChange: (offset: number) => void;
  onToggle: (nodeId: string) => void;
  selectedCell: MatrixCell | null;
  onSelectCell: (cell: MatrixCell) => void;
  onActivate?: (node: N, column: MatrixColumn) => void;
  /** Enter always activates for keyboard access, whatever pointer gesture the consumer declares. Default: enter. */
  activateOn?: 'enter' | 'click' | 'doubleClick';
  /** The consumer first fetches the destination window (including expansion); this request reveals it when it arrives. */
  reveal?: { row: string; column?: string } | null;
  hiddenColumns?: readonly string[];
  fill?: boolean;
  /**
   * When the viewport is resized (for example a panel opens below and the matrix shrinks), scroll the selected row back inside it, vertically
   * and within the matrix only. A row already in view stays where it is. Default: off.
   */
  keepSelectionInView?: boolean;
  busy?: boolean;
  /** Change for a new session/Scope/query generation; clears pending focus, editor drafts and remembered matching column ids. */
  generation?: string | number;
  emphasis?: readonly MatrixEmphasisRule[];
  onEmphasisChange?: (rules: MatrixEmphasisRule[]) => void;
  valueOf: MatrixValueOf<N>;
  onlyMatchingColumns?: boolean;
  emphasisActionLabel?: string;
  emphasisColumnLabel?: string;
  formatEmphasisCount?: (count: number, node: N) => string;
};

const WIDTH: Record<NonNullable<MatrixColumn['width']>, number> = { identity: 320, compact: 96, value: 96, wide: 384 };
const COMPACT_MIN_WIDTH = 'calc(var(--spacing) * 16)';
const EMPTY_RULES: readonly MatrixEmphasisRule[] = [];
const EMPTY_IDS: readonly string[] = [];
const CELL = 'relative z-0 flex h-(--ap-table-row-h) w-(--matrix-width) shrink-0 items-center border-r border-b border-border-subtle px-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring';
type PendingFocus = { index: number; column: string; generation: string | number } | null;

function MatrixCellBox({ compact, fullText, ...props }: ComponentProps<'div'> & { compact: boolean; fullText?: string }) {
  const [hovered, setHovered] = useState<HTMLDivElement | null>(null);
  // Recheck after each commit because the text can change without resizing its box.
  useLayoutEffect(() => {
    if (!hovered) return;
    if (!compact) {
      hovered.removeAttribute('title');
      return;
    }
    let boxes: HTMLElement[] = [];
    const refreshTitle = () => {
      let clipped: HTMLElement | undefined;
      for (const box of boxes) {
        if (clipped && !clipped.contains(box)) continue;
        if (box.scrollWidth > box.clientWidth && box.textContent?.trim()) clipped = box;
      }
      const title = clipped && (fullText ?? clipped.textContent);
      if (title) {
        if (hovered.title !== title) hovered.title = title;
      } else {
        hovered.removeAttribute('title');
      }
    };
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(refreshTitle);
    const refreshBoxes = () => {
      // The cell and its direct children have SDK clipping styles. A custom renderer can also truncate deeper inside its own layout.
      boxes = [hovered, ...Array.from(hovered.querySelectorAll('*')).filter((box): box is HTMLElement =>
        box instanceof HTMLElement && (box.parentElement === hovered || box.classList.contains('truncate') || getComputedStyle(box).textOverflow === 'ellipsis'),
      )];
      resize?.disconnect();
      for (const box of boxes) resize?.observe(box);
      refreshTitle();
    };
    refreshBoxes();
    // A custom renderer can also update independently of the matrix.
    const mutations = new MutationObserver(refreshBoxes);
    mutations.observe(hovered, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style'] });
    return () => { resize?.disconnect(); mutations.disconnect(); };
  });
  return <div {...props}
    onMouseEnter={compact ? event => setHovered(event.currentTarget) : undefined}
    onMouseLeave={hovered ? event => { event.currentTarget.removeAttribute('title'); setHovered(null); } : undefined} />;
}

/** Controlled server-windowed treegrid. Owns presentation and local focus only; fetching, counts and meaning remain consumer-owned. */
const unmodified = (event: KeyboardEvent) => !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
const togglesExpansion = (event: KeyboardEvent, node: { expanded: boolean }) => unmodified(event)
  && ((event.key === 'ArrowRight' && !node.expanded) || (event.key === 'ArrowLeft' && node.expanded));

export function TreeMatrix<N extends MatrixNode>({ nodes, columns, identityColumn, label, offset, totalVisible, windowSize, renderCell, cellTone, onWindowChange, onToggle, selectedCell, onSelectCell,
  onActivate, activateOn = 'enter', reveal, hiddenColumns = EMPTY_IDS, fill = false, keepSelectionInView = false, busy = false, generation = 0, emphasis = EMPTY_RULES, onEmphasisChange, valueOf, onlyMatchingColumns = false,
  emphasisActionLabel, emphasisColumnLabel, formatEmphasisCount }: TreeMatrixProps<N>) {
  const m = useMessages(MATRIX_MESSAGES);
  const ime = useImeEnterGuard();
  useRegisterPageBound(fill);
  const [size] = useTableSize();
  const step = TABLE_SIZE_STEPS[size];
  const rowHeight = BASE_ROW_HEIGHT + step.rowDelta;
  const viewport = useRef<HTMLDivElement>(null);
  const requested = useRef<{ offset: number; generation: string | number } | null>(null);
  const [pending, setPending] = useState<PendingFocus>(null);
  const identity = columns.find(column => column.id === identityColumn);
  if (!identity || new Set(columns.map(column => column.id)).size !== columns.length) throw new Error('TreeMatrix: declare unique columns including the identity column');
  if (!Number.isInteger(windowSize) || windowSize < 1 || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(totalVisible) || totalVisible < offset + nodes.length) throw new Error('TreeMatrix: invalid server window');
  const valueColumns = useMemo(() => columns.filter(column => column.id !== identityColumn), [columns, identityColumn]);
  const matching = useMatrixMatches(nodes, valueColumns, emphasis, valueOf, generation);
  const visible = useMemo(() => {
    const shown = columns.filter(column => column.id === identityColumn || column.pin || column.alwaysVisible || (!hiddenColumns.includes(column.id) && (!onlyMatchingColumns || emphasis.length === 0 || matching.union.has(column.id))));
    return [identity, ...shown.filter(column => column.id !== identityColumn && column.pin === 'left'), ...shown.filter(column => column.id !== identityColumn && !column.pin), ...shown.filter(column => column.id !== identityColumn && column.pin === 'right')];
  }, [columns, identity, identityColumn, hiddenColumns, onlyMatchingColumns, emphasis.length, matching.union]);
  const widths = new Map(visible.map(column => [column.id, WIDTH[column.width ?? (column.id === identityColumn ? 'identity' : 'value')] * step.widthScale]));
  const left = new Map<string, number>();
  const right = new Map<string, number>();
  let leftWidth = 0;
  const emphasisWidth = emphasis.length > 0 ? WIDTH.compact * step.widthScale : 0;
  let rightWidth = emphasisWidth;
  for (const column of visible) if (column.id === identityColumn || column.pin === 'left') { left.set(column.id, leftWidth); leftWidth += widths.get(column.id)!; }
  for (const column of [...visible].reverse()) if (column.pin === 'right' && column.id !== identityColumn) { right.set(column.id, rightWidth); rightWidth += widths.get(column.id)!; }
  const isFlexibleCompact = (column: MatrixColumn) => column.width === 'compact' && !left.has(column.id) && !right.has(column.id);
  const columnLayoutClass = (column: MatrixColumn) => cn(
    left.has(column.id) && 'sticky left-(--matrix-left) z-10',
    right.has(column.id) && 'sticky right-(--matrix-right) z-10',
    isFlexibleCompact(column) && 'min-w-(--matrix-compact-min-width) grow shrink overflow-hidden [&>*]:min-w-0 [&>*]:truncate',
  );
  const selectionVisible = nodes.some(node => node.id === selectedCell?.row) && visible.some(column => column.id === selectedCell?.column);
  const compactCount = visible.filter(isFlexibleCompact).length;
  const fixedWidth = visible.reduce((sum, column) => isFlexibleCompact(column) ? sum : sum + widths.get(column.id)!, emphasisWidth);
  const vars = {
    '--ap-table-row-h': `${rowHeight}px`,
    '--matrix-left-width': `${leftWidth}px`, '--matrix-right-width': `${rightWidth}px`,
    '--matrix-compact-min-width': COMPACT_MIN_WIDTH,
    '--matrix-fit-min-width': `calc(${fixedWidth}px + ${compactCount} * var(--matrix-compact-min-width))`,
  } as CSSProperties;
  const { canScrollLeft, canScrollRight } = useHorizontalOverflow(viewport, { contentKey: '' });

  const focusCell = useCallback((row: string, column: string) => {
    const root = viewport.current;
    const target = [...(root?.querySelectorAll<HTMLElement>('[data-matrix-row]') ?? [])].find(item => item.dataset.matrixRow === row);
    const cell = [...(target?.querySelectorAll<HTMLElement>('[data-matrix-column]') ?? [])].find(item => item.dataset.matrixColumn === column);
    if (!cell) return;
    cell.focus({ preventScroll: true });
    cell.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, []);
  useEffect(() => { requested.current = null; }, [offset, generation, nodes]);
  useEffect(() => {
    if (!pending) return;
    const cancelOutsideFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !viewport.current?.contains(event.target)) setPending(null);
    };
    document.addEventListener('focusin', cancelOutsideFocus);
    return () => document.removeEventListener('focusin', cancelOutsideFocus);
  }, [pending]);
  useEffect(() => {
    if (!pending) return;
    if (pending.generation !== generation) { setPending(null); return; }
    if (busy) return;
    const node = nodes[pending.index - offset];
    if (!node) return;
    const column = visible.find(column => column.id === pending.column) ?? visible[0];
    focusCell(node.id, column.id);
    setPending(null);
  }, [pending, busy, generation, nodes, offset, visible, focusCell]);
  const selectedRow = selectedCell?.row;
  useEffect(() => {
    const root = viewport.current;
    if (!keepSelectionInView || !root || selectedRow === undefined || typeof ResizeObserver === 'undefined') return;
    const keep = () => {
      const row = [...root.querySelectorAll<HTMLElement>('[data-matrix-row]')].find(element => element.dataset.matrixRow === selectedRow);
      if (!row) return;
      const box = root.getBoundingClientRect();
      const target = row.getBoundingClientRect();
      // The header row is sticky at the top; a horizontal scrollbar takes the bottom, so the content box ends at clientHeight.
      const top = box.top + root.clientTop + rowHeight;
      const bottom = box.top + root.clientTop + root.clientHeight;
      if (target.top < top) root.scrollTop -= top - target.top;
      else if (target.bottom > bottom) root.scrollTop += target.bottom - bottom;
    };
    const observer = new ResizeObserver(keep);
    observer.observe(root);
    return () => { observer.disconnect(); };
  }, [keepSelectionInView, selectedRow, rowHeight]);
  const revealRow = reveal?.row;
  const revealColumn = reveal?.column;
  useEffect(() => {
    if (!revealRow || busy) return;
    const node = nodes.find(node => node.id === revealRow);
    if (!node) return;
    const column = visible.find(column => column.id === (revealColumn ?? selectedCell?.column)) ?? visible[0];
    const row = [...(viewport.current?.querySelectorAll<HTMLElement>('[data-matrix-row]') ?? [])].find(element => element.dataset.matrixRow === node.id);
    const cell = [...(row?.querySelectorAll<HTMLElement>('[data-matrix-column]') ?? [])].find(element => element.dataset.matrixColumn === column.id);
    cell?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [revealRow, revealColumn, nodes, busy, selectedCell?.column, generation, visible]);

  const request = (next: number) => {
    const start = Math.max(0, Math.min(Math.max(0, totalVisible - windowSize), next));
    if (start === offset || (requested.current?.offset === start && requested.current.generation === generation)) return;
    requested.current = { offset: start, generation };
    onWindowChange(start);
  };
  const viewportRows = () => Math.max(1, Math.floor(((viewport.current?.clientHeight ?? rowHeight * 2) - rowHeight) / rowHeight));
  const move = (index: number, column: MatrixColumn) => {
    const target = Math.max(0, Math.min(totalVisible - 1, index));
    const node = nodes[target - offset];
    if (node && !busy) { setPending(null); focusCell(node.id, column.id); return; }
    setPending({ index: target, column: column.id, generation });
    const first = Math.min(target, Math.max(0, totalVisible - viewportRows()));
    if (viewport.current) viewport.current.scrollTop = first * rowHeight;
    request(first);
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>, node: N, rowIndex: number, column: MatrixColumn, columnIndex: number) => {
    if (event.target !== event.currentTarget || ime.isComposingEnter(event)) return;
    const pageRows = viewportRows();
    const row = pending?.generation === generation ? pending.index : offset + rowIndex;
    // Enter and expansion act on unmodified keys only, as in PlatformDataTable (#2549).
    if (event.key === 'Enter') { if (unmodified(event)) { event.preventDefault(); onActivate?.(node, column); } return; }
    // Expansion first on the identity column; every other move is the grid key map shared with PlatformDataTable (#2549).
    if (column.id === identityColumn && node.hasChildren && togglesExpansion(event, node)) {
      event.preventDefault();
      onToggle(node.id);
      return;
    }
    const next = gridKeyTarget(event, { row, column: columnIndex }, { rows: totalVisible, columns: visible.length }, pageRows);
    if (next === null) return;
    event.preventDefault();
    if (next !== 'stay') move(next.row, visible[next.column]);
  };
  const edgeFade = (side: 'left' | 'right', surface: 'card' | 'sunken') => {
    if (!(side === 'left' ? canScrollLeft : canScrollRight)) return null;
    // Zero-width sticky markers track the pin edges and paint between center and pinned cells.
    return <span aria-hidden data-matrix-fade={side} className={cn(
      'pointer-events-none sticky z-5 w-0 shrink-0', FADE_BASE,
      side === 'left' ? 'left-(--matrix-left-width) before:left-0 before:bg-linear-to-l' : 'right-(--matrix-right-width) before:right-0 before:bg-linear-to-r',
      surface === 'sunken' ? 'before:to-surface-sunken' : 'before:to-surface-card',
    )} />;
  };
  return <section aria-label={label} style={vars} className={cn('flex min-h-0 min-w-0 flex-col t-body break-keep', fill && 'h-full flex-1 overflow-hidden')}>
    <div ref={viewport} data-matrix-viewport role="treegrid" aria-label={label} aria-rowcount={totalVisible + 1} aria-colcount={visible.length + (emphasis.length > 0 ? 1 : 0)} aria-busy={busy}
      className={cn('scrollbar-panel min-h-0 min-w-0 scroll-pt-(--ap-table-row-h) scroll-pl-(--matrix-left-width) scroll-pr-(--matrix-right-width) overflow-auto overscroll-contain', fill ? 'flex-1' : 'max-h-96')}
      onCompositionStart={ime.onCompositionStart} onCompositionEnd={ime.onCompositionEnd}
      onFocusCapture={() => setPending(null)}
      onScroll={event => {
        if (pending?.generation === generation) return;
        const first = Math.max(0, Math.floor(event.currentTarget.scrollTop / rowHeight));
        const stride = Math.max(1, Math.floor(windowSize / 2));
        const next = Math.min(Math.max(0, totalVisible - 1), Math.floor(Math.max(0, first - stride / 2) / stride) * stride);
        request(next);
      }}>
      <div className="w-full min-w-(--matrix-fit-min-width)">
        <div role="row" aria-rowindex={1} className="sticky top-0 z-20 flex h-(--ap-table-row-h) min-w-full bg-surface-sunken">
          {edgeFade('left', 'sunken')}
          {visible.map((column, index) => {
            const content = <>{column.label}{column.headerNote && <span className="ml-1 font-normal">{column.headerNote}</span>}</>;
            const fullText = column.headerNote ? `${column.label} ${column.headerNote}` : column.label;
            return <MatrixCellBox key={column.id} role="columnheader" aria-colindex={index + 1}
              style={{ '--matrix-width': `${widths.get(column.id)}px`, '--matrix-left': `${left.get(column.id) ?? 0}px`, '--matrix-right': `${right.get(column.id) ?? 0}px` } as CSSProperties}
              className={cn(CELL, 't-table-header bg-surface-sunken text-text-secondary', columnLayoutClass(column))}
              compact={isFlexibleCompact(column)} fullText={fullText}>
              {isFlexibleCompact(column) ? <div>{content}</div> : content}
            </MatrixCellBox>;
          })}
          {emphasis.length > 0 && <div role="columnheader" aria-colindex={visible.length + 1} style={{ '--matrix-width': `${WIDTH.compact * step.widthScale}px` } as CSSProperties} className={cn(CELL, 'sticky right-0 z-10 t-table-header bg-surface-sunken text-text-secondary')}>{emphasisColumnLabel ?? m('emphasis')}</div>}
          {edgeFade('right', 'sunken')}
        </div>
        <div aria-hidden data-matrix-spacer="before" className="h-(--matrix-spacer)" style={{ '--matrix-spacer': `${offset * rowHeight}px` } as CSSProperties} />
        {nodes.map((node, rowIndex) => <div key={node.id} data-matrix-row={node.id} role="row" aria-rowindex={offset + rowIndex + 2} aria-level={node.level + 1} aria-expanded={node.hasChildren ? node.expanded : undefined}
          className={cn('group/matrix-row flex h-(--ap-table-row-h) min-w-full', node.kind === 'group' ? 'bg-surface-sunken' : 'bg-surface-card')}>
          {edgeFade('left', node.kind === 'group' ? 'sunken' : 'card')}
          {visible.map((column, columnIndex) => {
            const selected = selectedCell?.row === node.id && selectedCell.column === column.id;
            const tone = cellTone?.(node, column);
            const emphasized = matching.entries.get(node.id)?.columns.has(column.id) ?? false;
            const content = renderCell(node, column);
            // Give plain text a box to truncate while keeping custom content in the cell's flex layout.
            const wrapText = isFlexibleCompact(column) && (typeof content === 'string' || typeof content === 'number' || typeof content === 'bigint');
            const cellContent = wrapText ? <div>{content}</div> : content;
            return <MatrixCellBox key={column.id} role="gridcell" data-matrix-column={column.id} aria-colindex={columnIndex + 1} aria-selected={selected}
              tabIndex={selected || (!selectionVisible && rowIndex === 0 && columnIndex === 0) ? 0 : -1}
              style={{ '--matrix-width': `${widths.get(column.id)}px`, '--matrix-left': `${left.get(column.id) ?? 0}px`, '--matrix-right': `${right.get(column.id) ?? 0}px` } as CSSProperties}
              className={cn(CELL, node.kind === 'group' ? 'bg-surface-sunken' : 'bg-surface-card', columnLayoutClass(column), tone && MATRIX_TONE_CLASS[tone],
                selected && 'bg-surface-row-selected ring-2 ring-inset ring-border-selected', emphasized && 'outline outline-1 -outline-offset-4 outline-dashed outline-accent-primary')}
              compact={isFlexibleCompact(column)}
              onFocus={event => { if (event.target === event.currentTarget) onSelectCell({ row: node.id, column: column.id }); }}
              onKeyDown={event => keyDown(event, node, rowIndex, column, columnIndex)}
              onClick={event => {
                if ((event.target as HTMLElement).closest('button, input, a, [role="checkbox"]')) return;
                setPending(null);
                if (document.activeElement === event.currentTarget) onSelectCell({ row: node.id, column: column.id });
                else event.currentTarget.focus();
                if (activateOn === 'click') onActivate?.(node, column);
              }}
              onDoubleClick={event => { if ((event.target as HTMLElement).closest('button, input, a, [role="checkbox"]')) return; if (activateOn === 'doubleClick') onActivate?.(node, column); }}>
              {column.id === identityColumn ? <div className="flex min-w-0 flex-1 items-center gap-1 pl-(--matrix-indent)" style={{ '--matrix-indent': `calc(var(--spacing) * ${node.level * 4})` } as CSSProperties}>
                {node.hasChildren && <Button type="button" variant="ghost" size="icon-xs" aria-label={m(node.expanded ? 'collapse' : 'expand', { name: node.label })} aria-expanded={node.expanded}
                  onClick={() => onToggle(node.id)} onKeyDown={event => {
                    if (togglesExpansion(event, node)) { event.preventDefault(); event.stopPropagation(); onToggle(node.id); }
                  }}>{node.expanded ? <ChevronDown className="size-3" aria-hidden /> : <ChevronRight className="size-3" aria-hidden />}</Button>}
                <span className="flex min-w-0 flex-1 items-center gap-1">{content}</span>
                {onEmphasisChange && <MatrixRowMenu key={generation} node={node} columns={valueColumns} valueOf={valueOf} emphasis={emphasis} onChange={onEmphasisChange} label={emphasisActionLabel} />}
              </div> : cellContent}
            </MatrixCellBox>;
          })}
          {emphasis.length > 0 && <div role="gridcell" aria-colindex={visible.length + 1} style={{ '--matrix-width': `${WIDTH.compact * step.widthScale}px` } as CSSProperties} className={cn(CELL, 'sticky right-0 z-10', node.kind === 'group' ? 'bg-surface-sunken' : 'bg-surface-card')}>
            {matching.entries.has(node.id) && (formatEmphasisCount?.(matching.entries.get(node.id)!.columns.size, node) ?? m('matchCount', { count: matching.entries.get(node.id)!.columns.size }))}
          </div>}
          {edgeFade('right', node.kind === 'group' ? 'sunken' : 'card')}
        </div>)}
        <div aria-hidden data-matrix-spacer="after" className="h-(--matrix-spacer)" style={{ '--matrix-spacer': `${Math.max(0, totalVisible - offset - nodes.length) * rowHeight}px` } as CSSProperties} />
      </div>
    </div>
  </section>;
}
