import { useEffect, useEffectEvent, useState } from 'react';
import { useMenuFetch, usePlatform } from '@ap/kernel';
import { topviewContext, topviewEvents } from './endpoints.js';
import { readHostProps, type HostProps } from './host-props.js';
import { loadReplayInput, type Settled } from './replay-load.js';

/** The loaded state of a screen: `loading` until the load for the current equipment and time settles. */
export type ReplayLoad = { kind: 'loading' } | Settled;

/**
 * One load per (equipment, applied time, server generation, attempt). The props are re-read on every render of the Kernel's page state. `retry` starts a new attempt for the same input. A new identity aborts the
 * previous load (one `AbortController` per load); its late result is dropped, and the state is keyed by identity so a frame of
 * another equipment or window is never shown. The anchor is not a query input: `FocusView` re-enters on it. Both reads go through
 * the Kernel's `useMenuFetch`, which projects the applied Context at call time and waits for the platform's query gate.
 */
export function useReplayScreen(): { props: HostProps; load: ReplayLoad | null; resetKey: string; generation: string; retry: () => void } {
  const platform = usePlatform();
  const context = useMenuFetch(topviewContext);
  const events = useMenuFetch(topviewEvents);
  const props = readHostProps(platform);
  const { equipment } = props;
  const applied = props.time.kind === 'applied' ? props.time : null;
  const from = applied?.from ?? null;
  const to = applied?.to ?? null;
  const resetKey = JSON.stringify([equipment, from, to]);
  // The generation of the server side: adapter, session (user included) and Kernel revision. Any change drops the settled data at once and aborts
  // the load, as the equipment or time does. `epoch` counts adapter and session swaps, adjusted during render so the new key is used in the same frame.
  const { adapter, session, user, revision } = platform;
  const [swaps, setSwaps] = useState({ adapter, session, epoch: 0 });
  let epoch = swaps.epoch;
  if (swaps.adapter !== adapter || swaps.session !== session) {
    epoch += 1;
    setSwaps({ adapter, session, epoch });
  }
  const [attempt, setAttempt] = useState(0);
  const generation = JSON.stringify([epoch, user.id, revision]);
  const loadKey = JSON.stringify([resetKey, generation, attempt]);
  const retry = () => setAttempt((n) => n + 1);
  const loadable = equipment !== null && from !== null && to !== null;
  const gateOpen = context.ready && events.ready;
  const [settled, setSettled] = useState<{ key: string; load: Settled } | null>(null);
  // A settled result belongs to one request: any other key (an invalid input included) discards it, so revisiting a key waits for a new one.
  if (settled !== null && settled.key !== loadKey) setSettled(null);
  const read = useEffectEvent((id: string, signal: AbortSignal) => loadReplayInput({ context: context.fetch, events: events.fetch }, id, signal));

  useEffect(() => {
    if (!loadable || equipment === null || !gateOpen) return;
    const controller = new AbortController();
    void read(equipment, controller.signal).then((load) => {
      if (load === null || controller.signal.aborted) return;
      setSettled({ key: loadKey, load });
    });
    return () => controller.abort();
  }, [loadable, gateOpen, equipment, loadKey]);

  if (!loadable) return { props, load: null, resetKey, generation, retry };
  return { props, load: settled?.key === loadKey ? settled.load : { kind: 'loading' }, resetKey, generation, retry };
}
