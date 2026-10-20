import type * as React from 'react';
import { createContext, useContext, useInsertionEffect, useLayoutEffect, useMemo, useState } from 'react';

const OverlayVisibility = createContext<{ active: boolean; status: { current: boolean } } | null>(null);

/** Hiding retained content dismisses its transient portals without unmounting ordinary state or docked content. */
export function TransientOverlayScope({ active, children }: { active: boolean; children: React.ReactNode }): React.ReactElement {
  const parent = useContext(OverlayVisibility);
  const visible = active && (parent?.active ?? true);
  // Each visibility lifetime has its own cancellation token; a rapid hide/show cannot revive an old autofocus callback.
  const status = useMemo(() => ({ current: visible }), [visible]);
  useInsertionEffect(() => () => { status.current = false; }, [status]);
  return <OverlayVisibility.Provider value={{ active: visible, status }}>{children}</OverlayVisibility.Provider>;
}

type OpenProps = { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void };
export function useScopedOverlay(props: OpenProps): OpenProps {
  const scope = useContext(OverlayVisibility);
  const [local, setLocal] = useState(props.defaultOpen ?? false);
  const active = scope?.active ?? true;
  const open = props.open ?? local;
  useLayoutEffect(() => {
    if (!active && open) { setLocal(false); props.onOpenChange?.(false); }
  }, [active, open, props.onOpenChange]);
  return { open: active && open, onOpenChange: next => { setLocal(next); props.onOpenChange?.(next); } };
}

/** Read the live flag: Radix dispatches close autofocus after unmount, possibly after an identity change. */
export function useScopedAutofocus<T extends { preventDefault: () => void }>(callback?: (event: T) => void) {
  const scope = useContext(OverlayVisibility);
  return (event: T) => { if (scope && !scope.status.current) event.preventDefault(); else callback?.(event); };
}
export function useOverlayVisible() { return useContext(OverlayVisibility)?.active ?? true; }
