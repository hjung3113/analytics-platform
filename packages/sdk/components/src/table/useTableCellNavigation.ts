import { useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent, type MouseEvent, type RefObject } from 'react';
import { gridKeyTarget } from '../grid/gridKeyTarget';
import type { TableCell } from './PlatformDataTable';

type Options = {
  viewport: RefObject<HTMLDivElement | null>;
  rows: string[];
  columns: string[];
  onFocusChange?: (cell: TableCell | null) => void;
  onSelect?: (cell: TableCell) => void;
  onActivate?: (cell: TableCell) => void;
  scrollRow: (id: string) => void;
  /** Rows one PageUp/PageDown moves: the rows that fit the viewport. */
  pageRows: () => number;
  pinnedWidths: () => { left: number; right: number };
};

export function useTableCellNavigation({ viewport, rows, columns, onFocusChange, onSelect, onActivate, scrollRow, pageRows, pinnedWidths }: Options) {
  const pending = useRef<TableCell | null>(null);
  const focusedCell = useRef<{ coordinate: TableCell; element: HTMLElement } | null>(null);
  const rowIndices = new Map(rows.map((id, index) => [id, index]));
  const columnIndices = new Map(columns.map((id, index) => [id, index]));

  function focus(target: TableCell) {
    const port = viewport.current;
    const rowIndex = rowIndices.get(target.row);
    const columnIndex = columnIndices.get(target.column);
    if (!port || rowIndex === undefined || columnIndex === undefined) return false;
    const cell = port.querySelector<HTMLElement>(`[data-table-focus-row="${rowIndex}"] [data-table-focus-column="${columnIndex}"]`);
    if (!cell) return false;

    cell.focus({ preventScroll: true });
    const portRect = port.getBoundingClientRect();
    const sticky = port.querySelector('[data-table-sticky-rows]');
    const cellRect = cell.getBoundingClientRect();
    if (!sticky?.contains(cell)) {
      const top = sticky?.getBoundingClientRect().bottom ?? portRect.top;
      if (cellRect.top < top) port.scrollTop += cellRect.top - top;
      else if (cellRect.bottom > portRect.top + port.clientHeight) port.scrollTop += cellRect.bottom - portRect.top - port.clientHeight;
    }
    const clip = cell.closest('[data-column-group-clip]');
    const pinned = (clip instanceof HTMLElement ? clip : cell).style.position === 'sticky';
    if (!pinned) {
      const bounds = clip?.getBoundingClientRect() ?? cellRect;
      const widths = pinnedWidths();
      const left = portRect.left + widths.left;
      const right = portRect.left + port.clientWidth - widths.right;
      if (bounds.left < left || bounds.width > right - left) port.scrollLeft += bounds.left - left;
      else if (bounds.right > right) port.scrollLeft += bounds.right - right;
    }
    return true;
  }

  useLayoutEffect(() => {
    const target = pending.current;
    if (target && (!rowIndices.has(target.row) || !columnIndices.has(target.column) || focus(target))) pending.current = null;

    const port = viewport.current;
    const previous = focusedCell.current;
    if (!port || !previous) return;
    const { coordinate, element } = previous;
    if (port.contains(element) && rowIndices.has(coordinate.row) && columnIndices.has(coordinate.column)) return;

    focusedCell.current = null;
    onFocusChange?.(null);
    const { activeElement, body } = port.ownerDocument;
    if (activeElement && activeElement !== body) return;
    pending.current = null;

    // The selected cell, when mounted and visible, already owns the roving tab stop.
    const tabStop = port.querySelector<HTMLElement>('[data-table-focus-column][tabindex="0"]');
    const replacement = tabStop && position(tabStop);
    if (!replacement || !focus(replacement)) port.focus({ preventScroll: true });
  });

  function position(element: HTMLElement) {
    const row = rows[Number(element.closest<HTMLElement>('[data-table-focus-row]')?.dataset.tableFocusRow)];
    const column = columns[Number(element.dataset.tableFocusColumn)];
    return row !== undefined && column !== undefined ? { row, column } : null;
  }

  function trackFocus(event: FocusEvent<HTMLDivElement>) {
    const element = event.target instanceof HTMLElement && event.currentTarget.contains(event.target)
      && event.target.closest<HTMLElement>('[data-table-focus-column]');
    const coordinate = element && position(element);
    focusedCell.current = element && coordinate ? { coordinate, element } : null;
    onFocusChange?.(coordinate || null);
  }

  function releaseFocus(event: FocusEvent<HTMLDivElement>) {
    if (event.relatedTarget) {
      focusedCell.current = null;
      onFocusChange?.(null);
      if (!event.currentTarget.contains(event.relatedTarget)) pending.current = null;
      return;
    }
    // A removed node can emit blur without a destination during the commit.
    // A surviving node releases ownership after the commit has had a chance to recover.
    const previous = focusedCell.current;
    queueMicrotask(() => {
      if (previous?.element.isConnected && focusedCell.current === previous) {
        focusedCell.current = null;
        onFocusChange?.(null);
      }
    });
  }

  function click(event: MouseEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest('a, button, input, select, textarea, [contenteditable="true"]')) return;
    const target = position(event.currentTarget);
    if (target) onSelect?.(target);
  }

  function doubleClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest('a, button, input, select, textarea, [contenteditable="true"]')) return;
    const target = position(event.currentTarget);
    if (target) onActivate?.(target);
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const current = position(event.currentTarget);
    if (!current) return;
    if (event.key === 'Enter' && onActivate && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault();
      onSelect?.(current);
      onActivate(current);
      return;
    }
    // The one grid key map shared with TreeMatrix (#2549).
    const at = { row: rowIndices.get(current.row) ?? 0, column: columnIndices.get(current.column) ?? 0 };
    const next = gridKeyTarget(event, at, { rows: rows.length, columns: columns.length }, pageRows());
    if (next === null) return;
    event.preventDefault();
    if (next === 'stay') return;
    const target = { row: rows[next.row], column: columns[next.column] };
    onSelect?.(target);
    if (!focus(target)) {
      pending.current = target;
      scrollRow(target.row);
    }
  }

  return {
    rowIndices,
    focusHandlers: { onFocusCapture: trackFocus, onBlurCapture: releaseFocus },
    props: (column: string, tabStop: boolean) => ({
      'data-table-focus-column': columnIndices.get(column), tabIndex: tabStop ? 0 : -1,
      onClick: click, onDoubleClick: onActivate ? doubleClick : undefined, onKeyDown: keyDown,
    }),
  };
}
