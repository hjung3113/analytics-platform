import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ActionResponse, ActionResult, ActionSpec, AnyActionSpec, MenuAction } from '@ap/contracts';
import { usePlatform } from './platform';

/** What the write gates read from the platform; a host port reads it at call time instead of from a hook. */
export type ActionRequestInputs = Pick<ReturnType<typeof usePlatform>, 'adapter' | 'global' | 'scope' | 'session' | 'refreshEpochs'>;

const clientId = () => 'client-' + Date.now().toString(16);

/** Scope validated for this session when the action requires one (the same gate as `menuRequest`). */
export function actionReady(spec: Pick<AnyActionSpec, 'requiresScope'>, { global, scope, session }: Pick<ActionRequestInputs, 'global' | 'scope' | 'session'>): boolean {
  return !spec.requiresScope || (scope.status === 'valid' && scope.scopeId === global.scopeId && scope.validatedFor === session);
}

/**
 * The write core shared by `useMenuAction` and the module host port (ADR-0054). Not a hook. `RangeError` before anything
 * is sent when the version rule is broken. The request (fresh key, deep-copied input) is built once and every `retry`
 * resends that same object; the adapter never gets an abort signal. `ok`, `conflict` and `unknown` answers bump the epochs
 * of `spec.invalidates`, whether or not anyone is still waiting. The caller wraps `retry` in its own flight control.
 */
export function actionRequest<I, T>(spec: ActionSpec<I, T>, input: I, expectedVersion: string | undefined, inputs: ActionRequestInputs) {
  if (spec.concurrency === 'version' && expectedVersion === undefined) throw new RangeError(`Action "${spec.id}" is versioned and needs expectedVersion`);
  if (spec.concurrency === 'none' && expectedVersion !== undefined) throw new RangeError(`Action "${spec.id}" is not versioned and takes no expectedVersion`);
  const ready = actionReady(spec, inputs);
  const notReady = (): ActionResult<T> => ({
    outcome: 'error', data: null, version: null, fieldErrors: [], replayed: false, correlationId: clientId(), message: `not_ready: ${spec.id} waits for a validated Scope`,
  });
  if (!ready) return { ready, notReady, send: () => Promise.resolve(notReady()) };
  const request: MenuAction<I> = {
    action: spec.id,
    context: spec.requiresScope ? { scopeId: inputs.global.scopeId } : {},
    input: structuredClone(input),
    idempotencyKey: crypto.randomUUID(),
    ...(spec.concurrency === 'version' ? { expectedVersion } : {}),
  };
  const resend = async (): Promise<ActionResult<T>> => {
    let response: ActionResponse<unknown>;
    try {
      response = await inputs.adapter.menuAction(request);
    } catch (error) {
      response = { outcome: 'unknown', data: null, version: null, fieldErrors: [], replayed: false, correlationId: clientId(), message: String(error) };
    }
    if (response.outcome === 'ok' || response.outcome === 'conflict' || response.outcome === 'unknown') inputs.refreshEpochs.bump(spec.invalidates.map(endpoint => endpoint.id));
    const result = response as ActionResult<T>;
    return response.outcome === 'error' || response.outcome === 'unknown' ? { ...result, retry: resend } : result;
  };
  return { ready, notReady, send: resend };
}

export const abortError = () => new DOMException('The screen was released or its session generation changed before the write answered.', 'AbortError');

/** A write the owner can reject early (release, generation change): its delivery to the screen, not the write itself. */
export type PendingWrite = { valid: () => boolean; fail: () => void };
/** Flight control one owner (a hook instance or a host instance) gives the sends it starts. */
export type WriteFlight = {
  /** The unsettled send of this slot; `run` and every `retry` share it. */
  slot: { promise: Promise<ActionResult<any>> | null };
  pending: Set<PendingWrite>;
  /** Origin lifetime and generation: false once the owner is gone or the session generation changed since the first send. */
  valid: () => boolean;
  /** Permanent end of the origin (owner released or unmounted, generation changed); unlike `valid()` false while only suspended. */
  expired?: () => boolean;
  /** Host only: defers while the instance is only suspended, rejects once released. */
  /** Called with true when a send starts and false when it settles (hook `pending`). */
  busy?: (on: boolean) => void;
  gate?: <R>(start: () => Promise<R>) => Promise<R>;
};

/**
 * Starts `send` under `flight`: single-flight per slot, delivery only while `valid()`, every `retry` the answer carries is
 * wrapped in the same control (recursively). The send itself is never cancelled, so epochs still bump on a rejected delivery.
 */
export function launchWrite<T>(flight: WriteFlight, send: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  // A retained retry of an expired origin never joins or occupies a slot: it must not see another generation's answer.
  if (flight.expired?.()) return Promise.reject(abortError());
  if (flight.slot.promise) return flight.slot.promise;
  const start = () => new Promise<ActionResult<T>>((resolve, reject) => {
    if (!flight.valid()) return reject(abortError());
    const call: PendingWrite = { valid: flight.valid, fail: () => { flight.pending.delete(call); reject(abortError()); } };
    flight.pending.add(call);
    send().then(result => {
      flight.pending.delete(call);
      if (!flight.valid()) return reject(abortError());
      const { retry } = result;
      resolve(retry ? { ...result, retry: () => launchWrite(flight, retry) } : result);
    });
  });
  const promise = flight.gate ? flight.gate(start) : start();
  flight.slot.promise = promise;
  flight.busy?.(true);
  const clear = () => { if (flight.slot.promise === promise) flight.slot.promise = null; flight.busy?.(false); };
  promise.then(clear, clear);
  return promise;
}

export type MenuActionState<I, T> = {
  ready: boolean;
  /** True from send until the answer (retries included). */
  pending: boolean;
  /**
   * One write. While a previous `run` or `retry` of this hook instance is unsettled, returns that promise and the new
   * input is ignored. Rejects `AbortError` when the component unmounted or the session generation changed before the answer.
   */
  run: (input: I, options?: { expectedVersion?: string }) => Promise<ActionResult<T>>;
};

/** Declared server write for a menu screen (ADR-0054): `{ ready, pending, run }`. */
export function useMenuAction<I, T>(spec: ActionSpec<I, T>): MenuActionState<I, T> {
  const platform = usePlatform();
  const latest = useRef(platform);
  const mounted = useRef(false);
  const [owner] = useState(() => ({ slot: { promise: null as Promise<ActionResult<T>> | null }, pending: new Set<PendingWrite>() }));
  const [pending, setPending] = useState(false);
  useLayoutEffect(() => {
    latest.current = platform;
    for (const call of [...owner.pending]) if (!call.valid()) call.fail();
  });
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; for (const call of [...owner.pending]) call.fail(); };
  }, [owner]);

  const ready = actionReady(spec, platform);
  const run = useCallback((input: I, options?: { expectedVersion?: string }): Promise<ActionResult<T>> => {
    if (owner.slot.promise) return owner.slot.promise;
    const now = latest.current;
    const request = actionRequest(spec, input, options?.expectedVersion, now);
    if (!request.ready) return Promise.resolve(request.notReady());
    const origin = { revision: now.revision, user: now.user.id };
    const sameGeneration = () => latest.current.revision === origin.revision && latest.current.user.id === origin.user;
    const flight: WriteFlight = {
      ...owner, busy: on => { if (mounted.current) setPending(on); },
      valid: () => mounted.current && sameGeneration(),
      expired: () => !mounted.current || !sameGeneration(),
    };
    return launchWrite(flight, request.send);
  }, [spec, owner]);
  return { ready, pending, run };
}
