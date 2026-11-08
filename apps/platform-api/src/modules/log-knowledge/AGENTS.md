# log-knowledge module

Owns the `knowledge` schema: catalog, model spec revisions, SW changes, Items, drafts, imports. Contracts: `docs/architecture/platform-api/api/log-knowledge.md`. Reads and writes reach other modules only through the barrel `index.ts`.

## Read port for other modules (`knowledgeLookup`, `knowledge-lookup.ts`)

- `getModel`, `getSoftware` — existence and activity of a model / software version in the workspace.
- `getEffectiveSpecPin` — revision id and change-set digest of the effective spec (log-lifecycle).
- `listEffectiveRequirements(tx, workspaceId, modelId, softwareId | null, viewerActorId)` — requirement keys (`moduleKey`, `moduleKey/eventKey`) of the effective spec with its pin, states `ok | no_spec | model_unknown | ambiguous_key` (log-rules R-d, #1493). Key functions: `domain/requirement-key.ts`.

## Invariants of the port

- The caller passes a verified workspace; the port decides **no permission**. The caller owns the entry permission. Object access (#1504) requires the trailing `viewerActorId`: a model or SW version hidden from that actor answers like a missing one. Every caller, including a system Actor, passes the viewer.
- Every statement is scoped to `workspace_id`; reads `knowledge.*` only; writes nothing.
- A pin and the data derived with it come from one read under `lockModelChanges`, never from two separate calls. Keep callers aligned with the required viewer argument (log-lifecycle and log-rules use the same barrel).
- Keys are used exactly as stored. A key containing `/` makes a requirement key ambiguous: the port answers `ambiguous_key` instead of returning it.

## Object access (#1504 S-a)

- One rule, one place: `domain/access-visibility.ts` (pure) and `repositories/access-visibility.ts` (SQL: `visibleModelSql`, `visibleSoftwareSql`, `visibleItemSql`, `canSee*`, `visible*Ids`). Never write a second copy of the rule; a new read or write that reaches a model, SW version or Item (or a row that names one) takes a `Viewer` and goes through these.
- A hidden object is **not found**: same outcome, `data: null` / empty page / `not_found` field error as a missing id. No name, count, version or id of a hidden object in a list, total, count, error text or audit detail of another actor.
- Lock helpers (`lockRow`, `lockItem`, `lockDraft`, `lockRevision`, `lockChange`, `lockMapping`, `shareLockParent`, `checkOwner`, `readTargetItem`, `softwareOrders`, `modelExists`) take a `Viewer` and return null / not found when hidden. Their callers pass `viewerOf(actor)`.
- Managing (`access-actions.ts`, `access-endpoints.ts`, `repositories/access-write.ts`) is judged by `knowledge.access.manage`, not by visibility, and is the single place the search outbox (node S-c) is added.
