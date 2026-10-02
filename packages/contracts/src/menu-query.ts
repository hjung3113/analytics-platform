import type { AssessmentKind } from './response';
import type { Capability, ContextKey, Permission } from './menu';
import type { GlobalContext } from './url';

/** Menu endpoint declaration shared by the client and server. */
export type EndpointSpec<P, T> = {
  /** '<group>.<name>', globally unique transport key. */
  id: string;
  /** Owning menu manifest id; the Registry must contain it. */
  menuId: string;
  /** Runtime allow-list is Object.keys(spec.paramKeys); list every params key, including optional ones. */
  paramKeys: Readonly<Record<keyof P & string, true>>;
  /** Server endpoint ACL; permission is not sent in the request. */
  permission: Permission;
  /** Whether the endpoint requires and projects a scope. */
  requiresScope: boolean;
  /** Applied Context capabilities; an absent key is unsupported. */
  context: Partial<Record<ContextKey, Exclude<Capability, 'unsupported'>>>;
  /** Assessment kinds for which the server returns exactly one assessment each. */
  kinds: readonly AssessmentKind[];
  /**
   * Limits used for `too_large` assessment. `maxRows` is compared against the whole result size (not a page),
   * and is declared only on non-paged row-array endpoints (export, exploration); a selection export (ids in
   * params) is judged after the ids filter — i.e. against what the handler returns.
   */
  limits?: { maxHours?: number; maxRows?: number };
  /** Whether to merge the time-domain assessment (§6.3). */
  mergeTimeDomain: boolean;
  /** Phantom types only; no runtime value. */
  readonly _types?: { params: P; data: T };
};

/** Returns the endpoint declaration unchanged. */
export const defineEndpoint = <P, T>(spec: Omit<EndpointSpec<P, T>, '_types'>): EndpointSpec<P, T> => spec;

/**
 * Any endpoint for heterogeneous step 2 registries.
 * `P` is invariant: `paramKeys` is contravariant and phantom `params` is covariant,
 * so only `any` admits all specs.
 */
export type AnyEndpointSpec = EndpointSpec<any, unknown>;

/** Request Context includes only declared `apply` keys and `scopeId`. */
export type MenuQueryContext = Partial<GlobalContext>;

/** Request sent to the transport; permission, kinds, and compute are not included. */
export type MenuQuery<P = unknown> = { endpoint: string; context: MenuQueryContext; params: P };

/**
 * Projects GlobalContext in fixed query-identity order: `scopeId`, `from`, `to`, `roomNames`, `condition`, `selection`,
 * `lotIds`, `ppid`, `recipeIds`, `metricId`, `metricVersion`.
 * The result is a query identity and shares array and condition references with `g`; treat it as read-only.
 */
export function projectContext<P, T>(spec: EndpointSpec<P, T>, g: GlobalContext): MenuQueryContext {
  const context: MenuQueryContext = {};

  if (spec.requiresScope) context.scopeId = g.scopeId;
  if (spec.context.time === 'apply') {
    context.from = g.from;
    context.to = g.to;
  }
  if (spec.context.roomNames === 'apply') context.roomNames = g.roomNames;
  if (spec.context.condition === 'apply') context.condition = g.condition;
  if (spec.context.selection === 'apply') context.selection = g.selection;
  if (spec.context.lot === 'apply') context.lotIds = g.lotIds;
  if (spec.context.ppid === 'apply') context.ppid = g.ppid;
  if (spec.context.recipe === 'apply') context.recipeIds = g.recipeIds;
  if (spec.context.metric === 'apply') {
    context.metricId = g.metricId;
    context.metricVersion = g.metricVersion;
  }

  return context;
}
