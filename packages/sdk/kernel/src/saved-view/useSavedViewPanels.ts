import { useCallback, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { followHeldSets, type MenuViewPanels } from '@ap/contracts';
import { AppContext, LentPanelPlatformContext } from '../platform/contexts';
import { useHostPlatformOptional } from '../platform/hooks';
import type { HostPlatform } from '../platform/types';
import { NO_MENU_VIEW_SELECTION } from './table-slots';
import { resolveSavedViewSupport } from './useSavedViewSupport';

export const PANELS_SLOT = 'panels';

export type SavedViewPanelsOutcome = MenuViewPanels | null | 'unreadable';

export function useMainScreenPanelSlots(host: HostPlatform | null) {
  const registry = useContext(AppContext)?.internal.savedViewSlots;
  const lent = useContext(LentPanelPlatformContext) !== null;
  const participates = !lent && host?.paneId === null;
  const menuId = host?.route?.menu?.id;
  const scopeId = host?.global.scopeId;
  // Table selection and cleanup can replace a pending restore. Give panels a separate slot state owned by the main screen.
  return useMemo(
    () => participates ? registry?.screen(JSON.stringify([menuId, scopeId, PANELS_SLOT])) : undefined,
    [participates, registry, menuId, scopeId],
  );
}

/**
 * Register the current panel configuration once per main screen.
 * On open, null selects the menu's declared panels. 'unreadable' reports that the saved panels could not be opened.
 * The opened view id lets the screen scope local workspace preferences to that view. A local Scope
 * change can release held sets before a saved view is applied, in which case there is no view id.
 * For a view-scoped workspace, use onOpen to update the panel set and its view id together,
 * and onSelectionChange for the initial identity and identity-only changes such as Save As and clear.
 * The return value reports the accepted menu-view selection for the panel slot.
 */
export function useSavedViewPanels(options: {
  value: MenuViewPanels | null;
  onOpen(outcome: SavedViewPanelsOutcome, viewId?: string): void;
  onSelectionChange?(viewId: string | null): void;
}): string | null {
  const app = useContext(AppContext);
  const host = useHostPlatformOptional();
  const menu = host?.route?.menu;
  const scopeId = host?.global.scopeId;
  const mainScreenSlots = useMainScreenPanelSlots(host);
  const slots = menu?.features.savedView === true ? mainScreenSlots : undefined;
  const supports = app?.internal.savedViewSupports;
  const selection = useSyncExternalStore(slots?.subscribe ?? noSelectionSubscription, slots?.menuViewSelection ?? noSelectedView);
  const committed = useRef(options);
  useLayoutEffect(() => { committed.current = options; });
  useLayoutEffect(() => {
    if (!selection.replayed) committed.current.onSelectionChange?.(selection.id);
  }, [selection]);
  // Held sets belong to the Scope they were held in (#2862): on a Scope switch the screen's panels follow at once, before any view list or
  // selection answers, so nothing saved in the new Scope carries the previous Scope's members (R2862C-2 C1).
  const heldScope = useRef(scopeId);
  useLayoutEffect(() => {
    if (heldScope.current === scopeId) return;
    heldScope.current = scopeId;
    const value = committed.current.value;
    if (!slots || !value) return;
    const next = followHeldSets(value);
    if (next.keys.length) committed.current.onOpen(next.panels);
  }, [scopeId, slots]);
  const valueKey = useMemo(() => JSON.stringify(options.value), [options.value]);
  useLayoutEffect(() => { slots?.changed(); }, [slots, valueKey]);

  useLayoutEffect(() => {
    if (!menu || !slots || !supports) return;
    // A screen can declare support after this layout effect runs.
    let release: (() => void) | undefined;
    const sync = () => {
      const supported = resolveSavedViewSupport(menu, supports) !== undefined;
      if (supported && !release) release = slots.register<SavedViewPanelsOutcome>(PANELS_SLOT, PANELS_SLOT, {
        get value() { return committed.current.value; },
        apply: (outcome, viewId) => committed.current.onOpen(outcome, viewId),
        single: true,
      });
      else if (!supported && release) { release(); release = undefined; }
    };
    sync();
    const unsubscribe = supports.subscribe(sync);
    return () => { unsubscribe(); release?.(); };
  }, [menu, slots, supports]);
  return selection.id;
}

const noSelectionSubscription = () => () => {};
const noSelectedView = () => NO_MENU_VIEW_SELECTION;

/**
 * Whether the main screen's panels hold a selection now (#2862). Held values live only in the screen and its saved view (ADR-0176), never in
 * the address, so a copied link does not carry them. Read at call time, not render time.
 */
export function useHoldsPanels(): () => boolean {
  const host = useHostPlatformOptional();
  const slots = useMainScreenPanelSlots(host);
  return useCallback(() => {
    const value = slots?.capture<SavedViewPanelsOutcome>(PANELS_SLOT)[PANELS_SLOT];
    return typeof value === 'object' && value !== null && value.instances.some(instance => instance.inputs.some(input => input.mode === 'hold'));
  }, [slots]);
}
