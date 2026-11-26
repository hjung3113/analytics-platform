import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MappingChip, MappingSlot } from '@ap/contracts';

const START_DISTANCE = 5;
const SLOT = '[data-mapping-slot]';
const CHIP = '[data-mapping-chip][data-mapping-chip-kind]';
type Preview = { chip: MappingChip; target: HTMLElement | undefined; slot: MappingSlot | undefined };
type Assign = (slot: MappingSlot, chip: MappingChip) => void;

function mappingSlot(value: string | undefined): MappingSlot | undefined {
  return value === 'measure' || value === 'breakdown' ? value : undefined;
}

function suppressReleaseClick(win: Window, source: HTMLElement, pointerId: number) {
  const listener = new AbortController();
  win.addEventListener('click', event => {
    if (!(event.target instanceof Node) || !source.contains(event.target)) return;
    if (event.detail === 0 || ('pointerId' in event && event.pointerId !== pointerId)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    listener.abort();
  }, { capture: true, signal: listener.signal });
  win.setTimeout(() => listener.abort(), 0);
}

export function useMappingDrag(assign: Assign) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [retry, setRetry] = useState(false);
  const disposeDrag = useRef<(() => void) | null>(null);
  const shown = useRef({ assign, preview });
  useLayoutEffect(() => { shown.current = { assign, preview }; }, [assign, preview]);
  useLayoutEffect(() => () => disposeDrag.current?.(), []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.isPrimary === false || disposeDrag.current || !(event.target instanceof Element)) return;
    const root = event.currentTarget;
    const source = event.target.closest<HTMLElement>(CHIP);
    const doc = root.ownerDocument;
    const win = doc.defaultView;
    const id = source?.dataset.mappingChip;
    const kind = mappingSlot(source?.dataset.mappingChipKind);
    if (!source || !root.contains(source) || id === undefined || !kind || !win) return;

    setRetry(false);
    const { pointerId, clientX, clientY } = event;
    const chip = { id, kind };
    const listener = new AbortController();
    const options = { capture: true, signal: listener.signal };
    let phase: 'pending' | 'dragging' | 'cancelled' = 'pending';
    const hasSource = () => root.isConnected && root.contains(source)
      && source.dataset.mappingChip === id && source.dataset.mappingChipKind === kind;
    const wellAt = (pointer: PointerEvent) => {
      const well = doc.elementFromPoint?.(pointer.clientX, pointer.clientY)?.closest<HTMLElement>(SLOT);
      return well && root.contains(well) ? well : undefined;
    };
    const dispose = () => {
      listener.abort();
      mutations.disconnect();
      disposeDrag.current = null;
      if (source.hasPointerCapture?.(pointerId)) source.releasePointerCapture(pointerId);
    };
    const cancel = () => {
      dispose();
      setPreview(null);
    };
    const mutations = new MutationObserver(() => { if (!hasSource()) cancel(); });
    mutations.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-mapping-chip', 'data-mapping-chip-kind'] });
    disposeDrag.current = dispose;

    win.addEventListener('pointermove', move => {
      if (move.pointerId !== pointerId || phase === 'cancelled') return;
      if (!hasSource()) { cancel(); return; }
      if (phase === 'pending') {
        if (Math.hypot(move.clientX - clientX, move.clientY - clientY) < START_DISTANCE) return;
        phase = 'dragging';
        try {
          source.setPointerCapture?.(pointerId);
        } catch (error) {
          // A pointer that already ended cannot be captured. Window listeners still handle it.
          if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
        }
      }
      const target = wellAt(move);
      const slot = mappingSlot(target?.dataset.mappingSlot);
      setPreview(previous => previous?.chip === chip && previous.target === target && previous.slot === slot
        ? previous : { chip, target, slot });
      move.preventDefault();
    }, options);
    win.addEventListener('pointerup', up => {
      if (up.pointerId !== pointerId) return;
      const { preview, assign } = shown.current;
      cancel();
      if (phase === 'pending') return;
      up.preventDefault();
      suppressReleaseClick(win, source, pointerId);
      if (phase === 'cancelled' || !hasSource()) return;
      // Compare against the committed preview in case the layout shifted since the last pointer move.
      const target = wellAt(up);
      const slot = mappingSlot(target?.dataset.mappingSlot);
      if (target !== preview?.target || slot !== preview?.slot) {
        setRetry(true);
        return;
      }
      if (slot) assign(slot, chip);
    }, options);
    win.addEventListener('pointercancel', cancelled => { if (cancelled.pointerId === pointerId) cancel(); }, options);
    win.addEventListener('lostpointercapture', lost => {
      if (lost.pointerId === pointerId && lost.target === source) cancel();
    }, options);
    win.addEventListener('blur', blur => { if (blur.target === blur.currentTarget) cancel(); }, options);
    win.addEventListener('keydown', key => {
      if (key.key !== 'Escape' || phase !== 'dragging') return;
      key.preventDefault();
      key.stopImmediatePropagation();
      // Keep the release listener to consume the pointer's click after Escape.
      phase = 'cancelled';
      setPreview(null);
    }, options);
  }

  return { onPointerDown, preview, retry };
}
