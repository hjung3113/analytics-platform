# log-datasets module

Owns the test datasets of the log domain: dataset, its immutable revisions and the candidates that become datasets (#1477 node D-a; design `docs/design/features/log-test-datasets/README.md`, API `docs/architecture/platform-api/api/log-datasets.md`). Not here yet: baselines, suites, runs, comparison, review labels (nodes b–d). Dataset ≠ data-collection Source; Baseline ≠ metric Baseline (`GLOSSARY.md`).

## Invariants

- `model_ids` are log-knowledge stable ids and `source_ref.roundId` a log-lifecycle id: plain uuids, no cross-schema FK and no existence check. The sample list parser and digest are log-lifecycle's (`domain/sample-manifest.ts` re-exports them); do not copy them.
- Every read and write filters by the session workspace AND by visibility: `private` is the owner's alone (`datasetVisibleTo`), so a foreign or invisible id is the same absence as a missing one. Add the predicate to any new statement that reads `dataset`.
- `dataset_revision` is immutable: DB trigger (UPDATE/DELETE refused for every role) and no grant; `seq` is `max + 1` under the dataset `FOR UPDATE` lock. A different file list is a new revision; the same digest twice in one dataset is refused.
- Availability is computed at read time from per-file check states (`domain/availability.ts`), never stored. Only the latest revision is checked on read. `available` needs every file found AND its hash matched; no port, `unsupported`, aborted or an unreadable hash is `unverified`, never confirmed.
- The `SourceReadPort` is OPTIONAL (`deps.sourceRead`). Never import `log-explorer/adapters/synthetic` or `testing/`; the production graph test of log-explorer fails if it enters. Do the Source IO before locking the dataset row; never keep an adapter error text.
- A candidate holds data references only: no code, command or LLM origin field; the proposer is the session actor. Approve = dataset + first revision + decision in one transaction.
- Every write is one transaction: row change and `core.audit_log` row; audit detail is body-free (`packages/feature-shared/src/audit/log-datasets.ts`): ids, tag/status names, counts, digest, lengths; never a `fileRef`, hash list or note text.
- No read or action accepts an unknown param/input key. The «기준 낡음 요약» column is node b's: `datasets` returns no stale field.
