import { useContext, useLayoutEffect } from 'react';
import type { SavedViewSupport } from '@ap/contracts';
import { AppContext } from '../platform/contexts';

/** Screens' declared Saved View support, keyed by menu id. Owned by the provider; the host hook reads it, menus only write through `useSavedViewSupport`. */
export type SupportRegistry = {
  register: (support: SavedViewSupport) => () => void;
  get: (menuId: string) => SavedViewSupport | undefined;
  subscribe: (listener: () => void) => () => void;
};
export function createSupportRegistry(): SupportRegistry {
  // One entry per registration, so releasing one screen never removes what another screen of the same menu declared.
  const supports = new Map<string, { support: SavedViewSupport }[]>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  return {
    register(support) {
      const entry = { support };
      supports.set(support.menuId, [...(supports.get(support.menuId) ?? []), entry]);
      emit();
      return () => {
        const rest = (supports.get(support.menuId) ?? []).filter(item => item !== entry);
        if (rest.length) supports.set(support.menuId, rest); else supports.delete(support.menuId);
        emit();
      };
    },
    get: menuId => supports.get(menuId)?.at(-1)?.support,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

/**
 * A menu declares what a Saved View may store from it (06 §21): Context keys, page keys, their serialization and menu schema version.
 * The menu never calls the store; the shell's selector does. Pass a module-level constant (a new object per render re-registers).
 * Outside a provider this does nothing.
 */
export function useSavedViewSupport(support: SavedViewSupport): void {
  const registry = useContext(AppContext)?.internal.savedViewSupports;
  useLayoutEffect(() => registry?.register(support), [registry, support]);
}
