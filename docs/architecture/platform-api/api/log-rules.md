# Log Rules

Index and global rules: [03-api-contracts.md](../03-api-contracts.md). This file is the normative contract for **node R-a only** (#1491): the token-submitted validation catalog report and the `log_rules` storage behind it. Design and decisions: `docs/design/features/log-rules/README.md` §2–§5.1, §8 and ADR-0122. Not here (later nodes): catalog reads (R-b), the spec-requirement read port (R-c), coverage (R-d), any screen, any call from the platform to the Validator, any rule editing. The wire contract is `@ap/contract-schemas` `validation-catalog-report` `v0` (provisional until the Validator is surveyed).

The platform receives the Validator's report as a **read-only snapshot**. It stores identifiers, short display text, the support level and the declared targets, and nothing else: there is no column for a rule body, condition, threshold, parameter, script or sample log.

## Report

```text
POST /api/v1/validation-catalog/report
Authorization: Bearer <service token with scope validation.catalog.report>
Content-Type: application/json
{ sourceSystem, validatorVersion,
  ruleSets: [{ ruleSetKey, revision, resultRef?, status, supersedes?,
    rules: [{ ruleKey, title, summary, support, scope?, requiredDefault?,
      targets?: [{ format, target, requirementIds?: [string] }] }] }] }
→ 200 { reportId, outcome: "accepted", replayed, current }
→ 422 validation.failed  detail: { fields: [{ path, code }], report_id }
→ 401 auth.token_invalid | 403 permission.denied | 429 rate_limited.actor
```

- **Transport and permission.** The route sets `config.tokenCallable` and `config.tokenMutation` (own mutation-sized token bucket, 10/min). Capability `validation.catalog.report`: **token-scope-only** (see 05). A cookie session — Admin included — is `403 permission.denied` (`detail.capability`); a token without the scope, or whose owning Actor (system Actor, or the issuer of a personal token) holds no current workspace-wide grant of the capability, is the same 403. Effective right = owner's grant ∩ token scopes. Service tokens are issued by an Admin only (ADR-0116). Order of judgment: rate limit → token gate → capability → body.
- **Body size is judged before parsing**: more than 2 MB (2 × 1024 × 1024 bytes) is refused `too_large` and recorded. The transport reads up to 8 MB so that an oversize report can be recorded; beyond 8 MB the transport refuses the body before the handler (Fastify's `413` is remapped by the root error handler to `422 validation.malformed_request`) and nothing is recorded.
- **Closed fields.** An unknown key at any level — top, RuleSet, Rule, `scope`, target — is `unknown_field` (`path` names the key). `scope` keys: `logTypes[]`, `processes[]`, `modelIds[]`, `softwareRange`, `inputFormats[]` (each list ≤ 50 items, each item ≤ 200 characters; the key set is provisional, design D2).
- **Identifiers** (`sourceSystem`, `validatorVersion`, `ruleSetKey`, `revision`, `resultRef`, `supersedes`, `ruleKey`): 1–200 characters, no leading or trailing whitespace, no control character; otherwise `invalid_identifier`. Compared byte for byte: no case folding, no normalization. `support` ∈ `supported|partial|unsupported|unknown` and `status` ∈ `active|retired`, else `invalid_value`. `resultRef` defaults to `revision` (stored resolved).
- **Limits** (`too_large`; design D7, first values): RuleSets 50, Rules 5,000 in the whole report, `targets` 20 per Rule, `requirementIds` 50 per target, title 120, summary 300, `target` 500, `format` 40 characters.
- **Duplicates** (`duplicate_key`): the same `ruleSetKey` + `revision`; the same `ruleKey` inside one Revision; the same effective `resultRef` for two Revisions of one RuleSet.
- **Free text** — title, summary, `target`, `format`, `requirementIds`, `scope` strings, and every identifier — is refused, never rewritten: a control character (tab and newline included) is `control_character`; a secret pattern is `secret_pattern`. The patterns (`log-rules/domain/secret-patterns.ts`, unit-tested): this platform's API token format found anywhere in the text, a PEM private-key header, an AWS access key id (`AKIA` + 16), `Bearer` + a 20+ character token-like value, and `password|passwd|secret|token|api key` followed by `=` or `:` and a value. False positives are accepted on purpose.
- **Error codes** (`detail.fields[].code`): `unknown_field`, `invalid_identifier`, `invalid_value`, `invalid_json`, `duplicate_key`, `too_large`, `secret_pattern`, `control_character`. The first one is the recorded reason. At most 50 fields are listed.

## Idempotency and supersession

- `report_digest` = SHA-256 of the **canonical form** of an accepted report: object keys sorted, RuleSets ordered by `(ruleSetKey, revision)`, Rules by `ruleKey`, `resultRef` resolved; target order is kept (it is the declaration order). Re-sending the same snapshot — in any key or Rule order — answers `200` with the same `reportId`, `replayed: true`, and writes nothing (no row, no audit). `current` is `false` when a newer report of the source has superseded it since (the platform does not re-activate an older snapshot; send a changed report instead).
- A **different** digest from the same `sourceSystem` is a new full snapshot: in one transaction the previous accepted report gets `superseded_at` / `superseded_by_report_id` (never deleted) and the new rows are inserted. A partial unique index leaves exactly one current accepted report per `(workspace, source_system)`.
- One advisory lock per workspace (`pg_advisory_xact_lock`) serializes the replay lookup and the write, so parallel identical submissions make one report and parallel different ones leave exactly one current.
- A **rejected** report is recorded: `outcome = 'rejected'`, `reject_reason`, the reporter Actor, a digest of the raw body bytes under its own domain prefix (`log_rules.catalog_report.rejected.v0\n` + body), so a rejected body can never occupy the digest of a valid snapshot, and — only if it passes the same identifier, control-character and secret checks itself — `source_system`. Its content is not stored. The same rejected body again answers the same `422` with the same `report_id` and writes nothing.

## Audit

One `core.audit_log` row per accepted or rejected report, in the same transaction as the writes (none for a replay): `validation.catalog.reported` / `validation.catalog.rejected`, subject type `catalog_report`, subject id = the report id, Actor = the token's system Actor, `detail.api_token_id` added by the audit writer. Detail: accepted → `sourceSystem`, `validatorVersion`, `outcome`, `ruleSetCount`, `ruleCount`, `targetCount`, `reportDigest`, `supersededReportId`; rejected → `sourceSystem` (or null), `outcome`, `rejectReason`, `bodyBytes`, `reportDigest`. Never a rule key, title, summary or target. Both events are in the platform audit projection (`create` / `update` actions).

## Storage notes

Schema `log_rules`, migration 0106; column list and grants in 04. Every table carries `workspace_id`, composite same-workspace FKs and workspace-first indexes. **Insert-only**: `rule_set_revision`, `rule` and `rule_target` refuse UPDATE and DELETE (trigger, every role); `catalog_report` refuses DELETE and allows one change per row, current → superseded, by a column-limited grant and a guard trigger. `report_digest` is unique per workspace (accepted and rejected rows share the constraint; a rejected row's digest is over the raw bytes). `rule_set_revision.released_at` has no source in the v0 report body and stays null until a Validator reports it.

## Synthetic reporter

`tooling/scripts/log-rules-synthetic-reporter.mjs` posts a fixed catalog (3 Revisions in 2 RuleSets, one retired, one `unknown` support, targets with requirement ids) with a service token read from `LOG_RULES_REPORT_TOKEN`. Every label says «합성 fixture»; it is not evidence of an integration with the in-house Validator. It refuses a base URL or environment flagged as production, allows loopback by default, and is not part of the production assembly (the API image copies none of `tooling/`; a unit test pins this).
