import { useCallback, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import { followHeldSets, type MenuViewPanels } from '@ap/contracts';
import { AppContext, LentPanelPlatformContext } from '../platform/contexts';
import { useHostPlatformOptional } from '../platform/platform';
import { resolveSavedViewSupport } from './useSavedViewSupport';

export const PANELS_SLOT = 'panels';

export type SavedViewPanelsOutcome = MenuViewPanels | null | 'unreadable';

/**
 * Register the current panel configuration once per main screen.
 * On open, null selects the menu's declared panels. 'unreadable' reports that the saved panels could not be opened.
 */
export function useSavedViewPanels(options: {
  value: MenuViewPanels | null;
  onOpen(outcome: SavedViewPanelsOutcome): void;
}): void {
  const app = useContext(AppContext);
  const lent = useContext(LentPanelPlatformContext) !== null;
  const host = useHostPlatformOptional();
  const menu = host?.route?.menu;
  const menuId = menu?.id;
  const scopeId = host?.global.scopeId;
  const participates = !lent && host?.paneId === null && menu?.features.savedView === true;
  const registry = app?.internal.savedViewSlots;
  const slots = useMemo(() => participates ? registry?.screen(JSON.stringify([menuId, scopeId])) : undefined, [participates, registry, menuId, scopeId]);
  const supports = app?.internal.savedViewSupports;
  const committed = useRef(options);
  useLayoutEffect(() => { committed.current = options; });
  // Held sets belong to the Scope they were held in (#2862): on a Scope switch the screen's panels follow at once, before any view list or
  // selection answers, so nothing saved in the new Scope carries the previous Scope's members (R2862C-2 C1).
  const heldScope = useRef(scopeId);
  useLayoutEffect(() => {
    if (heldScope.current === scopeId) return;
    heldScope.current = scopeId;
    const value = committed.current.value;
    if (!participates || !value) return;
    const next = followHeldSets(value);
    if (next.keys.length) committed.current.onOpen(next.panels);
  }, [scopeId, participates]);
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
        apply: outcome => committed.current.onOpen(outcome),
        single: true,
      });
      else if (!supported && release) { release(); release = undefined; }
    };
    sync();
    const unsubscribe = supports.subscribe(sync);
    return () => { unsubscribe(); release?.(); };
  }, [menu, slots, supports]);
}

/**
 * Whether the main screen's panels hold a selection now (#2862). Held values live only in the screen and its saved view (ADR-0176), never in
 * the address, so a copied link does not carry them. Read at call time, not render time.
 */
export function useHoldsPanels(): () => boolean {
  const app = useContext(AppContext);
  const lent = useContext(LentPanelPlatformContext) !== null;
  const host = useHostPlatformOptional();
  // Only the main screen registers panels: a board pane or a lent source copying its own link never reads the main screen's (R2862C C3).
  const registry = !lent && host?.paneId === null ? app?.internal.savedViewSlots : undefined;
  const key = JSON.stringify([host?.route?.menu?.id, host?.global.scopeId]);
  return useCallback(() => {
    const value = registry?.screen(key).capture<SavedViewPanelsOutcome>(PANELS_SLOT)[PANELS_SLOT];
    return typeof value === 'object' && value !== null && value.instances.some(instance => instance.inputs.some(input => input.mode === 'hold'));
  }, [registry, key]);
}
