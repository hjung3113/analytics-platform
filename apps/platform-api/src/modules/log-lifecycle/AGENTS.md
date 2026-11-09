# log-lifecycle module

Owns the development project of a model, its append-only history and its validation rounds, plus the validation request queue (ADR-0117) and the Gate decision. Design: `docs/design/features/log-lifecycle/README.md`; API: `docs/architecture/platform-api/api/log-lifecycle.md`. «Append-only» below always means: DB trigger plus no UPDATE/DELETE grant.

## Invariants

- `model_id` / `software_id` are plain uuids, no cross-schema FK: a write checks them through the log-knowledge barrel port (`knowledgeLookup`), never through its repositories. The model list read joins `knowledge.*` tables directly (documented in 02).
- One open project per model: the partial unique index is the judge; a violation maps to `open_project_exists`.
- Stage moves follow `domain/stage-transitions.ts`; the guard trigger `log_lifecycle.project_guard` carries the same pairs (drift test). `completed` is reachable only through the Gate, so `projectSetStage` refuses it (`gate_required`).
- `development_event` is append-only. Event `seq` and round `seq` are `max + 1` under the project row lock (`FOR UPDATE`): lock before allocating.
- A round's `sample_set`, `sample_manifest_digest`, `spec_pin`, `stage`, `seq`, `note` never change after insert; the `spec_pin` is computed by the server (log-knowledge), never accepted from the client. `closed` is final.
- Every write is one transaction: row change, event (projects only) and `core.audit_log` row; audit detail is body-free (`packages/feature-shared/src/audit/log-lifecycle.ts`).
- Manual validation attachment (수동 검증 첨부, "manual validation attachment") is an attachment with parent kind `validation_round`, not a table: `roundEvidenceAttach` (right `lifecycle.round.manage`, open rounds only, links through the Attachments barrel `linkAttachments`, audit `lifecycle.round.evidence_attached`) writes it; `roundEvidence` lists it.
  - Download is judged by `roundAttachmentParent` (`attachment-parent.ts`, registered in `server.ts`): `platform:view` and a round in the actor's workspace whose model / SW version the actor may see; it never consults VOC rights.
- Each manual validation attachment is also an Entity Link `manual_validation_attachment → validation_round` (`evidence_of`, no Managed System; ADR-0123): `roundEvidenceAttach` writes it through the injected `deps.entityLinks.createNoManagedSystemLink` in the same transaction as `linkAttachments` and the audit, so a failed link write rolls the attach back.
  - `entity-link-provider.ts` is the `validation_round` end (`platform:view`, round in the workspace and visible to the actor). `readRoundEvidenceLinks` (barrel) is the Gate's read port: the Round's links with the Round's visibility (workspace and object access), `null` otherwise, no Gate logic. The 개발 건 ("development project") end has no provider yet (no pair uses it).
- Screen projections: `roundDetail.gateAvailability` reuses the pure Gate rules and current capability without locking or writing; `gateDecide` rechecks under locks. `queueStatus` exposes existing settings and database time; rule-result sorting is server-side.
- Evidence locations (`round_evidence_ref`) are append-only, written only by the barrel service `roundEvidenceRefIntake` (`round-evidence-ref-intake.ts`; the explorer calls it inside its own transaction; it never imports `log-explorer`, its input type is declared in `domain/evidence-ref-intake.ts`).
  - It re-judges `lifecycle.round.manage` (denied = `MenuActionInvalidError` `['target'] forbidden`), the Round (workspace, `open`) and the shape, decides each pointer's status itself, takes `seq` under the Round row lock and inserts with `ON CONFLICT DO NOTHING` (never catch `23505` on the caller's tx).
  - Not the manual attachment of `round-actions.ts` / `round-evidence-links.ts` (files).
- Reads filter by the session workspace; a foreign id answers `ok` with `data: null` (empty page for lists). No read or action accepts an unknown param/input key.
  - The hierarchy read answers `{ failure: 'deleted' }` for an unknown, moved or foreign path so the menu Source can produce `HierarchyFailure('deleted')`; contract: [log-lifecycle.md](../../../../../docs/architecture/platform-api/api/log-lifecycle.md#hierarchy-1449).

## Validation request queue

- The worker side (claim, heartbeat, result, fail) is token-only REST (`validation.worker`, a token-only scope for service tokens); the human side (`request-actions.ts`, `request-endpoints.ts`) is separate. Time is the database's `now()`; only the run-window judgment takes the injected clock.
- Claim = `select … for update skip locked` in one transaction that first requeues expired leases (no periodic job). The state table is `domain/request-states.ts` (SQL guard `request_guard`, drift test); the verdict is `domain/verdict.ts` and is the only source of `verdict` — no input carries a verdict or an AI opinion.
- A late result/fail is accepted only for the latest lease-expired attempt of a `queued` request; a heartbeat there re-claims the lease for the same attempt (`reclaimLease`, under the request lock); any other worker's attempt, a cancelled/expired request is `queue.lease_lost` (answered by the route, not the shared error registry).
  - Same result digest = same 200, another digest = `conflict.stale_write`.
- Excerpt text lives only in `rule_result_excerpt`; list reads, audit rows, summaries and notifications never carry it. The excerpt read is gated by `excerpt_reader` (per `sourceOwner`, admin-set), audited per read without text, refused to tokens.
- Settings are `queue_settings` (defaults when no row); change them under a per-workspace advisory lock (`lockQueueSettings`).
  - Excerpt bodies are erased only by `log_lifecycle.erase_excerpts` (definer function; the runtime role has no UPDATE): the daily job `excerpt-purge-job.ts` (`lifecycle.excerpt_purge`, round closed + `excerptRetentionDays`) and the admin action `excerptDelete` (round / attempt scope, required reason).
- `rule_result_evidence` holds one location row per distinct `(file_ref, line, file_sha256)` of a result, written by `insertRuleResults` in the result's own transaction; insert-only. The barrel read port `lifecycleEvidenceRead` (`evidence-link-read-port.ts`) is the explorer's reverse lookup: workspace-filtered and object-access-filtered (it takes a `Viewer`), newest first, paged, ids and locations only.
- The reference worker is the 합성 (synthetic) fixture `tooling/scripts/validation-worker-mock.mjs`.

## Gate decision

- `gateDecide` (`gate-actions.ts`) is a HUMAN approval: capability `lifecycle.gate.decide` (sensitive, session-only), plus an explicit refusal of any non-`internal_member` actor and of any token context before a statement. No input carries a verdict or an opinion; the Gate never writes a verdict, rule result or request.
- Lock order: project, then round (as `roundOpen`); `currentVersion` locks the project through the round. Every decision bumps the project version; an approving one (approved / exception) moves the stage in the same transaction. Pure rules: `domain/gate-rules.ts`.
- `gate_decision` is append-only. `basis` is frozen at decision time and holds attempt ids/verdicts, `rule_set_revision`, `input_manifest_digest`, `spec_pin`, the request digest and the 수동 검증 첨부 link ids and times only. No stale / 재검증 필요 ("re-verification needed") calculation (design §9). Self approval is stored (`self_approved`), never blocked.
- Reason text and exception scope are visible to every reader of the round; audit (`lifecycle.gate.decided`) carries ids, enums and counts only.
- Request subject (ADR-0117 amendment 1): `execution_request` is for a round XOR a suite run item (DB CHECK). A suite subject carries its run id and the sample list pinned at registration, so claim/result never read log-datasets; log-datasets reaches the queue only through `lifecycleSuiteRequests` (barrel).
  - The round request reads/cancel join the round and so never see a suite subject. Excerpt retention for a suite subject counts from the finish of its suite run (`erase_excerpts`).
- Suite result read port: `lifecycleSuiteResults` (`suite-result-read-port.ts`, barrel) gives log-datasets the rule ids, result names and `required` flags of a request's LATEST `succeeded` attempt, on the caller's transaction — never expected/observed text, evidence or an excerpt. Read-only; log-lifecycle still never imports log-datasets.
