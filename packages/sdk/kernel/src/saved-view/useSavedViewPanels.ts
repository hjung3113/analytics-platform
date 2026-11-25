import { useContext, useLayoutEffect, useMemo, useRef } from 'react';
import type { MenuViewPanels } from '@ap/contracts';
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
