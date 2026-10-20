import type * as React from 'react';
import { createElement } from 'react';
import { createContext, useContext, useInsertionEffect, useLayoutEffect, useMemo, useState } from 'react';

const OverlayVisibility = createContext<{ active: boolean; status: { current: boolean } } | null>(null);

/** Hiding retained content dismisses its transient portals without unmounting ordinary state or docked content. */
export function TransientOverlayScope({ active, detached = false, children }: { active: boolean; detached?: boolean; children: React.ReactNode }): React.ReactElement {
  const parent = useContext(OverlayVisibility);
  // Docked content owns visibility independently of the pane that created its portal.
  const visible = active && (detached || (parent?.active ?? true));
  // Each visibility lifetime has its own cancellation token; a rapid hide/show cannot revive an old autofocus callback.
  const status = useMemo(() => ({ current: visible }), [visible]);
  useInsertionEffect(() => () => { status.current = false; }, [status]);
  return <OverlayVisibility.Provider value={{ active: visible, status }}>{children}</OverlayVisibility.Provider>;
}

type OpenProps = { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void };
/** The unscoped branch delegates state and notification timing entirely to Radix. */
export function withScopedOverlay<P extends OpenProps>(Root: React.ComponentType<P>): React.FC<P> {
  return function OverlayRoot(props: P) {
    const scope = useContext(OverlayVisibility);
    return scope === null ? createElement(Root, props) : createElement(ScopedOverlayRoot<P>, { Root, props });
  };
}
function ScopedOverlayRoot<P extends OpenProps>({ Root, props }: { Root: React.ComponentType<P>; props: P }) {
  const scoped = useScopedOverlay(props);
  return createElement(Root, { ...props, ...scoped });
}
function useScopedOverlay(props: OpenProps): OpenProps {
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
