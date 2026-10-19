import { useContext, useId, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { DetailPanelSlotActionsContext } from '../DetailPanelSlot';

/**
 * Hook a shell uses to forward its `detailPanel?` prop into the shell's detail slot (ADR-0047).
 * Content registrant of the same slot `useDetailPanelSlot` registers into: one active registrant,
 * last registrant wins, cleanup restores the previous one. Without a `DetailPanelSlotProvider`
 * (storybook, ad-hoc tests) the hook is a no-op. `undefined` clears the registration; `null` registers a closed registrant (wins the slot, renders nothing).
 */
export function useDetailPanelContent(node: ReactNode | undefined): void {
  const actions = useContext(DetailPanelSlotActionsContext);
  const key = useId();
  // Register before paint so a deep link does not briefly show a full-width main without its detail.
  useLayoutEffect(() => {
    if (!actions) return;
    if (node === undefined) actions.clearContent(key);
    else actions.setContent(key, node);
  }, [actions, key, node]);
  useLayoutEffect(() => {
    if (!actions) return;
    return () => actions.clearContent(key);
  }, [actions, key]);
}
