import { useCallback, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import { followHeldSets, type MenuViewPanels } from '@ap/contracts';
import type { Text } from '../i18n';
import { AppContext, LentPanelPlatformContext } from '../platform/contexts';
import { useHostPlatformOptional } from '../platform/hooks';
import type { HostPlatform } from '../platform/types';
import { saveBlockKey } from './table-slots';
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
 * The second argument is the restored view ID. Immediate Scope-change release of held sets supplies no ID.
 */
export function useSavedViewPanels(options: {
  value: MenuViewPanels | null;
  onOpen(outcome: SavedViewPanelsOutcome, viewId?: string): void;
  /** While set, saving the current conditions as a new view or over the selected view is blocked. */
  saveBlocked?: string | Text | undefined;
  /** A committed save binds the mounted panels to the saved menu view. Clearing or selecting a condition set releases the binding. */
  onViewIdChange?(viewId: string | null): void;
}): void {
  const app = useContext(AppContext);
  const host = useHostPlatformOptional();
  const menu = host?.route?.menu;
  const scopeId = host?.global.scopeId;
  const mainScreenSlots = useMainScreenPanelSlots(host);
  const slots = menu?.features.savedView === true ? mainScreenSlots : undefined;
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
    if (!slots || !value) return;
    const next = followHeldSets(value);
    if (next.keys.length) committed.current.onOpen(next.panels);
  }, [scopeId, slots]);
  const valueKey = useMemo(() => JSON.stringify(options.value), [options.value]);
  const blockKey = options.saveBlocked === undefined ? undefined : saveBlockKey(options.saveBlocked);
  useLayoutEffect(() => { slots?.changed(); }, [slots, valueKey, blockKey]);

  useLayoutEffect(() => {
    if (!menu || !slots || !supports) return;
    // A screen can declare support after this layout effect runs.
    let release: (() => void) | undefined;
    const sync = () => {
      const supported = resolveSavedViewSupport(menu, supports) !== undefined;
      if (supported && !release) release = slots.register<SavedViewPanelsOutcome>(PANELS_SLOT, PANELS_SLOT, {
        get value() { return committed.current.value; },
        get blocked() { return committed.current.saveBlocked; },
        apply: (outcome, viewId) => committed.current.onOpen(outcome, viewId),
        onViewIdChange: viewId => committed.current.onViewIdChange?.(viewId),
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
  const host = useHostPlatformOptional();
  const slots = useMainScreenPanelSlots(host);
  return useCallback(() => {
    const value = slots?.capture<SavedViewPanelsOutcome>(PANELS_SLOT)[PANELS_SLOT];
    return typeof value === 'object' && value !== null && value.instances.some(instance => instance.inputs.some(input => input.mode === 'hold'));
  }, [slots]);
}
