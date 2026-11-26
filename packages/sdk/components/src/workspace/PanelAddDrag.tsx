import { createContext, useLayoutEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useMessages } from '@ap/kernel';
import { groupOf } from '../dock/commands';
import { dockTheme } from '../dock/dockPresentation';
import type { DockNode } from '../dock/schema';
import { dockStripElement } from '../dock/tabElements';
import { COMPONENTS_MESSAGES } from '../messages';
import { dockPointerHit, type DropStatus, usePointerDrag } from './usePointerDrag';

const DOCK = '[data-dock-layout]';
const GROUP = '.dv-groupview';
const ACTIONS = '[data-dock-group-actions][data-dock-active]';
type Side = 'top' | 'bottom';
export type PanelAddPlacement = { panelId: string; position: Side };
type Start = (event: ReactPointerEvent<HTMLElement>, id: string, add: (id: string) => string | undefined) => void;
export const PanelAddDragContext = createContext<Start | null>(null);
type Zone = { group: Element; panelId: string; rect: DOMRect; reason?: string };
type Pick = { zone: Zone; position: Side };
type Preview = { dock: HTMLElement; origin: DOMRect; zones: Zone[]; pick?: Pick };

function zonesOf(dock: HTMLElement, layout: DockNode, blocked: string | undefined, floating: string): Zone[] {
  return Array.from(dock.querySelectorAll<HTMLElement>(ACTIONS)).flatMap(action => {
    const group = action.closest(GROUP);
    const panelId = action.dataset.dockActive;
    if (!group || !panelId || group.closest(DOCK) !== dock || group.closest('.dv-hidden')) return [];
    const rect = group.getBoundingClientRect();
    if (!rect.width || !rect.height) return [];
    const reason = groupOf(layout, panelId) ? blocked : floating;
    return [{ group, panelId, rect, reason }];
  });
}

function panelAt(dock: HTMLElement, x: number, y: number) {
  const hit = dockPointerHit(dock, x, y);
  if (!hit) return;
  const body = hit.closest<HTMLElement>('[data-dock-panel][data-dock-visible="true"]');
  if (body?.closest(DOCK) === dock) return body.dataset.dockPanel;
  const header = dockStripElement(hit);
  return header?.closest(DOCK) === dock ? header.querySelector<HTMLElement>(ACTIONS)?.dataset.dockActive : undefined;
}

function pickAt(dock: HTMLElement, zones: Zone[], { clientX: x, clientY: y }: { clientX: number; clientY: number }): Pick | undefined {
  const panelId = panelAt(dock, x, y);
  const zone = zones.find(zone => zone.panelId === panelId && x >= zone.rect.left && x < zone.rect.right && y >= zone.rect.top && y < zone.rect.bottom);
  return zone && { zone, position: y < zone.rect.top + zone.rect.height / 2 ? 'top' : 'bottom' };
}

function samePick(a: Pick | undefined, b: Pick | undefined) {
  if (!a || !b) return a === b;
  const { rect } = a.zone;
  const next = b.zone.rect;
  return a.position === b.position && a.zone.group === b.zone.group && a.zone.panelId === b.zone.panelId
    && a.zone.reason === b.zone.reason && rect.left === next.left && rect.top === next.top && rect.width === next.width && rect.height === next.height;
}

function sameZones(a: Zone[], b: Zone[]) {
  return a.length === b.length && a.every((zone, index) => {
    const other = b[index]!;
    return zone.group === other.group && zone.panelId === other.panelId && zone.reason === other.reason
      && zone.rect.left === other.rect.left && zone.rect.top === other.rect.top && zone.rect.width === other.rect.width && zone.rect.height === other.rect.height;
  });
}

function samePreview(current: Preview | null, next: Preview | null) {
  if (current === next) return true;
  if (!current || !next) return false;
  return current.origin.left === next.origin.left && current.origin.top === next.origin.top
    && samePick(current.pick, next.pick) && sameZones(current.zones, next.zones);
}

function statusText(status: DropStatus<string> | null, changed: string) {
  if (!status) return '';
  if (status.kind === 'retry') return changed;
  return status.reason;
}

export function usePanelAddDrag(slotRef: RefObject<HTMLDivElement | null>, options: {
  layout: DockNode; scope: object; blocked?: string; place: (id: string, placement: PanelAddPlacement) => void;
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const gesture = usePointerDrag<Preview, string>();
  const { cancel, clearStatus } = gesture;
  const live = useRef(options);
  useLayoutEffect(() => {
    if (live.current.scope !== options.scope) { cancel(); clearStatus(); }
    live.current = options;
  }, [options, cancel, clearStatus]);

  const start: Start = (event, id, add) => {
    const source = event.currentTarget;
    const content = source.closest<HTMLElement>('[data-panel-add-content]');
    const dock = slotRef.current?.querySelector<HTMLElement>(DOCK);
    if (!dock || !content) return;
    const { scope } = live.current;
    const floating = m('panelAddDropFloating');
    let layout = live.current.layout;
    gesture.start(event, {
      source,
      isSourceAvailable: () => dock.isConnected && content.isConnected && content.contains(source)
        && content.getAttribute('data-state') === 'open' && source.dataset.panelAddSource === id,
      sourceAttributes: ['data-panel-add-source', 'data-state'],
      geometryRoot: dock,
      onStart: () => {
        content.setAttribute('data-panel-add-dragging', '');
        layout = live.current.layout;
      },
      previewAt: point => {
        const current = live.current;
        const zones = zonesOf(dock, current.layout, current.blocked, floating);
        return { dock, origin: dock.getBoundingClientRect(), zones, pick: pickAt(dock, zones, point) };
      },
      samePreview,
      onDrop: rendered => {
        const current = live.current;
        if (scope !== current.scope) return 'skip';
        if (layout !== current.layout) return 'changed';
        const pick = rendered.pick;
        if (!pick) return 'skip';
        if (pick.zone.reason) return pick.zone.reason;
        const panelId = add(id);
        if (panelId !== undefined && !groupOf(layout, panelId)) current.place(panelId, { panelId: pick.zone.panelId, position: pick.position });
      },
      onEnd: () => { content.removeAttribute('data-panel-add-dragging'); },
    });
  };

  const preview = gesture.preview;
  const announced = statusText(gesture.status, m('workspaceDropTargetChanged'));
  const overlays = preview && createPortal(<div className={`${dockTheme(true).className} pointer-events-none absolute inset-0 overflow-hidden`} data-panel-add-overlay aria-hidden>
    {preview.zones.filter(zone => zone.reason || zone === preview.pick?.zone).map(zone => {
      const { rect, reason } = zone;
      const position = reason ? undefined : preview.pick?.position;
      const height = position ? rect.height / 2 : rect.height;
      const top = rect.top - preview.origin.top + (position === 'bottom' ? height : 0);
      return <div key={zone.panelId} data-panel-add-preview={position} data-panel-add-refused={reason ? '' : undefined} className="absolute top-(--panel-add-top) left-(--panel-add-left) h-(--panel-add-height) w-(--panel-add-width)"
        style={{ '--panel-add-top': `${top}px`, '--panel-add-left': `${rect.left - preview.origin.left}px`,
          '--panel-add-height': `${height}px`, '--panel-add-width': `${rect.width}px` } as CSSProperties}>
        {reason ? <div className="grid size-full place-items-center bg-surface-canvas/75 p-2 text-center"><span className="rounded-md bg-surface-canvas px-2 py-1 text-sm text-text-primary">{reason}</span></div>
          : <div key={position} className="size-full opacity-75" ref={node => { node?.classList.add('dv-drop-target-selection', `dv-drop-target-${position}`); }} />}
      </div>;
    })}
  </div>, preview.dock);
  return { start, overlays, status: announced };
}
