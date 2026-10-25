import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { QueryMissing } from './query-draft';
import { narrowedGlobal } from './condition-preset';
import { useHostPlatform } from './platform';
import { clientCorrelationId, instantEpochMs, projectContext, type ApiResponse, type AssessmentKind, type AuditEvent, type EndpointSpec, type EntityAuditPage, type EntityRef, type MenuQueryContext, serializeGlobal } from '@ap/contracts';
import { useCursorPages, type CursorMore, type FirstPage } from './cursor-pages';

export type QueryState<T> = {
  /** loading: no result for the current Context yet. refreshing: same Context re-query, prior result kept. */
  status: 'idle' | 'loading' | 'refreshing' | 'done';
  missing: readonly QueryMissing[];
  completedAt: number | null;
  response: ApiResponse<T> | null;
  refetch: () => void;
};

/**
 * Platform request lifecycle (§11/§19). The identity of a result is (adapter revision, user, identity scope, page inputs):
 * when it changes the previous result is hidden immediately and late responses are discarded. The revision covers
 * server-side changes the URL cannot show (session switch, dev response scenario). identity 'context' (default)
 * includes the global Context; 'session' drops it — a period/room/condition change neither refetches nor hides
 * the result (destination single-row lookup, docs/06 §22). `refreshEpoch` is outside the identity: a change refetches
 * like `refetch()` (prior result kept, `refreshing`).
 */
export function usePlatformQuery<T>(run: (signal: AbortSignal) => Promise<ApiResponse<T>>, pageInputs: unknown = null, enabled = true, identity: 'context' | 'session' = 'context', refreshEpoch = 0): QueryState<T> {
  return useQueryLifecycle(run, pageInputs, enabled, identity, refreshEpoch, null);
}

function useQueryLifecycle<T>(run: (signal: AbortSignal) => Promise<ApiResponse<T>>, pageInputs: unknown, enabled: boolean, identity: 'context' | 'session', refreshEpoch: number, idle: readonly QueryMissing[] | null): QueryState<T> {
  const { global, user, revision } = useHostPlatform();
  const key = JSON.stringify(identity === 'session'
    ? [revision, user.id, idle !== null, pageInputs]
    : [revision, user.id, idle !== null, serializeGlobal(global), pageInputs]);
  const [result, setResult] = useState<{ identity: string; response: ApiResponse<T>; completedAt: number } | null>(null);
  const [tick, setTick] = useState(0);
  const [inFlight, setInFlight] = useState<{ identity: string; tick: number } | null>(null);
  const isIdle = idle !== null;
  const runRef = useRef(run);
  useLayoutEffect(() => { runRef.current = run; });

  useEffect(() => {
    if (isIdle) { setResult(null); setInFlight(null); return; }
    if (!enabled) return;
    const controller = new AbortController();
    setInFlight({ identity: key, tick });
    runRef.current(controller.signal).then(response => {
      if (controller.signal.aborted) return;
      setResult({ identity: key, response, completedAt: Date.now() });
      setInFlight(null);
    }).catch(error => {
      // Only the Kernel's own abort means superseded (#183); any other rejection — even an adapter-internal
      // AbortError timeout — is the normal error path (error outcome + retry), like validateScope since #167.
      if (controller.signal.aborted) return;
      setResult({ identity: key, completedAt: Date.now(), response: { outcome: 'error', data: null, assessments: [], trust: null, correlationId: clientCorrelationId(), message: String(error) } });
      setInFlight(null);
    });
    return () => controller.abort();
  }, [key, tick, refreshEpoch, enabled, isIdle]);

  const refetch = useCallback(() => setTick(t => t + 1), []);
  if (idle !== null) return { status: 'idle', response: null, missing: idle, completedAt: null, refetch };
  const current = result?.identity === key ? result.response : null;
  const busy = inFlight?.identity === key || (enabled && !current);
  return { status: !current ? 'loading' : busy ? 'refreshing' : 'done', response: current, missing: [], completedAt: current ? result!.completedAt : null, refetch };
}

/**
 * One destination row by ref (docs/06 §22) via `adapter.getEntity`. Session identity: the row is keyed by
 * (revision, user, ref, pageInputs), so a global period/condition change does not refetch or hide it, while a
 * server-side change (revision) or a ref change does. The menu casts the result; the kernel stays type-agnostic.
 */
export function useEntityQuery<T>(ref: EntityRef, pageInputs: unknown = null, enabled = true): QueryState<T> {
  const { adapter } = useHostPlatform();
  return usePlatformQuery<T>(
    signal => adapter.getEntity(ref, signal) as Promise<ApiResponse<T>>,
    [ref, pageInputs],
    enabled,
    'session',
  );
}

/** Older changes of one destination, appended after the first page (ADR-0085). `status` 'end' also covers a first page that was the whole list. */
export type AuditMore = CursorMore;

/** Newest first by instant, id ascending on a tie — the order of the port and of `AuditTimeline`. */
function compareAuditEvents(a: AuditEvent, b: AuditEvent): number {
  const byAt = instantEpochMs(b.at) - instantEpochMs(a.at);
  return byAt !== 0 ? byAt : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * One destination's change history (docs/06 §13, ADR-0085) via `adapter.entityAudit`: `query` is the first page for
 * `QueryView` (session identity, like `useEntityQuery`: a global period change does not refetch), `timeline` is the
 * props of `AuditTimeline` — the first page plus every older page `more.load()` appended. The appended pages belong
 * to one first-page read: a ref, Scope, revision or user change, or a refetch of the same ref, drops them and the
 * list starts again from the first page. The page count is not in the URL.
 */
export function useEntityAudit(ref: EntityRef, enabled = true): { query: QueryState<EntityAuditPage>; timeline: { events: readonly AuditEvent[]; more: AuditMore } } {
  const { adapter } = useHostPlatform();
  const query = usePlatformQuery<EntityAuditPage>(
    signal => adapter.entityAudit({ type: ref.type, id: ref.id, scopeId: ref.scopeId }, signal),
    [ref],
    enabled,
    'session',
  );
  const { response, status } = query;
  const first = useMemo<FirstPage<AuditEvent> | null>(() => response && {
    key: response,
    settled: status === 'done',
    items: response.outcome === 'ok' ? response.data?.events ?? [] : [],
    nextCursor: response.outcome === 'ok' ? response.data?.nextCursor ?? null : null,
  }, [response, status]);
  const { items, more } = useCursorPages<AuditEvent>(
    first,
    async (cursor, signal) => {
      const next = await adapter.entityAudit({ type: ref.type, id: ref.id, scopeId: ref.scopeId, cursor }, signal);
      return { ...next, data: next.data && { items: next.data.events, nextCursor: next.data.nextCursor } };
    },
    { id: event => event.id, order: compareAuditEvents },
  );
  const timeline = useMemo(() => ({ events: items, more }), [items, more]);
  return { query, timeline };
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

/** Applied set keys sent as `[]`: the only requests whose `empty` reply may skip the kind check (06 §6 명시적 공집합). */
function requestedEmptySet(projected: MenuQueryContext): boolean {
  return [projected.selection, projected.roomNames, projected.lineNames, projected.prcGroups, projected.lotIds, projected.recipeIds]
    .some(value => Array.isArray(value) && value.length === 0);
}

/** Replaces an `ok`/`empty` reply whose assessment kinds differ from the declaration with a `contract_violation` error. */
function checkMenuResponse<P, T>(spec: EndpointSpec<P, T>, projected: MenuQueryContext, response: ApiResponse<unknown>): ApiResponse<T> {
  const explicitEmpty = requestedEmptySet(projected) && response.outcome === 'empty' && response.assessments.length === 0 && response.trust === null;
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
}

/** What the request gates read from the platform; a host port reads it at call time instead of from a hook. */
export type MenuRequestInputs = Pick<ReturnType<typeof useHostPlatform>, 'adapter' | 'global' | 'page' | 'route' | 'scope' | 'session' | 'queryPolicy'>;

/** The Context a menu request carries: `projectContext` over the global Context narrowed to the screen's applied Condition preset (06 §6.4). */
export function projectMenuContext<P, T>(spec: EndpointSpec<P, T>, { global, page, route }: Pick<MenuRequestInputs, 'global' | 'page' | 'route'>): MenuQueryContext {
  return projectContext(spec, narrowedGlobal(route?.menu, page, global));
}

/**
 * The request gates shared by useMenuQuery, useMenuFetch and the module host port: Scope validated for this session,
 * absolute period when time applies, Context projection and the assessment check. Not a hook.
 */
export function menuRequest<P, T>(spec: EndpointSpec<P, T>, inputs: MenuRequestInputs) {
  const { adapter, global, scope, session, queryPolicy } = inputs;
  const projected = projectMenuContext(spec, inputs);
  const scopeReady = !spec.requiresScope || (scope.status === 'valid' && scope.scopeId === global.scopeId && scope.validatedFor === session);
  const periodReady = spec.context.time !== 'apply' || (global.from !== null && global.to !== null);
  const send = async (params: P, signal?: AbortSignal): Promise<ApiResponse<T>> =>
    checkMenuResponse(spec, projected, await adapter.menuQuery({ endpoint: spec.id, context: projected, params }, signal));
  const notReady = (): ApiResponse<T> => ({ outcome: 'error', data: null, assessments: [], trust: null, correlationId: clientCorrelationId(), message: `not_ready: ${spec.id} waits for a validated Scope and period` });
  return { projected, ready: scopeReady && periodReady && queryPolicy.ready && !queryPolicy.idle, send, notReady };
}

/**
 * Queries one declared menu endpoint through the platform adapter. Results use session identity
 * `[revision, user.id, spec.id, projectContext(spec, global), params]`: Context keys the endpoint does not apply
 * do not invalidate the result, while applied keys and session changes hide it immediately.
 *
 * A `requiresScope` endpoint waits until the selected Scope is server-validated for the current session and matches the Context.
 * `MenuMeta.requiresScope` means Scope must be selected and validated before a page queries data, so the Kernel
 * enforces that rule once instead of requiring every page to duplicate the gate. Params use the existing
 * `JSON.stringify` query key; callers should pass objects with a stable key order.
 * Endpoints applying time wait for an absolute `from` and `to`; 06 §6.3 defaults are materialized before the query.
 * The explicit-empty envelope bypasses kind checks only when the projected request contains an applied empty set, per 06 §6 명시적 공집합.
 * A write that declares this endpoint in `invalidates` (ADR-0054) refetches it with the prior result kept (`refreshing`).
 */
export function useMenuQuery<P, T>(spec: EndpointSpec<P, T>, params: NoInfer<P>, enabled = true): QueryState<T> {
  const platform = useHostPlatform();
  const { projected, ready, send } = menuRequest(spec, platform);
  const { refreshEpochs } = platform;
  const epoch = useSyncExternalStore(refreshEpochs.subscribe, () => refreshEpochs.get(spec.id));
  return useQueryLifecycle<T>(signal => send(params, signal), [spec.id, projected, params], enabled && ready, 'session', epoch, platform.queryPolicy.idle ? platform.queryPolicy.missing : null);
}

export type MenuFetch<P, T> = {
  /** The same gates as useMenuQuery: Scope validated for this session, absolute period when the endpoint applies time. */
  ready: boolean;
  /** One request with the Context projected at call time; same request shape and assessment contract as useMenuQuery. */
  fetch: (params: P, signal?: AbortSignal) => Promise<ApiResponse<T>>;
};

/**
 * Caller-driven form of useMenuQuery for requests a component or user gesture starts — PlatformDataTable `loadPage`
 * (06 §15) and export. The caller owns result identity (the table keys pages on Context, user and revision). A call
 * before `ready` resolves to an error envelope without reaching the adapter, so a page that skipped the gate still
 * never sends an unvalidated Scope.
 */
export function useMenuFetch<P, T>(spec: EndpointSpec<P, T>): MenuFetch<P, T> {
  const { ready, send, notReady } = menuRequest(spec, useHostPlatform());
  const fetch = (params: P, signal?: AbortSignal): Promise<ApiResponse<T>> => ready
    ? send(params, signal)
    : Promise.resolve(notReady());
  return { ready, fetch };
}

export type RequestState<T> = { status: 'loading' | 'done' | 'error'; data: T | null; retry: () => void };

/**
 * Same lifecycle as usePlatformQuery for plain adapter calls (shell editors): the result is keyed by
 * (adapter revision, user, key); when that changes the previous data is hidden at once and late replies are dropped.
 */
export function useAdapterRequest<T>(run: (signal: AbortSignal) => Promise<T>, key: unknown, enabled = true): RequestState<T> {
  const { user, revision } = useHostPlatform();
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
    }).catch(() => {
      // Only the Kernel's own abort means superseded (#183); an adapter-internal AbortError is the error path.
      if (controller.signal.aborted) return;
      setResult({ identity, state: { status: 'error', data: null } });
    });
    return () => controller.abort();
  }, [identity, enabled, tick]);

  return result?.identity === identity ? { ...result.state, retry } : { status: 'loading', data: null, retry };
}
