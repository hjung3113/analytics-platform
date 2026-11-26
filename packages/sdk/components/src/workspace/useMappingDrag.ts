import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { sameChartConfig, type ChartConfig, type MappingChip, type MappingSlot, type Text } from '@ap/contracts';

const START_DISTANCE = 5;
const SLOT = '[data-mapping-slot]';
const CHIP = '[data-mapping-chip][data-mapping-chip-kind]';
type Preview = { chip: MappingChip; target: HTMLElement | undefined; slot: MappingSlot | undefined };
type Assign = (slot: MappingSlot, chip: MappingChip) => Text | undefined;
type DropStatus = { kind: 'retry' } | { kind: 'refused'; reason: Text };

function mappingSlot(value: string | undefined): MappingSlot | undefined {
  return value === 'measure' || value === 'breakdown' ? value : undefined;
}

export function useMappingDrag(config: ChartConfig, assign: Assign) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<DropStatus | null>(null);
  const active = useRef<{ cancel: () => void; dispose: () => void } | null>(null);
  const shown = useRef({ config, assign, preview });
  useLayoutEffect(() => {
    if (!sameChartConfig(shown.current.config, config)) {
      active.current?.cancel();
      setStatus(null);
    }
    shown.current = { config, assign, preview };
  }, [config, assign, preview]);
  useLayoutEffect(() => () => active.current?.dispose(), []);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.isPrimary === false || active.current || !(event.target instanceof Element)) return;
    const root = event.currentTarget;
    const source = event.target.closest<HTMLElement>(CHIP);
    const doc = root.ownerDocument;
    const win = doc.defaultView;
    const id = source?.dataset.mappingChip;
    const kind = mappingSlot(source?.dataset.mappingChipKind);
    if (!source || !root.contains(source) || id === undefined || !kind || !win) return;

    setStatus(null);
    const { pointerId, clientX, clientY } = event;
    const chip = { id, kind };
    const listener = new AbortController();
    const options = { capture: true, signal: listener.signal };
    let phase: 'pending' | 'dragging' | 'cancelled' | 'released' = 'pending';
    const hasSource = () => root.isConnected && root.contains(source)
      && source.dataset.mappingChip === id && source.dataset.mappingChipKind === kind;
    const wellAt = (pointer: PointerEvent) => {
      const well = doc.elementFromPoint?.(pointer.clientX, pointer.clientY)?.closest<HTMLElement>(SLOT);
      return well && root.contains(well) ? well : undefined;
    };
    const dispose = () => {
      if (listener.signal.aborted) return;
      listener.abort();
      mutations.disconnect();
      active.current = null;
      if (source.hasPointerCapture?.(pointerId)) source.releasePointerCapture(pointerId);
    };
    const cancel = () => {
      if (phase === 'pending') dispose();
      if (phase === 'dragging') {
        // The matching release can still dispatch a click after cancellation.
        phase = 'cancelled';
        mutations.disconnect();
        setPreview(null);
      }
    };
    const mutations = new MutationObserver(() => { if (!hasSource()) cancel(); });
    mutations.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-mapping-chip', 'data-mapping-chip-kind'] });
    active.current = { cancel, dispose };

    win.addEventListener('pointerdown', down => {
      if (down.pointerId === pointerId && (phase === 'cancelled' || phase === 'released')) dispose();
    }, options);
    win.addEventListener('pointermove', move => {
      if (move.pointerId !== pointerId || phase === 'cancelled' || phase === 'released') return;
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
      if (up.pointerId !== pointerId || phase === 'released') return;
      if (phase === 'pending') { dispose(); return; }
      const wasDragging = phase === 'dragging';
      phase = 'released';
      const { preview, assign } = shown.current;
      setPreview(null);
      mutations.disconnect();
      up.preventDefault();
      win.addEventListener('click', click => {
        if (!(click.target instanceof Node) || !source.contains(click.target)) return;
        if (click.detail === 0 || ('pointerId' in click && click.pointerId !== pointerId)) return;
        click.preventDefault();
        click.stopImmediatePropagation();
        dispose();
      }, options);
      win.setTimeout(dispose, 0);
      if (!wasDragging || !hasSource()) return;
      if (doc.activeElement === doc.body) (source.closest<HTMLElement>(SLOT) ?? source).focus({ preventScroll: true });
      // Compare against the committed preview in case the layout shifted since the last pointer move.
      const target = wellAt(up);
      const slot = mappingSlot(target?.dataset.mappingSlot);
      if (target !== preview?.target || slot !== preview?.slot) {
        setStatus({ kind: 'retry' });
        return;
      }
      const reason = slot && assign(slot, chip);
      if (reason) setStatus({ kind: 'refused', reason });
    }, options);
    win.addEventListener('pointercancel', cancelled => {
      if (cancelled.pointerId !== pointerId) return;
      setPreview(null);
      dispose();
    }, options);
    win.addEventListener('lostpointercapture', lost => {
      if (lost.pointerId === pointerId && lost.target === source) cancel();
    }, options);
    win.addEventListener('blur', blur => { if (blur.target === blur.currentTarget) cancel(); }, options);
    win.addEventListener('keydown', key => {
      if (key.key !== 'Escape' || phase !== 'dragging') return;
      key.preventDefault();
      key.stopImmediatePropagation();
      cancel();
    }, options);
  }

  return { onPointerDown, preview, status };
}
