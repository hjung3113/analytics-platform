# log-lifecycle module

Owns the development project of a model, its append-only history and its validation rounds (#1444 node c; design `docs/design/features/log-lifecycle/README.md`, API `docs/architecture/platform-api/api/log-lifecycle.md`). Not here yet: requests, attempts, rule results, Gate (nodes d/e).

## Invariants

- `model_id` / `software_id` are plain uuids, no cross-schema FK: a write checks them through the log-knowledge barrel port (`knowledgeLookup`), never through its repositories. The model list read joins `knowledge.*` tables directly (documented in 02).
- One open project per model: the partial unique index is the judge; a violation maps to `open_project_exists`.
- Stage moves follow `domain/stage-transitions.ts`. The guard trigger `log_lifecycle.project_guard` carries the same pairs (drift test); `completed` is reachable only through the Gate, so `projectSetStage` refuses it (`gate_required`).
- `development_event` is append-only (trigger + no UPDATE/DELETE grant). Event `seq` and round `seq` are `max + 1` under the project row lock (`FOR UPDATE`): lock before allocating.
- A round's `sample_set`, `sample_manifest_digest`, `spec_pin`, `stage`, `seq`, `note` never change after insert; the `spec_pin` is computed by the server (log-knowledge), never accepted from the client. `closed` is final.
- Every write is one transaction: row change, event (projects only) and `core.audit_log` row; audit detail is body-free (`packages/feature-shared/src/audit/log-lifecycle.ts`).
- Manual validation attachment (#1451, D6) is an attachment with parent kind `validation_round`, not a table: `roundEvidenceAttach` (right `lifecycle.round.manage`, open rounds only, links through the Attachments barrel `linkAttachments`, audit `lifecycle.round.evidence_attached`) writes it and `roundEvidence` lists it. Download is judged by `roundAttachmentParent` (`attachment-parent.ts`, registered in `server.ts`): `platform:view` and the round in the actor's workspace; it never consults VOC rights.
- Reads filter by the session workspace; a foreign id answers `ok` with `data: null` (empty page for lists). No read or action accepts an unknown param/input key.
