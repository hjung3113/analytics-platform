import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clampGroupPan, groupPanKey, groupPanMax, revealGroupCell, snapGroupPan } from './columnGroupPan';

export type PanGroup = { id: string; width: number; widths: number[] };
type Geometry = PanGroup & { content: number; max: number; variable: string };
type Edges = { left: boolean; right: boolean };
type Gesture = { kind: 'idle' } | {
  kind: 'armed' | 'panning'; id: string; pointerId: number; startX: number; startY: number; startOffset: number; offset: number;
};
const DRAG_THRESHOLD = 4;
const CLIP = '[data-column-group-clip]';
const NO_PAN_START = '[data-column-resizer], input, textarea, select, [contenteditable]';
const edgesAt = (offset: number, max: number): Edges => ({ left: offset > 0, right: offset < max });

/** One table listener set; pointer frames mutate only a table CSS variable, with state committed at release. */
export function useColumnGroupPan(input: PanGroup[]) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  // Value identity prevents listener teardown during edge-only renders and data reloads.
  const signature = JSON.stringify(input);
  const groups = useMemo(() => new Map((JSON.parse(signature) as PanGroup[]).map(group => {
    const content = group.widths.reduce((sum, width) => sum + width, 0);
    // Encode id code points, never the display index (moving/hiding another group cannot rename this variable).
    const variable = `--ap-group-pan-${Array.from(group.id, char => char.codePointAt(0)!.toString(16)).join('-')}`;
    return [group.id, { ...group, content, max: groupPanMax(content, group.width), variable } satisfies Geometry];
  })), [signature]);
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  const [edges, setEdges] = useState<Record<string, Edges>>({});
  const live = useRef<Record<string, number>>({});
  useLayoutEffect(() => {
    const clamped = Object.fromEntries([...groups].map(([id, group]) => [id, clampGroupPan(offsets[id] ?? 0, group.content, group.width)]));
    live.current = clamped;
    for (const [id, group] of groups) node?.style.setProperty(group.variable, `${clamped[id]}px`);
    setOffsets(previous => Object.keys(previous).length === Object.keys(clamped).length && Object.entries(clamped).every(([id, value]) => previous[id] === value) ? previous : clamped);
    setEdges(previous => {
      const next = Object.fromEntries([...groups].map(([id, group]) => [id, edgesAt(clamped[id], group.max)]));
      return Object.keys(previous).length === groups.size && Object.entries(next).every(([id, edge]) => previous[id]?.left === edge.left && previous[id]?.right === edge.right) ? previous : next;
    });
  }, [node, groups, offsets]);

  useLayoutEffect(() => {
    if (!node || groups.size === 0) return;
    let gesture: Gesture = { kind: 'idle' };
    let frame: number | null = null;
    let removeClick: (() => void) | undefined;
    let clickTimer: ReturnType<typeof setTimeout> | undefined;
    const edgeStates = new Map([...groups].map(([id, group]) => [id, edgesAt(live.current[id] ?? 0, group.max)]));
    const groupAt = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return undefined;
      const box = target.closest<HTMLElement>(CLIP);
      if (!box || box.closest('[role=table], [role=grid]') !== node) return undefined;
      const group = groups.get(box.dataset.groupId!);
      return group ? { group, box } : undefined;
    };
    const paint = (group: Geometry, offset: number) => {
      live.current[group.id] = offset;
      node.style.setProperty(group.variable, `${offset}px`);
    };
    const updateEdges = (group: Geometry, offset: number) => {
      const edge = edgesAt(offset, group.max);
      const previous = edgeStates.get(group.id);
      if (previous?.left === edge.left && previous.right === edge.right) return;
      edgeStates.set(group.id, edge);
      setEdges(previous => ({ ...previous, [group.id]: edge }));
    };
    const commit = (group: Geometry, offset: number) => {
      paint(group, offset); updateEdges(group, offset);
      setOffsets(previous => previous[group.id] === offset ? previous : { ...previous, [group.id]: offset });
    };
    const down = (event: PointerEvent) => {
      if (gesture.kind !== 'idle' || event.button !== 0 || event.isPrimary === false || !(event.target instanceof Element) || event.target.closest(NO_PAN_START)) return;
      const hit = groupAt(event.target);
      if (!hit || hit.group.max === 0) return;
      gesture = { kind: 'armed', id: hit.group.id, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startOffset: live.current[hit.group.id] ?? 0, offset: live.current[hit.group.id] ?? 0 };
    };
    const move = (event: PointerEvent) => {
      if (gesture.kind === 'idle' || event.pointerId !== gesture.pointerId) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (gesture.kind === 'armed') {
        if (Math.abs(dx) <= DRAG_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
        gesture = { ...gesture, kind: 'panning' };
        node.setPointerCapture?.(event.pointerId);
        node.classList.add('select-none', 'cursor-grabbing');
        node.dataset.columnGroupPanning = 'true';
      }
      event.preventDefault();
      const group = groups.get(gesture.id)!;
      gesture.offset = clampGroupPan(gesture.startOffset - dx, group.content, group.width);
      updateEdges(group, gesture.offset);
      if (frame === null) frame = requestAnimationFrame(() => {
        frame = null;
        if (gesture.kind === 'panning') paint(group, gesture.offset);
      });
    };
    const finish = (event: PointerEvent) => {
      if (gesture.kind === 'idle' || event.pointerId !== gesture.pointerId) return;
      const ended = gesture;
      gesture = { kind: 'idle' };
      if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
      node.classList.remove('select-none', 'cursor-grabbing');
      delete node.dataset.columnGroupPanning;
      if (node.hasPointerCapture?.(ended.pointerId)) node.releasePointerCapture(ended.pointerId);
      if (ended.kind !== 'panning') return;
      const group = groups.get(ended.id)!;
      commit(group, snapGroupPan(ended.offset, group.widths, group.width));
      if (event.type !== 'pointerup') return;
      removeClick?.();
      if (clickTimer !== undefined) clearTimeout(clickTimer);
      // Native click follows pointerup in the same task. Always expire, including release outside the table.
      const swallow = (click: MouseEvent) => { click.preventDefault(); click.stopImmediatePropagation(); removeClick?.(); };
      removeClick = () => node.removeEventListener('click', swallow, true);
      node.addEventListener('click', swallow, true);
      clickTimer = setTimeout(() => { removeClick?.(); removeClick = undefined; }, 0);
    };
    const dragStart = (event: DragEvent) => { if (gesture.kind !== 'idle' && groupAt(event.target)) event.preventDefault(); };
    const wheel = (event: WheelEvent) => {
      const hit = groupAt(event.target);
      const delta = event.deltaX || (event.shiftKey ? event.deltaY : 0);
      if (!hit || delta === 0) return;
      const current = live.current[hit.group.id] ?? 0;
      const next = clampGroupPan(current + delta, hit.group.content, hit.group.width);
      if (next === current) return;
      event.preventDefault(); commit(hit.group, next);
    };
    const key = (event: KeyboardEvent) => {
      const hit = groupAt(event.target);
      if (!hit || hit.group.max === 0 || !(event.target instanceof HTMLElement) || event.target.getAttribute('role') !== 'columnheader' || event.target.dataset.column !== hit.group.id || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      commit(hit.group, groupPanKey(event.key, live.current[hit.group.id] ?? 0, hit.group.widths, hit.group.width));
    };
    const focus = (event: FocusEvent) => {
      const hit = groupAt(event.target);
      if (!hit || !(event.target instanceof Element)) return;
      const cell = event.target.closest<HTMLElement>('[role=cell], [role=gridcell], [role=columnheader]');
      if (!cell || cell.dataset.column === hit.group.id) return;
      const current = live.current[hit.group.id] ?? 0;
      // A cell wider than the group cannot be shown whole: reveal the focused control inside it instead, or End then Tab hides it again.
      const cellRect = cell.getBoundingClientRect();
      const rect = cellRect.width > hit.group.width ? event.target.getBoundingClientRect() : cellRect;
      const start = rect.left - hit.box.getBoundingClientRect().left + current;
      commit(hit.group, revealGroupCell(current, start, start + rect.width, hit.group.content, hit.group.width));
    };
    node.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    node.addEventListener('lostpointercapture', finish);
    node.addEventListener('dragstart', dragStart);
    node.addEventListener('wheel', wheel, { passive: false });
    node.addEventListener('keydown', key);
    node.addEventListener('focusin', focus);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      if (clickTimer !== undefined) clearTimeout(clickTimer);
      removeClick?.();
      const ended = gesture; gesture = { kind: 'idle' };
      if (ended.kind !== 'idle' && node.hasPointerCapture?.(ended.pointerId)) node.releasePointerCapture(ended.pointerId);
      node.classList.remove('select-none', 'cursor-grabbing');
      delete node.dataset.columnGroupPanning;
      node.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      node.removeEventListener('lostpointercapture', finish);
      node.removeEventListener('dragstart', dragStart);
      node.removeEventListener('wheel', wheel);
      node.removeEventListener('keydown', key);
      node.removeEventListener('focusin', focus);
    };
  }, [node, groups]);
  return { ref: setNode, groups, edges };
}
