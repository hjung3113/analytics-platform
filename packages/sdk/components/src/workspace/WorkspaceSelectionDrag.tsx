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
const VISIBLE_PANEL = '[data-dock-panel][data-dock-visible="true"]';
type Zone = { id: string; left: number; top: number; width: number; height: number };
type Preview = { chip: AnalysisSelectionChip; zones: Zone[]; target: string | undefined };

function dockZones(dock: HTMLElement): Zone[] {
  const base = dock.getBoundingClientRect();
  const visible = new Set([...dock.querySelectorAll<HTMLElement>(VISIBLE_PANEL)]
    .filter(body => body.closest(DOCK) === dock).map(body => body.dataset.dockPanel));
  return [...dock.querySelectorAll<HTMLElement>(ACTIONS)].flatMap(actions => {
    const group = actions.closest(GROUP);
    const id = actions.dataset.dockActive;
    if (!id || !visible.has(id) || !group || group.closest(DOCK) !== dock) return [];
    const { left, top, width, height } = group.getBoundingClientRect();
    return width > 0 && height > 0 ? [{ id, left: left - base.left, top: top - base.top, width, height }] : [];
  });
}

function panelAt(dock: HTMLElement, { clientX, clientY }: PointerEvent) {
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

export function WorkspaceSelectionDrag({ root, panels }: {
  root: RefObject<HTMLDivElement | null>; panels: readonly PanelWorkspacePanel[];
}) {
  const { tx } = useI18n();
  const [preview, setPreview] = useState<Preview | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const panelIds = useMemo(() => panels.map(panel => panel.analysisSelectionSourceId ?? panel.id), [panels]);
  const drops = useMemo(() => new Map(panels.map(panel => [panel.id, panel.analysisSelectionDrop])), [panels]);
  const currentDrops = useRef(drops);
  useLayoutEffect(() => { currentDrops.current = drops; }, [drops]);
  const reset = useCallback(() => cleanup.current?.(), []);
  const start = useCallback((event: PointerEvent, chip: AnalysisSelectionChip, trigger: HTMLButtonElement) => {
    const dock = root.current?.querySelector<HTMLElement>(`:scope > ${DOCK}`);
    const win = trigger.ownerDocument.defaultView;
    if (event.button !== 0 || event.isPrimary === false || cleanup.current || !dock || !win) return;
    const { pointerId } = event;
    const listener = new AbortController();
    const options = { capture: true, signal: listener.signal };
    let phase: 'pending' | 'dragging' | 'cancelled' = 'pending';
    const dispose = () => {
      listener.abort();
      cleanup.current = null;
    };
    cleanup.current = () => { dispose(); setPreview(null); };
    const restoreFocus = () => { if (trigger.isConnected) trigger.focus({ preventScroll: true }); };
    const cancel = () => {
      dispose();
      if (phase !== 'dragging') return;
      setPreview(null);
      restoreFocus();
    };
    win.addEventListener('pointermove', move => {
      if (move.pointerId !== pointerId || phase === 'cancelled') return;
      if (!trigger.isConnected) { cancel(); return; }
      if (phase === 'pending') {
        if (Math.hypot(move.clientX - event.clientX, move.clientY - event.clientY) < START_DISTANCE) return;
        phase = 'dragging';
        setPreview({ chip, zones: dockZones(dock), target: panelAt(dock, move) });
      } else {
        const target = panelAt(dock, move);
        setPreview(current => current && current.target !== target ? { ...current, target } : current);
      }
      move.preventDefault();
    }, options);
    win.addEventListener('pointerup', up => {
      if (up.pointerId !== pointerId) return;
      dispose();
      if (phase === 'pending') return;
      up.preventDefault();
      suppressReleaseClick(win, pointerId);
      if (phase === 'cancelled') return;
      setPreview(null);
      const id = panelAt(dock, up);
      const drop = id && currentDrops.current.get(id);
      if (trigger.isConnected && drop && !drop.reason?.(chip)) drop.onDrop(chip);
      else restoreFocus();
    }, options);
    win.addEventListener('pointercancel', cancelled => { if (cancelled.pointerId === pointerId) cancel(); }, options);
    win.addEventListener('blur', event => { if (event.target === event.currentTarget) cancel(); }, options);
    win.addEventListener('keydown', key => {
      if (key.key !== 'Escape' || phase !== 'dragging') return;
      key.preventDefault();
      key.stopImmediatePropagation();
      // Keep listening through release so Escape cannot turn the gesture into a click.
      phase = 'cancelled';
      setPreview(null);
      restoreFocus();
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
