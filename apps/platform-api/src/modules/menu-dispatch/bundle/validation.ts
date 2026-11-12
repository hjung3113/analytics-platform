import { bindingProblems, type ParamType } from './bindings.js';
import { callBindings, callKind, isEnvelope, statementProblems } from './calls.js';
import type { Routing } from './routing.js';
import type { Target } from './targets.js';
import type { ContextKey } from '../types.js';

/** Preserved verbatim for legacy string owners (ADR-0146). */
export const MAX_ROWS_REASON = 'limits.maxRows is refused on a declared endpoint: the engine would map an upstream ok to too_large, a Fastify-made outcome (ADR-0095 prohibition 7)';

interface EndpointRow {
  id: string;
  requiresScope: boolean;
  context: Partial<Record<ContextKey, unknown>>;
  paramKeys: readonly string[];
  paramTypes?: Record<string, ParamType> | undefined;
  limits?: { maxRows?: number | undefined } | undefined;
  kinds?: readonly string[] | undefined;
}

export function routingProblems(bundle: {
  endpoints: readonly EndpointRow[];
  endpointOwners: Readonly<Record<string, string | Routing>>;
  targets?: Readonly<Record<string, Target>> | undefined;
}): string[] {
  const problems: string[] = [];
  const targetSites = new Map<string, Set<string>>();
  for (const owner of Object.values(bundle.endpointOwners)) {
    if (typeof owner === 'string') continue;
    for (const route of owner.routes) for (const id of route.targets) {
      const sites = targetSites.get(id) ?? new Set<string>();
      for (const site of route.sites ?? []) sites.add(site);
      targetSites.set(id, sites);
    }
  }
  for (const endpoint of bundle.endpoints) {
    const owner = Object.hasOwn(bundle.endpointOwners, endpoint.id) ? bundle.endpointOwners[endpoint.id] : undefined;
    const at = `endpoint ${endpoint.id}`;
    const add = (problem: string) => problems.push(`${at}: ${problem}`);
    if (owner === undefined) continue;
    if (typeof owner === 'string') {
      if (endpoint.limits?.maxRows !== undefined) add(MAX_ROWS_REASON);
      continue;
    }
    const calls = owner.routes.map((route) => route.call ?? owner.call);
    const core = calls.some((call) => !isEnvelope(call));
    const paged = endpoint.paramKeys.some((key) => ['page', 'pageSize', 'cursor'].includes(key));
    if (core) {
      if (endpoint.requiresScope && !owner.scopeCheck) add('requiresScope core-answered endpoint needs scopeCheck');
      if (paged) {
        if (!endpoint.paramKeys.includes('page') || !endpoint.paramKeys.includes('pageSize') || endpoint.paramKeys.includes('cursor')) add('paged core-answered endpoint requires page and pageSize; cursor is not supported');
        if (owner.merge?.maxWindow === undefined) add('paged core-answered endpoint needs merge.maxWindow');
        if (endpoint.limits?.maxRows !== undefined) add('limits.maxRows is refused on a paged core-answered endpoint');
      } else if (endpoint.limits?.maxRows === undefined) add('non-paged core-answered endpoint needs limits.maxRows');
      if (endpoint.paramKeys.includes('filters')) add('filters is refused on a core-answered endpoint');
    }
    if (paged && owner.scopeCheck?.mode === 'drop-rows') add('scopeCheck.mode drop-rows is refused on a paged endpoint');
    if (paged && owner.merge?.partial !== undefined) add('merge.partial is refused on a paged endpoint');
    if (endpoint.limits?.maxRows !== undefined && calls.some(isEnvelope)) add('limits.maxRows is refused on an envelope destination');
    if (owner.merge?.partial === 'coverage' && !endpoint.kinds?.includes('coverage')) add('merge.partial coverage requires coverage in kinds');
    if (owner.merge?.sort && owner.merge.sort.at(-1)?.unique !== true) add('merge.sort last field must declare unique: true');
    for (const key of Object.keys(endpoint.paramTypes ?? {})) {
      if (!endpoint.paramKeys.includes(key)) add(`paramTypes ${key}: key is not in paramKeys`);
    }
    // Validate default calls even when all routes override them: unused declarations must not hide defects.
    for (const call of [owner.call, ...owner.routes.flatMap((route) => route.call ? [route.call] : [])]) {
      for (const problem of bindingProblems(callBindings(call), endpoint)) add(problem);
      if ('mode' in call && call.mode === 'mapped' && call.response.total !== undefined && !paged) add('response.total is only allowed on a paged endpoint');
    }
    if (owner.scopeCheck?.mode === 'resolve-keys') {
      for (const problem of bindingProblems([...callBindings(owner.scopeCheck.lookup), owner.scopeCheck.keys], endpoint)) add(problem);
      if (isEnvelope(owner.scopeCheck.lookup)) add('scopeCheck.lookup must be a non-envelope call');
    }
    for (const [index, route] of owner.routes.entries()) {
      const prefix = `route ${index}`;
      const call = route.call ?? owner.call;
      if (endpoint.requiresScope && route.sites === undefined) add(`${prefix}: requiresScope route needs sites`);
      if (!endpoint.requiresScope && (route.sites !== undefined || route.rooms !== undefined)) add(`${prefix}: scope-free route cannot declare sites or rooms`);
      if (new Set(route.targets).size !== route.targets.length) add(`${prefix}: duplicate target id`);
      if (new Set(route.sites).size !== (route.sites?.length ?? 0) || new Set(route.rooms).size !== (route.rooms?.length ?? 0)) add(`${prefix}: duplicate site or room`);
      if (isEnvelope(call) && route.targets.length > 1) add(`${prefix}: envelope call cannot select more than one target`);
      for (const id of route.targets) {
        const target = Object.hasOwn(bundle.targets ?? {}, id) ? bundle.targets?.[id] : undefined;
        if (!target) { add(`${prefix}: unknown target id ${id}`); continue; }
        if (callKind(call) !== target.kind) add(`${prefix}: call kind does not match target ${id}`);
        if (owner.scopeCheck?.mode === 'resolve-keys' && callKind(owner.scopeCheck.lookup) !== target.kind) add(`${prefix}: scopeCheck.lookup kind does not match target ${id}`);
        if (target.kind === 'sql') {
          for (const problem of statementProblems(call, target.dialect)) add(`${prefix}: target ${id}: call ${problem}`);
          if (owner.scopeCheck?.mode === 'resolve-keys') {
            for (const problem of statementProblems(owner.scopeCheck.lookup, target.dialect)) add(`${prefix}: target ${id}: scopeCheck.lookup ${problem}`);
          }
        }
        if (!isEnvelope(call) && endpoint.requiresScope && owner.scopeCheck) {
          const bindings = callBindings(call);
          const multiSite = (targetSites.get(id)?.size ?? 0) > 1;
          if (owner.scopeCheck.mode === 'verify-rows') {
            if (!bindings.includes('scope.rooms')) add(`${prefix}: verify-rows call must bind scope.rooms`);
            if (multiSite && !bindings.includes('scope.site')) add(`${prefix}: multi-site verify-rows call must bind scope.site`);
          }
          if (multiSite && owner.scopeCheck.mode !== 'resolve-keys' && owner.scopeCheck.siteField === undefined) add(`${prefix}: multi-site scopeCheck needs siteField`);
          if (owner.scopeCheck.mode === 'resolve-keys' && typeof owner.scopeCheck.keys !== 'string' && Array.isArray(owner.scopeCheck.keys.const) && owner.scopeCheck.keys.const.length === 0 && !bindings.includes('scope.rooms')) {
            add(`${prefix}: resolve-keys without keys must bind scope.rooms in the main call`);
          }
        }
      }
      for (let prior = 0; prior < index; prior++) {
        const other = owner.routes[prior];
        if (!other || !route.sites?.some((site) => other.sites?.includes(site))) continue;
        if ((route.rooms === undefined) !== (other.rooms === undefined)) add(`${prefix}: site mixes routes with and without rooms`);
        else if (route.rooms === undefined || route.rooms.some((room) => other.rooms?.includes(room))) add(`${prefix}: overlapping rooms for one site`);
      }
    }
  }
  return [...new Set(problems)];
}
