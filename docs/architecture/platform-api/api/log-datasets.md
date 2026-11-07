# Log Test Datasets

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for the test datasets of the log domain (#1477 node D-a): two reads and six writes of menu `log-datasets`. Design and decisions: `docs/design/features/log-test-datasets/README.md` §2, §3.1, §3.2, §3.7, §5, §6, §8 and [ADR-0120](../../../adr/0120-regression-runs-reuse-validation-queue-dataset-identity-separate-from-round.md). Not here yet: baselines, suites, runs, comparison, review labels (nodes b–d), screens (node e). Dataset ≠ data-collection Source, Baseline ≠ metric Baseline (`GLOSSARY.md`).

## Transport and permission

- Owning menu id `log-datasets` (`LOG_DATASETS_MENU_ID`). Reads: `permission: 'platform:view'`, `requiresScope: false`, `context: {}`, `mergeTimeDomain: false`; the workspace is the session actor's and no param names it.
- A bad param is an `error` outcome (HTTP 200, `data: null`, `message`), never an empty page. The outcome set has no `not_found`: an unknown, other-workspace or invisible id answers `ok` with `data: null` (the list answers an empty page).
- **Visibility.** `share_scope = 'workspace'` is visible to every member of the workspace; `private` to its owner only (not to an Admin either). A write on a dataset the actor cannot see is `not_found` (versioned actions) or `invalid` `datasetId:not_found` (`revisionCreate`) — the same answer as another workspace's id. Only the owner changes `shareScope` (`invalid` `shareScope:owner_only`).
- Writes: `POST /api/v1/menu-action`, `requiresScope: false`, menu permission `dataset:manage`, capability `dataset.manage` (workspace-scoped, non-sensitive, `adminModuleBypass: 'always'`, refused for a User recipient like `lifecycle.*`). Developers receive it by grant.
- Refusals use the dispatch envelope: HTTP 200 `{ outcome: 'invalid', fieldErrors: [{ path, code }] }`; `conflict` is only an `expectedVersion` mismatch; creates replay by `idempotencyKey`. Codes: `required`, `too_long`, `malformed`, `too_many`, `duplicate`, `not_found`, `illegal_transition`, `owner_only`, `unexpected_field`.

## Reads

| Endpoint | Params | Answer |
| --- | --- | --- |
| `logDataset.datasets` | `q?`, `page?`, `pageSize?`, `sorting?`, `filters?` (ADR-0105) | `{ rows, total }`; row = `id, name, purpose, owner{id,displayName}, shareScope, modelIds, scenarioTags, status, synthetic, revisionCount, latestRevisionSeq, version, createdAt, updatedAt`. **No stale field** (the «기준 낡음 요약» column is node b's). |
| `logDataset.datasetDetail` | `datasetId` | the head plus `revisions` (newest first) or `null` |

- Filters of `datasets`: `status` (`in`/`notIn`; `active`, `archived`), `tag` (set cell; `in` = any held, `notIn` = tagged and none of them, `isEmpty` = untagged, `isNotEmpty`), `model` (set cell over `modelIds`; same ops). Sort ids: `updatedAt` (default, desc), `name`, `status`, `createdAt`, `revisionCount`; ties by `id`. `q` matches name and purpose (case-insensitive contains).
- `datasetDetail.revisions[]`: `id, seq, sourceOwner, fileCount, digest, inputMeta, note, createdBy, createdAt, availability, availabilityChecked`. Only the **latest** revision lists `files[]` (`fileRef, order, sha256, state`, user order) and is checked against the Source **at read time**; older revisions are `availability: 'unverified'` with `availabilityChecked: false` (they are not re-checked: one Source call per file).

### Availability

A display computed at read time, never stored. Per-file states from the Source check: `match`, `hash_mismatch`, `hash_unknown` (file exists, hash not readable), `absent`, `permission_denied`, `unsupported`, `error` (call failed, aborted or out of budget). Revision availability, first match wins:

| Availability | When |
| --- | --- |
| `unavailable` | any file `absent` or `permission_denied` |
| `hash_mismatch` | else any file `hash_mismatch` |
| `available` | else every file `match` |
| `unverified` | everything else, including **no port**, `unsupported`, `error`, `hash_unknown`, or no check made |

`available` is claimed only when every file was found **and** its hash matched; an unsettled check is never shown as confirmed.

The check uses the injected `SourceReadPort` (log-explorer, ADR-0119); production injects none yet, so every availability is `unverified` there. The v0 port has no file-hash read: existence is asked with `getWindow` (line 1) and answers `hash_unknown`; a port that also offers the optional `describeFile({ sourceOwner, fileRef })` (`ok{sha256}` / `source_absent` / `permission_denied` / `unsupported`) can reach `match` / `hash_mismatch`. Start values: one call ≤ 2 s, whole check ≤ 10 s, 8 files in flight; a file not reached in time is `error`. The module never imports the synthetic adapter or `testing/`.

## Writes

| Action | `input` | Concurrency | Answer data |
| --- | --- | --- | --- |
| `logDataset.datasetCreate` | `name`, `purpose?`, `shareScope?` (default `private`), `modelIds?`, `scenarioTags?`, `synthetic?` | none | `datasetId, version` |
| `logDataset.datasetUpdate` | `id`, any of `name, purpose, shareScope, modelIds, scenarioTags` | version | `version` |
| `logDataset.datasetArchive` | `id` | version | `version` |
| `logDataset.revisionCreate` | `datasetId`, `sampleSet`, `inputMeta?`, `note?` | none | `revisionId, seq, digest, availability, availabilityChecked, fileCount, counts` |
| `logDataset.candidateCreate` | `origin`, `roundId?`, `evidenceRefs?`, `name`, `purpose?`, `modelIds?`, `scenarioTags?`, `sampleSet`, `inputMeta?`, `note?` | none | `candidateId, version` |
| `logDataset.candidateDecide` | `id`, `decision` (`approve`/`reject`), `reason?` (required for reject) | version | approve: `datasetId, revisionId, version`; reject: `version` |

- Limits: `name` 1–200, `purpose`/`note`/`reason` ≤ 2000 characters, `modelIds` ≤ 50 distinct uuids (log-knowledge stable ids; **no existence check, no FK** — an unknown id only never matches), `scenarioTags` distinct members of the closed set `normal, exception, boundary, regression, file_boundary, carryover, partial_support` (DB check too), `inputMeta` strict `{ encoding?, format? }` (confirmed values only; an unknown key is refused so a guess cannot be stored).
- `sampleSet` is the log-lifecycle shape and digest (`parseSampleSet`, `sampleManifestDigest`, re-exported, not copied): `{ sourceOwner, files: [{ fileRef, order, sha256 }] }`, ≤ 1000 files, order 1..n once. The digest is order-sensitive. The same digest twice in one dataset is `invalid` `sampleSet:duplicate`; another dataset may hold it.
- **Revisions are immutable.** `seq` is `max + 1` under the dataset row lock (`FOR UPDATE`), gapless per dataset. There is no edit or delete action; a DB trigger refuses UPDATE and DELETE for every role, and `platform_app` holds no such grant. A different file list is a new revision. An archived dataset takes no revision (`datasetId:illegal_transition`).
- **`revisionCreate` file check.** Each `fileRef` is checked through the port **before** the dataset row is locked (a slow adapter never holds the lock). The revision is created whatever the check answers; the answer is returned (`availability`, per-state `counts`) and audited but not stored. No port → `availability: 'unverified'`, `availabilityChecked: false`.
- `datasetUpdate`: a save that changes nothing answers `ok` with the current version and writes no audit row. Archived is final (`id:illegal_transition`).
- **Candidates** hold data references only (`origin` `manual`/`round_evidence`; `roundId` + `evidenceRefs` for the latter, `EvidenceRef` of log-explorer: `fileRef, line, fileSha256, note?`, no line body). No field takes code or a shell command; an unknown key is `unexpected_field`; there is no `llm` origin and no field naming another proposer: the proposer is the session actor. `candidateDecide` is final (`id:illegal_transition` when decided).
- **Approve** inserts the `dataset` (owner = proposer, `share_scope = 'workspace'`, so the reviewer sees what they decided), its first revision (`created_by` = reviewer) and the decision in **one transaction**; a failure at any step rolls all three back. **Reject** requires a reason and creates nothing.

## Audit

One `core.audit_log` row per write, in the same transaction, body-free (`packages/feature-shared/src/audit/log-datasets.ts`, strict schemas). Subject types `dataset`, `dataset_revision`, `dataset_candidate`:

| Event | Subject | Detail |
| --- | --- | --- |
| `dataset.created` (create) | dataset | `shareScope, scenarioTags, modelCount, synthetic` |
| `dataset.updated` (update) | dataset | `changed` (field names) |
| `dataset.archived` (retire) | dataset | `revisionCount` |
| `dataset.revision_created` (create) | revision | `datasetId, seq, fileCount, digest, availability` |
| `dataset.candidate_created` (create) | candidate | `origin, fileCount, evidenceCount` |
| `dataset.candidate_approved` (retire) | candidate | `datasetId, revisionId, fileCount` (approve also writes `dataset.created` and `dataset.revision_created`) |
| `dataset.candidate_rejected` (retire) | candidate | `reasonLength` |

Never in an audit row: a `fileRef`, a hash list, sample content, the text of a note, purpose or reason (length only).

## Storage

Schema `log_datasets` ([04](../04-database-and-migrations.md#log-test-datasets-1477-d-a)): `dataset`, `dataset_revision`, `dataset_candidate`; every table has `workspace_id` and composite same-workspace FKs (`ON DELETE RESTRICT`). `platform_app`: SELECT and INSERT on the three tables, column-limited UPDATE on `dataset` and `dataset_candidate`, no DELETE anywhere, no UPDATE on `dataset_revision`.
