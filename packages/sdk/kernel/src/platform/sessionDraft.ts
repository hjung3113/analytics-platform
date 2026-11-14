/** Generation-local, memory-only input. Never contains query results. */
export type SessionDraftEntry = { owner: string; value: unknown };
export type SessionDraftStore = { owner: string; gen: string; entries: Map<string, SessionDraftEntry>; mounts: Map<string, number> };

export function createSessionDraftStore(owner: string, gen: string, previous?: SessionDraftStore): SessionDraftStore {
  // Copy, never mutate the previous render's map: its screens still have cleanup and async callbacks to run.
  return { owner, gen, entries: previous?.owner === owner ? new Map(previous.entries) : new Map(), mounts: new Map() };
}
