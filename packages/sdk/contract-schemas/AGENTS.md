# @ap/contract-schemas

Zod wire-contract schemas and JSON Schema 2020-12 artifacts, implementing #1086 (stage 2 of #531). [ADR-0096](https://github.com/hjung3113/analytics-platform/blob/main/docs/adr/0096-contract-schemas-zod-source-and-reference-implementations.md) owns the source-direction decision. This private workspace package is outside `SDK_PACKAGES`; `pnpm sdk:schemas` produces a release asset, rather than a sixth installable SDK package.

## Editing schemas

- Production `src/**` imports only `zod` (exact version in package.json, using `zod/v4`). The `contractSchemas` lint preset rejects other `@ap/*` packages and React; the manifest and review enforce the broader external-dependency restriction. Test files alone may import `@ap/contracts` and its `vocab.json`.
- Keep vocabulary lists in `src/vocab.ts`; `vocab.test.ts` and type-equivalence tests bind them to the contracts vocabulary. Open app-owned permissions remain strings (ADR-0072).
- Schemas are the intended source. Until the first Node runtime tarball consumer, existing hand-written `@ap/contracts` types remain in place and `equivalence.test.ts` must prove equality under `tsc`. Its test-only `Wire<T>` removes readonly modifiers; endpoint declarations also normalize Permission brands, turn paramKeys into key lists, and drop phantom `_types`. A remaining mismatch is a blocker: report it instead of weakening either representation.
- Keep `.readonly()` out of schemas: it adds JSON Schema `readOnly` metadata. Retain field-comment semantics, including present sourceLogicVersions being non-empty, distinct, non-empty strings.

## Generated files and gates

- `src/index.ts` declares `SCHEMA_FILES`; `apiResponse.json` leaves data unconstrained. `src/export.ts` performs the pure Zod-to-2020-12 conversion, preserving emitted patterns and key order. JSON uses two-space indentation and a trailing newline.
- After schema edits, run `pnpm --filter @ap/contract-schemas gen:schemas` and commit `schemas/*.json`. Package `test` invokes `scripts/gen-schemas.mjs --check`, rejecting changed, missing or extra files.
- After menu endpoint edits, run `pnpm --filter @ap/contract-schemas gen:endpoints` and commit `endpoints.json`. The Vite loader reads `menus/*/*/src/endpoints.ts`, including grouped exports, validates declarations and rejects duplicate IDs, then sorts by ID. External module endpoints and mock assembly are outside this snapshot.
- Endpoint drift runs through root `pnpm sdk:test` (`tooling/sdk/sdk-schemas.test.mjs` calls `check:endpoints`). Keep this outside the package test's turbo cache: menu files live outside this package and must invalidate the check. Package unit tests remain scoped to `src/**/*.test.ts`.
- Verify changed schemas with package `lint`, `typecheck` and `test`, then root `pnpm sdk:test`. Completion requires committed snapshots matching both schema and endpoint sources. This package change selects full E2E in PR CI; local full E2E is not required.

## Artifact format rules

Release consumers and generators must preserve these conventions:

- JSON Schema dialect is 2020-12. Fixed-shape objects emit `additionalProperties: false`; the Condition map declares an array schema for its arbitrary axis keys. Required fields and nullable values follow the generated schemas.
- Context IDs are non-blank by the contracts `identifier` rule (not only Unicode whitespace per Python `str.isspace()`); they are never trimmed, case-folded or normalized. ID sets (`roomNames`, `lineNames`, `prcGroups`, `selection`, `lotIds`, `recipeIds`) are `null` (absent) or an array, `[]` being an explicit empty set, with `uniqueItems`. Condition is `null` or a map with at least one axis (`minProperties`, non-blank `propertyNames`) whose values are non-empty, distinct, non-blank ID lists (kernel 06 section 6.1, real-server-checklist section 3). Canonical code-point ordering and lone-surrogate rejection are not expressible in JSON Schema: servers enforce them at the boundary; the runtime schemas enforce uniqueness, non-blank IDs and valid Unicode.
- `contextCapabilitySchema` is the single source of the declarable capabilities (`APPLIED_CAPABILITIES`); `equivalence.test.ts` proves it equals `Exclude<Capability, 'unsupported'>` under `tsc`, so a vocabulary change fails typecheck even after snapshots are regenerated.
- Integer schemas carry safe-integer bounds (plus/minus 9007199254740991); `EndpointDeclaration.limits.maxRows` is a positive integer.
- Instants (`Trust.updatedAt`, `dataThrough`, `Assessment.observedAt`) use `format: date-time` plus Zod's emitted offset-or-Z pattern. Wall-clock `from`/`to` use `YYYY-MM-DDTHH:mm:ss` patterns, excluding offsets, Z, fractions and date-only values. Their patterns alone cannot establish calendar validity; servers need validation equivalent to `parseDateTime` (06 section 6.3).
- `ApiResponse` data is unconstrained or null. Endpoint-specific params/data shapes remain outside these artifacts. Runtime Zod `unknown` accepts omitted values and default objects strip unknown keys; JSON Schema requires declared unknown fields and rejects extra keys on fixed-shape objects.
- `pnpm sdk:schemas --version X.Y.Z --out <empty-or-absent-dir>` creates `contract-schemas-X.Y.Z.tgz` and `SHA256SUMS-schemas`, containing schemas, endpoints, the unmodified contracts vocabulary and README. Existing output is preserved. Tar mtimes prevent byte reproducibility; verify the checksum.

## Deferred work

[The #531 scope record](https://github.com/hjung3113/analytics-platform/issues/531#issuecomment-6464260358) records reasons and reopen conditions for unimplemented endpoint-specific schemas, z.infer type replacement, Pydantic/Python generation and CI, reference engines, internal identity-token schemas, declaration-header activation and a sixth SDK package tarball. Reopen each under its recorded consumer or design prerequisite.
