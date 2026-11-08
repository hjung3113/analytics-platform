# log-knowledge module

Owns the `knowledge` schema: catalog, model spec revisions, SW changes, Items, drafts, imports. Contracts: `docs/architecture/platform-api/api/log-knowledge.md`. Reads and writes reach other modules only through the barrel `index.ts`.

## Read port for other modules (`knowledgeLookup`, `knowledge-lookup.ts`)

- `getModel`, `getSoftware` — existence and activity of a model / software version in the workspace.
- `getEffectiveSpecPin` — revision id and change-set digest of the effective spec (log-lifecycle).
- `listEffectiveRequirements(tx, workspaceId, modelId, softwareId | null)` — requirement keys (`moduleKey`, `moduleKey/eventKey`) of the effective spec with its pin, states `ok | no_spec | model_unknown | ambiguous_key` (log-rules R-d, #1493). Key functions: `domain/requirement-key.ts`.

## Invariants of the port

- The caller passes a verified workspace; the port decides **no permission**. The caller owns the entry permission. There is no model-level ACL in log-knowledge today (spec reads use the menu permission only); do not assume the port filters restricted models. When a model-level ACL exists, add a variant that applies it here and in the API doc in the same change.
- Every statement is scoped to `workspace_id`; reads `knowledge.*` only; writes nothing.
- A pin and the data derived with it come from one read under `lockModelChanges`, never from two separate calls. Adding a method must not change the signature of an existing one (log-lifecycle uses the same barrel).
- Keys are used exactly as stored. A key containing `/` makes a requirement key ambiguous: the port answers `ambiguous_key` instead of returning it.

## Draft evidence intake (#1474)

- `draftEvidenceIntake` (barrel, `draft-evidence-intake.ts`) lets the log explorer create a `needs_check` draft or append pointers to the caller's own draft inside the explorer's transaction. It runs the same cores as the draft actions (`draft-core.ts`: `createDraft`, `updateDraft`, `lockOwn`) — change draft rules there, not in two places. Denied right = `['target'] forbidden`; `unresolved` pointers are refused; a hash mismatch is marked `[해시 불일치]` on the note; pointer mapping is `domain/evidence-intake.ts`. The module never imports `log-explorer`.
