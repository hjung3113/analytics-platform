import { useCallback, useLayoutEffect, useMemo, useRef, type CSSProperties, type RefObject } from 'react';
import { useI18n, type AnalysisSelectionChip, type Text } from '@ap/kernel';
import { Badge, cn } from '@ap/ui';
import { usePublishSelectionDrag } from '../chart/NextAnalysisBridge';
import { COMPONENTS_MESSAGES } from '../messages';
import type { PanelWorkspacePanel } from './PanelWorkspace';
import { DOCK, GROUP, GROUP_ACTIONS as ACTIONS, PANEL, dockGroups, dockPointerHit, watchDock } from './dockGeometry';
import { usePointerDrag } from './usePointerDrag';

const VISIBLE_PANEL = `${PANEL}[data-dock-visible="true"]`;
type Zone = { id: string; left: number; top: number; width: number; height: number };
type Preview = { chip: AnalysisSelectionChip; zones: Zone[]; target: string | undefined; hit: string | undefined };

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

function panelAt(dock: HTMLElement, point: { clientX: number; clientY: number }) {
  const hit = dockPointerHit(dock, point.clientX, point.clientY);
  if (!hit) return;
  // Dockview renders an active panel body in its own overlay. Header hits still come from the group.
  const body = hit.closest<HTMLElement>(VISIBLE_PANEL);
  const actions = hit.closest(GROUP)?.querySelector<HTMLElement>(ACTIONS);
  return body?.dataset.dockPanel ?? actions?.dataset.dockActive;
}

function sameZones(current: Zone[] | undefined, next: Zone[] | undefined) {
  if (!current || !next || current.length !== next.length) return false;
  return current.every((zone, index) => {
    const other = next[index]!;
    return zone.id === other.id && zone.left === other.left && zone.top === other.top && zone.width === other.width && zone.height === other.height;
  });
}

/** Why a panel does not take this chip: its own reason, or «not accepted» when it declares no drop. Overlay and release share it. */
function dropRefusal(drop: PanelWorkspacePanel['analysisSelectionDrop'], chip: AnalysisSelectionChip): Text | undefined {
  return drop ? drop.reason?.(chip) : COMPONENTS_MESSAGES.workspaceSelectionNotAccepted;
}

export function WorkspaceSelectionDrag({ root, panels }: {
  root: RefObject<HTMLDivElement | null>; panels: readonly PanelWorkspacePanel[];
}) {
  const { tx } = useI18n();
  const gesture = usePointerDrag<Preview, Text>();
  const panelIds = useMemo(() => panels.map(panel => panel.analysisSelectionSourceId ?? panel.id), [panels]);
  const drops = useMemo(() => new Map(panels.map(panel => [panel.id, panel.analysisSelectionDrop])), [panels]);
  const currentDrops = useRef(drops);
  useLayoutEffect(() => { currentDrops.current = drops; }, [drops]);
  const { cancel, clearStatus, start: startGesture } = gesture;
  const reset = useCallback(() => { cancel(); clearStatus(); }, [cancel, clearStatus]);
  const start = useCallback((event: PointerEvent, chip: AnalysisSelectionChip, trigger: HTMLButtonElement) => {
    const dock = root.current?.querySelector<HTMLElement>(`:scope > ${DOCK}`);
    if (!dock || !trigger.isConnected) return;
    const restoreFocus = () => { if (trigger.isConnected) trigger.focus({ preventScroll: true }); };
    startGesture(event, {
      source: trigger,
      isSourceAvailable: () => trigger.isConnected && dock.isConnected,
      sourceAttributes: [],
      geometry: changed => watchDock(dock, changed),
      previewAt: point => {
        const zones = dockZones(dock, dockGroups(dock));
        const hit = panelAt(dock, point);
        return { chip, zones, target: zones.find(zone => zone.id === hit)?.id, hit };
      },
      samePreview: (current, next) => current?.target === next?.target && sameZones(current?.zones, next?.zones),
      // The release compares the raw hit with the target the overlay committed, not a newer measurement.
      sameDrop: (rendered, fresh) => rendered?.target === fresh?.hit,
      onDrop: rendered => {
        const id = rendered.target;
        if (!id) return 'skip';
        const drop = currentDrops.current.get(id);
        const refusal = dropRefusal(drop, chip);
        if (drop && !refusal) { drop.onDrop(chip); return; }
        return refusal;
      },
      onCancel: restoreFocus,
      onRelease: applied => { if (!applied) restoreFocus(); },
    });
  }, [root, startGesture]);
  usePublishSelectionDrag(panelIds, start, reset);
  const preview = gesture.preview;
  const notice = gesture.status;

  const overlay = preview && <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
    {preview.zones.map(({ id, left, top, width, height }) => {
      const drop = drops.get(id);
      const reason = dropRefusal(drop, preview.chip);
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
  return <>
    {overlay}
    <div className="pointer-events-none sticky bottom-2 z-10 h-0">
      <p role="status" className={notice?.kind === 'retry'
        ? 'absolute inset-x-2 bottom-0 mx-auto w-fit rounded-md border border-border-subtle bg-surface-canvas px-2 py-1 text-center t-caption text-text-secondary break-keep'
        : 'sr-only'}>{notice && tx(notice.kind === 'retry' ? COMPONENTS_MESSAGES.workspaceDropTargetChanged : notice.reason)}</p>
    </div>
  </>;
}
