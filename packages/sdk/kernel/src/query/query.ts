import { useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ContextType } from 'react';
import { hashKey, useQuery, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { QueryMissing } from './query-draft';
import { bindQueryRecovery } from './recovery-evidence';
import { narrowedGlobal } from './condition-preset';
import { LentPanelQueryContext } from './lent-panel-context';
import { useHostPlatform, useQueryEngine } from '../platform/platform';
import { useScopeValidationId } from '../platform/hooks';
import { clientCorrelationId, compareAuditEvents, CUSTOM_GROUP_AXIS, projectContext, type ApiResponse, type AssessmentKind, type AuditEvent, type CustomGroupTarget, type EndpointSpec, type EntityAuditPage, type EntityRef, type MenuQueryContext, type SavedViewListItem, serializeGlobal, isAnswered } from '@ap/contracts';
import { customGroupItemId, customGroupReadState, expandCustomGroups } from '../saved-view/expand-custom-groups';
import { readEquipmentFacts } from '../scope/equipment-facts-cache';
import { readCustomGroupList } from '../saved-view/custom-group-list-cache';
import type { QueryEngine } from './query-engine';
import { useCursorPages, type CursorMore, type CursorMoreError, type CursorMoreLast, type CursorMoreStatus, type FirstPage } from '../audit/cursor-pages';

/**
 * Lifecycle of one request as a screen sees it. loading: no result for the current Context yet. refreshing: same Context re-query,
 * prior result kept. This is the *request's* vocabulary; `RequestState` (below) is the action/mutation one, which has no `refreshing`.
 */
export type QueryStatus = 'idle' | 'loading' | 'refreshing' | 'done';

export type QueryState<T> = {
  /** See {@link QueryStatus}. */
  status: QueryStatus;
  missing: readonly QueryMissing[];
  completedAt: number | null;
  response: ApiResponse<T> | null;
  refetch: () => void;
  /** Pause this observer. The engine aborts transport when the last observer pauses. */
  cancel?: () => void;
  cancelled?: true;
  /** Last successful read available on error, within this session and query identity. */
  previousResult?: { response: ApiResponse<T>; completedAt: number; params?: unknown };
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
  return useQueryLifecycle(['platform', instance, identity === 'session' ? null : serializeGlobal(global), pageInputs], async signal => ({ response: await run(signal) }), enabled, refreshEpoch, null);
}

/** A rejected read is transient only when the producer supplies an explicit platform error name. */
export function isTransientReadError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'NetworkError');
}

function errorEnvelope(error: unknown): ApiResponse<never> {
  return { outcome: 'error', data: null, assessments: [], trust: null, correlationId: clientCorrelationId(), message: String(error),
    ...(isTransientReadError(error) ? { recovery: { retryable: true } } : {}) };
}

type ReadResult<T> = { response: ApiResponse<T>; notSent?: true };
type QueryAnswer<T> = ReadResult<T> & { request: number };
type Accepted<T> = { key: string; scope: string; answer: QueryAnswer<T>; at: number; params: unknown };

function discardsPrevious(answer: ReadResult<unknown>): boolean {
  return answer.response.outcome === 'forbidden' || answer.notSent === true;
}

// Order reads by their start, including in-flight reads and reads within the same millisecond.
let lastRequest = 0;

/** Opt-in of {@link useMenuQuery} (ADR-0114). */
export type MenuQueryOptions = {
  /**
   * Gate for the request: false sends nothing and shows no result (the same as the positional `enabled` it replaces). Default true.
   * When the positional `enabled` is also given both must be true.
   */
  enabled?: boolean;
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
function useQueryLifecycle<T>(parts: readonly [string, ...unknown[]], run: (signal: AbortSignal) => Promise<ReadResult<T>>, enabled: boolean, refreshEpoch: number, idle: readonly QueryMissing[] | null, keepScope?: readonly unknown[], options?: { params: unknown; requestReady: boolean }): QueryState<T> {
  const { client, gen } = useQueryEngine();
  const isIdle = idle !== null;
  const [kind, ...rest] = parts;
  const queryKey = [kind, gen, ...rest, isIdle];
  const hash = hashKey(queryKey);
  const scopeHash = hashKey([kind, gen, ...(keepScope ?? []), isIdle]);
  const ready = enabled && !isIdle;
  const [cancelledKey, setCancelledKey] = useState<string | null>(null);
  const cancelled = ready && cancelledKey === hash;
  if (cancelledKey !== null && !cancelled) setCancelledKey(null);
  const active = ready && !cancelled;
  const [gate, setGate] = useState({ ready, discardThrough: 0 });
  const reopened = ready && !gate.ready;
  const discardThrough = reopened ? lastRequest : gate.discardThrough;
  if (gate.ready !== ready) setGate({ ready, discardThrough });

  const query = useQuery<QueryAnswer<T>>({
    queryKey,
    queryFn: async ({ signal }) => {
      const request = ++lastRequest;
      try {
        const result = await run(signal);
        return { ...result, request };
      } catch (error) {
        // Only the Kernel's own abort means superseded (#183); any other rejection — even an adapter-internal AbortError
        // timeout — is the normal error path, like validateScope since #167.
        if (signal.aborted) throw error;
        return { response: errorEnvelope(error), request };
      }
    },
    enabled: active,
  }, client);
  const openKey = [kind, gen, ...rest, false];
  useDropOnIdle(client, openKey, hashKey(openKey), isIdle);

  const [accepted, setAccepted] = useState<Accepted<T> | null>(null);
  const answer = query.data;
  const fresh = answer !== undefined && answer.request > discardThrough;
  const revoked = ready && fresh && discardsPrevious(answer);
  const live = fresh && (active || revoked)
    ? { key: hash, scope: scopeHash, answer, at: query.dataUpdatedAt, params: options?.params } : null;
  if (live && (accepted?.key !== hash || accepted.scope !== live.scope || accepted.answer !== live.answer || accepted.at !== live.at)) setAccepted(live);
  else if (!live && accepted && (isIdle || reopened || options?.requestReady === false)) setAccepted(null);
  const same = !isIdle && !reopened && options?.requestReady !== false && accepted?.key === hash ? accepted : null;
  const kept = !live && !same && !reopened && keepScope && active && accepted && accepted.scope === scopeHash && isAnswered(accepted.answer.response.outcome) ? accepted : null;
  const shown = live ?? same ?? kept;

  const [lastSuccess, setLastSuccess] = useState<Accepted<T> | null>(null);
  const prior = ready && !reopened && lastSuccess && (keepScope ? lastSuccess.scope === scopeHash : lastSuccess.key === hash) ? lastSuccess : null;
  if (live?.answer.response.outcome === 'ok') {
    if (prior?.at !== live.at || prior.key !== live.key || prior.answer !== live.answer) setLastSuccess(live);
  } else if (lastSuccess && (!prior || revoked)) setLastSuccess(null);

  const guard = useRef({ ready });
  useLayoutEffect(() => { guard.current = { ready }; });
  const { refetch: engineRefetch } = query;
  // Re-enabling may join a peer's in-flight read. If it predates this gate, read again once it settles.
  const needsFreshAnswer = active && answer !== undefined && !fresh && query.fetchStatus === 'idle';
  useEffect(() => {
    if (needsFreshAnswer) void engineRefetch({ cancelRefetch: false });
  }, [needsFreshAnswer, engineRefetch]);
  // TanStack's `refetch()` ignores `enabled`; a closed gate (06 §19) stays closed. `cancelRefetch: false` lets observers of one key share the request.
  const refetch = useCallback(() => {
    if (!guard.current.ready) return;
    setCancelledKey(null);
    void engineRefetch({ cancelRefetch: false });
  }, [engineRefetch]);
  const pause = useCallback(() => setCancelledKey(hash), [hash]);
  useRefreshEpoch(refreshEpoch, refetch);

  const extra = (result: Accepted<T> | null) => !options || !keepScope ? {} : {
    resultParams: result?.params,
    showingPrevious: result !== null && hashKey([result.params]) !== hashKey([options.params]),
  };
  if (idle !== null) return { status: 'idle', response: null, missing: idle, completedAt: null, refetch, ...extra(null) };
  const response = shown?.answer.response ?? null;
  const status = cancelled ? 'done' : !shown ? 'loading' : active && (query.isFetching || kept) ? 'refreshing' : 'done';
  const cancel = active && query.fetchStatus !== 'idle' ? pause : undefined;
  const previousResult = prior && !revoked && (response?.outcome === 'error' || response?.outcome === 'timeout')
    ? { response: prior.answer.response, completedAt: prior.at, params: prior.params } : undefined;
  const showCancelled = cancelled && !(shown && discardsPrevious(shown.answer));
  return { status, response, missing: [], completedAt: shown?.at ?? null, refetch, cancel, cancelled: showCancelled || undefined, previousResult, ...extra(shown) };
}

/**
 * One destination row by ref (docs/06 §22) via `adapter.getEntity`. Session identity: the row is keyed by
 * (revision, user, ref, pageInputs), so a global period/condition change does not refetch or hide it, while a
 * server-side change (revision) or a ref change does. The menu casts the result; the kernel stays type-agnostic.
 */
export function useEntityQuery<T>(ref: EntityRef, pageInputs: unknown = null, enabled = true): QueryState<T> {
  const { adapter } = useHostPlatform();
  return useQueryLifecycle<T>(['entity', ref, pageInputs], async signal => ({ response: await adapter.getEntity(ref, signal) as ApiResponse<T> }), enabled, 0, null);
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
  const query = useQueryLifecycle<EntityAuditPage>(['audit', ref], async signal => ({ response: await adapter.entityAudit({ type: ref.type, id: ref.id, scopeId: ref.scopeId }, signal) }), enabled, 0, null);
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
  if ((isAnswered(response.outcome)) && !explicitEmpty && !hasExactAssessmentKinds(response.assessments, spec.kinds)) {
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
export type MenuRequestInputs = Pick<ReturnType<typeof useHostPlatform>, 'adapter' | 'global' | 'page' | 'route' | 'scope' | 'session' | 'queryPolicy' | 'savedViewStore'> & { queryEngine: QueryEngine };

/** The Context a menu request carries: `projectContext` over the global Context narrowed to the screen's applied Condition preset (06 §6.4). */
export function projectMenuContext<P, T>(spec: EndpointSpec<P, T>, { global, page, route }: Pick<MenuRequestInputs, 'global' | 'page' | 'route'>, options?: { detached?: boolean }): MenuQueryContext {
  return projectContext(spec, !options?.detached || spec.menuId === route?.menu.id ? narrowedGlobal(route?.menu, page, global) : global);
}

function aborted(signal?: AbortSignal): boolean { return signal?.aborted === true; }
function queryError<T>(message: string): ApiResponse<T> {
  return { outcome: 'error', data: null, assessments: [], trust: null, correlationId: clientCorrelationId(), message };
}
/** Resolves the reserved platform axis just before transport; neither URL state nor the query identity is rewritten. */
async function expandedMenuContext<T>(inputs: MenuRequestInputs, projected: MenuQueryContext, signal?: AbortSignal): Promise<MenuQueryContext | ApiResponse<T>> {
  const condition = projected.condition;
  const chosen = condition?.[CUSTOM_GROUP_AXIS];
  if (!chosen?.length) return projected;
  const ids = [...new Set(chosen)];
  if (!('selection' in projected)) return queryError(`customGroup blocked: ${ids.join(', ')} (endpoint cannot receive custom-group members; Selection must apply)`);
  const scopeId = inputs.global.scopeId;
  if (!scopeId) return queryError(`customGroup blocked: ${ids.join(', ')} (a current Scope is required)`);
  if (inputs.scope.status !== 'valid' || inputs.scope.scopeId !== scopeId || inputs.scope.validatedFor !== inputs.session) {
    return queryError(`customGroup blocked: ${ids.join(', ')} (Scope ${scopeId} is ${inputs.scope.status})`);
  }
  const store = inputs.savedViewStore;
  if (!store) return queryError(`customGroup blocked: ${ids.join(', ')} (saved-view store is unavailable)`);
  let listed: readonly SavedViewListItem[];
  try {
    listed = await readCustomGroupList(inputs.queryEngine.client, inputs.queryEngine.gen, store, inputs.session.user.id, signal);
  } catch (error) {
    if (aborted(signal)) throw error;
    return queryError(`customGroup expansion blocked: saved groups could not load (${error instanceof Error ? error.message : String(error)})`);
  }
  if (aborted(signal)) throw new DOMException('aborted', 'AbortError');
  const byId = new Map(listed.map(item => [customGroupItemId(item), item]));
  const groups: Record<string, CustomGroupTarget | { denied: string }> = Object.create(null);
  for (const id of ids) {
    const state = customGroupReadState(byId.get(id), scopeId);
    groups[id] = 'denied' in state ? state : state.target;
  }
  const denied = Object.entries(groups).flatMap(([id, target]) => 'denied' in target ? [{ id, reason: target.denied }] : []);
  if (denied.length) return queryError(`customGroup blocked: ${denied.map(({ id, reason }) => `${id} (${reason})`).join(', ')}`);
  if (!inputs.adapter.listEquipmentFacts) return queryError('customGroup expansion blocked: listEquipmentFacts is not implemented');
  let facts;
  try {
    facts = await readEquipmentFacts(inputs.queryEngine.client, inputs.queryEngine.gen, inputs.adapter, scopeId, signal);
  } catch (error) {
    if (aborted(signal)) throw error;
    return queryError(`customGroup expansion blocked: equipment facts could not load (${error instanceof Error ? error.message : String(error)})`);
  }
  if (aborted(signal)) throw new DOMException('aborted', 'AbortError');
  const expanded = expandCustomGroups({ condition: condition ?? null, selection: projected.selection ?? null, groups, facts: facts.items });
  if (!expanded.ok) return queryError(`customGroup blocked: ${expanded.denied.map(({ id, reason }) => `${id} (${reason})`).join(', ')}`);
  const context: MenuQueryContext = { ...projected };
  if ('condition' in context) context.condition = expanded.condition ?? null;
  if ('selection' in context) context.selection = expanded.selection;
  return context;
}

/**
 * The request gates shared by useMenuQuery, useMenuFetch and the module host port: Scope validated for this session,
 * absolute period when time applies, no drill gap in the page (06 §6.4), Context projection and the assessment check. Not a hook.
 */
export function menuRequest<P, T>(spec: EndpointSpec<P, T>, inputs: MenuRequestInputs, options?: { detached?: boolean; lent?: ContextType<typeof LentPanelQueryContext> }) {
  const { adapter, global, scope, session, queryPolicy } = inputs;
  const lent = options?.lent;
  const projected = lent ? projectContext(spec, lent.context) : projectMenuContext(spec, inputs, options);
  // A lent implementation can only read through the source specifications that passed registration.
  const endpointAllowed = !lent || lent.source.endpoints.some(endpoint => endpoint === spec);
  const scopeReady = !spec.requiresScope || (scope.status === 'valid' && scope.scopeId === global.scopeId && scope.validatedFor === session);
  const groupReadPending = Boolean(projected.condition?.[CUSTOM_GROUP_AXIS]?.length) && scope.status === 'validating';
  const periodReady = spec.context.time !== 'apply' || (global.from !== null && global.to !== null);
  const transport = async (context: MenuQueryContext, params: P, signal?: AbortSignal): Promise<ApiResponse<T>> => {
    if (aborted(signal) || (lent && !lent.current())) throw new DOMException('aborted', 'AbortError');
    // Copy the request Context before transport so recovery cannot bind to adapter-mutated inputs.
    const submitted = structuredClone(context);
    const projectedKey = hashKey([projected]);
    const response = await adapter.menuQuery({ endpoint: spec.id, context, params }, signal);
    if (aborted(signal) || (lent && !lent.current())) throw new DOMException('aborted', 'AbortError');
    const checked = checkMenuResponse(spec, submitted, response);
    return lent ? checked : bindQueryRecovery(checked, submitted, inputs,
      host => hashKey([projectMenuContext(spec, host, options)]) === projectedKey, signal);
  };
  // Without a chosen custom group the adapter is called in the same tick as before; only expansion adds awaits.
  const read = (params: P, callerSignal?: AbortSignal): Promise<ReadResult<T>> => {
    const signal = lent && callerSignal ? AbortSignal.any([lent.signal, callerSignal]) : lent?.signal ?? callerSignal;
    if (lent && (aborted(signal) || !lent.current())) return Promise.reject(new DOMException('aborted', 'AbortError'));
    const sendContext = (context: MenuQueryContext) => transport(context, params, signal).then(response => ({ response }));
    if (!projected.condition?.[CUSTOM_GROUP_AXIS]?.length) return sendContext(projected);
    return expandedMenuContext<T>(inputs, projected, signal).then(outgoing => {
      if ('outcome' in outgoing) return { response: outgoing, notSent: true };
      return sendContext(outgoing);
    });
  };
  const send = (params: P, signal?: AbortSignal) => read(params, signal).then(({ response }) => response);
  const notReady = (): ApiResponse<T> => ({ outcome: 'error', data: null, assessments: [], trust: null, correlationId: clientCorrelationId(), message: `not_ready: ${spec.id} waits for a validated Scope and period` });
  // A detached sidebar fetch follows the screen's Apply/drill gate only for that screen's own endpoints.
  // Screen panels keep their gate even when their endpoint belongs to another menu.
  const ownScreen = !!lent || !options?.detached || spec.menuId === inputs.route?.menu.id;
  // Declared option sources are auxiliary reads: requiring a completed query to choose its required inputs deadlocks Apply.
  const optionSource = options?.detached && spec.menuId === inputs.route?.menu.id && inputs.route.menu.pageConditions?.categories.some(({ kind }) => {
    if (kind.type === 'groupedChecks' || kind.type === 'tree') return kind.source === spec.id;
    return (kind.type === 'select' || kind.type === 'multi') && 'endpoint' in kind.options && kind.options.endpoint === spec.id;
  });
  const screenReady = !ownScreen || (queryPolicy.ready && (optionSource || (!queryPolicy.idle && !queryPolicy.drillGap)));
  const missing = ownScreen && queryPolicy.idle ? queryPolicy.missing : null;
  return { projected, ready: endpointAllowed && scopeReady && !groupReadPending && periodReady && screenReady, missing, read, send, notReady };
}

/** `useMenuQuery` result: `QueryState` with `resultParams` typed as the endpoint's `P` (the params the shown result was loaded with). */
export type MenuQueryState<P, T> = QueryState<T> & {
  resultParams?: P;
  previousResult?: NonNullable<QueryState<T>['previousResult']> & { params?: P };
};

/**
 * Queries one declared menu endpoint through the platform adapter. Result identity includes the session generation,
 * endpoint, projected Context and params. Scope-guarded reads also include the screen's accepted validation.
 * Context keys the endpoint does not apply do not invalidate the result, while applied keys and session changes hide it immediately.
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
export function useMenuQuery<P, T>(spec: EndpointSpec<P, T>, params: NoInfer<P>, options?: MenuQueryOptions): MenuQueryState<P, T>;
/** The positional `enabled` form is deprecated: pass `{ enabled }` in `options` (an unnamed boolean says nothing at the call site). It keeps working. */
export function useMenuQuery<P, T>(spec: EndpointSpec<P, T>, params: NoInfer<P>, enabled?: boolean, options?: MenuQueryOptions): MenuQueryState<P, T>;
export function useMenuQuery<P, T>(spec: EndpointSpec<P, T>, params: NoInfer<P>, third?: boolean | MenuQueryOptions | undefined, fourth?: MenuQueryOptions): MenuQueryState<P, T> {
  const options = typeof third === 'object' ? third : fourth;
  const enabled = (typeof third === 'boolean' ? third : true) && (options?.enabled ?? true);
  const platform = useHostPlatform();
  const scopeValidationId = useScopeValidationId();
  const queryEngine = useQueryEngine();
  const lent = useContext(LentPanelQueryContext);
  const { projected, ready, missing, read } = menuRequest(spec, { ...platform, queryEngine }, { lent });
  // `resultParams` is the `params` object handed to the lifecycle below, so it is a `P`; the engine layer types it `unknown`.
  const identity = [spec.id, projected, lent?.instanceId ?? null,
    spec.requiresScope || projected.condition?.[CUSTOM_GROUP_AXIS]?.length ? scopeValidationId : null] as const;
  const parts = ['menu', ...identity, params] as const;
  return useQueryLifecycle<T>(parts, signal => read(params, signal), enabled && ready, 0, missing, options?.keepPrevious ? identity : undefined, { params, requestReady: ready }) as MenuQueryState<P, T>;
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
  const platform = useHostPlatform();
  const queryEngine = useQueryEngine();
  const lent = useContext(LentPanelQueryContext);
  const { ready, send, notReady } = menuRequest(spec, { ...platform, queryEngine }, { detached: true, lent });
  const fetch = (params: P, signal?: AbortSignal): Promise<ApiResponse<T>> => ready && (!lent || lent.current())
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

/** Answers a component keeps for its own caller-driven reads (`useKeptAnswers`). */
export type KeptAnswers = {
  /** The answer kept under `key` in this session generation, or `undefined`. */
  read: <T>(key: readonly unknown[]) => T | undefined;
  keep: <T>(key: readonly unknown[], value: T) => void;
};

/**
 * Answers a component keeps for the reads it drives itself (PlatformDataTable `loadPage`, 06 §15), held in the Kernel query engine
 * (ADR-0086) so a remounted component shows what it already read. Keys live under the session generation: a user, adapter or revision
 * change drops them, and an entry leaves the engine after the engine's gcTime (5 minutes) from when it was first kept. The caller owns the
 * key (it must name everything the answer depends on) and decides what is worth keeping.
 */
export function useKeptAnswers(): KeptAnswers {
  const { client, gen } = useQueryEngine();
  return useMemo(() => ({
    read: <T>(key: readonly unknown[]) => client.getQueryData<T>(['kept', gen, ...key]),
    keep: <T>(key: readonly unknown[], value: T) => { client.setQueryData<T>(['kept', gen, ...key], value); },
  }), [client, gen]);
}

export type RequestState<T> = { status: 'loading' | 'done' | 'error'; data: T | null; retry: () => void };

/**
 * Same lifecycle as usePlatformQuery for plain adapter calls (shell editors): the result is keyed by
 * (session generation, key); when that changes the previous data is hidden at once and late replies are dropped.
 * The default key carries a per-instance id: no sharing across instances. `shared` opts into one kept request
 * per generation/key, reused until retry or query-engine GC; callers must include every request input in the key.
 */
export function useAdapterRequest<T>(run: (signal: AbortSignal) => Promise<T>, key: unknown, enabled = true, options: { shared?: boolean } = {}): RequestState<T> {
  const { client, gen } = useQueryEngine();
  const instance = useId();
  const queryKey = ['request', gen, options.shared ? 'shared' : instance, key];
  const query = useQuery<{ ok: true; data: T } | { ok: false }>({
    queryKey,
    staleTime: options.shared ? Infinity : 0,
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
