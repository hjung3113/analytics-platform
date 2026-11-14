/** Site and room grants, independent of menu capabilities (ADR-0147). */
export type ScopeGrant = { site: string; rooms: readonly string[] };

export interface ScopeResolver {
  resolve(
    actor: { actor_id: string; workspace_id: string },
    signal?: AbortSignal,
  ): Promise<readonly ScopeGrant[]>;
}

/** The request Scope rule: a Site needs a nonempty grant and every recorded room must be granted.
 * Absent/null/empty rooms impose no additional room constraint, as in menu-query dispatch. */
export function hasRequestScope(context: Record<string, unknown>, scopes: readonly ScopeGrant[]): boolean {
  const site = scopes.filter(grant => grant.site === context.scopeId);
  if (typeof context.scopeId !== 'string' || !site.some(grant => grant.rooms.length > 0)) return false;
  const rooms = context.roomNames;
  return rooms == null || (Array.isArray(rooms) && rooms.every(room => typeof room === 'string' && site.some(grant => grant.rooms.includes(room))));
}

/** Test/dev fixture only. Do not re-export from the production module entry. */
export function createSyntheticScopeResolver(
  table: readonly { actor_id: string; workspace_id: string; grants: readonly ScopeGrant[] }[],
): ScopeResolver {
  const entries = structuredClone(table);
  return {
    async resolve(actor, signal) {
      signal?.throwIfAborted();
      const entry = entries.find((row) =>
        row.actor_id === actor.actor_id && row.workspace_id === actor.workspace_id);
      return structuredClone(entry?.grants ?? []);
    },
  };
}
