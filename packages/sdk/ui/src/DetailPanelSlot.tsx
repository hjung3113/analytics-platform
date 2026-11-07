import { createContext, useCallback, useContext, useEffect, useInsertionEffect, useLayoutEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DetailPanelFullscreenContext, focusDetailPanelToggle, popupOwnsEscape, rememberPopupEscape } from './panel/DetailPanelFullscreenContext';
import { useSurfacePaused } from './SurfacePauseScope';
import { isProductionEnv } from './utils/isProductionEnv';

interface DetailPanelSlot {
  host: HTMLElement | null;
  activeKey: string | undefined;
  /** True when the active registrant is neither a closed (`null`) content registrant nor paused (`SurfacePauseScope`). */
  open: boolean;
  /** Increments when a detail becomes visible (a new visible registrant, or a listed one going from closed to a node); never on re-render, close, clear or pause; resuming the still-active registrant counts as becoming visible. */
  activation: number;
  expanded: boolean;
  toggle: () => void;
  setHost: (host: HTMLElement | null) => void;
  register: (key: string, onSuperseded: (winner: string) => void, paused?: boolean, localExpansion?: boolean) => () => void;
}

/** Stable callbacks for content registrants; never changes, so `useDetailPanelContent` callers do not re-render with the slot state. */
interface DetailPanelSlotActions {
  setContent: (key: string, node: ReactNode, paused?: boolean) => void;
  clearContent: (key: string) => void;
  /** The registrant's owning surface was paused or resumed (`SurfacePauseScope`); the registrant keeps its place either way. */
  setPaused: (key: string, paused: boolean) => void;
}

const DetailPanelSlotContext = createContext<DetailPanelSlot | null>(null);
/** Internal: consumed by `layout/useDetailPanelContent`; not part of the public API. */
export const DetailPanelSlotActionsContext = createContext<DetailPanelSlotActions | null>(null);

function warnOnOverlap(registrants: number) {
  if (registrants && !isProductionEnv(import.meta as { env?: { PROD?: boolean } }, globalThis as { process?: { env?: { NODE_ENV?: string } } })) {
    console.warn('[DetailPanelSlot] Multiple registrants; the last registrant wins.');
  }
}

/**
 * Shell-scoped DOM slot. Portal registrants (`useDetailPanelSlot`) preserve the registering page's React context;
 * content registrants (`useDetailPanelContent`) are rendered here, so they see the provider's context (ADR-0047).
 * A `null` content registrant is closed: it wins the slot but nothing renders. Provider-rendered content and portal
 * registrants through the children tree get `DetailPanelFullscreenContext`. An open replacement inherits expansion; closing, pausing or clearing ends it (ADR-0122).
 * A paused registrant (its owning surface is covered, `SurfacePauseScope`) keeps its place in the list but the slot reports `open` false, so the
 * shell hides the host; it gets no `onSuperseded` and no `activation`. Provider-rendered content is not rendered while paused; a portal registrant
 * stays mounted in the hidden host and scopes its own transient UI. A newer registrant still supersedes it, and a resume shows it again only if
 * it is still the winner (ADR-0088).
 */
export function DetailPanelSlotProvider({ children, expanded: controlledExpanded, onExpandedChange }: { children: ReactNode; expanded?: boolean; onExpandedChange?: (expanded: boolean) => void }) {
  const [localKeys, setLocalKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [activeKey, setActiveKey] = useState<string>();
  const [contents, setContents] = useState<ReadonlyMap<string, ReactNode>>(() => new Map());
  // One registrant list for portal (`register`) and content (`setContent`) registrants: the last one wins.
  const keys = useRef<string[]>([]);
  // Mirror of `contents` for the activation rule: setContent needs the previous node synchronously.
  const shown = useRef(new Map<string, boolean>());
  // Counts detail panels that became visible; the shell hides a docked drawer on each increment (06 §13).
  const [activation, setActivation] = useState(0);
  const portals = useRef(new Map<string, (winner: string) => void>());
  // Registrants whose owning surface is paused; the ref is read synchronously by the handlers, the state drives rendering.
  const pausedRef = useRef(new Set<string>());
  const [pausedKeys, setPausedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const syncPaused = useCallback(() => setPausedKeys(new Set(pausedRef.current)), []);
  const unregister = useCallback((key: string) => {
    portals.current.delete(key);
    setLocalKeys(previous => { if (!previous.has(key)) return previous; const next = new Set(previous); next.delete(key); return next; });
    if (pausedRef.current.delete(key)) syncPaused();
    keys.current = keys.current.filter(existing => existing !== key);
    setActiveKey(keys.current.at(-1));
  }, [syncPaused]);
  const takeSlot = useCallback((key: string, visible: boolean, paused: boolean) => {
    if (keys.current.includes(key)) return;
    if (paused) {
      // A registrant born under a paused surface must not push out a detail the user can see: it waits at the back of the list.
      pausedRef.current.add(key);
      syncPaused();
      warnOnOverlap(keys.current.length);
      keys.current = [key, ...keys.current];
      setActiveKey(keys.current.at(-1));
      return;
    }
    if (visible) setActivation(count => count + 1);
    const outgoing = keys.current.at(-1);
    warnOnOverlap(keys.current.length);
    keys.current = [...keys.current, key];
    setActiveKey(key);
    // Synchronous, after list mutation and before React can remove the outgoing portal content.
    // No deferred delivery: neither source nor winner can disappear between takeover and notification.
    if (outgoing !== undefined) portals.current.get(outgoing)?.(key);
  }, [syncPaused]);
  const register = useCallback((key: string, onSuperseded: (winner: string) => void, paused = false, localExpansion = false) => {
    if (localExpansion) setLocalKeys(previous => new Set(previous).add(key));
    portals.current.set(key, onSuperseded);
    takeSlot(key, true, paused);
    return () => unregister(key);
  }, [takeSlot, unregister]);
  const actions = useMemo<DetailPanelSlotActions>(() => ({
    setContent: (key, node, paused = false) => {
      // A registrant that is already listed keeps its place: a new node must not reclaim the slot.
      const wasShown = shown.current.get(key) === true;
      shown.current.set(key, node != null);
      if (keys.current.includes(key)) {
        // Only a winner that is not paused becomes visible here; a paused one counts when it resumes (`setPaused`), once.
        // The pause state arriving in this same render counts too, whichever of `setPaused` and `setContent` runs first.
        if (node != null && !wasShown && keys.current.at(-1) === key && !paused && !pausedRef.current.has(key)) setActivation(count => count + 1);
      } else takeSlot(key, node != null, paused);
      setContents(prev => {
        if (prev.get(key) === node) return prev;
        return new Map(prev).set(key, node);
      });
    },
    clearContent: key => {
      shown.current.delete(key);
      setContents(prev => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      if (keys.current.includes(key)) unregister(key);
      else if (pausedRef.current.delete(key)) syncPaused();
    },
    setPaused: (key, paused) => {
      if (pausedRef.current.has(key) === paused) return;
      // A key without a registration keeps no pause entry; a registrant that comes later brings its own pause state.
      if (paused && !keys.current.includes(key)) return;
      if (paused) pausedRef.current.add(key); else pausedRef.current.delete(key);
      syncPaused();
      // Resuming shows a detail again, so it takes the VOC drawer's place like any newly visible detail, but only if nothing newer holds the slot.
      if (!paused && keys.current.at(-1) === key && (portals.current.has(key) || shown.current.get(key) === true)) setActivation(count => count + 1);
    },
  }), [takeSlot, unregister, syncPaused]);
  // A closed registrant is a content registrant whose node is `null`: it wins the slot but renders nothing.
  const open = activeKey !== undefined && contents.get(activeKey) !== null && !pausedKeys.has(activeKey);
  const [localExpanded, setLocalExpanded] = useState(false);
  const controlled = controlledExpanded !== undefined && !localKeys.has(activeKey ?? '');
  const expanded = controlled ? controlledExpanded : open && localExpanded;
  const changeExpanded = useCallback((next: boolean) => {
    if (controlled) onExpandedChange?.(next);
    else setLocalExpanded(next);
  }, [controlled, onExpandedChange]);
  // An open replacement inherits the presentation. Close/clear/pause ends it; an empty initial slot never clears a restored URL.
  const previous = useRef({ open: false, local: false });
  useLayoutEffect(() => {
    if (previous.current.open && !open) {
      if (previous.current.local) setLocalExpanded(false);
      // Use the CURRENT screen's controller; navigation may already have removed the key.
      else if (controlledExpanded) onExpandedChange?.(false);
    }
    previous.current = { open, local: !controlled };
  }, [open, controlled, controlledExpanded, onExpandedChange]);
  const toggle = useCallback(() => changeExpanded(!expanded), [changeExpanded, expanded]);
  useEffect(() => {
    // Capture the popup's claim before Radix dismisses/unmounts it. Its Escape must not also collapse the panel at window bubble.
    document.addEventListener('keydown', rememberPopupEscape, true);
    const onKeyDown = (event: KeyboardEvent) => {
      if (open && expanded && event.key === 'Escape' && !event.defaultPrevented && !popupOwnsEscape(event)) {
        event.preventDefault();
        changeExpanded(false);
        focusDetailPanelToggle(host);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', rememberPopupEscape, true); window.removeEventListener('keydown', onKeyDown); };
  }, [open, expanded, changeExpanded, host]);
  const fullscreen = useMemo(() => ({ expanded, toggle }), [expanded, toggle]);
  const value = useMemo(() => ({ host, activeKey, open, activation, expanded, toggle, setHost, register }), [host, activeKey, open, activation, expanded, toggle, register]);
  const activeContent = activeKey !== undefined && host && !pausedKeys.has(activeKey) ? contents.get(activeKey) : undefined;
  return <DetailPanelSlotActionsContext.Provider value={actions}>
    <DetailPanelSlotContext.Provider value={value}>
      <DetailPanelFullscreenContext.Provider value={fullscreen}>{children}</DetailPanelFullscreenContext.Provider>
      {activeContent != null && host ? createPortal(
        <DetailPanelFullscreenContext.Provider value={fullscreen}>{activeContent}</DetailPanelFullscreenContext.Provider>,
        host,
      ) : null}
    </DetailPanelSlotContext.Provider>
  </DetailPanelSlotActionsContext.Provider>;
}

/** Register once per mounted consumer. Without onSuperseded, the previous registrant resumes when the winner unmounts. */
export function useDetailPanelSlot(options?: { onSuperseded?: () => void; /** A host surface whose presentation must stay in memory (e.g. a board pane). */ localExpansion?: boolean }): HTMLElement | null {
  const slot = useContext(DetailPanelSlotContext);
  const actions = useContext(DetailPanelSlotActionsContext);
  const paused = useSurfacePaused();
  const key = useId();
  const register = slot?.register;
  // Registration reads the pause state of the moment but must not re-run (and so re-order the list) when it changes.
  const localExpansion = options?.localExpansion === true;
  const pausedAtRegister = useRef(paused);
  useInsertionEffect(() => { pausedAtRegister.current = paused; });
  const latest = useRef(options?.onSuperseded);
  // Mutation phase completes across the entire tree before any layout registration runs (React 19.3).
  useInsertionEffect(() => { latest.current = options?.onSuperseded; });
  // StrictMode replay preserves the winner's key; a different registrant is a new takeover.
  const lastWinner = useRef<string | null>(null);
  const supersede = useCallback((winner: string) => {
    if (winner === lastWinner.current) return;
    lastWinner.current = winner;
    latest.current?.();
  }, []);
  // Register before paint so a deep link does not briefly show a full-width main without its detail.
  useLayoutEffect(() => register?.(key, supersede, pausedAtRegister.current, localExpansion), [register, key, supersede, localExpansion]);
  const setPaused = actions?.setPaused;
  useLayoutEffect(() => { setPaused?.(key, paused); }, [setPaused, key, paused]);
  if (!slot) throw new Error('Detail panel requires DetailPanelSlotProvider (provided by AppShell).');
  return slot.activeKey === key ? slot.host : null;
}

/** Shell host only: attach the returned ref to its aside. */
export function useDetailPanelSlotHost() {
  const slot = useContext(DetailPanelSlotContext);
  if (!slot) throw new Error('Detail panel host requires DetailPanelSlotProvider.');
  return { ref: slot.setHost, open: slot.open, activation: slot.activation, expanded: slot.expanded, toggle: slot.toggle };
}
