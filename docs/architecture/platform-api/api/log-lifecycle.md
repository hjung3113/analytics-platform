# Log Lifecycle

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the development project, its append-only history and the validation rounds (#1444 node c): seven reads and seven writes of menu `log-models`, including the hierarchy read (#1449). Design and decisions: the log-lifecycle design (`docs/design/features/log-lifecycle/`) §3–§5 and ADR-0117. Manual validation attachments (node c2, #1451) are included (one read, one write; see below). Node d (#1445) adds the validation request queue: [§Validation request queue](#validation-request-queue-node-d-1445). Node e (#1446) adds the Gate decision: [§Gate decision](#gate-decision-node-e-1446). The seams between the nodes (service token → claim → result → verdict → Gate) are pinned by one chain test, `apps/platform-api/src/modules/log-lifecycle/__tests__/contract-chain.integration.test.ts` (#1450 h; `-t "contract chain"`).

## Human validation records — As-built (#1808 N1/N2)

Migration 0128 stores neutral `validation_issue` records under a project and first Round, append-only occurrences, evidence references, separate issue / Round comments and field corrections. Same-workspace composite FKs enforce parent ownership down to an optional attempt/rule-result. SQL walls and limits: [database document](../../../../apps/platform-api/docs/04-database-and-migrations.md#human-validation-issues--as-built-storage--api-not-yet-1808-n1).

All eleven surfaces belong to `log-models`, use no Context or Scope and require a human login session. Every API token (including `validation.worker`, `workspace.read` and scope-less tokens) receives `forbidden`. Reads require `platform:view` plus current workspace/project/first-Round visibility; linked occurrences also require their own Round visibility. Missing, foreign or hidden targets return `ok` + `null`, or `{ rows: [] }` for the issue list. Counts/activity exclude hidden objects. Discussion prose grants no Source access: excerpts remain exclusively behind the existing audited `excerpt` read and `lifecycle.excerpt.read`.

#### Immutable Round ownership (#2111)

A Round records `owner_model_id` and nullable `owner_software_id` from its locked project at creation. Both are immutable, independently of subsequent project SW changes. A recorded model with null SW means a model-only Round; null model means unresolved legacy ownership. Project visibility still follows its current model/SW. Round lists/details, requests, attempts, evidence (including attachment downloads), Gate history, summaries/counts and writes use the Round's recorded owner with the current knowledge object ACL. A visible project never makes a hidden historical Round visible. Queue SW labels use the recorded SW. Existing capability decisions and Source-owner checks are unchanged.

Migration 0133 leaves pre-migration owners unresolved. A spec pin identifies a model revision and a change digest, not an SW identity (multiple SWs can have the same digest); project events do not record a serialized Round-creation boundary. Neither the project's current SW nor event timestamps reliably establish the historical owner. These Rounds and their derived records are hidden from non-admin viewers. Admin with access to the project's immutable model may inspect/close the unresolved history, but cannot use it for an approving Gate decision; validation must use a newly opened Round. The migration does not guess an owner or grant additional table privileges.

Gate `approved` and `exception` require a resolved owner matching the project's current model/SW, including null equality. Otherwise the dispatch response is HTTP 200 `outcome: 'invalid'`, `fieldErrors: [{ path: ['roundId'], code: 'round_owner_unresolved' | 'round_owner_mismatch' }]`; no decision, stage change, event or audit is written. `gateAvailability.decisions` gives the same refusal reason. `rejected` remains a non-approving record under the existing rules. Close the old Round and open/validate a new Round for the current SW before approval. This preserves project editing and historical evidence without treating an old pass or exception as validation of a replacement SW.

## Reads

`POST /api/v1/menu-query`, prefix `logLifecycle.`:

| Endpoint | Params | Data |
| --- | --- | --- |
| `validationIssues` | `projectId?`, `roundId?`, `states?`, `cursor?`, `limit?` | `{ rows, nextCursor?, counts }`; rows contain id/project/first Round, corrected title, reporter/time, visible activity/time, `commentCount`, `occurrenceCount`, `roundCount`, `state` and `assigneeActorId` |
| `validationIssueDetail` | `issueId`, `cursor?`, `limit?` | corrected title/body/expected/actual/repro, reporter/time and `occurrences: { rows, nextCursor? }`, or null; occurrences contain Round/optional attempt/result ids and reference-only evidence |
| `validationIssueThread` | `issueId`, `cursor?`, `limit?` | issue comments `{ rows, nextCursor? }` or null |
| `validationIssueHistory` | `issueId`, `of?` (`corrections` default / `transitions`), `cursor?`, `limit?` | append-only field correction events, or with `of: 'transitions'` the state transitions by `seq`; `{ rows, nextCursor? }` or null |
| `roundDiscussion` | `roundId`, `cursor?`, `limit?` | Round comments `{ rows, nextCursor? }` or null; never issue comments |

Comment rows are `{ id, authorActorId, body, correctsCommentId, createdAt }`. History rows are `{ id, kind: 'field_corrected', field, body, correctsEventId, actorId, createdAt }`. Occurrence rows are `{ id, roundId, attemptId, ruleResultId, linkerActorId, createdAt, evidence: [{ fileRef, line, fileSha256 }] }`; hidden occurrences are omitted. Detail includes `id`, `projectId`, `firstRoundId`, `title`, `body`, `expected`, `actual`, `repro`, `reporterActorId`, `createdAt` and its occurrence page. List timestamps are `createdAt` and `lastActivityAt`; comment/occurrence/Round counts are `commentCount`, `occurrenceCount`, `roundCount`.

States (#1808 H3): `state` is the last transition's `toState`, or `reported` when there is none; `assigneeActorId` is that transition's assignee (null before the first one). Detail adds `state`, `assigneeActorId` and `lastTransition` (a transition row or null). Transition rows are `{ id, seq, fromState, toState, reason, assigneeActorId, basisCommentId, occurrenceId, duplicateOfIssueId, actorId, createdAt }`; a cited occurrence or duplicate issue the reader cannot see now is `null`. `states` (1–9 distinct state codes) narrows the list rows and is part of the cursor binding; `counts` = `{ open, closed, byState }` covers every visible issue of the project/Round filter at the page's cutoff, ignoring `states` (Round-level counts with `roundId`). Activity ordering counts transitions. The counts feed the Gate warning of N3; nothing blocks the Gate. The history transition cursor walks `seq` ascending.

Target/filter ids are UUIDs. Unknown keys, invalid values or cursors return `outcome: error`. Pages default to 50, maximum 100. Instance-scoped authenticated cursors expire after 30 minutes and bind workspace, actor, filters/target and limit. Issue lists sort visible activity/id descending; comments, corrections and occurrences sort timestamp/id ascending. The first-page timestamp cutoff excludes later inserts but is not a cross-request MVCC snapshot. Every page reevaluates current ACL before counts/activity. Detail's cursor pages only its occurrences. Reads write no audit.

### Actions

`POST /api/v1/menu-action`, prefix `logLifecycle.`, concurrency `none` (`version` for `validationIssueChangeState`); every write requires the existing session/CSRF checks and an `idempotencyKey` UUID:

| Action | Input | Capability | N1 command / audit event |
| --- | --- | --- | --- |
| `validationIssueRegister` | `projectId`, `firstRoundId`, `title`, `body`, `expected?`, `actual?`, `repro?` | `lifecycle.issue.contribute` | `create` / `lifecycle.validation_issue.created` |
| `validationIssueComment` | `issueId`, `body`, `correctsCommentId?` | contribute | `commentIssue` / `lifecycle.validation_issue.commented` |
| `validationIssueCorrect` | `issueId`, `field` (title/body/expected/actual/repro), `body`, `correctsEventId?` | contribute | `correctField` / `lifecycle.validation_issue.field_corrected` |
| `validationIssueLinkOccurrence` | `issueId`, `roundId`, `attemptId?`, `ruleResultId?` | `lifecycle.issue.link` | `linkOccurrence` / `lifecycle.validation_issue.occurrence_linked` |
| `validationIssueLinkEvidence` | `occurrenceId`, `refs: [{ fileRef, line, fileSha256 }]` | link | `linkEvidence` / `lifecycle.validation_issue.evidence_linked` |
| `roundDiscussionComment` | `roundId`, `body`, `correctsCommentId?` | contribute | `commentRound` / `lifecycle.round.commented` |
| `validationIssueChangeState` | `issueId`, `toState`, `reason?`, `assigneeActorId?`, `basisCommentId?`, `occurrenceId?`, `duplicateOfIssueId?`; frame `expectedVersion` = current seq | `lifecycle.issue.triage` (+ `lifecycle.gate.decide` and an `internal_member` human for `waived`) | `changeState` / `lifecycle.validation_issue.state_changed` |

Successful action `data`: registration and Round comments return `{ id }`; issue comments and field corrections return `{ id, issueId }`; occurrence links return `{ id, issueId, added }` (`added: false` for an existing tuple); evidence links return `{ id: occurrenceId, issueId, count }`, where count is newly added references. The standard menu-action envelope carries `version: null` and the replay flag. No write response contains prose or evidence locations.

The contribution declares menu permissions `lifecycle:issue-contribute` and `lifecycle:issue-link`. Both capabilities are workspace-only, non-sensitive, session-only explicit grants, with no Admin bypass or default role grant. User recipients are allowed. `lifecycle:issue-triage` (capability `lifecycle.issue.triage`, #1808 H3) has the same metadata but a User recipient is refused (supported-scope policy); `waived` also needs `lifecycle.gate.decide` (Admin bypass as for the Gate) and an `internal_member` actor; the rule lives in `transitionPolicy` only. Neither widens `lifecycle.round.manage` or Source rights. Closed Rounds accept registration and comments. Field corrections require the original reporter; comment corrections require the original author and same-target provenance. Originals remain immutable. Limits/normalization reuse `domain/validation-issue-input.ts` and `validation-issue-limits.ts`: title 200, prose 8,000, comments 4,000 characters; 20 evidence references per occurrence, all within Round samples, supplied hashes preserved. Unknown input keys and status/verdict/opinion/Gate inputs are rejected, never truncated.

Targets are checked before capability denial: a hidden/foreign target is `404 not_found.record`; a visible target without the capability is `forbidden`. Invalid input is `invalid` with field errors; failed storage provenance uses the same safe field errors. Locks follow project → Round → owner ACL, then recheck capability before writing. Row, audit and menu receipt share one transaction. Receipts contain only ids/counts; audits contain stable ids, enum field names and counts, never title/body/comment/fileRef. Duplicate occurrence/reference links add no duplicate audit. A replay rechecks capability, ownership and current target visibility and adds no audit. The existing menu-action frame hashes workspace/action/input for the actor/key: same content returns the saved result; changed content returns the framework's `outcome: error`, `idempotency_key_reuse` (its conflict signal, not a version conflict).

#### Issue states (#1808 H3)

Codes: `reported` (implicit initial), `investigating`, `fix_requested` (defect confirmed), `vendor_inquiry`, `on_hold` — open; `fix_verified`, `by_design`, `waived`, `dismissed` — closed. Legal moves (`domain/validation-issue-states.ts`, guard trigger `validation_issue_transition_guard`): `reported → investigating | dismissed`; `investigating → fix_requested | vendor_inquiry | on_hold | by_design | waived | dismissed`; `fix_requested → investigating | vendor_inquiry | on_hold | waived | fix_verified`; `vendor_inquiry → investigating | fix_requested | on_hold | by_design | waived`; `on_hold → investigating`; `fix_verified → investigating` (a person reopens on recurrence). `by_design`, `waived` and `dismissed` are terminal; a recurrence there adds occurrences only.

Required inputs: `assigneeActorId` (an actor of the workspace, self allowed) on every move except `reported → dismissed`; `reason` (plain text ≤ 4,000, secret patterns refused) on every move except the first `reported → investigating`; `basisCommentId` (a thread comment of the same issue) for `on_hold`, `waived`, and `by_design` from `vendor_inquiry` (the vendor's answer recorded by the assignee); `occurrenceId` only and always for `fix_verified`: an occurrence of this issue in a visible Round created after the issue entered `fix_requested`; `duplicateOfIssueId` optional and only with `dismissed`: another visible issue of the same project. Field errors: `toState/illegal_transition`, `<field>/required`, `<field>/not_allowed`, `assigneeActorId|basisCommentId|occurrenceId|duplicateOfIssueId/not_found`, `occurrenceId/round_too_early`, `duplicateOfIssueId/self`, `duplicateOfIssueId/other_project`.

Concurrency is the frame's `version`: `expectedVersion` is the issue's last `seq` as a string (`"0"` before the first transition); a stale one answers `conflict` with the current version, ABA included. `data` = `{ id, issueId, seq, state }`, `version` = the new seq. The unique `(issue_id, seq)` and the project lock judge concurrent writers. Audit detail is `{ transitionId, seq, fromState, toState }`, never the reason or comment text. The server never reads a rule result, verdict, opinion or Gate to judge a move and never moves a state on a PASS or a FAIL. Closed Rounds accept transitions. Every token is refused before any statement.

No severity, revalidation, attachments, rich text or external hand-off action is implemented. These records never change machine results, verdicts, opinions, Gate, sample sets or comparisons; those decisions never consult human records. The owning [design](../../../design/features/log-lifecycle/validation-issues-discussion.md) records the later-node gates.

## Transport and permission

- Owning menu id `log-models` (`LOG_MODELS_MENU_ID`, manifest in `menus/log-dev/log-models`). Reads: `permission: 'platform:view'`, `requiresScope: false`, `context: {}`, `mergeTimeDomain: false`; every active workspace session may read; the workspace is the session actor's and no param names it.
- A bad param is an `error` outcome (HTTP 200, `data: null`, `message`), never an empty page. The outcome set has no `not_found`: an unknown or other-workspace id answers `ok` with `data: null` (the list reads answer an empty page); hierarchy paths use the explicit `{ failure: 'deleted' }` data described below.
- Writes: `POST /api/v1/menu-action`, `requiresScope: false`. Project actions declare menu permission `lifecycle:project-manage` (capability `lifecycle.project.manage`), round actions `lifecycle:round-manage` (`lifecycle.round.manage`). Both capabilities are workspace-scoped, non-sensitive, `adminModuleBypass: 'always'`, refused for a User recipient (supported-scope policy). Developers receive them by request.
- Refusals use the dispatch envelope: HTTP 200 `{ outcome: 'invalid', fieldErrors: [{ path, code }] }`; `outcome: 'conflict'` is only an `expectedVersion` mismatch (`version` = the current one); a missing or other-workspace target of a versioned action is `not_found`; creates replay by `idempotencyKey`.

## Reads

| Endpoint id | Params | Data |
| --- | --- | --- |
| `logLifecycle.hierarchy` | discriminated `op`, see [Hierarchy](#hierarchy-1449) | `HierarchyPage`, ancestor nodes, or `{ failure: 'deleted' }` |
| `logLifecycle.models` | `q`, `page`, `pageSize`, `sorting`, `filters`, `includeClosedProjects?` | `{ rows: ModelRow[], total }` |
| `logLifecycle.projectDetail` | `projectId` (uuid) | `ProjectDetail` or `null` |
| `logLifecycle.projectEvents` | `projectId`, `page`, `pageSize` (offset page, 50 default, 200 max) | `{ rows: EventRow[], total }`, newest first (`seq desc`) |
| `logLifecycle.rounds` | `projectId` | `{ rows: RoundSummary[] }`, `seq desc` |
| `logLifecycle.roundDetail` | `roundId` | `RoundDetail` (with `evidenceRefs`, see [Evidence locations](#evidence-locations-1474-x-h)) or `null` |
| `logLifecycle.roundEvidence` | `roundId` | `{ rows: [{ id, name, sizeBytes, mimeType, uploadedByActorId, linkedAt }] }` or `null` (see Manual validation attachment) |

`models`: the base rows are the knowledge models (`knowledge.equipment_model`, read directly: see 02 §Log Lifecycle), so a model without a project is a row with `project: null`. Row: `{ id, code, name, active, version, vendorId, vendorName, processes[{id,name}], createdAt, updatedAt, validation, pendingRequests, gateDecision, project }` with `project: null | { projectId, stage, kind, ownerActorId, latestRound: { id, seq, status } | null }`. `project` is the model's OPEN project (not `completed`, not `cancelled`). Sort ids: those of `logKnowledge.models` plus `stage` (`code, name, vendorName, active, softwareCount, stage, createdAt, updatedAt`); same `q` / page / sorting rules as [log-knowledge.md §Common params](log-knowledge.md). Filter fields (ADR-0105): `active`, `id`, `vendorId`, `processes` as in `logKnowledge.models`, and `stage` (ops `in`, `notIn`, `isEmpty`, `isNotEmpty`; values the stage set `registered|kickoff|alpha|beta|completed|cancelled`; rows show only the open project, so `completed`/`cancelled` match nothing under `in`): `isEmpty` = the model has no open project, `notIn` excludes models without one (ADR-0105). Node f (#1447) adds `validation` (`none|queued|claimed|pass|fail|incomplete`; ops `in`, `notIn`), `pendingRequests` (all queued/claimed requests across the open project's Rounds), and `gateDecision` (newest human decision of the latest Round or null). Validation uses the latest Round and its newest request/attempt; a queued/claimed request takes precedence over a prior verdict. These are separate axes; a Gate decision never changes validation. For A2, `includeClosedProjects: true` opts into a display projection: prefer the open project, otherwise the newest closed project by `created_at desc, id desc`. The default remains open-only for existing consumers. Round projections and pending counts include only Rounds visible by their immutable owner; latest Round means latest visible Round in these read summaries. Under this opt-in, stage filters also match completed/cancelled projects; null means the model has never had a project. Creating a new development project still follows the unchanged one-open-project rule.

`ProjectDetail`: `{ id, modelId, model: { code, name, vendorName } | null, softwareId, softwareLabel, kind, stage, owner: { id, displayName }, targetDate, nextStages[], reopenTo, openRound: { id, seq } | null, version, createdBy, createdAt, updatedBy, updatedAt }`. `nextStages` is what `projectSetStage` accepts now (never `completed`); `reopenTo` is where `projectReopen` would put the project (`null` = not reopenable). Node e adds `gateTarget` (the one stage the Gate may take the project to: the next step forward, `null` from `completed` and `cancelled`) and `gate: { latest, decidedOnLatestRound, decisionCount }` (`latest` = the newest Gate decision of any Round without its `basis`, `null` when the Gate never decided).

`EventRow`: `{ id, seq, kind, actor: { id, displayName }, at, before, after, reason }`. `RoundSummary`: `{ id, projectId, seq, stage, status, sampleCount, validation, gateDecision, sampleManifestDigest, specPin, note, version, createdBy, createdAt, closedBy, closedAt }`. `RoundDetail` adds nullable `ownerModelId` and `ownerSoftwareId` and omits the list-only `sampleCount`, `validation` and `gateDecision`, and adds `sampleSet: { files: [{ fileRef, order, sha256 }] (by `order`), sourceOwner }` and `gateDecisions[]` (the Gate history, see [§Gate decision](#gate-decision-node-e-1446)); request/attempt sections are read through the existing paged `requests` and `requestDetail` endpoints. Node f adds `gateAvailability` (below). `specPin` is `{ revisionId, changeSetDigest }` or `null` (shown as 미고정: the model had no published revision when the round opened).

### Hierarchy (#1449)

`logLifecycle.hierarchy` is a read-only projection for the `log-models` sidebar (`platform:view`, `requiresScope: false`, no Context). The session actor supplies the workspace; there is no workspace parameter. It reads the existing knowledge catalogs and open lifecycle projects without writes, new capabilities, grants or migrations.

- `op: 'children'`: optional `parentId` (null/omitted = vendors), `cursor`, `limit`.
- `op: 'ancestors'`: required `nodeId`; no paging parameters. Returns root through immediate parent, excluding the requested node.
- `op: 'search'`: required `query` (trimmed, 1–200 characters), optional `cursor`, `limit`. Case-insensitive literal label substring on all four kinds.

Unknown keys and keys of another operation are errors. `limit` is a positive safe integer, default 50, clamped to 200. Pages are `{ nodes, nextCursor? }`, in stable path-ID order (C collation); no count is promised. The opaque AES-GCM cursor authenticates the workspace, actor, operation, parent/search and clamped limit, expires after 30 minutes, and is valid only in the same server instance. Invalid, tampered, expired or replayed cursors return `outcome: error`, `message: cursor_invalid`.

Node: `{ id, parentId, kind, label, hasChildren, target }`. Kinds are `vendor`, `process`, `model`, `software`. IDs encode object UUIDs along their placement: `v/<vendor>/p/<process>/m/<model>/s/<software>` (prefixes for earlier levels). A model in multiple processes has one path per process; unassigned models use the per-vendor `p/none` node labeled `미분류`. Process nodes exist only for actual model placements. `hasChildren` is exact, including empty vendors/models and software leaves. As with the model list's unfiltered default, inactive catalog records remain visible. IDs remain stable on rename; subsequent reads return the new label. An unknown, moved or foreign-workspace path returns `{ failure: 'deleted' }`, which the menu Source turns into `HierarchyFailure('deleted')`. Authorization remains the dispatch engine's explicit `forbidden` outcome, mapped by the Source; ordinary read failures map to `error`.

Vendor targets open `log-models` with `{ vendorId }`; process targets use `{ vendorId, processId }` (the synthetic unassigned process uses the explicit `none` sentinel, projected to the existing `processes isEmpty` condition). Model and SW targets open the model's open `log-model-project` with params `{ projectId }` and page `{ node }`, where `node` is the selected object's full placement ID: `v/<vendor>/p/<process|none>/m/<model>[/s/<software>]`. The project and Round manifests both declare `node`; navigation to a Round within that project preserves it. Without an open project, both kinds target `log-models` with `{ vendorId, processId, modelId }`. Only the model-list screen's own `models` read projects `modelId` to the existing `id in` condition and `processId=none` to `processes isEmpty`; registration pickers remain independent. The menu's synchronous `currentNodeId` validates the object-only node grammar for hidden project/Round routes, or derives the full path from the list's three keys. No labels, ancestor expansion or search text enters target URLs. The body tables are unchanged. Bare project/Round deep links without `node` remain unmarked pending an SDK route-resolution seam; see [backlog](../../../../.planning/backlog.md).

## Writes

| Action | `input` | Concurrency |
| --- | --- | --- |
| `logLifecycle.projectCreate` | `modelId`, `softwareId?`, `kind` (`new`\|`redevelopment`), `ownerActorId`, `targetDate?` (`YYYY-MM-DD`) | none (`idempotencyKey`) |
| `logLifecycle.projectSetStage` | `id`, `toStage`, `reason?` (required for `cancelled`) | `expectedVersion` |
| `logLifecycle.projectReopen` | `id`, `reason` | `expectedVersion` |
| `logLifecycle.projectUpdate` | `id`, `ownerActorId?`, `targetDate?` (null clears), `softwareId?` (null clears) | `expectedVersion` |
| `logLifecycle.roundOpen` | `projectId`, `sampleSet`, `note?` | none (`idempotencyKey`) |
| `logLifecycle.roundClose` | `id` | `expectedVersion` |
| `logLifecycle.roundEvidenceAttach` | `roundId`, `attachmentIds` (1–20, unique uuids) | none (`idempotencyKey`) |

`roundOpen` has no `specPin` input: the server computes it (below). Unknown input keys are `unexpected_field`.

Every project write is one transaction: the row change (`row_version + 1`), the `development_event` row and the `core.audit_log` row. A save that changes nothing answers `ok` with the current version and writes nothing. Round writes write the audit row and no `development_event` (the closed event kinds have no round kind).

### Manual validation attachment (#1451, design D6)

Manual validation records are Core attachments linked to a Round with parent kind `validation_round` (no new table; the parent seam is in [attachments.md](attachments.md)). The caller first uploads with `POST /attachments`, then calls `roundEvidenceAttach { roundId, attachmentIds }`. Right: `lifecycle.round.manage` (menu permission `lifecycle:round-manage`, like `roundOpen`/`roundClose`). The Round must be `open` (`roundId: illegal_transition` on a closed one, `roundId: not_found` for an unknown or other-workspace id). Each attachment must be an unlinked, non-archived upload of the caller; any miss is `attachmentIds.<i>: invalid` and the whole call rolls back (one transaction with the audit row); `attachmentIds` is `required` when empty, `too_many` above 20 (start value), `duplicate` on a repeated id. The audit row `lifecycle.round.evidence_attached` (subject `validation_round`, action `update`) carries `{ projectId, seq, count }` and no filename or key.

Each attached file also gets an Entity Link `manual_validation_attachment → validation_round` (`evidence_of`, `managed_system_id` NULL, `internal_only`; [ADR-0123](../../../adr/0123-entity-links-extend-to-targets-without-managed-system.md), contract [06](../06-entity-linking-contract.md#links-without-a-managed-system-adr-0123)). The link row and its `entity_link.created` audit are written in the same transaction as the attach and its `evidence_attached` audit, so a failed link write rolls the attach back. Both ends are judged by their owning module's read permission; the link is command-only (not creatable, listed or detachable through `/entity-links`). Gate read port: `readRoundEvidenceLinks(deps, actor, roundId)` (log-lifecycle barrel) returns the Round's links, oldest first, with the Round's own visibility (`platform:view`, Round in the actor's workspace) or `null`; it carries no Gate logic (#1446).

Read: `logLifecycle.roundEvidence { roundId }` (right `platform:view`) answers `{ rows: [{ id, name, sizeBytes, mimeType, uploadedByActorId, linkedAt }] }` ordered by `linkedAt`, or `data: null` for an unknown or other-workspace Round. The bytes come from `GET /attachments/:id/download`, allowed under the Round's own visibility (`platform:view`, Round in the actor's workspace). There is no detach action in v0.30.0.

### Evidence locations (#1474 X-h)

A body-free pointer to a place in a log file (`fileRef`, `line`, `fileSha256`, optional `note` ≤ 500) handed to a Round by the log explorer (`logExplorer.evidenceHandoff`, next PR). Not an attachment (those stay manual files, [above](#manual-validation-attachment-1451-design-d6)) and not an Entity Link: a location is a pointer, the Round owns the table `log_lifecycle.round_evidence_ref` (lead decision 2026-11-08). The receiver is a **service function**, not a menu action: the log-lifecycle barrel exports `roundEvidenceRefIntake({ checkService })` → `{ attach(tx, actor, { roundId, refs, origin }), canAttach(tx, actor) }`; the explorer calls `attach` inside its own transaction, so a refusal rolls the whole handoff back.

- **Input.** `roundId`; `refs[]` (1–100, `{ fileRef, line, fileSha256, note?, sourceResolved }`, strict; the shape is judged again here, the caller is not trusted; the same `(fileRef, line, fileSha256)` twice is `refs.<i>: duplicate`; the hash is lower-cased); `origin: { kind: 'log_explorer', id }` (the investigation id). `sourceResolved=false` is the explorer's Source read result (the original is gone); the Round has no Source.
- **Right.** `lifecycle.round.manage`, judged inside like the round actions. A service can throw only `MenuActionInvalidError`, so a denied right is `target: forbidden` (`canAttach` lets the sender pre-check in its own `authorize`). Round in the actor's workspace and `open`: `target.roundId: not_found` (unknown or other workspace), `target.roundId: round_closed`.
- **Sample set.** Each `fileRef` must be in the Round's `sample_set.files`: `refs.<i>.fileRef: not_in_sample_set`. Nothing is written when any pointer fails.
- **Status, decided by the Round.** `sourceResolved=false` → `unresolved`; else `fileSha256` ≠ that file's `sample_set` sha256 → `hash_mismatch`; else `match`. Nothing is rewritten into a "real" evidence.
- **Result.** `{ attached, alreadyAttached, byStatus: { match, hash_mismatch, unresolved } }`. A pointer already stored for the Round (same triple) is counted in `alreadyAttached` and not written again (`ON CONFLICT DO NOTHING`; a repeated handoff is harmless and keeps its first status and note); `byStatus` counts the newly attached ones. One Round holds at most 1000 pointers: `refs: round_full`.
- **Storage.** `round_evidence_ref` (migration 0116): `workspace_id`, `round_id` (composite FK to the Round), `seq` (1..n per Round, gapless, allocated under the Round row lock), `file_ref`, `line` (`bigint`, read as a number; any positive safe integer), `file_sha256`, `note?`, `status` (`match` · `hash_mismatch` · `unresolved`), `origin_kind` (`log_explorer`), `origin_id`, `handed_off_by`, `at`; unique `(workspace_id, round_id, file_ref, line, file_sha256)`. Append-only: `platform_app` holds SELECT and INSERT only and a trigger refuses UPDATE and DELETE for every role.
- **Audit.** `lifecycle.round.evidence_ref_attached` (subject `validation_round`, action `update`), only when `attached > 0`; detail (strict) `{ projectId, seq, attached, alreadyAttached, match, hashMismatch, unresolved, originKind, originId }` — no note, no file location, no hash.
- **Read.** `logLifecycle.roundDetail` gains `evidenceRefs: [{ seq, fileRef, line, fileSha256, note, status, originKind, originId, handedOffBy, at }]`, newest first (`seq desc`, all rows). Same visibility as the Round.

### Stage transitions

Stages: `registered, kickoff, alpha, beta, completed, cancelled`. Open stages are the first four.

| Action | Legal moves | Event kind |
| --- | --- | --- |
| `projectSetStage` | `registered→kickoff`, `kickoff→alpha`, `alpha→beta`; `cancelled` from any open stage (reason required) | `stage_changed` / `cancelled` |
| `projectReopen` | `cancelled →` the `before.stage` of the last `cancelled` event; `completed → beta` | `reopened` |
| (node e, the Gate only) | `beta → completed` | `gate_decided` |

`projectSetStage` with `toStage: 'completed'` is refused (`toStage: gate_required`); same-stage, backward and every other pair is `toStage: illegal_transition`. The DB guard `log_lifecycle.project_guard` carries the union of these pairs (`LEGAL_STAGE_PAIRS`, `domain/stage-transitions.ts`; a drift test pins the SQL list to the table); it allows `beta→completed` because it cannot know the Gate called it, which the service enforces.

`projectCreate` checks that the model exists in the workspace and is active (`modelId: not_found | inactive`), that `softwareId` is a version of that model (`softwareId: not_found`, also in `projectUpdate`) and that `ownerActorId` is an actor of the workspace (`ownerActorId: not_found`), all through the log-knowledge read port (`knowledgeLookup`: `getModel`, `getSoftware`, `getEffectiveSpecPin`). One open project per model: a second one is `modelId: open_project_exists` (create) or `id: open_project_exists` (reopen), mapped from the partial unique index `development_project_open_model_uq (workspace_id, model_id) where stage not in ('completed','cancelled')`. `projectUpdate` is refused on a completed or cancelled project (`id: project_not_open`). It writes `owner_changed` for an owner change and `target_changed` for a `targetDate` and/or `softwareId` change; `before`/`after` carry only the changed fields.

Error codes: `invalid` field errors — `['toStage'] gate_required | illegal_transition`, `['id'] illegal_transition` (bad reopen, closing a closed round), `['modelId'|'id'] open_project_exists`, `['projectId'] open_round_exists | project_not_open | not_found`, `['reason'] required`, plus the input codes `required`, `malformed`, `too_long`. `conflict` is only the version mismatch.

### Rounds

A round opens only on an open project (`projectId: project_not_open`), at most one round per project is `open` (partial unique index `validation_round_open_project_uq` → `projectId: open_round_exists`), `seq` is 1..n per project without gaps (allocated as `max + 1` under the project row lock, `FOR UPDATE`; the same lock orders event `seq`), `stage` is the project's stage at open. `sample_set`, `sample_manifest_digest`, `spec_pin`, `project_id`, `seq`, `stage` and `note` are immutable from insert (guard `log_lifecycle.round_guard` + no column grant); there is no sample-edit action. Only `status open→closed` (+ `closed_at/by`, `updated_*`, `row_version + 1`) may change; closed is final (`roundClose` on a closed round: `id: illegal_transition`).

**Spec pin (server-computed).** At open the server asks log-knowledge `getEffectiveSpecPin(model, softwareId|null)`: `null` when the model has no published revision, else `{ revisionId, changeSetDigest }` where `changeSetDigest` = SHA-256 hex of `canonicalJson` (sorted keys) of the applicable change list in apply order `(start release order, created_at, id)`, each change as `{ id, targetKind, targetKey, changeKind, change }` (`change` = `change_json`); `[]` when the project has no `softwareId` or no change applies. The pin lives with log-knowledge's effective spec; log-lifecycle only stores it.

**`sampleSet` limits (start values; ADR-0117 has no fileRef rule yet).** `{ files: [{ fileRef, order, sha256 }], sourceOwner }`, strict (an unknown key is `malformed`). `files`: 1–1000 entries (`too_many` above); `order`: integers exactly `1..n`, each once (`order_invalid`), stored in the user's order and never re-sorted by time; `fileRef`: opaque string, trimmed, non-empty, ≤ 1024 characters, no control characters (C0, DEL, C1, NUL, lone surrogates → `malformed`), unique within the set (`duplicate`); `sha256`: 64 lowercase hex (`malformed`); `sourceOwner`: trimmed, non-empty, ≤ 200 characters. Field error paths are `sampleSet[.files.<i>[.<key>]]`.

**Manifest digest.** `sample_manifest_digest` = SHA-256 hex of `JSON.stringify({ files: [{ order, fileRef, sha256 }…] sorted by order, sourceOwner })` with exactly that key sequence (`sampleManifestDigest`, `domain/sample-set.ts`; node d reuses it for `input_manifest_digest`). Reordering the files changes it; identical input gives an identical digest.

## Gate decision (node e, #1446)

Design: log-lifecycle design §3 `gate_decision`, §4, §5, §10 D2/D3; ADR-0116 decision 4. The Gate is a **human** business approval of the next stage of a 개발 건. It is recorded beside the machine verdicts and never changes one: no script verdict, rule result or request is written, and nothing stores an AI opinion.

**Action `logLifecycle.gateDecide`** (menu `log-models`, menu permission `lifecycle:gate-decide`, `expectedVersion` = the **project's** version, `idempotencyKey`). Input (strict; an unknown key is `unexpected_field`): `roundId`, `targetStage` (`kickoff|alpha|beta|completed`), `decision` (`approved|rejected|exception`), `reason` (required, trimmed, ≤ 2000, for every decision), `exception` (`{ riskAcceptedBy: actorId, scope: text ≤ 500, until?: YYYY-MM-DD }`; required for `exception`, `malformed` for any other decision). Answer: `{ gateDecisionId, stage, selfApproved, version }`.

- **Who.** Capability `lifecycle.gate.decide`: workspace scope, **sensitive**, **session-only**, `adminModuleBypass: 'always'`, refused for a User recipient. A personal or service token is refused before any statement (`outcome: forbidden`; the capability cannot be a token scope: `scopes[i]: session_only`). The action also refuses an actor that is not an `internal_member` (a `system` identity), so no AI / Agent / service actor can decide (the #1198 review rule, applied as written: a session-only right plus a human actor). A refusal is HTTP 200 `outcome: 'forbidden'`.
- **Rules (server, in this order).** The Round must exist in the workspace (`not_found`); the project must be open (`roundId: project_not_open`); the Round must be the project's newest (`roundId: round_not_current`) and opened at the project's current stage (`roundId: round_stage_mismatch`); `targetStage` must be the next forward stage of the transition table (`targetStage: illegal_transition`; `cancelled` is never a Gate target) and `beta → completed` needs the project's `software_id` (`targetStage: software_required`). `approved` only when the Round's most recent `succeeded` attempt has `verdict = 'pass'` (`decision: verdict_not_pass`); `fail`, `incomplete` or no attempt pass only as `exception` with a reason and `riskAcceptedBy` (an actor of the workspace, else `exception.riskAcceptedBy: not_found`); an `exception` over a `pass` is refused (`decision: exception_not_needed`), so every exception in the history means the machine did not pass. `rejected` is always allowed.
- **Effect (one transaction).** Lock the project, then the Round; append the `gate_decision` row; every decision bumps the project `row_version` (two decisions with the same `expectedVersion`: exactly one wins, the other is `conflict`); an approving decision (`approved`, `exception`) also moves `development_project.stage` to `targetStage` in the same statement; then the `development_event` `gate_decided` (`before { stage }`, `after { stage, decision, targetStage, gateDecisionId, selfApproved }`, `reason`) and the audit row `lifecycle.gate.decided` (subject `validation_round`; ids, enums, `seq`, counts, `selfApproved` and `riskAcceptedBy` only — never the reason, the exception scope or the basis).
- **Self approval (D3).** Not refused. `self_approved` is stored with the decision: the decider is the requester of the Round's latest 검증 요청, or the Round's opener when it has no request. History readers see it.
- **Evidence snapshot `basis`** (frozen at decision time, jsonb): `version: 1`, `attempts[]` (every `succeeded` attempt of the Round, oldest first: `attemptId`, `attemptNo`, `requestId`, `verdict`, `ruleSetRevision`, `inputManifestDigest`, `endedAt`), `decisiveAttemptId` / `decisiveVerdict` (the most recent one), `specPin`, `sampleManifestDigest`, `requestDigest` (of the decisive attempt's request, else the latest request, else `null`), `evidenceLinks[]` (the 수동 검증 첨부 read through `readRoundEvidenceLinks`: `attachmentId` and `linkedAt` only — no file name, size or content). Later attachments or attempts never edit a past row (append-only table); no stale / 재검증 필요 calculation exists (design §9): the digests are kept so it can be added later without touching past rows.

**Reads.** `logLifecycle.roundDetail` adds `gateDecisions[]`, oldest first: `{ id, roundId, fromStage, targetStage, decision, reason, exception, selfApproved, decidedBy: { id, displayName }, at, basis, basisSummary: { attemptCount, decisiveVerdict, evidenceLinkCount } }`. `logLifecycle.projectDetail` adds `gateTarget` and `gate` (above). Visibility is the Round's (`platform:view` + the workspace): **anyone who can read the Round reads every decider's reason text and exception scope**; the audit never carries them.

**Storage (migration 0113).** `log_lifecycle.gate_decision`: `id`, `workspace_id`, `round_id` (composite FK to `validation_round`, `RESTRICT`), `from_stage`, `target_stage`, `decision`, `basis`, `reason`, `exception` (set exactly when `decision = 'exception'`), `self_approved`, `actor_id`, `at`. Runtime role: SELECT, INSERT only; trigger `gate_decision_append_only` refuses UPDATE and DELETE for every role. Walls: [04 §Log lifecycle](../../../../apps/platform-api/docs/04-database-and-migrations.md).

## Storage

Schema `log_lifecycle` (migration of #1444 c): `development_project` (`model_id`/`software_id` plain uuids, no FK into `knowledge`; composite same-workspace FKs inside the schema), `development_event` (append-only: `seq` per project, `kind`, `before`/`after` objects, `reason`, `actor_id`), `validation_round`. Grants, triggers and the audit projection: [04 §Log lifecycle](../../../../apps/platform-api/docs/04-database-and-migrations.md). Audit events (`subject_type` → platform action): `development_project`: `lifecycle.project.created` → create, `.updated` / `.stage_changed` / `.reopened` → update, `.cancelled` → retire; `validation_round`: `lifecycle.round.opened` → create, `.closed` → retire. Details are body-free (ids, stage names, counts, changed field names).

## Validation request queue (node d, #1445)

Contract owner for the queue: this section plus [ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md) (decisions 1–10). Provisional `v0`; the worker schemas are `@ap/contract-schemas` `validation*` (`packages/sdk/contract-schemas/src/validation-queue.ts`). Terms: 검증 요청 (request), 시도 (attempt), 규칙 결과, 근거 위치 (`{ fileRef, line, fileSha256 }`, one type).

### Human side (menu `log-validation-requests`)

Reads (`platform:view`): `logLifecycle.requests` (params `page`, `pageSize` ≤ 200, `states[]`, `priority` 0–2, `immediate`, `roundId`, `modelId`, `from`, `to`; data `{ rows, total, immediateTotal }`, newest first; `immediateTotal` = the share of «즉시» requests in the filtered set for the admin view), `logLifecycle.requestDetail` (`requestId`; request + round summary + `attempts[]` with `verdict`, `manifestMatches`, per-result counts and `requiredUnchecked` (required `ERROR|NOT_CHECKED|SKIPPED` count); request rows also include `modelCode`, `softwareLabel`, `roundSeq`; `null` when unknown), `logLifecycle.ruleResults` (`attemptId`, `page`, `pageSize`, `results[]`, `required`, `sorting` (up to three `{id,desc}` entries from `ruleId|result|required`, default `ruleId asc`, stable UUID tie-break); rows carry `evidence[{ fileRef, line, fileSha256, hasExcerpt }]` and `hasExcerpt`, never the text), `logLifecycle.excerpt` (`ruleResultId`, `evidenceIndex` 0–19).

**Attempt `ruleSet` (R-f, #1496).** Every attempt of `logLifecycle.requestDetail` carries `ruleSet`: `null` when the attempt stored no `ruleSetRevision`; else the lookup of that string in the current rule catalog (`RuleCoveragePort.findRuleSetRevision`, injected by the assembly): `{ state: 'matched', ruleSetKey, revision, isCurrent, status }`, or `{ state: 'ambiguous' | 'unknown' | 'no_catalog' }`. Display information only: results are not re-judged and the stored string is unchanged. The request is read first in its own transaction; the lookups run after it, outside that transaction. A rejected lookup does not fail the read: every attempt that needed it carries `{ state: 'unavailable' }` (shown as «규칙 세트를 확인하지 못함») and one warning with a fixed text (no token, row data or error message) is logged.

`logLifecycle.excerpt` is the one read with a write: it needs the right `lifecycle.excerpt.read` **for the Round's `sample_set.sourceOwner`** (table `log_lifecycle.excerpt_reader`; there is no per-source scope in the permission module, so this right is its own ACL, granted and withdrawn by an admin with `excerptAccessSet`; admin role alone does not read), is refused to a token (`forbidden`), is judged inside the transaction that writes the audit row (a withdrawn right refuses the same call), and writes `lifecycle.excerpt.read` naming the rule result and the evidence index, never the text. Answers: `ok` + `{ ruleResultId, evidenceIndex, deleted, excerpt }`; `deleted: true` and `excerpt: null` once the body was erased (retention purge or administrator deletion; the read is still audited); `ok` + `null` for an unknown id or an evidence entry without an excerpt.

Writes (menu permission `lifecycle:round-manage`, i.e. `lifecycle.round.manage`, session or token):

| Action | `input` | Concurrency |
| --- | --- | --- |
| `logLifecycle.requestCreate` | `roundId`, `priority` (0–2, higher is claimed first), `immediate?`, `engineProfileRef?` (≤ 200), `maxAttempts?` (1–10, default 3) | none (`idempotencyKey`) |
| `logLifecycle.requestCancel` | `id`, `reason` | `expectedVersion` |
| `logLifecycle.queueSettingsUpdate` (admin, `console:access`) | `runWindow?`, `leaseSeconds?` (30–3600), `immediateLimit?` (0–50), `excerptRetentionDays?` (1–3650); at least one | none |
| `logLifecycle.excerptAccessSet` (admin) | `sourceOwner`, `actorId`, `allowed` | none |
| `logLifecycle.excerptDelete` (admin, `console:access`, session only) | `scope` (`round` \| `attempt`), `id` (the Round or attempt id), `reason` (required, ≤ 2,000) | none |

Field errors: `['roundId'] not_found | round_closed`, `['immediate'] queue.immediate_limit` (the user already holds the workspace's immediate limit, default 5, of queued or claimed «즉시» requests; counted under an advisory lock per workspace and user), `['id'] illegal_transition` (cancel of a request that is not `queued`/`claimed`), `['reason'] required`, `['actorId'] not_found`, `['runWindow'] malformed`, `['id'] not_found` (`excerptDelete`: unknown Round / attempt in this workspace). A Round request stores its round (`round_id`; since #1479 nullable, see Request subject), a request digest (SHA-256 of `{ roundId, sampleManifestDigest, engineProfileRef }`) and the registering actor; the samples are the Round's, which never change (`round_guard`, for every round). Cancel of a claimed request clears its lease and ends its running attempt as `lease_expired`.

### Worker REST (token-only, `v0`)

Prefix `/api/v1/validation-queue`. Every route is `tokenCallable` and needs an authenticated API token whose scopes hold `validation.worker`. A cookie session or a token without the scope is 403 `permission.denied`; no credentials 401. `validation.worker` is a **token-only scope** (`TOKEN_ONLY_SCOPES`, not a capability: no grant, request or role right, never held by a human session), and only a **service** token may carry it (a personal token with it is 422 `scopes[i]: service_only`). Audit rows of a token call carry the token's Actor and `api_token_id`.

| Route | Body | Answers |
| --- | --- | --- |
| `POST /claim` | `{}` | `200 { request, attempt, leaseExpiresAt }` (the request carries `roundId`/`suiteRunItemId` (one is `null`), `sampleSet`, `sampleManifestDigest`, `specPin`) · `204` nothing claimable now |
| `POST /requests/:id/heartbeat` | `{ attemptNo }` | `200 { leaseExpiresAt }` · `409 queue.lease_lost` |
| `POST /requests/:id/result` | `{ attemptNo, inputManifestDigest, executorVersion?, executorDigest?, ruleSetRevision?, summary?, results[] }` | `200 { requestId, attemptNo, state: 'succeeded', verdict, resultDigest, ruleCount }` · `409 conflict.stale_write` · `409 queue.lease_lost` · `422 validation.failed` |
| `POST /requests/:id/fail` | `{ attemptNo, reason? }` | `200 { requestId, attemptNo, state: 'failed' }` · `409 …` |

**Request subject (#1479, [ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md) amendment 1).** A request is for a Round (`round_id`, as above) XOR a regression suite run item (`suite_run_item_id`, registered by log-datasets through the barrel port `lifecycleSuiteRequests`, never through `requestCreate`); the DB CHECK `execution_request_subject_check` enforces exactly one. A suite subject also stores its `suite_run_id` and the sample list pinned at registration, so `claim` never reads log-datasets. The worker routes are unchanged; the claim `request` carries `roundId` (Round request) or `suiteRunItemId` (suite subject) and `null` in the other, with that subject\'s `sampleSet` and `sampleManifestDigest` (`specPin` is `null` for a suite subject). A suite subject is claimable whenever it is `queued` (no Round to be open) at priority 0. `logLifecycle.requests|requestDetail|requestCancel` see Round requests only. Excerpt retention for a suite subject counts from the finish of its suite run (every request of the run ended; latest `ended_at`), not from a Round close.

### Attempt opinions (#1778, [ADR-0117](../../../adr/0117-validation-request-queue-claim-lease-heartbeat.md) amendment 2)

Provisional `v0`; schemas `@ap/contract-schemas` `validationOpinion*`. An **opinion** is an append-only note on one item of an attempt, on its own axis. It is not one-to-one with a rule result: an item the in-house side found that has no rule result is stored too, and `rule_result_id` is set only when the attempt has a rule result whose `rule_id` equals the item key. It never changes `verdict`, a Gate decision, knowledge state or a regression comparison, and no code that computes those reads `attempt_opinion` (pinned by tests). The platform calls no LLM and adds no token path to Gate or Knowledge approval. The platform holds no grade vocabulary.

**Opinion scale.** `queue_settings.opinion_scale = { grades: [{ key, label }], marks: [{ key, label }] }` (array order is display order; key `^[a-z0-9_-]{1,32}$` and not `none` (reserved for the `opinionGrade` filter), label ≤ 40 characters, ≤ 12 of each, keys unique). Default is empty. It is set by `logLifecycle.queueSettingsUpdate` (admin, `console:access`; new optional input `opinionScale`, replaced whole, audited by the existing `lifecycle.queue_settings.updated` with changed field names only). Field errors: `['opinionScale'] malformed | duplicate_key | too_many`.

**Write (worker REST, token-only).** `POST /api/v1/validation-queue/requests/:id/attempts/:attemptNo/opinions`, `tokenCallable`, scope `validation.worker` (same rules as the other worker routes: session or scope-less token 403 `permission.denied`, no credentials 401). Any worker token of the workspace may write; it need not be the one that claimed the attempt.

| Body | Answers |
| --- | --- |
| `{ submissionId, opinions: [{ itemKey, grade, mark?, note?, evidence?, inputRevision?, producer? }] }` (1–500 entries; unknown key `malformed`) | `200 { requestId, attemptNo, recorded, duplicate }` · `404 not_found` (request or attempt unknown in this workspace; Round and suite-item requests both count) · `409 conflict.attempt_not_succeeded` · `409 conflict.stale_write` (same `submissionId` and item key, different content) · `422 validation.failed` |

`submissionId` and `itemKey` ≤ 200 characters; `grade`/`mark` must be keys of the declared scale; `note` ≤ 1,000 characters; `evidence` is up to 20 locations `{ fileRef, line, fileSha256 }` that must be in the request subject's sample list; `inputRevision` and `producer` (opaque references such as a model or prompt version) ≤ 200 characters each, stored and shown as text only. Limits per attempt: 2,000 opinion rows and 256 KB of notes (`too_many`, `too_long`; nothing is cut). Field errors (`detail.fields[{ path, code }]`, nothing written): `opinion.scale_undeclared` (grades empty), `not_declared` (grade or mark), `not_in_sample`, `duplicate` (same `itemKey` twice in one body), `too_long`, `too_many`, `secret_detected` (the ADR-0117 decision 7 patterns on `itemKey`, `note`, `inputRevision`, `producer`); control characters are removed. Idempotency: `(attempt, actor, submissionId, itemKey)`; a retry returns the same answer and is counted in `duplicate`, judged BEFORE the current scale (a resend of a stored row stays `200 duplicate` after its grade or mark left the scale or the scale was emptied; changed content is `409 conflict.stale_write`; only new rows meet the current scale, with `not_declared` / `opinion.scale_undeclared`); a correction is a new `submissionId`. Audit: `lifecycle.opinion.recorded` (subject `execution_request`; `attemptNo`, `recorded`; never the note), written only when the call stored at least one new row (a pure resend writes none). `conflict.attempt_not_succeeded` is a queue-local code answered by the route, like `queue.lease_lost`, not an entry of the shared error registry. The worker contract states that `note` is a query or memo, not a log excerpt.

**Reads (`platform:view`, menu `log-validation-requests` / Round detail).** `logLifecycle.requestDetail` attempts gain `opinionCount` (0 when none; the Round screen shows no opinion UI at 0). `logLifecycle.ruleResults` rows gain `opinion`: `null`, or `{ grade: { key, label|null }, mark: { key, label|null } | null, hasNote, at, count }` for the latest opinion of the linked item (`label` is `null` when the key left the declared scale; the screen shows the key as text). `logLifecycle.opinions` (`attemptId`, optional `ruleResultId` or `itemKey`, `unlinked?: true` for items without a rule result, `page`, `pageSize` ≤ 100) has two shapes. **Item history** (`itemKey` or `ruleResultId` given): every opinion of that item, newest first, `{ id, itemKey, ruleResultId, grade, mark, note, evidence, inputRevision, producer, author, at }` — the only read that returns the note, evidence, revision or producer. **Item list** (neither given, including `unlinked: true`): one summary row per item, newest item first, `{ itemKey, grade: { key, label|null }, mark: { key, label|null } | null, hasNote, at, count }` of the item's latest opinion; it never carries `note`, `evidence`, `inputRevision` or `producer`; `logLifecycle.opinionScale {}` returns the declaration for columns and filters. Like `ruleResults`, the opinion reads answer for Round attempts (an unknown or hidden attempt, and the attempt of a suite-item request, gives an empty page); the write accepts both subjects. The note is untrusted text: rendered as text only, never in a list response (the item list above included), audit row, notification, search index or export. The rule results list can filter by `opinionGrade` (declared key or `none`) without changing `verdict` filters. Screen term for the query text: «설비사 질의» (open question in ADR-0117 amendment 2, item 9).

**Storage (migration 0126).** `log_lifecycle.attempt_opinion` and `queue_settings.opinion_scale`: see [04 §Attempt opinions](../../../../apps/platform-api/docs/04-database-and-migrations.md).

### Suite result read port (#1480)

`lifecycleSuiteResults` (barrel; `SuiteResultReadPort.latestSucceeded(tx, workspaceId, requestIds)`) is the only way log-datasets reads rule results for the comparison. For each given request of the workspace it returns the LATEST attempt (highest `attempt_no`) whose `outcome` is `succeeded` with that attempt's rule results as `{ ruleId, result, required }` — no expected/observed text, evidence or excerpt. A request with no succeeded attempt is absent from the map; a succeeded attempt with no rule rows is present with `rules: []`. It runs on the caller's transaction and reads no other workspace's rows. It writes nothing and adds no route, claim or state.

State table (`domain/request-states.ts`, the DB guard `log_lifecycle.request_guard` carries the same pairs between `LEGAL_REQUEST_PAIRS` markers; drift test): `queued→claimed|cancelled`, `claimed→succeeded|failed|queued|expired|cancelled`, plus `queued→succeeded|failed` for a late result (below); a terminal state never moves.

- **Claim** (one transaction): expired leases of the workspace are requeued first (`expired` when `attempt_count ≥ max_attempts`); then the highest-priority, oldest `queued` request with `not_before` passed, whose Round is still `open`, and that may run now — the run window is open, or the request is `immediate` — is locked `for update skip locked`, becomes `claimed` with `attempt_count + 1`, a lease of `leaseSeconds` (default 300) and a new `execution_attempt` (`input_manifest_digest` = the Round's until the worker reports). Two claim calls never get one request. Requeue happens on claim calls (no periodic job for leases); a lease that expired and was not yet requeued still accepts its worker's calls.
- **Run window** (`domain/run-window.ts`): `{ timezone (IANA), weekday: { fromHour, toHour }, weekendAllDay }`; start value Asia/Seoul, weekdays 22:00–06:00, weekend all day, judged on the wall clock of the zone by the server. Outside it only `immediate` requests are handed out.
- **Lease rules**: a call for the current attempt of a claimed request is accepted; a **result or fail** for the latest, lease-expired attempt of a request that went back to `queued` and that nobody took is accepted (the request ends `succeeded`/`failed`; audit `late: true`); everything else — another attempt exists, the request is cancelled/expired/finished, the attempt belongs to another worker — is `409 queue.lease_lost`, except that a **heartbeat** for the latest, lease-expired attempt of a request that went back to `queued` and that nobody took gives the lease back to that same attempt (request `claimed`, attempt `running`, `attempt_count` unchanged, lease extended; one transaction under the request row lock, so a claim by another worker that got there first makes it `queue.lease_lost`). A request that reached `expired` is terminal: its late result is `queue.lease_lost`.
- **Result idempotency**: the server canonicalises the normalised body (control characters removed) into `result_digest`. Same attempt, same digest → the same 200 with no new row; different digest, or a result after `fail` → `409 conflict.stale_write`.
- **Verdict** (`domain/verdict.ts`, server-computed; the result body has no verdict or opinion field, an unknown key is `malformed`; opinions come only through the opinions route above): any `FAIL` → `fail`; else a manifest digest different from the request's, or a `required` rule `ERROR|NOT_CHECKED|SKIPPED` → `incomplete`; else `pass`. The worker's `summary` (≤ 4,096 bytes) is stored for reference and never read by the verdict; the read projection is the allow-listed [진단 읽기 투영](#attemptout과-summary-허용-목록) (A1, As-built).
- **Input checks** (422 `validation.failed`, `detail.fields[{ path, code }]`; nothing is cut, nothing is written): `observed`/`expected` ≤ 500 characters, `ruleId` ≤ 200, ≤ 2,000 results, ≤ 20 evidence entries per rule result, excerpt ≤ 2,000 characters, excerpts ≤ 256 KB per attempt (`too_long`, `too_many`, `excerpt_total_too_large`); control characters are removed; in any worker text field (`ruleId`, `expected`, `observed`, excerpts, `executorVersion`, `executorDigest`, `ruleSetRevision`, `summary`) text matching a platform token (`ap_…`), a private-key header, a cloud/VCS/chat token or `password|secret|api_key = value` is `secret_detected`; an evidence `fileRef` outside the Round's sample set is `not_in_sample`; a duplicate `ruleId` is `duplicate`.
- **Error codes of the queue**: `queue.lease_lost` (409, answered by the worker routes; not an entry of the shared `ERROR_CODES` registry), `queue.immediate_limit` (field error code of `requestCreate`), `conflict.stale_write`.

### Storage (migration 0108)

`log_lifecycle.execution_request` (state, priority, `immediate`, lease columns, `attempt_count`/`max_attempts`, `row_version`), `execution_attempt` (one per claim; `outcome running|succeeded|failed|lease_expired`, executor/rule-set references, `input_manifest_digest`, `result_digest`, `verdict`, `worker_summary`, `token_id`), `rule_result` (`attempt_id`, `rule_id` unique per attempt, `result`, `required`, `expected`, `observed`, `evidence` jsonb ≤ 20), `rule_result_excerpt` (the text, apart; `deleted_at`, `deleted_reason`; an erased row has an empty body), `queue_settings` (one row per workspace; a missing row = defaults), `excerpt_reader` (the per-source-owner right). Walls: see [04 §Validation request queue](../../../../apps/platform-api/docs/04-database-and-migrations.md). Audit events: `lifecycle.request.created|cancelled|claimed|result_submitted|failed|lease_expired`, `lifecycle.excerpt.read`, `lifecycle.queue_settings.updated`, `lifecycle.excerpt_access.set`, `lifecycle.excerpt.deleted` (administrator deletion; subject `validation_round` or `execution_request`; `scope`, `count`), `lifecycle.excerpt.purged` (retention job summary per workspace and run; subject `queue_settings`; `count`, `retentionDays`) (subject types `execution_request`, `queue_settings`, `excerpt_reader`); details are ids, counts and verdicts only. Heartbeats are not audited (a lease extension is transient). Not implemented: the Gate stale / 재검증 필요 calculation.

**Excerpt erasure (ADR-0117 decision 7).** After a Round is `closed` + `excerptRetentionDays` (setting, default 90) the excerpt BODY is physically erased; rule results, evidence locations and hashes stay and the excerpt reads as `deleted`. Two doors, one storage path: (1) the daily job `lifecycle.excerpt_purge` (`excerpt-purge-job.ts`, pg-boss queue created by migration 0108, cron `45 3 * * *`, injectable clock, batches of 500, idempotent, one `lifecycle.excerpt.purged` summary row per workspace and run, never text; `deleted_reason` = `retention`); (2) the admin action `logLifecycle.excerptDelete` at Round or attempt scope with a required reason (stored in `deleted_reason`, not in the audit row). Both call `log_lifecycle.erase_excerpts(workspace, round, attempt, closed_before, reason, limit)`, a `SECURITY DEFINER` function (fixed `search_path`, EXECUTE for `platform_app` only, exactly one scope per call, workspace-filtered) because `platform_app` has no UPDATE on the table. The guard trigger `rule_result_excerpt_guard` allows exactly one UPDATE (live row → empty body with `deleted_at` and `deleted_reason` set, identity columns unchanged); the CHECK allows an empty body only when `deleted_at` is set.

### Evidence side table and reverse-lookup read port (node X-d, #1470, migration `*_rule_result_evidence.sql`)

`log_lifecycle.rule_result_evidence(rule_result_id, workspace_id, file_ref, line, file_sha256)` normalizes `rule_result.evidence` (log-explorer D4). Primary key `(rule_result_id, file_ref, line, file_sha256)` (a location is held once per result), composite same-workspace FK to `rule_result` (`ON DELETE RESTRICT`), reverse-lookup index `(workspace_id, file_ref, line, file_sha256)`. Location only, never text. `platform_app` has SELECT + INSERT; a guard trigger refuses every UPDATE/DELETE for any role. `insertRuleResults` writes the rows (deduped) in the same transaction as the rule result, so a failed side insert rolls the result post back. The migration backfills existing results idempotently.

The barrel read port `lifecycleEvidenceRead.findEvidenceLinks(tx, workspaceId, { fileRef, line, fileSha256, page, pageSize })` returns the rule results and the Rounds that cite the location in that workspace, newest first, paged; the endpoint is `logExplorer.evidenceLinks` ([log-explorer.md](log-explorer.md)).

The 참조 작업자 is `tooling/scripts/validation-worker-mock.mjs`: a **합성 fixture** that invents rule results from the sample list. It is not evidence of any in-house Validator integration.


## 진단 읽기 투영 (#1815)

**A1·A2 As-built; B0/B1 Decided · 미구현.** [진단 리포트 설계](../../../design/features/log-lifecycle/diagnostic-report-parity.md)의 Slice A에서 summary 투영(A1)과 근거 상태 읽기(A2)는 아래 계약으로 구현했다. 시도 진단(B0/B1, [ADR-0159](../../../adr/0159-attempt-diagnostic-separate-worker-write-and-source-acl-read.md))은 플랫폼이 정한 구조로 확정했고 구현 전이다(소유자 2026-11-13, R1·R2). 기존 worker result 쓰기 shape·상한·verdict는 바꾸지 않는다.

### AttemptOut과 summary 허용 목록

`AttemptOut`의 기본 필드는 `id`, `attemptNo`, `workerActorId`, `startedAt`, `endedAt`, `outcome`, `executorVersion`, `executorDigest`, `ruleSetRevision`, `inputManifestDigest`, `manifestMatches`, `resultDigest`, `verdict`, `ruleCount`, `requiredUnchecked`, `counts`, `opinionCount`다. `withAttemptRuleSets`가 붙이는 별도 RuleSet 연결 투영도 유지한다. `requestDetail`은 Round 요청만 읽는다.

**As-built (A1).** `AttemptOut`에 세 필드를 항상 낸다: `workerSummaryProjection: 1`(서버가 적용한 허용 목록의 버전, 상수), `workerSummaryState: not_submitted | no_allowed_fields | available`, `workerSummary: WorkerSummaryV1 | null`. 허용 목록 버전 1은 아래 다섯 키뿐이다. 허용된 값이 하나 이상이면 available, 저장 summary가 null이면 not_submitted, 객체에 유효한 허용 키가 없거나 객체가 아닌 JSON이면 no_allowed_fields(이때 `workerSummary`는 빈 객체 대신 null)다. 실패 시도의 `{ reason }`도 저장 summary이므로 no_allowed_fields가 된다.

| 키 | 타입과 검사 | 이유 |
| --- | --- | --- |
| `fixture` | `'synthetic'` | 합성 결과 표시. 참조 작업자의 기존 키 |
| `mode` | `'pass' \| 'fail' \| 'incomplete'` | 생산자가 의도한 실행 모드. verdict가 아니며 verdict를 대체하지 않는다 |
| `durationMs` | 정수 0–86,400,000 | 실행 시간. 숫자라 원본 텍스트를 실을 수 없다 |
| `producer` | `^[a-z0-9][a-z0-9._-]{0,63}$` | 진단 생산자 식별자(아래 B1의 `producer`와 같은 문법). 의견의 `producer`(자유 text ≤200)와 같은 개념(생산자 식별자)이나 이 표면은 문법을 좁히고, 기존 의견 데이터는 바꾸지 않는다. 소문자·숫자·`._-`만이라 경로·문장을 담지 못한다 |
| `producerVersion` | `^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$` | 생산자 버전 문자열. 같은 이유로 좁은 문자 집합 |

검사는 읽을 때 저장 행마다 다시 한다(쓰기는 지금처럼 임의 JSON이라서). 키별로 따로 판정해 잘못된 값·미지 키·중첩 객체·배열은 그 키만 빼고, 원본 JSON·빠진 키 이름·빠진 값은 DTO·로그에 남기지 않는다. 쓰기 경로·4,096 bytes 상한·`secret_detected`는 그대로다.

**자유 텍스트 키를 두지 않는 이유.** 이 투영은 `requestDetail`의 시도 목록으로 `platform:view`만 있으면 읽힌다. R5에 따라 Source 유래 내용은 원본 소유자 ACL을 매 접근 판정해야 하는데, 제목·설명 같은 문장은 비밀 패턴 검사(ADR-0117 결정 7)를 통과해도 로그 줄·경로·값을 담을 수 있어 원본 비포함을 증명할 수 없다. 길이·문자 집합 제한도 짧은 원문 조각을 막지 못한다. 그래서 제목·설명·표는 아래 시도 진단에서 ACL 읽기로만 낸다. `counts`·verdict는 서버 계산 필드를 그대로 쓰며 worker summary 수치로 대체하지 않는다. summary 투영은 기존 객체 가시성 안에서만 내려주고 검색·감사·알림에 값을 더하지 않는다. 허용 목록을 바꾸면 `workerSummaryProjection`을 올린다.

### 근거 행의 두 상태 축

기존 `RuleResultOut`의 `id`, `ruleId`, `result`, `required`, `expected`, `observed`, `evidence`, `hasExcerpt`, `opinion`을 유지한다. `evidence[]`는 `{ fileRef, line, fileSha256, hasExcerpt }`이다. 발췌 본문은 목록에 넣지 않는다.

**As-built · #1815 A2.** `POST /api/v1/menu-query`, endpoint `logLifecycle.evidenceStates`, params `{ ruleResultId }` (uuid; unknown keys including `evidenceIndex` are rejected with `outcome: error`). Right `platform:view`, menu `log-validation-requests`, `requiresScope: false`, no Context. A human session is required; tokens return `forbidden` before any state lookup.

Returns `ok` + `{ rows: [{ ruleResultId, evidenceIndex, evidenceRef: { fileRef, line, fileSha256 }, excerptState, sourceState }] }`, one row per original evidence entry (at most 20), including duplicate locations at their original indices. An unknown, foreign-workspace or currently hidden result returns `ok` + `null`. A visible result without evidence returns `{ rows: [] }`. The read rechecks object visibility and the Round's current source-owner `lifecycle.excerpt.read` ACL each call in its transaction; revocation applies to the next call in the same session. It never reads excerpt storage for a caller without that right. The references and `hasExcerpt=false` fact already visible in `ruleResults` remain visible.

| Axis / returned value | Authority and handling |
| --- | --- |
| excerptState `not_submitted` | The visible result's evidence entry has `hasExcerpt=false`; no excerpt right is needed to learn this public fact |
| `not_loaded` | Right held and a live excerpt row exists; the body still requires the separate audited `excerpt` read |
| `no_permission` | Object visible, evidence has `hasExcerpt=true`, source-owner excerpt right missing; no existence or erasure metadata queried |
| `unknown` | Right held but the submitted excerpt has no stored row or has been erased; no authoritative deletion provenance |
| sourceState `no_permission` | Source-owner excerpt right missing; source existence/hash state is not checked |
| `hash_mismatch` | Right held and the same `fileRef` in the Round's sample manifest has a different sha256 than the evidence `fileSha256` |
| `not_checked` | Right held; no known same-file manifest mismatch. Does not assert current Source availability or existence |

Erasure reasons share one free-text `deleted_reason` column: the purge job writes `retention`, but the admin action can also write that exact text. Without authoritative provenance this read returns `unknown` for both, including legacy rows, and emits neither `expired` nor `deleted`. It never returns or parses the reason. No DDL, migration or backfill is added.

This module has no Source check available for this read. It makes no new Source call and reports no `available`, `absent`, `unsupported` or `temporarily_unavailable`; missing local injection means `not_checked`, never `absent`. Only the manifest comparison uses data already stored for the same file. Opening the original still uses the existing Source contract with a fresh ACL check. Excerpt and Source survival remain independent.

This read contains no body text and writes no audit row, verdict, Gate decision or opinion. The existing `RuleResultOut`, `hasExcerpt` and audited `excerpt` response remain unchanged; body access still records `lifecycle.excerpt.read` without text.

### 시도 진단 (AttemptDiagnostic, B0/B1)

**Decided · 미구현.** 결정과 대안은 [ADR-0159](../../../adr/0159-attempt-diagnostic-separate-worker-write-and-source-acl-read.md). 이 절이 wire·상한·읽기 계약을 소유한다. `AttemptDiagnostic`은 시도 × 생산자당 문서 하나, `DiagnosticItem`은 그 안의 항목이다. 규칙 결과·의견·사람 등록 항목과 다른 출처이며 verdict·Gate·Knowledge·회귀 비교·의견은 이 표를 읽지 않는다(시험으로 고정).

**쓰기 (worker REST, token-only).** `POST /api/v1/validation-queue/requests/:id/attempts/:attemptNo/diagnostics`, `tokenCallable`, scope `validation.worker`(다른 worker 경로와 같은 거절: 세션·scope 없는 토큰 403 `permission.denied`, 자격 없음 401). 요청 주체는 Round와 suite item 둘 다 받는다. 시도는 `succeeded`여야 한다.

```text
{ schemaVersion: 1, producer, producerVersion, inputManifestDigest,
  items: [ { itemKey, origin: 'rule' | 'analysis', ruleId?, title, explanation?,
             evidenceRefs?: [{ fileRef, line, fileSha256 }],
             tables?: [ { tableKey, title?, columns: [{ key, label, type: 'string' | 'number' | 'boolean' }],
                          rows: [ { <column key>: string | number | boolean | null } ] } ] } ] }
```

| 필드 | 규칙 |
| --- | --- |
| `schemaVersion` | `1`만. 다른 값은 `['schemaVersion'] unsupported_version` |
| `producer` | `^[a-z0-9][a-z0-9._-]{0,63}$`. 시도당 생산자 4개(`too_many`) |
| `producerVersion` | `^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$` |
| `inputManifestDigest` | sha256 hex. 시도의 저장값과 다르면 `['inputManifestDigest'] manifest_mismatch`(다른 입력의 진단을 섞지 않음) |
| `itemKey` | `^[A-Za-z0-9._:-]{1,200}$`, 문서 안 고유(`duplicate`). 배열 순번·제목을 키로 쓰지 않는다 |
| `origin`·`ruleId` | `rule`은 `ruleId` 필수이고 같은 시도의 규칙 결과여야 한다(`not_in_attempt`). `analysis`는 `ruleId` 선택(있으면 같은 검사). 읽기는 `ruleResultId`로 바꿔 낸다 |
| `title` | 한 줄(제어 문자 제거) 1–200자 |
| `explanation` | 0–4,000자, 개행·탭 유지(발췌와 같은 정리). 텍스트로만 렌더 |
| `evidenceRefs` | 항목당 20개, 위치는 요청 주체의 sample 목록 안(`not_in_sample`). 기존 근거 위치 타입 그대로 |
| `tables` | 항목당 4개. `tableKey` `^[a-z0-9_]{1,32}$` 항목 안 고유, `title` 200자 |
| `columns` | 표당 1–16개. `key` `^[a-z0-9_]{1,32}$` 고유, `label` 한 줄 1–80자, `type` 셋 중 하나 |
| `rows` | 표당 200행. 각 행은 열 key만 가진 평면 객체(빠진 key는 `null`), 값은 열 type에 맞는 string(한 줄 ≤ 500자)·유한 number·boolean·`null`. 중첩·배열·미지 key는 `malformed` |
| 문서 | items 1–500. 시도의 모든 생산자 합계 정규화 UTF-8 512 KiB(`diagnostic_total_too_large`) |

모든 텍스트(제목·설명·라벨·셀·키)에 ADR-0117 결정 7의 비밀 패턴을 적용한다(`secret_detected`). HTML·Markdown·수식·URL은 해석하지 않는 글자일 뿐이며 서버는 어떤 주소도 fetch하지 않는다. 초과·미지 필드는 422 `validation.failed`, `detail.fields[{ path, code }]`이고 아무것도 쓰지 않는다. 자동 절단은 없다.

**상한의 이유.** 셀 500자는 `expected`/`observed`와 같은 한 줄 기준이다. 설명 4,000자는 발췌 2,000자의 두 배로, 문단 몇 개의 «왜 문제인가»를 담고 원문 덤프는 막는다. 행 200·열 16은 한 화면 Drawer에서 읽는 표 크기다. 수량 상한만 곱하면 수 MB가 되므로 합계 512 KiB가 실제 상한이다: 같은 Source 유래 본문인 발췌의 시도당 256 KiB에 표 구조 오버헤드를 더한 두 배이고, 서버 JSON 본문 기본 한도(1 MiB) 안에서 한 요청으로 끝난다. summary 4,096 bytes는 표 하나도 못 담는 메타데이터 자리라 쓰지 않는다. items 500은 규칙 결과 상한 2,000의 4분의 1로, 진단은 주목할 항목만 담는다.

**멱등과 고침.** 서버가 정규화 본문(제어 문자 제거)의 digest를 저장한다. 같은 `(시도, producer)`에 같은 digest → `200 { requestId, attemptNo, producer, itemCount, duplicate: true }`, 다른 digest → `409 conflict.stale_write`. 생산자당 문서는 한 번 쓰면 바뀌지 않으며 고침은 새 시도다. `404 not_found`(요청·시도 없음), `409 conflict.attempt_not_succeeded`는 의견 경로와 같다. 감사 `lifecycle.diagnostic.recorded`(subject `execution_request`; `attemptNo`, `producer`, `itemCount`, 본문 없음), 새 문서를 쓸 때만.

**읽기 (`platform:view`, menu `log-validation-requests`, 사람 세션만).** Round 시도만 답하고 suite item 시도·모르는/숨겨진 시도는 `ok` + `null`이다. 매 호출 트랜잭션에서 객체 가시성과 Round 원본 소유자의 `lifecycle.excerpt.read`를 다시 판정한다(근거 상태 읽기와 같은 권리).

- `logLifecycle.diagnostics` `{ attemptId, ruleResultId?, page, pageSize ≤ 100 }` → `{ access: 'granted' | 'no_permission', documents: [{ producer, producerVersion, schemaVersion, itemCount, createdAt }], rows: [{ producer, itemKey, origin, ruleResultId, evidenceCount, tableCount, rowCounts, bodyState, title }], total }`. 순서는 producer, 쓴 순서. 권리가 없으면 `title`은 `null`이고 나머지는 형태 메타데이터라 그대로 낸다(R5의 독립 메타데이터). 문서가 없으면 `documents: []`, `rows: []`. 권리가 있고 제목을 낸 호출은 `lifecycle.diagnostic.read`(subject `execution_request`; `attemptId`, `scope: 'list'`, 행 수)를 한 줄 쓴다.
- `logLifecycle.diagnosticItem` `{ attemptId, producer, itemKey, tableKey?, rowOffset? }` → `{ item: { producer, itemKey, origin, ruleResultId, title, explanation, evidenceRefs, bodyState, tables: [{ tableKey, title, columns, totalRows, rowOffset, rows }] } }`. 표마다 행 100개씩, `tableKey`+`rowOffset`으로 그 표의 다음 쪽을 읽는다. 권리 없음은 `forbidden`, 모르는 항목은 `ok` + `null`. 감사 `lifecycle.diagnostic.read`(`scope: 'item'`, `itemKey`, 본문 없음).

`bodyState`는 `live | erased_retention | erased_admin`이다. 지워진 항목은 `title`·`explanation`·셀·표 제목·열 라벨이 `null`이고 키·출처·규칙 연결·근거 위치·표 형태는 남는다. 새 표라서 삭제 원인을 열거형 열(`erased_cause`)로 저장하므로 원인을 낸다. 발췌 표의 `deleted_reason`은 관리자 사유 텍스트이고 열거형이 아니다(R3의 과거 발췌 행 `unknown`은 그대로).

**수명과 삭제.** 본문은 발췌와 같이 Round `closed` + `excerptRetentionDays`(suite 주체는 suite run 종료 기준) 뒤 지운다. 같은 일일 작업과 관리자 `excerptDelete`(Round·시도 범위)가 같은 저장 경로로 진단 본문도 지우며, 원인은 `retention`·`admin`으로 따로 기록한다. 수명 이유: 진단 본문은 발췌와 같은 Source 유래 텍스트다.

**저장 (B1 마이그레이션).** `log_lifecycle.attempt_diagnostic`(시도·workspace·producer·버전·schemaVersion·digest·바이트 수·actor·token, `(attempt_id, producer)` 고유)과 `attempt_diagnostic_item`(항목 키·순서·origin·`rule_result_id`·근거 jsonb·제목·설명·표 jsonb·`erased_at`·`erased_cause`). `platform_app`은 SELECT·INSERT만, 삭제는 발췌와 같은 `SECURITY DEFINER` 함수 경로, guard trigger가 그 한 가지 UPDATE만 허용한다. 열 이름·인덱스는 B1 PR이 [04](../../../../apps/platform-api/docs/04-database-and-migrations.md)에 적는다.

**첨부 (R4).** schemaVersion 1에는 첨부 필드가 없다. 방향은 Source 소유 참조(형식 CSV·PDF·PNG, 내용 해시·크기·형식만 플랫폼에 저장, 열기는 Source 계약의 새 ACL 판정, 보관은 Source 수명이며 발췌 90일과 무관)다. 플랫폼 저장 첨부와 세션 전용 `uploadFile`의 worker 전용은 쓰지 않는다. 버전 2 필드로 여는 조건은 [backlog](../../../../.planning/backlog.md)의 #1815 행이 가진다.

## 작업자 입력 전달 (#1807)

**Candidate · 미구현.** [ADR-0152](../../../adr/0152-worker-input-delivery-source-owner-step.md)의 상세 계약 후보다. 소유자 확정·사내 적합성 확인 뒤 구현하며 endpoint 경로와 DDL은 정하지 않는다. 기존 Worker REST·SourceReadPort 동작은 그대로다.

### 해석 단계와 응답

논리 동작 이름 후보는 `resolveWorkerInput`이다. 작업자의 `requestId`, `attemptNo`, `sourceOwner`, `fileRef`, expected `sha256`를 받아 서버가 요청 주체의 고정 샘플 목록과 대조한다. Round와 회귀 항목 모두 claim에 고정된 순서·해시·manifest digest를 사용한다. 이유: 작업자가 다른 파일·시도의 읽기 권한을 만들 수 없어야 한다.

`fileRef`는 Source 종속 불투명 안정 참조로 유지한다. Source 어댑터만 실제 위치를 해석하고 URL·로컬 경로·스토리지 키를 DB의 `fileRef`로 쓰지 않는다. 응답 후보의 공통 메타데이터는 상태와 요청/시도 식별자이며 `ready`만 expected SHA-256, 만료 시각, 읽기 전용 전달 수단을 갖는다. 수단은 Source 소유 스트림, storage key broker, 짧은 TTL의 signed GET 중 하나다. 내부 키는 broker 안에 감추고 signed URL은 작업자 전달 응답에만 일시적으로 둔다. 영속 DTO·공개 딥링크에는 넣지 않는다.

| 상태 후보 | 의미와 작업자 동작 |
| --- | --- |
| `ready` | 현재 접근이 허용된 바이트 전달 수단. 읽은 뒤 별도로 해시 검증 |
| `absent` | 허가된 Source에서 원본 부재 확인. Rule FAIL로 바꾸지 않음 |
| `revoked` | 토큰·Source 접근 철회 또는 유효 claim 상실. 재발급·이어 읽기 중단 |
| `hash_mismatch` | Source가 확인한 바이트 해시가 고정값과 다름. 실행 금지 |
| `unsupported` | 해당 Source가 입력 전달을 지원하지 않음. 성공으로 대체하지 않음 |
| `temporarily_unavailable` | 일시 장애·전송 예산 초과. 제한된 재시도만 허용 |

인증·객체 가시성 판정 전에는 원본 존재 상태도 노출하지 않는다. 인증 실패·숨겨진 요청의 오류 봉투는 기존 서버 계약을 따르며 위 상태는 인증 이후의 전달 상태다.

### 권한과 수명

- 서비스 토큰 `validation.worker`와 현재 claim의 Actor·attempt·lease, workspace, Source ACL을 **매 접근** 서버에서 함께 판정한다. Source 권한을 토큰 scope로 대체하지 않는다.
- 새 전달 수단 발급은 유효 lease에만 허용하는 후보이며, 만료 시 기존 heartbeat로 연장/재획득한 뒤 다시 해석한다. 기존 큐의 늦은 result/fail 수락 규칙은 변경하지 않는다. 이유: 완료 결과 보존과 신규 원본 접근 승인은 다르다.
- 철회 뒤 재발급은 즉시 거절한다. 이미 발급한 signed GET은 만료까지 접근될 수 있고 진행 중 전송도 즉시 중단을 보장하지 못한다. TTL은 남은 lease·Source 정책 상한 중 짧은 값 이내로 제한한다. 즉시 철회가 필요하면 매 접근 검사와 활성 스트림 중단을 지원하는 게이트웨이를 선택한다. TTL 수치·허용 철회 지연은 Open이다.
- 대용량 전송 중에도 heartbeat를 유지한다. 취소·lease 재할당·권한 철회가 확인되면 전송·실행을 중단하고 임시 파일을 정리한다. 임시 스테이징도 Source 보관·삭제·사내 무반출 정책을 따른다.

### 무결성과 오류

작업자는 실제 끝까지 읽은 바이트의 SHA-256을 expected hash와 비교하고 사용자 파일 순서를 보존해 전체 manifest digest를 다시 계산한다. ETag를 SHA-256으로 쓰지 않는다. 부분 전송·절단·누락·해시 불일치는 성공 근거가 될 수 없다.

파일 접근 오류는 **Rule FAIL과 별개**다. 실행 전 실패는 기존 fail 경로로 시도를 종료한다. 부분 검증은 실제 검사하지 못한 필수 규칙을 `ERROR|NOT_CHECKED|SKIPPED`로 제출해 기존 verdict 계산을 따른다. 이미 확인한 FAIL이 있으면 기존 우선순위대로 verdict는 fail일 수 있다. 가짜 FAIL·PASS를 만들지 않는다. 재시도는 유효 lease·취소·전송 예산을 다시 확인하며 결과 멱등성은 ADR-0117 그대로다.

### 전송 한도와 기록 경계

파일 수는 기존 sampleSet 상한 안에서 정하고 파일별/총 바이트·동시 다운로드·전송 시간·재시도 수를 유한하게 제한한다. 스트리밍·백프레셔·취소를 지원하고 파일 전체를 플랫폼 메모리에 모으지 않는다. 구체 수치는 실사 항목이며 무제한 기본값은 허용하지 않는다.

호스트·스킴·포트 allowlist, redirect 재검사, DNS 해석 뒤 목적지 검증으로 SSRF를 막는다. 사용자 제공 URL을 직접 fetch하지 않고 Source가 해석한 목적지만 쓴다. 사내 목적지는 승인된 것만 허용하며 메타데이터 서비스·경로 탐색·임의 로컬 파일 접근을 차단한다. 업로드 MIME allowlist를 원본 로그 읽기 형식의 근거로 쓰지 않는다. 이유: 원본 입력과 수동 첨부는 다른 자원이다.

감사·서버/프록시/작업자 로그·추적·오류·알림에는 signed URL, query credential, 스토리지 키, 원본 경로, 토큰, 원문을 기록하지 않는다. 감사 후보는 request/attempt 식별자, 상태 코드, 바이트 수, 소요 시간뿐이며 원본 `fileRef`도 생략한다. 다운로드 credential은 메모리 수명 안에서만 다룬다.

### 적합성 확인과 Open decisions

공개 검증은 합성 파일로 분리 컨테이너 사이 공유 로컬 경로 없이 claim→해석→전송→SHA-256→result를 확인한다. 다른 Actor/attempt, 토큰 철회, URL 만료, hash mismatch, 부분 전송, lease 재할당, 전송 중 취소를 포함한다. 사내 실제 원본 적합성은 내부에서만 수행하며 경로·호스트·토큰·원문을 공개 CI/Artifact/AI에 옮기지 않는다.

| ID / 상태 | 선택지와 확인 질문 | 추천과 이유 |
| --- | --- | --- |
| I1 Open | Source 스트림/게이트웨이, storage broker, 임시 MinIO/S3 signed GET 중 어느 연결이 가능한가? 원본 위치·접근 주체·작업자 망 연결은? | 기존 Source 게이트웨이 우선. 복사를 줄이고 철회 판정을 한 곳에 둠. 공급자는 실사 전 미선택 |
| I2 Open | 짧은 URL TTL과 만료까지 철회 지연 허용, 또는 즉시 중단 프록시? | 철회 지연을 허용하지 않으면 프록시. 수치는 최대 파일·망 속도와 함께 확인 |
| I3 Open | 파일별/총 크기·동시 수·시간·재시도·임시 보관 상한은? | 측정한 최대 입력과 운영 예산에 맞춘 유한 상한. 업로드 32 MiB를 전용하지 않음 |
| I4 Open | 유효 lease에서만 새 전달 발급, 또는 별도 읽기 유예? | 유효 lease만 추천. heartbeat 재획득으로 재할당과 원본 접근 경합을 줄임 |

입력 전달은 미구현이며 I1–I4 답과 사내 적합성 조건이 갖춰질 때 구현 노드를 연다. 출력 리포트는 [#1815 설계](../../../design/features/log-lifecycle/diagnostic-report-parity.md)가 소유한다.

## Screen reads (node f, #1447)

`logLifecycle.queueStatus {}` belongs to `log-validation-requests`, requires only the existing `platform:view`, and answers `{ runWindow, immediateLimit, serverAt, withinWindow }`. Settings come from the workspace's existing queue settings/defaults; `serverAt` is the database instant and `withinWindow` uses that instant. No default schedule is invented by the screen.

`roundDetail.gateAvailability` is `{ targetStage, projectVersion, reasons[], decisions: { approved, rejected, exception }, basis }`. Each decision is `{ allowed, reasons[] }`. Reasons are the existing action-rule codes: `session_required`, `permission_denied`, `project_not_open`, `round_not_current`, `round_stage_mismatch`, `verdict_not_pass`, `exception_not_needed`, `software_required`; approving decisions also report `round_owner_unresolved` or `round_owner_mismatch`. The read applies the current actor's existing Gate capability and the same pure target/verdict rules as `gateDecide`; it exposes no excerpt or new permission. A token can read the Round but receives `session_required`; the read does not attempt a sensitive mutation check for a token.

The availability/basis is a hint from independent reads, not an atomic authorization or a reservation. `gateDecide` remains authoritative under its project/Round locks and checks `expectedVersion` against the project version. Request date filters use page keys `requestedFrom`/`requestedTo`, mapped to API `from`/`to`, so they do not collide with global Context keys. The UI preserves conflict/error drafts; unknown/error retries use the Kernel result's identical-request retry. All final Gate history entries retain their original frozen basis.
