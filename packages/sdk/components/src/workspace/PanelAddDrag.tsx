import { createContext, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useMessages } from '@ap/kernel';
import { groupOf } from '../dock/commands';
import { dockTheme } from '../dock/dockPresentation';
import type { DockNode } from '../dock/schema';
import { COMPONENTS_MESSAGES } from '../messages';

const START_DISTANCE = 5;
type Side = 'top' | 'bottom';
export type PanelAddPlacement = { panelId: string; position: Side };
type Start = (event: ReactPointerEvent<HTMLElement>, id: string, add: () => unknown) => void;
export const PanelAddDragContext = createContext<Start | null>(null);
type Zone = { group: Element; panelId: string; rect: DOMRect; reason?: string };
type Pick = { zone: Zone; position: Side };
type Preview = { doc: Document; zones: Zone[]; pick?: Pick };

function zonesOf(slot: HTMLElement, layout: DockNode, blocked: string | undefined, floating: string): Zone[] {
  const dock = slot.querySelector('[data-dock-layout]');
  return Array.from(dock?.querySelectorAll<HTMLElement>('[data-dock-group-actions]') ?? []).flatMap(action => {
    const group = action.closest('.dv-groupview');
    const panelId = action.dataset.dockActive;
    if (!group || !panelId || group.closest('[data-dock-layout]') !== dock || group.closest('.dv-hidden')) return [];
    const rect = group.getBoundingClientRect();
    if (!rect.width || !rect.height) return [];
    const reason = groupOf(layout, panelId) ? blocked : floating;
    return [{ group, panelId, rect, reason }];
  }).sort((a, b) => Number(!a.reason) - Number(!b.reason));
}

function pickAt(zones: Zone[], { clientX: x, clientY: y }: PointerEvent): Pick | undefined {
  const zone = zones.find(({ rect }) => x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom);
  return zone && { zone, position: y < zone.rect.top + zone.rect.height / 2 ? 'top' : 'bottom' };
}

function samePick(a: Pick | undefined, b: Pick | undefined) {
  if (!a || !b) return a === b;
  const { rect } = a.zone;
  const next = b.zone.rect;
  return a.position === b.position && a.zone.group === b.zone.group && a.zone.panelId === b.zone.panelId
    && a.zone.reason === b.zone.reason && rect.left === next.left && rect.top === next.top && rect.width === next.width && rect.height === next.height;
}

export function usePanelAddDrag(slotRef: RefObject<HTMLDivElement | null>, options: {
  layout: DockNode; scope: object; blocked?: string; place: (id: string, placement: PanelAddPlacement) => void;
}) {
  const m = useMessages(COMPONENTS_MESSAGES);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [status, setStatus] = useState('');
  const active = useRef<{ cancel: () => void; dispose: () => void } | null>(null);
  const live = useRef({ ...options, preview });
  useLayoutEffect(() => {
    if (live.current.scope !== options.scope) { active.current?.cancel(); setStatus(''); }
    live.current = { ...options, preview };
  }, [options, preview]);
  useLayoutEffect(() => () => active.current?.dispose(), []);

  const start: Start = (event, id, add) => {
    const source = event.currentTarget;
    const content = source.closest('[data-panel-add-content]');
    const slot = slotRef.current;
    const doc = source.ownerDocument;
    const win = doc.defaultView;
    if (event.button !== 0 || event.isPrimary === false || active.current || !slot || !content || !win) return;
    const { pointerId, clientX, clientY } = event;
    const { scope } = live.current;
    const floating = m('panelAddDropFloating');
    const listener = new AbortController();
    const capture = { capture: true, signal: listener.signal };
    let phase: 'pending' | 'dragging' | 'cancelled' = 'pending';
    let zones: Zone[] = [];
    let layout: DockNode;
    const eligible = () => source.isConnected && source.dataset.panelAddSource === id && slot.isConnected;
    const clear = () => { content.removeAttribute('data-panel-add-dragging'); setPreview(null); };
    const dispose = () => {
      listener.abort(); active.current = null;
      content.removeAttribute('data-panel-add-dragging');
      if (source.hasPointerCapture?.(pointerId)) source.releasePointerCapture(pointerId);
    };
    const cancel = () => {
      if (phase === 'pending') dispose();
      if (phase === 'dragging') { phase = 'cancelled'; clear(); }
    };
    setStatus('');
    active.current = { cancel, dispose };
    win.addEventListener('pointerdown', () => { if (phase === 'cancelled') dispose(); }, capture);
    win.addEventListener('pointermove', move => {
      if (move.pointerId !== pointerId || phase === 'cancelled') return;
      if (!eligible()) { cancel(); return; }
      if (phase === 'pending') {
        if (Math.hypot(move.clientX - clientX, move.clientY - clientY) < START_DISTANCE) return;
        phase = 'dragging';
        try { source.setPointerCapture?.(pointerId); } catch (error) {
          // Window listeners still receive events if the pointer ended just before capture.
          if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error;
        }
        content.setAttribute('data-panel-add-dragging', '');
        layout = live.current.layout;
        zones = zonesOf(slot, layout, live.current.blocked, floating);
      }
      const pick = pickAt(zones, move);
      setPreview(previous => previous?.zones === zones && samePick(previous.pick, pick) ? previous : { doc, zones, pick });
      move.preventDefault();
    }, capture);
    win.addEventListener('pointerup', up => {
      if (up.pointerId !== pointerId) return;
      dispose();
      if (phase === 'pending') return;
      up.preventDefault();
      const clickListener = new AbortController();
      win.addEventListener('click', click => {
        if (click.detail === 0 || ('pointerId' in click && click.pointerId !== pointerId)) return;
        click.preventDefault(); click.stopImmediatePropagation();
      }, { capture: true, signal: clickListener.signal });
      win.setTimeout(() => clickListener.abort(), 0);
      if (phase === 'cancelled') return;
      clear();
      const current = live.current;
      if (!eligible() || scope !== current.scope) return;
      const pick = current.preview?.pick;
      if (layout !== current.layout || !samePick(pick, pickAt(zonesOf(slot, current.layout, current.blocked, floating), up))) {
        setStatus(m('workspaceDropTargetChanged')); return;
      }
      if (!pick) return;
      if (pick.zone.reason) { setStatus(pick.zone.reason); return; }
      const opened = add();
      const panelId = typeof opened === 'string' ? opened : id;
      if (!groupOf(layout, panelId)) current.place(panelId, { panelId: pick.zone.panelId, position: pick.position });
    }, capture);
    win.addEventListener('pointercancel', cancelled => {
      if (cancelled.pointerId !== pointerId) return;
      if (phase === 'dragging') clear();
      dispose();
    }, capture);
    win.addEventListener('lostpointercapture', lost => { if (lost.pointerId === pointerId && (lost.target === source || !eligible())) cancel(); }, capture);
    win.addEventListener('blur', blur => { if (blur.target === blur.currentTarget) cancel(); }, capture);
    win.addEventListener('keydown', key => {
      if (key.key !== 'Escape' || phase !== 'dragging') return;
      key.preventDefault(); key.stopImmediatePropagation(); cancel();
    }, capture);
  };

  const overlays = preview && createPortal(<div className={dockTheme(true).className} aria-hidden>
    {preview.zones.filter(zone => zone.reason || zone === preview.pick?.zone).map(zone => {
      const { rect, reason } = zone;
      const position = reason ? undefined : preview.pick?.position;
      const height = position ? rect.height / 2 : rect.height;
      return <div key={zone.panelId} data-panel-add-preview={position} data-panel-add-refused={reason ? '' : undefined} className="pointer-events-none fixed top-(--panel-add-top) left-(--panel-add-left) z-40 h-(--panel-add-height) w-(--panel-add-width)"
        style={{ '--panel-add-top': `${position === 'bottom' ? rect.top + height : rect.top}px`, '--panel-add-left': `${rect.left}px`,
          '--panel-add-height': `${height}px`, '--panel-add-width': `${rect.width}px` } as CSSProperties}>
        {reason ? <div className="grid size-full place-items-center bg-surface-canvas/75 p-2 text-center"><span className="rounded-md bg-surface-canvas px-2 py-1 text-sm text-text-primary">{reason}</span></div>
          : <div key={position} className="size-full opacity-75" ref={node => { node?.classList.add('dv-drop-target-selection', `dv-drop-target-${position}`); }} />}
      </div>;
    })}
  </div>, preview.doc.body);
  return { start, overlays, status };
}
