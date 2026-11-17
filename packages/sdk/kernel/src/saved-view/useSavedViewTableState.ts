import { useContext, useLayoutEffect, useMemo, useRef } from 'react';
import type { TableViewState } from '@ap/contracts';
import { AppContext } from '../platform/contexts';
import { useHostPlatformOptional } from '../platform/platform';

/** Host-only table contribution. Board panes and screens without saved-view support never contribute. */
export function useSavedViewTableState(preferenceKey: string, options: { value: TableViewState; apply(entry: TableViewState): void; /** Declaration fingerprint, including when the current value is {}. */ basis?: string }): void {
  const app = useContext(AppContext);
  const host = useHostPlatformOptional();
  const menuId = host?.route?.menu.id;
  const scopeId = host?.global.scopeId;
  const registry = app?.internal.savedViewSlots;
  const slots = useMemo(() => registry?.screen(JSON.stringify([menuId, scopeId])), [registry, menuId, scopeId]);
  const committed = useRef(options);
  useLayoutEffect(() => { committed.current = options; });
  const valueKey = JSON.stringify(options.value);
  useLayoutEffect(() => { slots?.changed(); }, [slots, valueKey]);
  const supports = app?.internal.savedViewSupports;
  const participates = host?.paneId === null && host.route?.menu.features.savedView === true;
  useLayoutEffect(() => {
    if (!participates || !menuId || !slots || !supports) return;
    // Support may be declared in an ancestor layout effect, after the table's effect.
    let release: (() => void) | undefined;
    const sync = () => {
      if (supports.get(menuId) && !release) release = slots.register('tables', preferenceKey, {
        get value() { return committed.current.value; },
        apply: entry => committed.current.apply(entry),
        accepts: entry => !entry.groups || committed.current.basis === undefined || entry.groups.basis === committed.current.basis,
      });
      else if (!supports.get(menuId) && release) { release(); release = undefined; }
    };
    sync(); const unsubscribe = supports.subscribe(sync);
    return () => { unsubscribe(); release?.(); };
  }, [participates, menuId, slots, supports, preferenceKey]);
}
