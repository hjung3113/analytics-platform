import { useCallback, useLayoutEffect, useRef, useState } from 'react';

const START_DISTANCE = 5;
const DOCK = '[data-dock-layout]';
const GROUP = '.dv-groupview';
const PANEL = '[data-dock-panel]';
const LAYOUT_ATTRIBUTES = ['class', 'style'];

export type DragPoint = { clientX: number; clientY: number };
export type DropStatus<Reason> = { kind: 'retry' } | { kind: 'refused'; reason: Reason };
type Press = DragPoint & { button: number; isPrimary: boolean; pointerId: number };
type DropDecision<Reason> = Reason | undefined | 'changed' | 'skip';

export type PointerDrag<Preview, Reason> = {
  /** Element that owns capture and the matching release click. */
  source: HTMLElement;
  isSourceAvailable: () => boolean;
  /** Attributes whose change, anywhere in the document, re-checks `isSourceAvailable`. */
  sourceAttributes: readonly string[];
  /** Scroll, resize and layout under a stationary pointer re-run `previewAt`. */
  geometryRoot?: HTMLElement | null;
  onStart?: () => void;
  previewAt: (point: DragPoint) => Preview | null;
  /** Skip a preview render when the committed value already shows `next`. */
  samePreview: (rendered: Preview | null, next: Preview | null) => boolean;
  /** Release check. Defaults to `samePreview`. A miss announces retry and does not call `onDrop`. */
  sameDrop?: (rendered: Preview | null, fresh: Preview | null) => boolean;
  /** `undefined` applies the drop. A reason is refused. `changed` retries. `skip` does neither. */
  onDrop: (rendered: Preview, point: DragPoint) => DropDecision<Reason>;
  onEnd?: () => void;
  /** Escape, blur, lost capture, pointercancel or source removal while the pointer may still be down. */
  onCancel?: () => void;
  /** A release that had been dragging. `applied` is false for retry, refusal, skip and a missing source. */
  onRelease?: (applied: boolean) => void;
};

/** Hit inside `dock`, treating a nested dock as occupying its outer panel. */
export function dockPointerHit(dock: HTMLElement, x: number, y: number): Element | undefined {
  let hit = dock.ownerDocument.elementFromPoint?.(x, y) ?? null;
  if (!hit || !dock.contains(hit)) return;
  for (let owner = hit.closest(DOCK); owner && owner !== dock; owner = owner.parentElement?.closest(DOCK) ?? null) hit = owner;
  return hit;
}

export function dockGroups(dock: HTMLElement): HTMLElement[] {
  return [...dock.querySelectorAll<HTMLElement>(GROUP)].filter(group => group.closest(DOCK) === dock);
}

function mutationChangesGeometry(root: HTMLElement, { target, attributeName }: MutationRecord) {
  if (!(target instanceof Element)) return false;
  // Ancestor boxes: only their own class/style. A node added beside the root is not geometry.
  if (target !== root && target.contains(root)) return attributeName !== null;
  if (!root.contains(target)) return false;
  if (!root.matches(DOCK)) return target === root && attributeName !== null;
  if (target.closest(DOCK) !== root) return false;
  // Dockview rewrites the scrollbar thumb on its own resize frame. That is not a group box,
  // and a refresh queued for it absorbs the next scroll (#3081).
  if (target.closest('.dv-scrollbar')) return false;
  // Panel content can update independently of the dock geometry.
  const body = target.closest(PANEL);
  return !body || (target === body && attributeName !== null);
}

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

type OwnerWindow = WindowProxy & typeof globalThis;

function watchGeometry(win: OwnerWindow, root: HTMLElement, schedule: () => void) {
  let resize: ResizeObserver | undefined;
  const groups = new Set<HTMLElement>();
  const mutations = new win.MutationObserver(records => {
    if (records.some(record => mutationChangesGeometry(root, record))) schedule();
  });
  mutations.observe(root, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: [...LAYOUT_ATTRIBUTES, 'data-dock-active', 'data-dock-visible'],
  });
  if (typeof win.ResizeObserver !== 'undefined') {
    const observer = new win.ResizeObserver(schedule);
    observer.observe(root);
    resize = observer;
  }
  for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) {
    mutations.observe(ancestor, { childList: true, attributes: true, attributeFilter: [...LAYOUT_ATTRIBUTES] });
    resize?.observe(ancestor);
  }
  const syncGroups = () => {
    if (!resize || !root.matches(DOCK)) return;
    const next = new Set(dockGroups(root));
    for (const group of groups) if (!next.has(group)) resize.unobserve(group);
    for (const group of next) if (!groups.has(group)) resize.observe(group);
    groups.clear();
    for (const group of next) groups.add(group);
  };
  syncGroups();
  win.addEventListener('scroll', schedule, { capture: true, passive: true });
  win.addEventListener('resize', schedule);
  return {
    syncGroups,
    stop() {
      mutations.disconnect();
      resize?.disconnect();
      groups.clear();
      win.removeEventListener('scroll', schedule, true);
      win.removeEventListener('resize', schedule);
    },
  };
}

/** Shared pointer lifecycle for the workspace drags. Feature behaviour stays with the caller. */
export function usePointerDrag<Preview, Reason>() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState<DropStatus<Reason> | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const active = useRef<(() => void) | null>(null);
  const disposals = useRef(new Set<() => void>());
  useLayoutEffect(() => { previewRef.current = preview; }, [preview]);
  useLayoutEffect(() => {
    const gestures = disposals.current;
    return () => { for (const dispose of gestures) dispose(); };
  }, []);
  const cancel = useCallback(() => { active.current?.(); }, []);
  const clearStatus = useCallback(() => { setStatus(null); }, []);

  const start = useCallback((event: Press, drag: PointerDrag<Preview, Reason>) => {
    const source = drag.source;
    const doc = source.ownerDocument;
    const view = doc.defaultView;
    if (event.button !== 0 || event.isPrimary === false || active.current || !view || !doc.body) return false;
    const win: OwnerWindow = view;
    const { pointerId } = event;
    const origin = { x: event.clientX, y: event.clientY };
    const listener = new AbortController();
    const capture = { capture: true, signal: listener.signal };
    let phase: 'pending' | 'dragging' | 'cancelled' | 'released' = 'pending';
    let last: DragPoint = event;
    let frame: number | undefined;
    let geometry: ReturnType<typeof watchGeometry> | undefined;
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
    function holdCancel() {
      if (phase === 'pending') { dispose(); return; }
      if (phase !== 'dragging') return;
      phase = 'cancelled';
      stopGeometry();
      removal.disconnect();
      if (active.current === holdCancel) active.current = null;
      setPreview(null);
      drag.onEnd?.();
      drag.onCancel?.();
    }
    function schedule() {
      if (phase !== 'dragging' || frame !== undefined) return;
      frame = win.requestAnimationFrame(() => {
        frame = undefined;
        if (phase !== 'dragging') return;
        if (!drag.isSourceAvailable()) { holdCancel(); return; }
        geometry?.syncGroups();
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
      // The next press of this pointer ends a held gesture whose release never arrived. A different pointer may drag.
      if (down.pointerId === pointerId && (phase === 'cancelled' || phase === 'released')) dispose();
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
        if (drag.geometryRoot?.isConnected) geometry = watchGeometry(win, drag.geometryRoot, schedule);
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
      setPreview(null);
      drag.onEnd?.();
      if (!drag.isSourceAvailable()) { drag.onRelease?.(false); return; }
      const fresh = drag.previewAt(up);
      const same = drag.sameDrop ?? drag.samePreview;
      if (!same(rendered, fresh)) { setStatus({ kind: 'retry' }); drag.onRelease?.(false); return; }
      if (rendered === null) { drag.onRelease?.(false); return; }
      const decision = drag.onDrop(rendered, up);
      if (decision === 'changed') setStatus({ kind: 'retry' });
      else if (decision !== undefined && decision !== 'skip') setStatus({ kind: 'refused', reason: decision });
      drag.onRelease?.(decision === undefined);
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
