---
paths:
  - "apps/platform-api/src/**/*.test.ts"
  - "apps/platform-api/src/**/__tests__/**"
  - "apps/platform-api/src/test-support/**"
---

# Backend integration test traps

Paths below are relative to the repository root (feature code was integrated in ADR-0072).

The gate, env, reset contract, and teardown rules are in `apps/platform-api/AGENTS.md` → Verification. These are the additional measured traps.

## What a test must do to prove anything

- Go through the route (`buildServer` + `app.inject`). Calling the service directly does not prove the HTTP contract.
- Use actors that actually differ in the scope under test. Same-scope actors make a leak test vacuous.
- For mutations, assert the audit row, not only the HTTP response.
- For each case, ask: if this behavior regressed, would this test fail?
- Error bodies are flat `{ code, message, detail }`. Copy the assertion idiom from a sibling suite instead of asserting a nested `{ error: { code } }` envelope.

## Rate limits

- A `429 rate_limited.actor` in a test is a per-actor route-group limit (`apps/platform-api/src/lib/rate-limit-tiers.ts`; usually the `mutation` group, 10 per minute), not the global limit. Find the route's tier first. The window is stored in Postgres, so an immediate rerun keeps the current count.
- Seed fixtures through SQL (see `seed()` in `survey-results.integration.test.ts`) and use HTTP only for the mutation under test. If that is not enough, give each mutating test its own actor.
- Never change, stub, sleep around, or retry around the limiter.

## Fixtures and teardown

- Session rows are not per-test garbage: deleting `core.sessions` in `beforeEach` revokes cookies minted in `beforeAll`, and later requests return `401 auth.session_invalid`. Clean sessions in `afterAll` only.
- Tear down children before parents: grant → managed system → session → actor, and vocs/managed systems/actors before workspaces. Audit-log and permission-request rows go first; see `apps/platform-api/AGENTS.md` → Verification.
- `db.execute` returns `timestamptz` as text, not `Date`. Normalize with `v instanceof Date ? v : new Date(v)`; an empty-result test never exercises the mapping.

## Authorization is two layers

`roleSatisfies` is only the bottom layer; the admin-bypass layer on top is described in `apps/platform-api/src/modules/permissions/AGENTS.md`. To decide whether an actor has a capability, read the enforcement path the route actually calls. Persona grants for `SEED_MODE=personas` are pinned in `apps/platform-api/src/db/__tests__/persona-seed.integration.test.ts`.

## Mutation checks

Mutation-check new tests once per issue: break the fix, see the named test fail, restore. Worker output is uncommitted, so copy the target file aside first (`git checkout <file>` would wipe the whole chunk).

- Record which assertion fired, not just that the test died. A count assertion placed before a set-difference assertion masks it (`expected 47 to be 46` names nothing). Put name-revealing assertions first, counts after, and include one mutant with an equal count but a different set.
- Confirm the mutation applied: use single-line grep patterns (multiline ones miss) and `cmp` after restoring.
- A survivor is usually the fixture, not the code:
  - a priority rule tested with nothing to beat (a deny test whose actor had no allow): make the lower-priority side true first;
  - a negative assertion against a list that has not rendered: anchor with a positive "N rows rendered" first;
  - a negative assertion inside an async-mounting `RouterProvider` harness: await a mounted marker first;
  - a React Query refetch inside `act` asserts before the re-render: flush with `await new Promise((r) => setTimeout(r, 0))`.
- Or a survivor is dead code: if deleting a line breaks nothing because another path does the same, delete the line.
- Some defense-in-depth assertions cannot fire alone (`not.toHaveBeenCalled()` after `toBeDisabled`); list them as such, not as gaps.
- Passing worker-written tests can still miss the safeguard (an advisory lock, an HMAC check): mutate each core safeguard, and when one survives add a targeted test plus a positive pair.
- SQL `SECURITY DEFINER` mutants: `psql -f` exits 0 on error, and neither the migration role nor the owner role can replace the function. Dump with `pg_get_functiondef`, apply the mutant and the restore as superuser on the throwaway DB with `-v ON_ERROR_STOP=1`, then check `proowner`/`prosecdef`. Anchor text replacements uniquely.
