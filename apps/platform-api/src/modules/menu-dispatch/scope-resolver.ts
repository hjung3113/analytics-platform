/** Site and room grants, independent of menu capabilities (ADR-0147). */
export type ScopeGrant = { site: string; rooms: readonly string[] };

export interface ScopeResolver {
  resolve(
    actor: { actor_id: string; workspace_id: string },
    signal?: AbortSignal,
  ): Promise<readonly ScopeGrant[]>;
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
