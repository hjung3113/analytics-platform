# First admin bootstrap (operator data)

Operator (production-like) data never contains fixtures. The first Admin is created in two steps: a fixture-free workspace seed, then an audited role change for a person who has already logged in once.

Never run `SEED_MODE=core`, `personas` or `scale` against operator data: they create mock actors (`mock-admin-1`, …), Managed Systems, a fixture team and VOCs. Operator data uses only `SEED_MODE=bootstrap`.

## Steps

All commands run as one-off jobs from the migrate/tools image in the operator Compose project (see [oidc-and-images.md](oidc-and-images.md) for the project, env file and volume variables). Define `P` as in [oidc-and-images.md](oidc-and-images.md) «Production stack» (project and restore pin file included) and run from `ops/platform-api` in the same Bash session. The long-running backend workload never receives `DATABASE_URL_MIGRATE`; use operator-job secrets only.

1. **Migrate.** Run the migration job so the schema and roles are current.
2. **Seed the workspace.** `SEED_MODE=bootstrap` creates the Workspace (`WORKSPACE_ID`, `WORKSPACE_NAME`) and the `system` Actor, nothing else. Rerunning changes nothing and exits 0. On the production stack the `bootstrap` job service (profile `bootstrap`) carries `SEED_MODE=bootstrap`, `WORKSPACE_ID`, `WORKSPACE_NAME` and both database URLs from `.env.production`:

       $P --profile bootstrap run --rm bootstrap

   *Local smoke stack only* (`release.yml`; never operator data):

       docker compose --project-name platform-api --env-file .env.release -f docker-compose.release.yml \
         run --rm -e SEED_MODE=bootstrap -e WORKSPACE_ID -e WORKSPACE_NAME migrate node_modules/.bin/tsx src/seed/index.ts
3. **First login.** The future admin signs in once through the company IdP. The first OIDC login creates their Actor with role `user`. Find their external id (the IdP `sub`) from the IdP or from `core.actors.external_id`.
4. **Promote.** `set-actor-role` changes an existing Actor by external id. It needs only `DATABASE_URL_MIGRATE` and `WORKSPACE_ID`. On the production stack it is the `set-actor-role` job service (profile `admin`):

       $P --profile admin run --rm set-actor-role --external-id <idp-sub> --role admin --reason "first admin"

   *Local smoke stack only:*

       docker compose --project-name platform-api --env-file .env.release -f docker-compose.release.yml \
         run --rm migrate node_modules/.bin/tsx src/cli/set-actor-role.ts \
         --external-id <idp-sub> --role admin --reason "first admin"

   Arguments: `--external-id <sub>`, `--role admin|user`, optional `--reason <text>` (≤500 characters), optional `--revoke-admin-grants` (a flag without a value, see below). On success it prints one JSON line with ids and roles only (never an email). The compiled form is `node dist/cli/set-actor-role.js` with the same arguments, for an image that ships `dist/`.
5. **Verify.** The person reloads the app: `/me` shows role Admin.

## Behavior and exit codes

- One transaction: a per-workspace lock, the role update, and one `actor_role_changed` audit row attributed to the `system` Actor (subject = the changed Actor; detail = `before_role`, `after_role`, optional `reason`).
- Role changes are serialized per workspace, so two concurrent demotions cannot remove the last admin.
- Already at the requested role: no change, no audit row, exit 0.
- **Demotion does not revoke grants.** An explicit `workspace.admin` grant is a capability separate from the role, and the server keeps honoring it after the role drops to `user` (admin checks, permission decisions, workspace settings, the operations console). So lowering an Actor who holds an active `workspace.admin` grant (not revoked, not superseded, not expired) is refused with exit 5 and the count, and nothing changes. Rerun with `--revoke-admin-grants` to lower the role and revoke those grants in the same transaction: one `permission_revoked` audit row per grant, attributed to the `system` Actor (reason = `--reason`, else a fixed text). Promotion and lowering an Actor without such grants are unaffected.

| Exit | Meaning |
| --- | --- |
| 0 | Changed, or already at the requested role |
| 1 | Usage error, missing `DATABASE_URL_MIGRATE`/`WORKSPACE_ID`, `system` Actor missing (run step 2), or unexpected error |
| 2 | Unknown external id: the person must log in once first |
| 3 | Refused: would demote the last admin Actor that is not the `system` Actor |
| 4 | Refused: the `system` Actor's role cannot be changed |
| 5 | Refused: the Actor being lowered holds active `workspace.admin` grants; rerun with `--revoke-admin-grants` |

## Why the migrate role

The `platform_app` role holds UPDATE on `core.actors` and INSERT on `core.audit_log`, so the database would let the runtime change a role. The wall is operational: nothing in the running backend calls this code path, and the backend never receives `DATABASE_URL_MIGRATE`. Running it with the migrate URL keeps role changes an operator-only job. This is a convention, not a database grant.
