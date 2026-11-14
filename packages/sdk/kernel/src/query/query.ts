import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { hashKey, useQuery, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { QueryMissing } from './query-draft';
import { narrowedGlobal } from './condition-preset';
import { useHostPlatform, useQueryEngine } from '../platform/platform';
import { clientCorrelationId, compareAuditEvents, projectContext, type ApiResponse, type AssessmentKind, type AuditEvent, type EndpointSpec, type EntityAuditPage, type EntityRef, type MenuQueryContext, serializeGlobal } from '@ap/contracts';
import { useCursorPages, type CursorMore, type CursorMoreError, type CursorMoreLast, type CursorMoreStatus, type FirstPage } from '../audit/cursor-pages';

export type QueryState<T> = {
  /** loading: no result for the current Context yet. refreshing: same Context re-query, prior result kept. */
  status: 'idle' | 'loading' | 'refreshing' | 'done';
  missing: readonly QueryMissing[];
  completedAt: number | null;
  response: ApiResponse<T> | null;
  refetch: () => void;
  /**
   * `useMenuQuery` with `keepPrevious` on only (ADR-0114): the `params` the displayed result was loaded with; undefined while no
   * result is shown, and always undefined when the option is off or for any other hook.
   * It differs from the caller's current params while a kept result shows.
   */
  resultParams?: unknown;
  /**
   * `useMenuQuery` with `keepPrevious` on only: true while a kept result is shown whose params differ (same structural comparison as the query key)
   * from the current ones, false for a live result; undefined (not false) when the option is off, so a screen can tell opted-in queries apart.
   */
  showingPrevious?: boolean;
};

/**
 * Platform request lifecycle (§11/§19) on the Kernel's internal query client (ADR-0086). The identity of a result is
 * (session generation = adapter, revision, user; identity scope; page inputs): when it changes the previous result is
 * hidden immediately and late responses are discarded. The revision covers server-side changes the URL cannot show
 * (session switch, dev response scenario). identity 'context' (default) includes the global Context; 'session' drops it —
 * a period/room/condition change neither refetches nor hides the result (destination single-row lookup, docs/06 §22).
 * `refreshEpoch` is outside the identity: a change refetches like `refetch()` (prior result kept, `refreshing`).
 * The key carries a per-instance id, because `run` is the caller's: no sharing across instances.
 */
export function usePlatformQuery<T>(run: (signal: AbortSignal) => Promise<ApiResponse<T>>, pageInputs: unknown = null, enabled = true, identity: 'context' | 'session' = 'context', refreshEpoch = 0): QueryState<T> {
  const { global } = useHostPlatform();
  const instance = useId();
  return useQueryLifecycle(['platform', instance, identity === 'session' ? null : serializeGlobal(global), pageInputs], run, enabled, refreshEpoch, null);
}

function errorEnvelope(error: unknown): ApiResponse<never> {
  return { outcome: 'error', data: null, assessments: [], trust: null, correlationId: clientCorrelationId(), message: String(error) };
}

type Accepted = { key: string; scope: string; data: unknown; at: number; params: unknown };

/** Opt-in of {@link useMenuQuery} (ADR-0114). */
export type MenuQueryOptions = {
  /**
   * When only the endpoint's own `params` change (same session generation, projected Context and endpoint, gate open), keep the
   * last result this hook accepted as `refreshing` until the new result arrives. Default false: a params change hides the result.
   */
  keepPrevious?: boolean;
};

/** The idle gate hides prior results (§19): when it closes, the same-identity result of the open gate is not kept for a later reopening. */
function useDropOnIdle(client: QueryClient, openKey: QueryKey, hash: string, isIdle: boolean): void {
  useEffect(() => {
    if (!isIdle) return;
    const query = client.getQueryCache().find({ queryKey: openKey, exact: true });
    if (query && query.getObserversCount() === 0) client.removeQueries({ queryKey: openKey, exact: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `hash` stands for the structurally compared `openKey`
  }, [client, hash, isIdle]);
}

/** Calls `refetch` when `refreshEpoch` changes after the first render, through the same guard as `refetch()`. */
function useRefreshEpoch(refreshEpoch: number, refetch: () => void): void {
  const seen = useRef(refreshEpoch);
  useEffect(() => {
    if (seen.current === refreshEpoch) return;
    seen.current = refreshEpoch;
    refetch();
  }, [refreshEpoch, refetch]);
}

/**
 * The engine under every envelope hook. `parts` is the identity after the session generation: key = [kind, gen, ...parts].
 * While `enabled` the hook shows the key's cached/fetched result (a same-identity result still in memory is `refreshing`
 * while it is re-read); while not enabled it shows only a result it accepted while enabled (§19 `enabled=false`), so an
 * unready pane never shows another pane's result and a reply landing after the disable is never shown (it is cancelled
 * when no enabled observer of the key remains). `keepScope` (opt-in; the identity parts after `kind` without the page inputs)
 * lets an enabled hook keep its last accepted `ok`/`empty` result as `refreshing` while a key that differs only in page inputs
 * loads; the kept result keeps its own `completedAt`, and any reply of the new key (also an error) replaces it.
 */
function useQueryLifecycle<T>(parts: readonly [string, ...unknown[]], run: (signal: AbortSignal) => Promise<ApiResponse<T>>, enabled: boolean, refreshEpoch: number, idle: readonly QueryMissing[] | null, keepScope?: readonly unknown[], paramsInfo?: { value: unknown }): QueryState<T> {
  const { client, gen } = useQueryEngine();
  const isIdle = idle !== null;
  const [kind, ...rest] = parts;
  const queryKey = [kind, gen, ...rest, isIdle];
  const hash = hashKey(queryKey);
  const scopeHash = hashKey([kind, gen, ...(keepScope ?? []), isIdle]);
  const active = enabled && !isIdle;
  const query = useQuery<ApiResponse<T>>({
    queryKey,
    queryFn: async ({ signal }) => {
      try {
        return await run(signal);
      } catch (error) {
        // Only the Kernel's own abort means superseded (#183); any other rejection — even an adapter-internal AbortError
        // timeout — is the normal error path (error outcome + retry), like validateScope since #167.
        if (signal.aborted) throw error;
        return errorEnvelope(error);
      }
    },
    enabled: active,
  }, client);
  const openKey = [kind, gen, ...rest, false];
  useDropOnIdle(client, openKey, hashKey(openKey), isIdle);

  const [accepted, setAccepted] = useState<Accepted | null>(null);
  const live: Accepted | null = active && query.data !== undefined ? { key: hash, scope: scopeHash, data: query.data, at: query.dataUpdatedAt, params: paramsInfo?.value } : null;
  if (live && (accepted?.key !== hash || accepted.scope !== live.scope || accepted.data !== live.data || accepted.at !== live.at)) setAccepted(live);
  else if (isIdle && accepted !== null) setAccepted(null);
  const same = !isIdle && accepted?.key === hash ? accepted : null;
  const kept = !live && !same && keepScope && active && accepted && accepted.scope === scopeHash && ['ok', 'empty'].includes((accepted.data as ApiResponse<unknown>).outcome) ? accepted : null;
  const shown = live ?? same ?? kept;

  const guard = useRef({ active });
  useLayoutEffect(() => { guard.current = { active }; });
  const { refetch: engineRefetch } = query;
  // TanStack's `refetch()` ignores `enabled`; a closed gate (06 §19) stays closed. `cancelRefetch: false` lets observers of one key share the request.
  const refetch = useCallback(() => { if (guard.current.active) void engineRefetch({ cancelRefetch: false }); }, [engineRefetch]);
  useRefreshEpoch(refreshEpoch, refetch);

  const extra = (result: Accepted | null) => !paramsInfo || !keepScope ? {} : {
    resultParams: result?.params,
    showingPrevious: result !== null && hashKey([result.params]) !== hashKey([paramsInfo.value]),
  };
  if (idle !== null) return { status: 'idle', response: null, missing: idle, completedAt: null, refetch, ...extra(null) };
  if (!shown) return { status: 'loading', response: null, missing: [], completedAt: null, refetch, ...extra(null) };
  return { status: active && (query.isFetching || kept) ? 'refreshing' : 'done', response: shown.data as ApiResponse<T>, missing: [], completedAt: shown.at, refetch, ...extra(shown) };
}

/**
 * One destination row by ref (docs/06 §22) via `adapter.getEntity`. Session identity: the row is keyed by
 * (revision, user, ref, pageInputs), so a global period/condition change does not refetch or hide it, while a
 * server-side change (revision) or a ref change does. The menu casts the result; the kernel stays type-agnostic.
 */
export function useEntityQuery<T>(ref: EntityRef, pageInputs: unknown = null, enabled = true): QueryState<T> {
  const { adapter } = useHostPlatform();
  return useQueryLifecycle<T>(['entity', ref, pageInputs], signal => adapter.getEntity(ref, signal) as Promise<ApiResponse<T>>, enabled, 0, null);
}

/** Older changes of one destination, appended after the first page (ADR-0085). `status` 'end' also covers a first page that was the whole list. */
export type AuditMore = CursorMore;

export type AuditMoreStatus = CursorMoreStatus;
export type AuditMoreError = CursorMoreError;
export type AuditMoreLast = CursorMoreLast;

/**
 * One destination's change history (docs/06 §13, ADR-0085) via `adapter.entityAudit`: `query` is the first page for
 * `QueryView` (session identity, like `useEntityQuery`: a global period change does not refetch), `timeline` is the
 * props of `AuditTimeline` — the first page plus every older page `more.load()` appended. The appended pages belong
 * to one first-page read: a ref, Scope, revision or user change, or a refetch of the same ref, drops them and the
 * list starts again from the first page. The page count is not in the URL.
 */
export function useEntityAudit(ref: EntityRef, enabled = true): { query: QueryState<EntityAuditPage>; timeline: { events: readonly AuditEvent[]; more: AuditMore } } {
  const { adapter } = useHostPlatform();
  const { client, gen } = useQueryEngine();
  const query = useQueryLifecycle<EntityAuditPage>(['audit', ref], signal => adapter.entityAudit({ type: ref.type, id: ref.id, scopeId: ref.scopeId }, signal), enabled, 0, null);
  // The read generation of the first page: bumped whenever a first-page read starts (the cache event of the key's fetch
  // action, which no batching can swallow), so the appended pages belong to one read even when the adapter answers a
  // refetch with the very same response object.
  const hash = hashKey(['audit', gen, ref, false]);
  const [read, setRead] = useState({ hash, n: 0 });
  // A new identity (ref, session generation) is a new read too; the cache event covers the reads of the same identity.
  let current = read;
  if (read.hash !== hash) { current = { hash, n: read.n + 1 }; setRead(current); }
  const generation = current.n;
  useEffect(() => client.getQueryCache().subscribe(event => {
    if (event.type === 'updated' && event.action.type === 'fetch' && event.query.queryHash === hash) setRead(prev => ({ ...prev, n: prev.n + 1 }));
  }), [client, hash]);
  const { response, status } = query;
  const first = useMemo<FirstPage<AuditEvent> | null>(() => response && {
    key: generation,
    settled: status === 'done',
    items: response.outcome === 'ok' ? response.data?.events ?? [] : [],
    nextCursor: response.outcome === 'ok' ? response.data?.nextCursor ?? null : null,
  }, [response, status, generation]);
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
  return projectContext(spec, spec.menuId === route?.menu.id ? narrowedGlobal(route.menu, page, global) : global);
}

/**
 * The request gates shared by useMenuQuery, useMenuFetch and the module host port: Scope validated for this session,
 * absolute period when time applies, no drill gap in the page (06 §6.4), Context projection and the assessment check. Not a hook.
 */
export function menuRequest<P, T>(spec: EndpointSpec<P, T>, inputs: MenuRequestInputs) {
  const { adapter, global, scope, session, queryPolicy } = inputs;
  const projected = projectMenuContext(spec, inputs);
  const scopeReady = !spec.requiresScope || (scope.status === 'valid' && scope.scopeId === global.scopeId && scope.validatedFor === session);
  const periodReady = spec.context.time !== 'apply' || (global.from !== null && global.to !== null);
  const send = async (params: P, signal?: AbortSignal): Promise<ApiResponse<T>> =>
    checkMenuResponse(spec, projected, await adapter.menuQuery({ endpoint: spec.id, context: projected, params }, signal));
  const notReady = (): ApiResponse<T> => ({ outcome: 'error', data: null, assessments: [], trust: null, correlationId: clientCorrelationId(), message: `not_ready: ${spec.id} waits for a validated Scope and period` });
  // Sidebar sources belong to their endpoint's menu, so another screen's Apply/drill gate cannot block them.
  const ownScreen = spec.menuId === inputs.route?.menu.id;
  const screenReady = !ownScreen || (queryPolicy.ready && !queryPolicy.idle && !queryPolicy.drillGap);
  const missing = ownScreen && queryPolicy.idle ? queryPolicy.missing : null;
  return { projected, ready: scopeReady && periodReady && screenReady, missing, send, notReady };
}

/** `useMenuQuery` result: `QueryState` with `resultParams` typed as the endpoint's `P` (the params the shown result was loaded with). */
export type MenuQueryState<P, T> = QueryState<T> & { resultParams?: P };

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
 * `options.keepPrevious` (opt-in, ADR-0114): when only `params` change, the last `ok`/`empty` result this hook accepted stays as
 * `refreshing` (with its own `completedAt`) until the new reply arrives, and any reply of the new params replaces it. A change of
 * session generation, projected Context (Scope, period, …) or endpoint, or a closed or idle gate, still hides the result at once.
 * `resultParams` is the params the shown result was loaded with and `showingPrevious` is true while a kept result with other params
 * shows (both are `undefined` unless `keepPrevious` is on): build titles, drill/click handlers, exports and writes from `resultParams` (not the current selection) while it is true.
 */
export function useMenuQuery<P, T>(spec: EndpointSpec<P, T>, params: NoInfer<P>, enabled = true, options?: MenuQueryOptions): MenuQueryState<P, T> {
  const platform = useHostPlatform();
  const { projected, ready, missing, send } = menuRequest(spec, platform);
  // `resultParams` is the `params` object handed to the lifecycle below, so it is a `P`; the engine layer types it `unknown`.
  return useQueryLifecycle<T>(['menu', spec.id, projected, params], signal => send(params, signal), enabled && ready, 0, missing, options?.keepPrevious ? [spec.id, projected] : undefined, { value: params }) as MenuQueryState<P, T>;
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

/**
 * The refresh epoch of the listed endpoints (ADR-0054): the sum of their bump counts, so it changes exactly when a write
 * whose `invalidates` names one of them succeeded (or conflicted or was unknown). A component that reads through
 * a caller-driven `fetch` (PlatformDataTable `refreshOn`) folds it into its request identity to read again.
 */
export function useEndpointRefreshEpoch(endpointIds: readonly string[]): number {
  const { refreshEpochs } = useHostPlatform();
  // Joined ids are a stable primitive, so an inline array does not resubscribe or change the snapshot function.
  const key = endpointIds.join('\u0000');
  const getSnapshot = useCallback(() => (key === '' ? [] : key.split('\u0000')).reduce((sum, id) => sum + refreshEpochs.get(id), 0), [refreshEpochs, key]);
  return useSyncExternalStore(refreshEpochs.subscribe, getSnapshot);
}

export type RequestState<T> = { status: 'loading' | 'done' | 'error'; data: T | null; retry: () => void };

/**
 * Same lifecycle as usePlatformQuery for plain adapter calls (shell editors): the result is keyed by
 * (session generation, key); when that changes the previous data is hidden at once and late replies are dropped.
 * The key carries a per-instance id: no sharing across instances.
 */
export function useAdapterRequest<T>(run: (signal: AbortSignal) => Promise<T>, key: unknown, enabled = true): RequestState<T> {
  const { client, gen } = useQueryEngine();
  const instance = useId();
  const queryKey = ['request', gen, instance, key];
  const query = useQuery<{ ok: true; data: T } | { ok: false }>({
    queryKey,
    queryFn: async ({ signal }) => {
      try {
        return { ok: true, data: await run(signal) };
      } catch (error) {
        // Only the Kernel's own abort means superseded (#183); an adapter-internal AbortError is the error path.
        if (signal.aborted) throw error;
        return { ok: false };
      }
    },
    enabled,
  }, client);
  // Hides, then loads again: the reset drops the key's data before the refetch.
  const retry = useCallback(() => { void client.resetQueries({ queryKey, exact: true }); }, [client, hashKey(queryKey)]); // eslint-disable-line react-hooks/exhaustive-deps -- the hash stands for `queryKey`
  const { data } = query;
  if (data === undefined) return { status: 'loading', data: null, retry };
  return data.ok ? { status: 'done', data: data.data, retry } : { status: 'error', data: null, retry };
}
