import { useCallback, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

const START_DISTANCE = 5;

type Drag = {
  isSourceAvailable: () => boolean;
  sourceAttributes: string[];
  onStart: () => void;
  onMove: (event: PointerEvent) => void;
  onDrop: (event: PointerEvent) => void;
  onEnd: () => void;
};

/** A drag can end visually before its pointer releases. Keep that release owned by the original gesture. */
export function usePointerDrag() {
  const active = useRef<(() => void) | null>(null);
  const disposals = useRef(new Set<() => void>());
  const cancel = useCallback(() => { active.current?.(); }, []);
  useLayoutEffect(() => {
    const gestures = disposals.current;
    return () => { for (const dispose of gestures) dispose(); };
  }, []);

  const start = (event: ReactPointerEvent<HTMLElement>, drag: Drag) => {
    const source = event.currentTarget;
    const doc = source.ownerDocument;
    const win = doc.defaultView;
    if (event.button !== 0 || event.isPrimary === false || active.current || !win) return;
    const { pointerId, clientX, clientY } = event;
    const listener = new AbortController();
    const capture = { capture: true, signal: listener.signal };
    let phase: 'pending' | 'dragging' | 'cancelled' | 'released' = 'pending';

    const retire = () => {
      mutations.disconnect();
      if (active.current === cancelGesture) active.current = null;
    };
    const dispose = () => {
      if (listener.signal.aborted) return;
      listener.abort();
      retire();
      disposals.current.delete(dispose);
      if (source.hasPointerCapture?.(pointerId)) source.releasePointerCapture(pointerId);
    };
    const cancelGesture = () => {
      if (phase === 'pending') dispose();
      if (phase !== 'dragging') return;
      phase = 'cancelled';
      retire();
      drag.onEnd();
    };
    const mutations = new MutationObserver(() => { if (!drag.isSourceAvailable()) cancelGesture(); });
    mutations.observe(doc.body, { subtree: true, childList: true, attributeFilter: drag.sourceAttributes });
    active.current = cancelGesture;
    disposals.current.add(dispose);

    win.addEventListener('pointerdown', down => {
      if (down.pointerId === pointerId && (phase === 'cancelled' || phase === 'released')) dispose();
    }, capture);
    win.addEventListener('pointermove', move => {
      if (move.pointerId !== pointerId || phase === 'cancelled' || phase === 'released') return;
      if (!drag.isSourceAvailable()) { cancelGesture(); return; }
      if (phase === 'pending') {
        if (Math.hypot(move.clientX - clientX, move.clientY - clientY) < START_DISTANCE) return;
        phase = 'dragging';
        try {
          source.setPointerCapture?.(pointerId);
        } catch (error) {
          // A pointer that already ended cannot be captured. Window listeners still handle cancellation.
          if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
        }
        drag.onStart();
      }
      drag.onMove(move);
      move.preventDefault();
    }, capture);
    win.addEventListener('pointerup', up => {
      if (up.pointerId !== pointerId || phase === 'released') return;
      if (phase === 'pending') { dispose(); return; }
      const wasDragging = phase === 'dragging';
      phase = 'released';
      retire();
      up.preventDefault();
      win.addEventListener('click', (click: MouseEvent) => {
        if (click.detail === 0) return;
        const matches = 'pointerId' in click ? click.pointerId === pointerId : click.target instanceof win.Node && source.contains(click.target);
        if (!matches) return;
        click.preventDefault();
        click.stopImmediatePropagation();
        dispose();
      }, capture);
      win.setTimeout(dispose, 0);
      if (!wasDragging) return;
      // Hit-test while the source surface is still faded and cannot intercept the pointer.
      try {
        if (drag.isSourceAvailable()) drag.onDrop(up);
      } finally {
        drag.onEnd();
      }
    }, capture);
    win.addEventListener('pointercancel', cancelled => {
      if (cancelled.pointerId !== pointerId) return;
      cancelGesture();
      dispose();
    }, capture);
    win.addEventListener('lostpointercapture', lost => { if (lost.pointerId === pointerId && lost.target === source) cancelGesture(); }, capture);
    win.addEventListener('blur', blur => { if (blur.target === blur.currentTarget) cancelGesture(); }, capture);
    win.addEventListener('keydown', key => {
      if (key.key !== 'Escape' || phase !== 'dragging') return;
      key.preventDefault();
      key.stopImmediatePropagation();
      cancelGesture();
    }, capture);
    return true;
  };
  return { start, cancel };
}
