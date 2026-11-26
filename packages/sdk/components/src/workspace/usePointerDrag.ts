import { useCallback, useLayoutEffect, useRef, useState } from 'react';

const START_DISTANCE = 5;
const LAYOUT_ATTRIBUTES = ['class', 'style'];

export type DragPoint = { clientX: number; clientY: number };
export type DropStatus<Reason> = { kind: 'retry' } | { kind: 'refused'; reason: Reason };
type Press = DragPoint & { button: number; isPrimary: boolean; pointerId: number; pointerType?: string };
type DropDecision<Reason> = Reason | undefined | 'changed' | 'skip';

export type PointerDrag<Preview, Reason> = {
  /** Element that owns capture and the matching release click. */
  source: HTMLElement;
  isSourceAvailable: () => boolean;
  /** Attributes whose change, anywhere in the document, re-checks `isSourceAvailable`. */
  sourceAttributes: readonly string[];
  /** Watches what can move under a stationary pointer (scroll, resize, layout); each change re-runs `previewAt`. */
  geometry?: DragGeometry;
  onStart?: () => void;
  previewAt: (point: DragPoint) => Preview | null;
  /** Skip a preview render when the committed value already shows `next`. */
  samePreview: (rendered: Preview | null, next: Preview | null) => boolean;
  /** Release check. Defaults to `samePreview`. A miss announces retry and does not call `onDrop`. */
  sameDrop?: (rendered: Preview | null, fresh: Preview | null) => boolean;
  /** `undefined` applies the drop. A reason is refused. `changed` retries. `skip` does neither. */
  onDrop: (rendered: Preview, point: DragPoint) => DropDecision<Reason>;
  onEnd?: () => void;
  /** Escape, blur, lost capture, pointercancel or source removal. Not called for the caller's own `cancel()`. */
  onCancel?: () => void;
  /** A release that had been dragging. `applied` is false for retry, refusal, skip and a missing source. */
  onRelease?: (applied: boolean) => void;
};

function capturePointer(source: HTMLElement, pointerId: number) {
  try {
    source.setPointerCapture?.(pointerId);
  } catch (error) {
    // A pointer that already ended cannot be captured. Window listeners still handle cancellation.
    if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
  }
}

function matchesReleaseClick(click: MouseEvent, source: HTMLElement, pointerId: number) {
  if (click.detail === 0) return false;
  if ('pointerId' in click && click.pointerId !== pointerId) return false;
  const view = source.ownerDocument.defaultView;
  return click.target instanceof (view?.Node ?? Node) && source.contains(click.target);
}

export type GeometryWatch = { /** Runs before each refreshed preview. */ sync?: () => void; stop: () => void };
/** Starts watching once the drag starts; `changed` schedules one coalesced preview refresh per frame. */
export type DragGeometry = (changed: () => void) => GeometryWatch;
type BoxWatchOptions = {
  /** Which records inside `root` count as geometry. Default: only `root`'s own attributes. */
  changed?: (record: MutationRecord) => boolean;
  attributes?: readonly string[];
};

/**
 * Watches `root`'s box: its own and its ancestors' size and class/style, window scroll and resize.
 * Returns the ResizeObserver so a caller can observe more boxes.
 */
export function watchBox(root: HTMLElement, changed: () => void, options: BoxWatchOptions = {}): GeometryWatch & { resize?: ResizeObserver } {
  const win = root.ownerDocument.defaultView as (WindowProxy & typeof globalThis) | null;
  if (!win || !root.isConnected) return { stop() {} };
  const inside = options.changed ?? (({ target, attributeName }: MutationRecord) => target === root && attributeName !== null);
  const mutations = new win.MutationObserver(records => {
    if (records.some(record => {
      const { target, attributeName } = record;
      if (!(target instanceof win.Element)) return false;
      // Ancestor boxes: only their own class/style. A node added beside the root is not geometry.
      if (target !== root && target.contains(root)) return attributeName !== null;
      return root.contains(target) && inside(record);
    })) changed();
  });
  mutations.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: [...LAYOUT_ATTRIBUTES, ...options.attributes ?? []] });
  const resize = typeof win.ResizeObserver === 'undefined' ? undefined : new win.ResizeObserver(changed);
  resize?.observe(root);
  for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
    mutations.observe(ancestor, { childList: true, attributes: true, attributeFilter: [...LAYOUT_ATTRIBUTES] });
    resize?.observe(ancestor);
  }
  win.addEventListener('scroll', changed, { capture: true, passive: true });
  win.addEventListener('resize', changed);
  return {
    resize,
    stop() {
      mutations.disconnect();
      resize?.disconnect();
      win.removeEventListener('scroll', changed, true);
      win.removeEventListener('resize', changed);
    },
  };
}

/** Shared pointer lifecycle for the workspace drags. Feature behaviour stays with the caller. */
export function usePointerDrag<Preview, Reason>() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<DropStatus<Reason> | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const active = useRef<((programmatic?: boolean) => void) | null>(null);
  const disposals = useRef(new Set<() => void>());
  useLayoutEffect(() => { previewRef.current = preview; }, [preview]);
  useLayoutEffect(() => {
    const gestures = disposals.current;
    return () => { for (const dispose of gestures) dispose(); };
  }, []);
  const cancel = useCallback(() => { active.current?.(true); }, []);
  const clearStatus = useCallback(() => { setStatus(null); }, []);

  const start = useCallback((event: Press, drag: PointerDrag<Preview, Reason>) => {
    const source = drag.source;
    const doc = source.ownerDocument;
    const view = doc.defaultView;
    if (event.button !== 0 || event.isPrimary === false || active.current || !view || !doc.body) return false;
    const win = view;
    const { pointerId, pointerType } = event;
    // A primary touch or pen press means every earlier contact of that kind has ended. Mouse keeps one id.
    const retiredBy = (down: PointerEvent) => down.pointerId === pointerId
      || ((pointerType === 'touch' || pointerType === 'pen') && down.isPrimary && down.pointerType === pointerType);
    const origin = { x: event.clientX, y: event.clientY };
    const listener = new AbortController();
    const capture = { capture: true, signal: listener.signal };
    let phase: 'pending' | 'dragging' | 'cancelled' | 'released' = 'pending';
    let last: DragPoint = event;
    let frame: number | undefined;
    let geometry: GeometryWatch | undefined;
    let clickGuard: AbortController | undefined;
    let done = false;
    const show = (point: DragPoint) => {
      const next = drag.previewAt(point);
      setPreview(previous => drag.samePreview(previous, next) ? previous : next);
    };
    const stopGeometry = () => {
      if (frame !== undefined) win.cancelAnimationFrame(frame);
      frame = undefined;
      geometry?.stop();
      geometry = undefined;
    };
    function dispose() {
      if (done) return;
      done = true;
      listener.abort();
      clickGuard?.abort();
      stopGeometry();
      removal.disconnect();
      disposals.current.delete(dispose);
      if (active.current === holdCancel) active.current = null;
      if (source.hasPointerCapture?.(pointerId)) source.releasePointerCapture(pointerId);
    }
    // A cancel while the pointer may still be down keeps the release listener so its click cannot activate the source.
    function holdCancel(programmatic = false) {
      if (phase === 'pending') { dispose(); return; }
      if (phase !== 'dragging') return;
      phase = 'cancelled';
      stopGeometry();
      removal.disconnect();
      if (active.current === holdCancel) active.current = null;
      setPreview(null);
      drag.onEnd?.();
      if (!programmatic) drag.onCancel?.();
    }
    function schedule() {
      if (phase !== 'dragging' || frame !== undefined) return;
      frame = win.requestAnimationFrame(() => {
        frame = undefined;
        if (phase !== 'dragging') return;
        if (!drag.isSourceAvailable()) { holdCancel(); return; }
        geometry?.sync?.();
        show(last);
      });
    }
    const removal = new win.MutationObserver(() => { if (!drag.isSourceAvailable()) holdCancel(); });
    const removalWatch: MutationObserverInit = { subtree: true, childList: true };
    if (drag.sourceAttributes.length > 0) {
      removalWatch.attributes = true;
      removalWatch.attributeFilter = [...drag.sourceAttributes];
    }
    removal.observe(doc.body, removalWatch);
    active.current = holdCancel;
    disposals.current.add(dispose);
    setStatus(null);

    const drop = (rendered: Preview | null, up: DragPoint) => {
      if (!drag.isSourceAvailable()) return false;
      const fresh = drag.previewAt(up);
      const same = drag.sameDrop ?? drag.samePreview;
      if (!same(rendered, fresh)) { setStatus({ kind: 'retry' }); return false; }
      if (rendered === null) return false;
      const decision = drag.onDrop(rendered, up);
      if (decision === 'changed') setStatus({ kind: 'retry' });
      else if (decision !== undefined && decision !== 'skip') setStatus({ kind: 'refused', reason: decision });
      return decision === undefined;
    };
    const armClick = () => {
      clickGuard = new AbortController();
      win.addEventListener('click', (click: MouseEvent) => {
        if (!matchesReleaseClick(click, source, pointerId)) return;
        click.preventDefault();
        click.stopImmediatePropagation();
        dispose();
      }, { capture: true, signal: clickGuard.signal });
      win.setTimeout(dispose, 0);
    };
    win.addEventListener('pointerdown', down => {
      // The next press of this pointer ends a held gesture whose release never arrived. Another mouse pointer may drag.
      if ((phase === 'cancelled' || phase === 'released') && retiredBy(down)) dispose();
    }, capture);
    win.addEventListener('pointermove', move => {
      if (move.pointerId !== pointerId || phase === 'cancelled' || phase === 'released') return;
      last = move;
      if (!drag.isSourceAvailable()) { holdCancel(); return; }
      if (phase === 'pending') {
        if (Math.hypot(move.clientX - origin.x, move.clientY - origin.y) < START_DISTANCE) return;
        phase = 'dragging';
        capturePointer(source, pointerId);
        drag.onStart?.();
        geometry = drag.geometry?.(schedule);
      }
      show(move);
      move.preventDefault();
    }, capture);
    win.addEventListener('pointerup', up => {
      if (up.pointerId !== pointerId || phase === 'released') return;
      if (phase === 'pending') { dispose(); return; }
      const dropping = phase === 'dragging';
      phase = 'released';
      const rendered = previewRef.current;
      listener.abort();
      stopGeometry();
      removal.disconnect();
      if (active.current === holdCancel) active.current = null;
      // Drop the capture listener before releasing, or lostpointercapture would cancel this drop.
      if (source.hasPointerCapture?.(pointerId)) source.releasePointerCapture(pointerId);
      up.preventDefault();
      armClick();
      if (!dropping) return;
      let applied = false;
      // Judge the drop while the drag surface is still as previewed (`onEnd` may un-fade a surface above the target).
      try {
        applied = drop(rendered, up);
      } finally {
        setPreview(null);
        drag.onEnd?.();
      }
      drag.onRelease?.(applied);
    }, capture);
    win.addEventListener('pointercancel', cancelled => {
      if (cancelled.pointerId !== pointerId) return;
      // The pointer is gone, so no release click follows. Retire after the listeners are gone.
      const dragging = phase === 'dragging';
      if (dragging) phase = 'cancelled';
      dispose();
      if (!dragging) return;
      setPreview(null);
      drag.onEnd?.();
      drag.onCancel?.();
    }, capture);
    win.addEventListener('lostpointercapture', lost => {
      // Touch can transfer implicit capture from a child of the source when the drag starts.
      if (lost.pointerId === pointerId && (lost.target === source || !drag.isSourceAvailable())) holdCancel();
    }, capture);
    win.addEventListener('blur', blur => { if (blur.target === blur.currentTarget) holdCancel(); }, capture);
    win.addEventListener('keydown', key => {
      if (key.key !== 'Escape' || phase !== 'dragging') return;
      key.preventDefault();
      key.stopImmediatePropagation();
      holdCancel();
    }, capture);
    return true;
  }, []);

  return { start, cancel, clearStatus, preview, status };
}
