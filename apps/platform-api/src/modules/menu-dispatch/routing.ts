import type { DeclarationBundle } from './declarations-file.js';
import type { Route, Routing } from './bundle/routing.js';
import { routeCall } from './bundle/routing.js';
import type { ValueMap } from './bundle/targets.js';
import type { ConnectorFactories } from './connectors/types.js';
import type { EndpointHandlerArgs } from './types.js';

export function allowedRooms(appliesRooms: boolean, args: EndpointHandlerArgs): string[] {
  const granted = [...new Set(args.scopes.filter((grant) => grant.site === args.context.scopeId).flatMap((grant) => [...grant.rooms]))];
  const requested = args.context.roomNames;
  return appliesRooms && Array.isArray(requested) ? [...new Set(requested as string[])] : granted;
}
export interface SelectedLeg { route: Route; targetId: string; rooms: string[] }
export function selectRoutes(owner: Routing, site: string | null, rooms: readonly string[]): { ok: true; legs: SelectedLeg[] } | { ok: false } {
  if (site !== null && rooms.length === 0) return { ok: true, legs: [] };
  const routes = owner.routes.filter((route) => site === null ? route.sites === undefined : route.sites?.includes(site));
  if (!routes.length) return { ok: false };
  if (owner.unroutedRooms !== 'skip' && rooms.some((room) => !routes.some((route) => route.rooms === undefined || route.rooms.includes(room)))) return { ok: false };
  return { ok: true, legs: routes.flatMap((route) => {
    const share = route.rooms === undefined ? [...rooms] : rooms.filter((room) => route.rooms?.includes(room));
    return site !== null && share.length === 0 ? [] : route.targets.map((targetId) => ({ route, targetId, rooms: share }));
  }) };
}
/** Route-level axes override target-level axes; missing entries in an explicit axis fail closed. */
export function effectiveValueMap(target: ValueMap | undefined, route: ValueMap | undefined): ValueMap {
  return { ...target, ...route };
}
export function mapValue(value: string, map: Record<string, string> | undefined, inverse = false): string | undefined {
  if (!map) return value;
  return inverse ? Object.entries(map).find(([, mapped]) => mapped === value)?.[0] : Object.hasOwn(map, value) ? map[value] : undefined;
}
export function routedBootProblems(bundle: DeclarationBundle, factories: ConnectorFactories, scopeCatalog?: Readonly<Record<string, readonly string[]>>): string[] {
  const problems: string[] = [];
  for (const endpoint of bundle.endpoints) {
    const owner = bundle.endpointOwners[endpoint.id];
    if (!owner || typeof owner === 'string') continue;
    if (owner.merge?.partial !== undefined || endpoint.paramKeys.some((key) => ['page', 'pageSize', 'cursor'].includes(key))) problems.push('fan-out merge is not available yet (ADR-0153 node 1839d2)');
    for (const route of owner.routes) for (const id of route.targets) {
      const target = bundle.targets?.[id];
      if (target && !factories[target.kind]) problems.push(`connector kind ${target.kind} is not available`);
      if (target?.kind === 'sql') {
        if (target.dialect === 'mssql') problems.push('sql dialect mssql is not available yet (ADR-0153 node 1839b2)');
        else if ('procedure' in routeCall(owner, route) || (owner.scopeCheck?.mode === 'resolve-keys' && 'procedure' in owner.scopeCheck.lookup)) {
          problems.push('sql procedure calls are not available for dialect postgres');
        }
      }
    }
    if (scopeCatalog && owner.unroutedRooms !== 'skip') {
      for (const [site, rooms] of Object.entries(scopeCatalog)) {
        const split = owner.routes.filter((route) => route.sites?.includes(site) && route.rooms !== undefined);
        if (!split.length) continue;
        for (const room of rooms) if (!split.some((route) => route.rooms?.includes(room))) problems.push(`endpoint ${endpoint.id}: site ${site}: room ${room} is not covered by a route`);
      }
    }
  }
  return [...new Set(problems)];
}
