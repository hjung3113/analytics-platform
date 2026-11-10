# log-knowledge module

Owns the `knowledge` schema: catalog, model spec revisions, SW changes, Items, drafts, imports. Contracts: `docs/architecture/platform-api/api/log-knowledge.md`. Reads and writes reach other modules only through the barrel `index.ts`.

## Read port for other modules (`knowledgeLookup`, `knowledge-lookup.ts`)

- `getModel`, `getSoftware` — existence and activity of a model / software version in the workspace.
- `listModels`, `listSoftware` — picker options; the required trailing `viewerActorId` filters rows and totals before paging.
- `getEffectiveSpecPin` — revision id and change-set digest of the effective spec (log-lifecycle).
- `listEffectiveRequirements(tx, workspaceId, modelId, softwareId | null, viewerActorId)` — requirement keys (`moduleKey`, `moduleKey/eventKey`) of the effective spec with its pin, states `ok | no_spec | model_unknown | ambiguous_key` (log-rules coverage). Key functions: `domain/requirement-key.ts`.

## Invariants of the port

- The caller passes a verified workspace; the port decides **no permission** — the caller owns the entry permission. Object access requires the trailing `viewerActorId`: a model or SW version hidden from that actor answers like a missing one. Every caller, including a system Actor, passes the viewer.
- Every statement is scoped to `workspace_id`; reads `knowledge.*` only; writes nothing.
- A pin and the data derived with it come from one read under `lockModelChanges`, never from two separate calls. Keep callers aligned with the required viewer argument (log-lifecycle and log-rules use the same barrel).
- Keys are used exactly as stored. A key containing `/` makes a requirement key ambiguous: the port answers `ambiguous_key` instead of returning it.

## Draft evidence intake

- `draftEvidenceIntake` (barrel, `draft-evidence-intake.ts`) lets the log explorer create a `needs_check` draft or append pointers to the caller's own draft inside the explorer's transaction. It runs the same cores as the draft actions (`draft-core.ts`) — change draft rules there, not in two places.
  - Denied right = `['target'] forbidden`; `unresolved` pointers are refused; a hash mismatch is marked `[해시 불일치]` ("hash mismatch") on the note; pointer mapping is `domain/evidence-intake.ts`. The module never imports `log-explorer`.

## Top View pointer

`knowledge.model_topview_link` (`repositories/topview-link.ts`, `domain/topview-resolution.ts`, `topview-endpoints.ts`, `topview-actions.ts`) points a model — from a start SW, or as the model default — at a published Layout Revision of the `eqv` module; the Hub owns the pointer only. The document is read through `eqv/read-service.ts` (approved surface), never by importing an eqv repository. Reads follow the Hub model ACL (no `eqv:view`); link and unlink are `knowledge.catalog.manage`, versioned per (model, start SW) row, audited as `knowledge.model_topview.linked|unlinked`. Resolution: greatest start-SW `release_order` ≤ the target's, else the model default, else unlinked. Contract: `docs/architecture/platform-api/api/log-knowledge.md` «Model Top View pointer».

## Object access

- One rule, one place: `domain/access-visibility.ts` (pure) and `repositories/access-visibility.ts` (SQL: `visibleModelSql`, `visibleSoftwareSql`, `visibleItemSql`, `canSee*`, `lockOwnerAccess`). Never write a second copy of the rule; a new read or write that reaches a model, SW version or Item (or a row that names one) takes a `Viewer` and goes through these.
- A hidden object is **not found**: same outcome as a missing id (`data: null` / empty page / `not_found` field error). No name, count, version or id of a hidden object in a list, total, count, error text or audit detail of another actor.
- Lock helpers take a `Viewer` and return null / not found when hidden; their callers pass `viewerOf(actor)`.
- Managing (`access-actions.ts`, `access-endpoints.ts`, `repositories/access-write.ts`) is judged by `knowledge.access.manage`, not by visibility, and is where access changes enter the search outbox (`setAccessMode`, `insertRule`, `revokeRule`).

## Search index

- Derived and rebuildable: `search_document` (one row per Item per generation), `search_outbox` (payload-free «rebuild Item X»), `search_index_pointer`, `search_backfill_progress`. No ACL, excerpt or 지식 근거 ("knowledge evidence") text in any of them; visibility stays a query-time rule (ADR-0124).
- Writers enqueue in the SAME transaction at the single write functions: `item-write.ts` (`insertItem`, `appendRevision`, `setPublicationState`), `access-write.ts`, `concept.ts` (`reviewMapping`), `catalog-write.ts` (`updateRow`, `setRowActive`); all go through `repositories/search-outbox.ts`.
  - A new write that changes published state, the latest Revision, an owner, a concept mapping or an access rule calls it too.
- The consumer (`repositories/search-index.ts`, jobs in `search-index-jobs.ts`) is a service path: it takes no actor, never reads or writes an access rule, and builds a document only from the source's current values under a per-Item advisory lock.

## Search read

- `SearchPort` (`repositories/search-port.ts`) is candidate generation only and knows nothing about access: the caller hands it an opaque `guard` (the single `visibleItemSql` predicate) that the adapter applies to the Item id inside the statement that produces candidates, counts and suggestions. A new adapter must pass `__tests__/search-port-contract.ts`.
  - Never add an unfiltered count, autocomplete or candidate path.
- `repositories/search-read.ts` is the pipeline (interpret → port → live display → related count); display values come from the latest Revision and the Item row at read time, never from the index.
  - Query interpretation is `domain/search-query.ts` (pure): direction only from the explicit relation or a closed operator between two Event tokens. Concept expansion reads confirmed `equivalent` mappings of models the viewer may see only.
- No exact total anywhere in the answer; the query text is never logged or audited. Contract: `docs/architecture/platform-api/api/log-knowledge.md` «Knowledge search».
