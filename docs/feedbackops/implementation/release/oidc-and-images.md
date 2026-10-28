# Production images and local OIDC check

This local stack exercises the production backend image, the separate migration job, S3-compatible attachment storage, and the OIDC authorization-code path. It uses NODE_ENV=development so the existing config allows the localhost issuer and redirect URI and the browser can receive non-Secure cookies over HTTP.

The local run verifies OIDC discovery/code flow, backend session issuance and revocation, and first-login Actor creation. It does not verify TLS. Production requires an HTTPS issuer and redirect URI and always sets Secure on session and OIDC transaction cookies; verify those properties when connecting the company IdP.

## Prepare the isolated release project

All commands below run from `ops/platform-api` (where `docker-compose.release.yml`, `.env.release.example` and `scripts/release/` live). Create the local interpolation file and inspect the operator Compose configuration:

    cp .env.release.example .env.release
    docker compose --project-name platform-api --env-file .env.release -f docker-compose.release.yml config

The example values are local-only. The operator Compose project is `platform-api` (ADR-0097), the same name as the development project in `docker-compose.dev.yml`. To run development and release at the same time, give exactly one of them another project name (`--project-name <name>`); never rely on a silent different default. The Postgres and MinIO volumes carry explicit names (see "Existing installs: data volumes" below). `image-smoke.sh` has its own default project `platform-api-smoke` (`RELEASE_PROJECT_NAME` overrides it), ignores those volume names and always uses its own `<project>_smoke-*` volumes. The Postgres port is not published on the host, so this stack does not use the development database on port 5434. The --env-file supplies Compose interpolation only; selected values are passed to each service explicitly so the running backend never receives DATABASE_URL_MIGRATE.

Postgres initialization mounts [scripts/db/init.sql](../../../../ops/platform-api/scripts/db/init.sql) and runs it as the postgres bootstrap superuser on an empty release-owned volume. Do not set POSTGRES_DB: init.sql creates the `platform` database itself. It also creates the replay bootstrap logins **fops_app** and **fops_migrate** (not platform_*), the other seven NOLOGIN owner roles with their memberships, and the vector extension. Their initial passwords are the literals platform_app and platform_migrate from that script, which are the passwords the final roles keep; changing POSTGRES_PASSWORD changes only the bootstrap superuser password. No platform_app or platform_migrate role exists until the cutover below renames them.

The initialization script runs only for an empty Postgres volume. Before reusing an existing volume, provision `platform` (or run the cutover below on an existing `feedbackops` database) owned by the migrate role, both login roles with the script's passwords and NOINHERIT, all NOLOGIN owner roles and one-way memberships from the script, and the vector extension in the database as a superuser. Do not assume the init script will repair an existing volume.

## Build, migrate, seed, and start

The smoke script builds the backend and migration images, starts Postgres, the OIDC provider, and MinIO, then runs the one-off `cutover` job (below) and starts the migration job and waits up to three minutes for it to exit successfully. Only after migration succeeds does it start bucket provisioning, and the backend; it then probes the backend routes directly and waits up to two minutes for database, pg-boss, and storage readiness:

    bash scripts/release/image-smoke.sh

A new release volume must be cut over once before the migration job: the job-only `cutover` service (compose profile `cutover`, same image as `migrate`) replays migrations 0000–0075 as the bootstrap fops_migrate, renames the roles and database with the postgres superuser URL, then runs the ordinary drizzle-kit migrate as platform_migrate. It runs inside the compose network because Postgres publishes no host port, and only that container receives the superuser credential: a password-free admin URL (`postgresql://postgres@postgres:5432/postgres`) plus `PGPASSWORD` taken from POSTGRES_PASSWORD, so a password with URL-reserved characters (`@ : / ? # %`) works unchanged. `backend` and `migrate` get neither:

    # operator example (operator project and volumes), not for the smoke
    docker compose --project-name platform-api --env-file .env.release -f docker-compose.release.yml run --rm cutover

It is safe to repeat. `image-smoke.sh` runs it; its effective target is validated before any connection, as described in [the database identity section](../04-database-and-migrations.md#database-and-role-identity-1100-a-adr-0097-migration-0076). The `migrate` service itself stays plain: it runs only drizzle-kit migrate as platform_migrate and never needs an admin credential, so on a volume that was not cut over it fails closed. It never seeds. For a parallel check, export `RELEASE_PROJECT_NAME`, `RELEASE_BACKEND_PORT` and `RELEASE_OIDC_PORT` before `image-smoke.sh` (defaults: `platform-api-smoke`, 3001, 8080; the operator projects `platform-api` and `feedbackops-release-1060` are refused). After it succeeds and before logging in, seed the smoke stack with the repeatable core baseline seed from the migration/tools image. `image-smoke.sh` exports its project, volume names and `RELEASE_OWNER=smoke` only inside its own process, so the seed command must set them itself. Run it in a subshell so nothing leaks into your shell. The default smoke project is `platform-api-smoke`; for a custom project set `RELEASE_PROJECT_NAME` to the same value you gave `image-smoke.sh`:

    (
      export RELEASE_PROJECT_NAME="${RELEASE_PROJECT_NAME:-platform-api-smoke}"
      export RELEASE_OWNER=smoke
      export RELEASE_POSTGRES_VOLUME="${RELEASE_PROJECT_NAME}_smoke-postgres-data"
      export RELEASE_MINIO_VOLUME="${RELEASE_PROJECT_NAME}_smoke-minio-data"
      docker compose --project-name "$RELEASE_PROJECT_NAME" --env-file .env.release -f docker-compose.release.yml run --rm -e SEED_MODE=core migrate node_modules/.bin/tsx src/seed/index.ts
    )

With the default project this selects `platform-api-smoke`, `platform-api-smoke_smoke-postgres-data` and `platform-api-smoke_smoke-minio-data`. Never point this command at the operator project `platform-api`: it would write the fixtures into operator data. `bash scripts/release/image-smoke.sh --print-identity` shows the names.

The tools image includes the backend development dependency closure because db:seed uses tsx. The command receives both DATABASE_URL (the platform_app runtime role used by the core seed) and DATABASE_URL_MIGRATE (the platform_migrate role used to create the seed team). It also receives the same WORKSPACE_ID as the backend. Core mode creates the Workspace, baseline Actors, Tableau and Power BI Managed Systems, Analytics Areas, team, and core VOC fixtures; it does not create personas or scale data.

Before the backend starts, the release stack runs the existing idempotent apps/platform-api/src/cli/storage-bootstrap.ts command against MinIO. It checks the configured bucket and creates it only when it is missing.

The standalone web app is retired (#597), so the release stack has no frontend service: sign in through the platform host. Set `OIDC_REDIRECT_URI` in `.env.release` to the actual platform host ending in `/auth/callback`. Start login through that host’s `/auth/login`; the provider is http://localhost:8080/default and returns to the configured platform callback. The host must forward `/auth` to this backend. On the mock provider form, enter a new subject such as release-user-1. The JSON_CONFIG mapping returns sub, email, email_verified=true, and name based on that username.

After callback, verify the session by confirming GET /me returns 200 in the browser Network panel and includes the new Actor. The first login creates an Actor with Role Level User and type internal_member. Log out through the host; POST /auth/logout revokes the local session and clears the session cookie only, with no IdP logout redirect. Start another login as a different subject, such as release-user-2, and verify that it creates a separate Actor and session.

Register a VOC from the platform host using one of the seeded Managed Systems. If the active Workspace has no Managed System, an Admin must create one first in Admin → Managed Systems; first-login Actors are User and cannot create Managed Systems. Core seed normally supplies Tableau and Power BI, so no manual setup is needed for a fresh release volume.

The provider README for tag 6.0.4 documents interactive login, tokenCallbacks/requestMappings, username claim substitution, and authorization code with PKCE S256. It does not document client-secret validation at the token endpoint or the ID Token nonce behavior required by the backend. The Compose config uses only the documented settings; the conductor must verify those interoperability details during the runtime check.

The release stack publishes host ports 8080 (OIDC provider) and 3001 (backend, through the provider's network namespace). Stop a local development backend on port 3001 before `image-smoke.sh`, or `docker compose up` cannot bind the port.

## Routes and image behavior

The backend serves its own routes directly; there is no static web image or HTML-navigation split. The standalone nginx proxy (`/assets/*`, SPA fallback, `Accept: text/html` routing) was retired with the web app (#597). The auth routes are in apps/platform-api/src/modules/auth/routes.ts (GET /auth/login, GET /auth/callback, POST /auth/logout), the attachment routes in apps/platform-api/src/modules/attachments/routes.ts (POST /attachments, GET /attachments/:id/download), and health routes in apps/platform-api/src/modules/core/health/routes.ts (GET /health, /health/live, /health/ready). The platform host reaches them through its own proxy seam. The local backend keeps PUBLIC_ATTACHMENT_ORIGIN at the quoted literal 'self' for same-origin downloads.

## Company IdP and Kubernetes configuration

Until the company IdP is known, Keycloak can serve as the interim IdP: see [keycloak-interim-idp.md](keycloak-interim-idp.md).

Register the exact callback URI https://<public-host>/auth/callback. The company IdP must provide:

- OIDC_ISSUER_URL: absolute HTTPS issuer URL without query, fragment, or credentials.
- OIDC_CLIENT_ID and OIDC_CLIENT_SECRET: non-empty client credentials. The backend uses the OIDC client's client_secret_basic default when supported by discovery.
- OIDC_REDIRECT_URI: absolute HTTPS URL whose path is exactly /auth/callback, with no query or fragment.
- OIDC_SCOPES: single-space-separated scopes including openid; request email profile for the profile claims below.
- ID Token claims: non-empty string sub and email; email_verified may be absent but must not be false; name is preferred for the display name, then preferred_username, then the email local part. The backend verifies issuer, audience, expiry, signature, state, nonce, and PKCE S256. Its bounded raw-claim allowlist is sub, iss, aud, email, email_verified, name, and preferred_username.

For Kubernetes, supply non-secret runtime config through the workload environment and secrets through Kubernetes Secret objects per ADR-0013:

- Runtime config: NODE_ENV=production, HOST, PORT, AUTH_PROVIDER=oidc, WORKSPACE_ID, TRUSTED_PROXY_HOPS, PUBLIC_ATTACHMENT_ORIGIN, OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_REDIRECT_URI, OIDC_SCOPES, and STORAGE_S3_ENDPOINT, STORAGE_S3_REGION, STORAGE_S3_BUCKET, STORAGE_S3_FORCE_PATH_STYLE.
- Runtime secrets: DATABASE_URL for platform_app, OIDC_CLIENT_SECRET, STORAGE_S3_ACCESS_KEY_ID, and STORAGE_S3_SECRET_ACCESS_KEY. If enabled, also supply SMTP_PASSWORD with SMTP_HOST, SMTP_PORT, SMTP_USERNAME, and SMTP_FROM; or EMBEDDING_API_KEY when EMBEDDING_PROVIDER=voyage.
- Migration job only: DATABASE_URL_MIGRATE for platform_migrate. Do not mount it in the backend workload.

The images emit backend structured JSON logs to stdout per ADR-0013. They do not add metrics or tracing. No ADR-0013 amendment is needed for this local stack: its deployment, health, logging, and secret-handling facts remain accurate.

## Stop and cleanup

To stop the smoke stack and remove its database and object-storage volumes, use the script's project-scoped option (with the same `RELEASE_PROJECT_NAME` as the run, if you set one):

    bash scripts/release/image-smoke.sh --down

Before any build, start or `--down`, the script lists the project's containers and volumes (and the two volumes it would mount) and refuses unless every one carries the ownership label `platform.release.owner=smoke` (set from `RELEASE_OWNER`, which the script exports; operators leave it unset, so their resources are labelled `operator`). A custom `RELEASE_PROJECT_NAME` that points at an operator stack is therefore refused with nothing started, built or removed; its own previous smoke stack is accepted, so reruns work. Resources created before the label existed count as foreign. Do not run `docker compose ... down -v` by hand: a project name alone does not isolate the explicitly named volumes, and a manual command skips this ownership check.

#597: release compose deploys backend and infrastructure only. Set `OIDC_REDIRECT_URI` to the retained platform host ending in `/auth/callback` (the platform edge forwards `/auth`); compose requires this value instead of guessing a backend port. Standalone frontend image, SPA fallback, visual runner and external return origin configuration are retired. Backend image smoke, health checks and integration gates remain.

## Existing installs: data volumes (#1100 b)

The project used to be `feedbackops-release-1060`, so an existing install holds its data in
`feedbackops-release-1060_release-postgres-data` and `feedbackops-release-1060_release-minio-data`. The compose file
pins exactly those names (`RELEASE_POSTGRES_VOLUME`, `RELEASE_MINIO_VOLUME` default to them), so the new project name
mounts the existing data instead of creating blank volumes. If the existing install ran under another project name,
select its volumes explicitly **before the first start**:

    export RELEASE_POSTGRES_VOLUME=<old-project>_release-postgres-data
    export RELEASE_MINIO_VOLUME=<old-project>_release-minio-data
    docker volume inspect "$RELEASE_POSTGRES_VOLUME" "$RELEASE_MINIO_VOLUME" >/dev/null   # both must already exist

Both variables are independent. `docker compose ... config` shows the resolved `volumes:` names; check them before `up`.
`image-smoke.sh` (start and `--down`) forces both variables to volumes it owns, whatever the caller or `.env.release`
sets, so it can neither mount nor remove an operator volume; `bash scripts/release/image-smoke.sh --print-identity`
prints the project and the volumes a run would own without touching Docker.

The operator default project is `platform-api`; `image-smoke.sh` refuses it (and `feedbackops-release-1060`) as its own.

## Attachment bucket rename (fops-attachments to platform-attachments)

The default bucket is now `platform-attachments` and the dev MinIO root user `platform-minio`; the root password and
every operator secret keep their values. Attachment rows store object keys, not bucket names, so the move is a copy
inside the object store plus a configuration switch. No database row is rewritten and the old bucket is kept.

1. Keep the server running on the old bucket. With the server's `STORAGE_S3_*` values exported and
   `STORAGE_S3_BUCKET=platform-attachments`, create the new bucket (idempotent) and copy:

       pnpm --filter @ap/platform-api exec tsx src/cli/storage-bootstrap.ts
       pnpm --filter @ap/platform-api exec tsx src/cli/storage-copy-bucket.ts copy --source fops-attachments

2. Verify inventory and content (key sets, length and SHA-256 of every object); it exits non-zero on any difference:

       pnpm --filter @ap/platform-api exec tsx src/cli/storage-copy-bucket.ts verify --source fops-attachments

3. Stop writes (stop the backend), run `copy` and `verify` once more to pick up objects added since step 1, then switch
   `STORAGE_S3_BUCKET` to `platform-attachments` and start the backend. Writes must stay stopped from the final `copy`
   until the switch: an object written to the old bucket afterwards is not in the new one.

   `copy` never overwrites a destination object. A key that already exists with identical bytes is kept (a resumed run
   copies only the missing keys); a key that exists with different bytes aborts the run before any write and lists the
   key(s). Resolve it by hand (decide which bytes are valid, remove the stray destination object yourself or use a fresh
   bucket) and run `copy` again; the tool will not replace the destination's bytes or touch the source.
4. Keep `fops-attachments` and its policy until you explicitly retire it. The tool never deletes, and it changes no
   bucket policy. Bucket access on the new bucket must match the old one (the code creates private buckets); compare
   the two policies with your storage tool before switching. Retiring the old bucket is a separate, explicit step; the source stays available (read-only for this tool) until then.

The MinIO root user change affects only a data directory started with the new `MINIO_ROOT_USER`; a bind-mounted
`ops/platform-api/minio_data` keeps its objects.
