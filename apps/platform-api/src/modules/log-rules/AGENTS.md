# log-rules module

Owns the validation rule catalog the external Validator reports over a service token (#1491 node R-a; design `docs/design/features/log-rules/README.md`, ADR-0122, API `docs/architecture/platform-api/api/log-rules.md`). Not here yet: catalog reads (R-b), the spec-requirement port (R-c), coverage (R-d), screens.

## Invariants

- The only write is `POST /api/v1/validation-catalog/report`, token-only: capability `validation.catalog.report` is `tokenOnly` (a session is denied `token_required` before any grant is read) and has no Admin bypass; the token owner's own grant ∩ the token scopes decides. Never add a session path, a menu action or a human capability for it.
- No column, field or log line holds a rule body, condition, threshold, parameter or script. Every object in the report is closed (`unknown_field`); a new accepted key needs the contract schema, the table column, the limits and the doc in one change.
- Free text is refused, never rewritten (`control_character` — C0/DEL/C1 controls and ill-formed Unicode such as a lone surrogate, plus invalid UTF-8 bytes as `invalid_json` —, `secret_pattern`); a refused report is recorded with its reason and **no content**, and the audit row never carries rule text or targets.
- Order of judgment in `domain/report.ts`: byte size before parse → JSON → closed shape and limits → control characters → secrets → duplicates. Keep the size check first.
- One transaction per report behind the per-workspace advisory lock (`lockReports`): replay lookup by digest, supersession of the previous report of the same source (marker first, the deferred FK points at the new row), snapshot rows, audit row. A replay writes nothing.
- Rows are insert-only (trigger on every role); the only UPDATE is the supersede marker. Test teardown disables the triggers with the migrate role, production code never does.
- `result_ref` is stored resolved (`resultRef ?? revision`); matching of an attempt's `rule_set_revision` to it, and the `ambiguous` rule, belong to the read nodes (design §2 identification contract). Identifiers are compared exactly.
- The synthetic reporter (`tooling/scripts/log-rules-synthetic-reporter.mjs`) is test/dev only; no `src/` file may import it.
