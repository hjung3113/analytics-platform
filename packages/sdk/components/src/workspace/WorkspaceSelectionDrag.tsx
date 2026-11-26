import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useI18n, type AnalysisSelectionChip } from '@ap/kernel';
import { Badge, cn } from '@ap/ui';
import { usePublishSelectionDrag } from '../chart/NextAnalysisBridge';
import { COMPONENTS_MESSAGES } from '../messages';
import type { PanelWorkspacePanel } from './PanelWorkspace';

const START_DISTANCE = 5;
const DOCK = '[data-dock-layout]';
const GROUP = '.dv-groupview';
const ACTIONS = '[data-dock-group-actions][data-dock-active]';
const PANEL = '[data-dock-panel]';
const VISIBLE_PANEL = `${PANEL}[data-dock-visible="true"]`;
type PointerPosition = Pick<PointerEvent, 'clientX' | 'clientY'>;
type Zone = { id: string; left: number; top: number; width: number; height: number };
type Preview = { chip: AnalysisSelectionChip; zones: Zone[]; target: string | undefined };

function dockGroups(dock: HTMLElement) {
  return [...dock.querySelectorAll<HTMLElement>(GROUP)].filter(group => group.closest(DOCK) === dock);
}

function dockZones(dock: HTMLElement, groups: readonly HTMLElement[]): Zone[] {
  const base = dock.getBoundingClientRect();
  const visible = new Set([...dock.querySelectorAll<HTMLElement>(VISIBLE_PANEL)]
    .filter(body => body.closest(DOCK) === dock).map(body => body.dataset.dockPanel));
  return groups.flatMap(group => {
    const actions = group.querySelector<HTMLElement>(ACTIONS);
    const id = actions?.dataset.dockActive;
    if (!id || !visible.has(id) || actions?.closest(GROUP) !== group) return [];
    const { left, top, width, height } = group.getBoundingClientRect();
    return width > 0 && height > 0 ? [{ id, left: left - base.left, top: top - base.top, width, height }] : [];
  });
}

function panelAt(dock: HTMLElement, { clientX, clientY }: PointerPosition) {
  let hit = dock.ownerDocument.elementFromPoint(clientX, clientY);
  if (!hit || !dock.contains(hit)) return;
  // A nested workspace occupies part of the outer target's panel body.
  for (let owner = hit.closest(DOCK); owner && owner !== dock; owner = owner.parentElement?.closest(DOCK) ?? null) hit = owner;
  // Dockview renders an active panel body in its own overlay. Header hits still come from the group.
  const body = hit.closest<HTMLElement>(VISIBLE_PANEL);
  const actions = hit.closest(GROUP)?.querySelector<HTMLElement>(ACTIONS);
  return body?.dataset.dockPanel ?? actions?.dataset.dockActive;
}

function suppressReleaseClick(win: Window, pointerId: number) {
  const listener = new AbortController();
  win.addEventListener('click', event => {
    if (event.detail === 0 || ('pointerId' in event && event.pointerId !== pointerId)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true, signal: listener.signal });
  win.setTimeout(() => listener.abort(), 0);
}

function capturePointer(trigger: HTMLButtonElement, pointerId: number) {
  try {
    trigger.setPointerCapture?.(pointerId);
  } catch (error) {
    // A pointer that already ended cannot be captured. Window listeners still handle cancellation.
    if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
  }
}

export function WorkspaceSelectionDrag({ root, panels }: {
  root: RefObject<HTMLDivElement | null>; panels: readonly PanelWorkspacePanel[];
}) {
  const { tx } = useI18n();
  const [preview, setPreview] = useState<Preview | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const renderedTarget = useRef<Preview['target']>(undefined);
  useLayoutEffect(() => { renderedTarget.current = preview?.target; }, [preview]);
  const panelIds = useMemo(() => panels.map(panel => panel.analysisSelectionSourceId ?? panel.id), [panels]);
  const drops = useMemo(() => new Map(panels.map(panel => [panel.id, panel.analysisSelectionDrop])), [panels]);
  const currentDrops = useRef(drops);
  useLayoutEffect(() => { currentDrops.current = drops; }, [drops]);
  const reset = useCallback(() => cleanup.current?.(), []);
  const start = useCallback((event: PointerEvent, chip: AnalysisSelectionChip, trigger: HTMLButtonElement) => {
    const dock = root.current?.querySelector<HTMLElement>(`:scope > ${DOCK}`);
    const win = trigger.ownerDocument.defaultView;
    if (event.button !== 0 || event.isPrimary === false || cleanup.current || !dock || !win || !trigger.isConnected) return;
    const { pointerId } = event;
    const listener = new AbortController();
    const options = { capture: true, signal: listener.signal };
    let phase: 'pending' | 'dragging' | 'cancelled' = 'pending';
    let lastPointer: PointerPosition = event;
    let zones: Zone[] = [];
    let frame: number | undefined;
    let resize: ResizeObserver | undefined;
    let observedGroups = new Set<HTMLElement>();
    const connected = () => trigger.isConnected && dock.isConnected;
    const restoreFocus = () => { if (trigger.isConnected) trigger.focus({ preventScroll: true }); };
    const finish = (end: 'release' | 'cancel' | 'escape' | 'reset') => {
      mutations.disconnect();
      resize?.disconnect();
      if (frame !== undefined) win.cancelAnimationFrame(frame);
      frame = undefined;
      win.removeEventListener('scroll', scheduleRefresh, true);
      win.removeEventListener('resize', scheduleRefresh);
      if (phase !== 'pending') setPreview(null);
      if (end === 'escape') {
        // The pointer is still down. Keep the release listener and capture to consume its click.
        phase = 'cancelled';
        restoreFocus();
        return;
      }
      listener.abort();
      cleanup.current = null;
      if (trigger.hasPointerCapture?.(pointerId)) trigger.releasePointerCapture(pointerId);
      if (end === 'cancel' && phase === 'dragging') restoreFocus();
    };
    const showPreview = () => {
      const hit = panelAt(dock, lastPointer);
      const target = zones.find(zone => zone.id === hit)?.id;
      const next = { chip, zones, target };
      setPreview(current => current?.zones === next.zones && current.target === next.target ? current : next);
    };
    const refresh = () => {
      if (!connected()) { finish('cancel'); return; }
      const groups = new Set(dockGroups(dock));
      for (const group of observedGroups) {
        if (!groups.has(group)) resize?.unobserve(group);
      }
      for (const group of groups) {
        if (!observedGroups.has(group)) resize?.observe(group);
      }
      observedGroups = groups;
      zones = dockZones(dock, [...groups]);
      showPreview();
    };
    const scheduleRefresh = () => {
      if (phase !== 'dragging' || frame !== undefined) return;
      frame = win.requestAnimationFrame(() => {
        frame = undefined;
        refresh();
      });
    };
    const layoutAttributes = ['class', 'style'];
    const mutations = new win.MutationObserver(records => {
      if (!connected()) { finish('cancel'); return; }
      if (records.some(({ target, attributeName }) => {
        if (!(target instanceof win.Element)) return false;
        if (target.contains(dock)) return true;
        if (target.closest(DOCK) !== dock) return false;
        // Panel content can update independently of the dock geometry.
        const body = target.closest(PANEL);
        return !body || (target === body && attributeName !== null);
      })) scheduleRefresh();
    });
    mutations.observe(trigger.ownerDocument, { childList: true, subtree: true });
    cleanup.current = () => finish('reset');
    win.addEventListener('pointermove', move => {
      if (move.pointerId !== pointerId || phase === 'cancelled') return;
      if (!connected()) { finish('cancel'); return; }
      lastPointer = move;
      if (phase === 'pending') {
        if (Math.hypot(move.clientX - event.clientX, move.clientY - event.clientY) < START_DISTANCE) return;
        phase = 'dragging';
        capturePointer(trigger, pointerId);
        if (typeof ResizeObserver !== 'undefined') resize = new ResizeObserver(scheduleRefresh);
        mutations.observe(dock, { subtree: true, attributes: true, attributeFilter: [...layoutAttributes, 'data-dock-active', 'data-dock-visible'] });
        resize?.observe(dock);
        for (let ancestor = dock.parentElement; ancestor; ancestor = ancestor.parentElement) {
          mutations.observe(ancestor, { attributes: true, attributeFilter: layoutAttributes });
          resize?.observe(ancestor);
        }
        win.addEventListener('scroll', scheduleRefresh, { capture: true, passive: true });
        win.addEventListener('resize', scheduleRefresh);
        refresh();
      } else showPreview();
      move.preventDefault();
    }, options);
    win.addEventListener('pointerup', up => {
      if (up.pointerId !== pointerId) return;
      const id = renderedTarget.current;
      finish('release');
      if (phase === 'pending') return;
      up.preventDefault();
      suppressReleaseClick(win, pointerId);
      if (phase === 'cancelled') return;
      // A layout can shift again before its next preview frame. Apply only the target the user saw and is still over.
      if (!id || !connected() || panelAt(dock, up) !== id) { restoreFocus(); return; }
      const drop = currentDrops.current.get(id);
      if (drop && !drop.reason?.(chip)) drop.onDrop(chip);
      else restoreFocus();
    }, options);
    const cancelPointer = (cancelled: PointerEvent) => { if (cancelled.pointerId === pointerId) finish('cancel'); };
    win.addEventListener('pointercancel', cancelPointer, options);
    win.addEventListener('lostpointercapture', lost => {
      // Touch can transfer implicit capture from a child of the trigger when the drag starts.
      if (lost.target === trigger || !connected()) cancelPointer(lost);
    }, options);
    win.addEventListener('blur', event => { if (event.target === event.currentTarget) finish('cancel'); }, options);
    win.addEventListener('keydown', key => {
      if (key.key !== 'Escape' || phase !== 'dragging') return;
      key.preventDefault();
      key.stopImmediatePropagation();
      finish('escape');
    }, options);
  }, [root]);
  usePublishSelectionDrag(panelIds, start, reset);

  if (!preview) return null;
  return <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
    {preview.zones.map(({ id, left, top, width, height }) => {
      const drop = drops.get(id);
      const reason = drop ? drop.reason?.(preview.chip) : COMPONENTS_MESSAGES.workspaceSelectionNotAccepted;
      const hovered = !reason && id === preview.target;
      const availableState = hovered ? 'hovered' : 'available';
      return <div key={id} data-selection-drop-panel={id} data-selection-drop-state={reason ? 'rejected' : availableState} style={{
        '--selection-drop-left': `${left}px`, '--selection-drop-top': `${top}px`,
        '--selection-drop-width': `${width}px`, '--selection-drop-height': `${height}px`,
      } as CSSProperties}
        className={cn('absolute top-(--selection-drop-top) left-(--selection-drop-left) grid h-(--selection-drop-height) w-(--selection-drop-width) place-items-center overflow-hidden rounded-lg',
          reason ? 'bg-surface-canvas/75 p-2' : 'border-2 border-accent-primary',
          hovered && 'bg-accent-primary-soft/35')}>
        {reason && <Badge variant="secondary" className="max-w-full whitespace-normal break-keep text-center">{tx(reason)}</Badge>}
      </div>;
    })}
  </div>;
}
