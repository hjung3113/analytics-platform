import { useImperativeHandle, useLayoutEffect, type ReactNode, type Ref, type RefObject } from 'react';
import { useVirtualizer, type VirtualItem } from '@tanstack/react-virtual';

export type VirtualRowsHandle = { scrollToIndex: (index: number) => void };

/**
 * The table's virtual row area. The virtualizer re-renders its host on every scroll and row measure, so it lives here: scrolling
 * re-renders these rows only, never the toolbar, header or pager around them (#2813). `renderItem` is the table's own row render.
 * `onMounted` (grid tables only) hears the mounted item keys when the range changes, for the tab stops of rows rendered outside (the pinned row).
 */
export function VirtualRows({ count, getKey, scrollElement, rowHeight, handle, onMounted, renderItems }: {
  count: number;
  getKey: (index: number) => string;
  scrollElement: RefObject<HTMLDivElement | null>;
  rowHeight: number;
  handle: Ref<VirtualRowsHandle>;
  onMounted?: (keys: readonly string[]) => void;
  /** Renders the mounted items; `mounted` is their keys in this same render, so row state derived from the range is never a frame late. */
  renderItems: (items: VirtualItem[], measure: (node: Element | null) => void, mounted: readonly string[]) => ReactNode;
}) {
  const virtual = useVirtualizer({ count, getScrollElement: () => scrollElement.current, estimateSize: () => rowHeight, overscan: 8, getItemKey: getKey });
  useLayoutEffect(() => { virtual.measure(); }, [rowHeight]); // eslint-disable-line react-hooks/exhaustive-deps -- `virtual` is stable; a size change re-measures the cached rows
  useImperativeHandle(handle, () => ({ scrollToIndex: index => virtual.scrollToIndex(index, { align: 'center' }) }), [virtual]);
  const items = virtual.getVirtualItems();
  const keys = items.map(item => getKey(item.index));
  const range = keys.join('\u0000');
  useLayoutEffect(() => { onMounted?.(keys); }, [range, onMounted]); // eslint-disable-line react-hooks/exhaustive-deps -- `range` is `keys` by value
  // eslint-disable-next-line shadcn/no-inline-styles -- total row height comes from the virtualizer at runtime
  return <div role="rowgroup" className="relative" style={{ height: virtual.getTotalSize() }}>{renderItems(items, virtual.measureElement, keys)}</div>;
}
