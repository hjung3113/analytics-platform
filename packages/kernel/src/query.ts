import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlatform } from './platform';
import { projectContext, type ApiResponse, type AssessmentKind, type EndpointSpec, type EntityRef, serializeGlobal } from '@ap/contracts';

export type QueryState<T> = {
  /** loading: no result for the current Context yet. refreshing: same Context re-query, prior result kept. */
  status: 'loading' | 'refreshing' | 'done';
  response: ApiResponse<T> | null;
  refetch: () => void;
};

/**
 * Platform request lifecycle (§11/§19). The identity of a result is (adapter revision, user, identity scope, page inputs):
 * when it changes the previous result is hidden immediately and late responses are discarded. The revision covers
 * server-side changes the URL cannot show (session switch, dev response scenario). identity 'context' (default)
 * includes the global Context; 'session' drops it — a period/room/condition change neither refetches nor hides
 * the result (destination single-row lookup, docs/06 §22).
 */
export function usePlatformQuery<T>(run: (signal: AbortSignal) => Promise<ApiResponse<T>>, pageInputs: unknown = null, enabled = true, identity: 'context' | 'session' = 'context'): QueryState<T> {
  const { global, user, revision } = usePlatform();
  const key = JSON.stringify(identity === 'session'
    ? [revision, user.id, pageInputs]
    : [revision, user.id, serializeGlobal(global), pageInputs]);
  const [result, setResult] = useState<{ identity: string; response: ApiResponse<T> } | null>(null);
  const [tick, setTick] = useState(0);
  const [inFlight, setInFlight] = useState<{ identity: string; tick: number } | null>(null);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setInFlight({ identity: key, tick });
    runRef.current(controller.signal).then(response => {
      if (controller.signal.aborted) return;
      setResult({ identity: key, response });
      setInFlight(null);
    }).catch(error => {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      setResult({ identity: key, response: { outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'client-' + Date.now().toString(16), message: String(error) } });
      setInFlight(null);
    });
    return () => controller.abort();
  }, [key, tick, enabled]);

  const refetch = useCallback(() => setTick(t => t + 1), []);
  const current = result?.identity === key ? result.response : null;
  const busy = inFlight?.identity === key || (enabled && !current);
  return { status: !current ? 'loading' : busy ? 'refreshing' : 'done', response: current, refetch };
}

/**
 * One destination row by ref (docs/06 §22) via `adapter.getEntity`. Session identity: the row is keyed by
 * (revision, user, ref, pageInputs), so a global period/condition change does not refetch or hide it, while a
 * server-side change (revision) or a ref change does. The menu casts the result; the kernel stays type-agnostic.
 */
export function useEntityQuery<T>(ref: EntityRef, pageInputs: unknown = null, enabled = true): QueryState<T> {
  const { adapter } = usePlatform();
  return usePlatformQuery<T>(
    signal => adapter.getEntity(ref, signal) as Promise<ApiResponse<T>>,
    [ref, pageInputs],
    enabled,
    'session',
  );
}

function hasExactAssessmentKinds(actual: readonly { kind: AssessmentKind }[], expected: readonly AssessmentKind[]): boolean {
  if (actual.length !== expected.length) return false;

  const remaining = new Map<AssessmentKind, number>();
  for (const kind of expected) remaining.set(kind, (remaining.get(kind) ?? 0) + 1);
  for (const assessment of actual) {
    const count = remaining.get(assessment.kind);
    if (count === undefined || count === 0) return false;
    remaining.set(assessment.kind, count - 1);
  }
  return [...remaining.values()].every(count => count === 0);
}

/**
 * Queries one declared menu endpoint through the platform adapter. Results use session identity
 * `[revision, user.id, spec.id, projectContext(spec, global), params]`: Context keys the endpoint does not apply
 * do not invalidate the result, while applied keys and session changes hide it immediately.
 *
 * A `requiresScope` endpoint waits until the selected Scope is server-validated for the current user and matches the Context.
 * `MenuMeta.requiresScope` means Scope must be selected and validated before a page queries data, so the Kernel
 * enforces that rule once instead of requiring every page to duplicate the gate. Params use the existing
 * `JSON.stringify` query key; callers should pass objects with a stable key order.
 * Endpoints applying time wait for an absolute `from` and `to`; 06 §6.3 defaults are materialized before the query.
 * The explicit-empty envelope bypasses kind checks only when the projected request contains an applied empty set, per 06 §6 명시적 공집합.
 */
export function useMenuQuery<P, T>(spec: EndpointSpec<P, T>, params: NoInfer<P>, enabled = true): QueryState<T> {
  const { adapter, global, scope, user } = usePlatform();
  const projected = projectContext(spec, global);
  const scopeReady = !spec.requiresScope || (scope.status === 'valid' && scope.scopeId === global.scopeId && scope.validatedFor === user.id);
  const periodReady = spec.context.time !== 'apply' || (global.from !== null && global.to !== null);

  return usePlatformQuery<T>(async signal => {
    const response = await adapter.menuQuery({ endpoint: spec.id, context: projected, params }, signal);
    const requestedEmpty = [projected.selection, projected.roomNames, projected.lotIds, projected.recipeIds]
      .some(value => Array.isArray(value) && value.length === 0);
    const explicitEmpty = requestedEmpty && response.outcome === 'empty' && response.assessments.length === 0 && response.trust === null;
    if ((response.outcome === 'ok' || response.outcome === 'empty') && !explicitEmpty && !hasExactAssessmentKinds(response.assessments, spec.kinds)) {
      const got = `[${response.assessments.map(({ kind }) => kind).join(', ')}]`;
      const declared = `[${spec.kinds.join(', ')}]`;
      return {
        outcome: 'error',
        data: null,
        trust: null,
        assessments: [],
        correlationId: response.correlationId,
        message: `contract_violation: assessments ${got} ≠ declared ${declared}`,
      };
    }
    return response as ApiResponse<T>;
  }, [spec.id, projected, params], enabled && scopeReady && periodReady, 'session');
}

export type RequestState<T> = { status: 'loading' | 'done' | 'error'; data: T | null; retry: () => void };

/**
 * Same lifecycle as usePlatformQuery for plain adapter calls (shell editors): the result is keyed by
 * (adapter revision, user, key); when that changes the previous data is hidden at once and late replies are dropped.
 */
export function useAdapterRequest<T>(run: (signal: AbortSignal) => Promise<T>, key: unknown, enabled = true): RequestState<T> {
  const { user, revision } = usePlatform();
  const identity = JSON.stringify([revision, user.id, key]);
  const [result, setResult] = useState<{ identity: string; state: Omit<RequestState<T>, 'retry'> } | null>(null);
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => { setResult(null); setTick(t => t + 1); }, []);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    runRef.current(controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ identity, state: { status: 'done', data } });
    }).catch(error => {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      setResult({ identity, state: { status: 'error', data: null } });
    });
    return () => controller.abort();
  }, [identity, enabled, tick]);

  return result?.identity === identity ? { ...result.state, retry } : { status: 'loading', data: null, retry };
}
