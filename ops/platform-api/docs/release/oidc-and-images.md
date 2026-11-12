# Production images and local OIDC check

This page covers two stacks. `docker-compose.release.yml` is the **local smoke** stack (mock IdP, development mode, fixtures); it is described first and is never deployed. The deployable stack is `docker-compose.production.yml`, described in [Production stack](#production-stack).

This local stack exercises the production backend image, the separate migration job, S3-compatible attachment storage, and the OIDC authorization-code path. It uses NODE_ENV=development so the existing config allows the localhost issuer and redirect URI and the browser can receive non-Secure cookies over HTTP.

The local run verifies OIDC discovery/code flow, backend session issuance and revocation, and first-login Actor creation. It does not verify TLS. Production requires an HTTPS issuer and redirect URI and always sets Secure on session and OIDC transaction cookies; verify those properties when connecting the company IdP.

## Prepare the isolated release project

All commands below run from `ops/platform-api` (where `docker-compose.release.yml`, `.env.release.example` and `scripts/release/` live). Create the local interpolation file and inspect the operator Compose configuration:

    cp .env.release.example .env.release
    docker compose --project-name platform-api --env-file .env.release -f docker-compose.release.yml config

The example values are local-only. The operator Compose project is `platform-api` (ADR-0097), the same name as the development project in `docker-compose.dev.yml`. To run development and release at the same time, give exactly one of them another project name (`--project-name <name>`); never rely on a silent different default. The Postgres and MinIO volumes carry explicit names (see "Existing installs: data volumes" below). `image-smoke.sh` has its own default project `platform-api-smoke` (`RELEASE_PROJECT_NAME` overrides it), ignores those volume names and always uses its own `<project>_smoke-*` volumes. The Postgres port is not published on the host, so this stack does not use the development database on port 5434. The --env-file supplies Compose interpolation only; selected values are passed to each service explicitly so the running backend never receives DATABASE_URL_MIGRATE.

Postgres initialization mounts [scripts/db/init.sql](../../scripts/db/init.sql) and runs it as the postgres bootstrap superuser on an empty release-owned volume. Do not set POSTGRES_DB: init.sql creates the `platform` database itself. It also creates the replay bootstrap logins **fops_app** and **fops_migrate** (not platform_*), the other seven NOLOGIN owner roles with their memberships, and the vector extension. Their initial passwords are the dev/CI literals platform_app and platform_migrate from that script, which the local smoke stack keeps; the production stack replaces them with the `set-role-passwords` job before any login-role use (see [DB role passwords](#db-role-passwords)). Changing POSTGRES_PASSWORD changes only the bootstrap superuser password. No platform_app or platform_migrate role exists until the cutover below renames them.

The initialization script runs only for an empty Postgres volume. Before reusing an existing volume, provision `platform` (or run the cutover below on an existing `feedbackops` database) owned by the migrate role, both login roles with the script's passwords and NOINHERIT, all NOLOGIN owner roles and one-way memberships from the script, and the vector extension in the database as a superuser. Do not assume the init script will repair an existing volume.

## Build, migrate, seed, and start

The smoke script builds the backend and migration images, starts Postgres, the OIDC provider, and MinIO, then runs the one-off `cutover` job (below) and starts the migration job and waits up to three minutes for it to exit successfully. Only after migration succeeds does it start bucket provisioning, and the backend; it then probes the backend routes directly and waits up to two minutes for database, pg-boss, and storage readiness:

    bash scripts/release/image-smoke.sh

A new release volume must be cut over once before the migration job: the job-only `cutover` service (compose profile `cutover`, same image as `migrate`) replays migrations 0000–0075 as the bootstrap fops_migrate, renames the roles and database with the postgres superuser URL, then runs the ordinary drizzle-kit migrate as platform_migrate. It runs inside the compose network because Postgres publishes no host port, and only that container receives the superuser credential: a password-free admin URL (`postgresql://postgres@postgres:5432/postgres`) plus `PGPASSWORD` taken from POSTGRES_PASSWORD, so a password with URL-reserved characters (`@ : / ? # %`) works unchanged. `backend` and `migrate` get neither:

    # operator example (operator project and volumes), not for the smoke
    docker compose --project-name platform-api --env-file .env.release -f docker-compose.release.yml run --rm cutover

It is safe to repeat. `image-smoke.sh` runs it; its effective target is validated before any connection, as described in [the database identity section](../../../../apps/platform-api/docs/04-database-and-migrations.md#database-and-role-identity-1100-a-adr-0097-migration-0076). The `migrate` service itself stays plain: it runs only drizzle-kit migrate as platform_migrate and never needs an admin credential, so on a volume that was not cut over it fails closed. It never seeds. For a parallel check, export `RELEASE_PROJECT_NAME`, `RELEASE_BACKEND_PORT` and `RELEASE_OIDC_PORT` before `image-smoke.sh` (defaults: `platform-api-smoke`, 3001, 8080; the operator projects `platform-api` and `feedbackops-release-1060` are refused). After it succeeds and before logging in, seed the smoke stack with the repeatable core baseline seed from the migration/tools image. `image-smoke.sh` exports its project, volume names and `RELEASE_OWNER=smoke` only inside its own process, so the seed command must set them itself. Run it in a subshell so nothing leaks into your shell. The default smoke project is `platform-api-smoke`; for a custom project set `RELEASE_PROJECT_NAME` to the same value you gave `image-smoke.sh`:

    (
      export RELEASE_PROJECT_NAME="${RELEASE_PROJECT_NAME:-platform-api-smoke}"
      export RELEASE_OWNER=smoke
      export RELEASE_POSTGRES_VOLUME="${RELEASE_PROJECT_NAME}_smoke-postgres-data"
      export RELEASE_MINIO_VOLUME="${RELEASE_PROJECT_NAME}_smoke-minio-data"
      docker compose --project-name "$RELEASE_PROJECT_NAME" --env-file .env.release -f docker-compose.release.yml run --rm -e SEED_MODE=core migrate node_modules/.bin/tsx src/seed/index.ts
    )

With the default project this selects `platform-api-smoke`, `platform-api-smoke_smoke-postgres-data` and `platform-api-smoke_smoke-minio-data`. `SEED_MODE=core` is smoke-only — **never on operator data**; operator data uses `SEED_MODE=bootstrap` ([first-admin-bootstrap.md](first-admin-bootstrap.md)). Never point this command at the operator project `platform-api`: it would write the fixtures into operator data. `bash scripts/release/image-smoke.sh --print-identity` shows the names.

The tools image includes the backend development dependency closure because db:seed uses tsx. The command receives both DATABASE_URL (the platform_app runtime role used by the core seed) and DATABASE_URL_MIGRATE (the platform_migrate role used to create the seed team). It also receives the same WORKSPACE_ID as the backend. Core mode creates the Workspace, baseline Actors, Tableau and Power BI Managed Systems, Analytics Areas, team, and core VOC fixtures; it does not create personas or scale data.

Before the backend starts, the release stack runs the existing idempotent apps/platform-api/src/cli/storage-bootstrap.ts command against MinIO. It checks the configured bucket and creates it only when it is missing.

The standalone web app is retired (#597), so the release stack has no frontend service: sign in through the platform host. Set `OIDC_REDIRECT_URI` in `.env.release` to the actual platform host ending in `/auth/callback`. Start login through that host’s `/auth/login`; the provider is http://localhost:8080/default and returns to the configured platform callback. The host must forward `/auth` to this backend. On the mock provider form, enter a new subject such as release-user-1. The JSON_CONFIG mapping returns sub, email, email_verified=true, and name based on that username.

After callback, verify the session by confirming GET /me returns 200 in the browser Network panel and includes the new Actor. The first login creates an Actor with Role Level User and type internal_member. Log out through the host; POST /auth/logout revokes the local session and clears the session cookie only, with no IdP logout redirect. Start another login as a different subject, such as release-user-2, and verify that it creates a separate Actor and session.

Register a VOC from the platform host using one of the seeded Managed Systems. If the active Workspace has no Managed System, an Admin must create one first in Admin → Managed Systems; first-login Actors are User and cannot create Managed Systems. Core seed normally supplies Tableau and Power BI, so no manual setup is needed for a fresh release volume.

The provider README for tag 6.0.4 documents interactive login, tokenCallbacks/requestMappings, username claim substitution, and authorization code with PKCE S256. It does not document client-secret validation at the token endpoint or the ID Token nonce behavior required by the backend. The Compose config uses only the documented settings; the conductor must verify those interoperability details during the runtime check.

The release stack publishes host ports 8080 (OIDC provider) and 3001 (backend, through the provider's network namespace). Stop a local development backend on port 3001 before `image-smoke.sh`, or `docker compose up` cannot bind the port.

## Production stack

`ops/platform-api/docker-compose.production.yml` runs `NODE_ENV=production` with a real OIDC provider only: no mock IdP, no fixture seed (`core`, `personas`, `scale` do not exist in this file) and no `network_mode` sharing. Only the `edge` service is published, as `${EDGE_BIND}:${EDGE_PORT:-8080}:80` (see «Edge» below); the backend has no `ports`. The backend never receives `DATABASE_URL_MIGRATE` or the Postgres superuser password, only the job services do. Role passwords come from `PLATFORM_APP_DB_PASSWORD` and `PLATFORM_MIGRATE_DB_PASSWORD` in the env file; the backend gets only the app one. `postgres`, `minio`, `backend` and `edge` use `restart: unless-stopped`; jobs use `restart: "no"`; `backend` has `stop_grace_period: 45s` (the API bounds its shutdown at 40 s); every service logs through `json-file` with `max-size: 10m`, `max-file: 5`. The backend DB and HTTP budgets (`DB_POOL_MAX`, `DB_POOL_ACQUIRE_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS`, `DB_LOCK_TIMEOUT_MS`, `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS`, `HTTP_REQUEST_TIMEOUT_MS`) pass through with the defaults of `.env.example`. The compose healthcheck probes `/health/ready` so dependents wait for database, pg-boss and storage; the image keeps its `/health/live` check.

All commands run from `ops/platform-api` in Bash. If your current shell is zsh, run `bash` first and keep that Bash session for this page and the linked operator runbooks: `$P` below relies on Bash word splitting. Define `P` once, here; the other runbooks point to this definition. The project defaults to `platform-api`; a restored installation has its own project and a pin file next to the compose file, and every compose command for that project uses both files. `PIN` is emptied when the file is absent:

    PROJECT=platform-api            # or the restored project name
    PIN=docker-compose.restore-$PROJECT.yml; [ -f "$PIN" ] || PIN=
    P="docker compose -p $PROJECT --env-file .env.production -f docker-compose.production.yml${PIN:+ -f $PIN}"

1. **Preflight.** `cp .env.production.example .env.production`, replace every `CHANGE_ME` (including `MINIO_IMAGE`, the site's MinIO image: run-guide «MinIO 이미지»), then `bash scripts/release/production-preflight.sh .env.production`. It makes no network call and prints one line per problem: non-https issuer or redirect, redirect path other than `/auth/callback`, an empty, `CHANGE_ME` or smoke-demo secret, `TRUSTED_PROXY_HOPS` below 1 (a value other than 2 only prints a warning: the topology needs 2), `EDGE_BIND` unset, a placeholder, not an IP address, or `0.0.0.0` without `EDGE_BIND_ALL_INTERFACES_ACK=yes`, `WORKSPACE_ID` not a UUID, a non-empty `SMTP_PORT` that is not a positive integer (either channel), `NOTIFICATION_EMAIL_CHANNEL` other than `mock` or `smtp` (no default), and with `smtp` a missing `SMTP_HOST`, `SMTP_PORT` (positive integer) or `SMTP_FROM`, `SMTP_USERNAME`/`SMTP_PASSWORD` not set together, or a placeholder/demo `SMTP_PASSWORD`; with `mock` it prints «email disabled (mock): notifications reach the inbox only» and still exits 0. The two DB role passwords must match `^[A-Za-z0-9_-]{24,}$` and differ (generate each with `openssl rand -hex 24`). Continue only on exit 0, then check `$P config --quiet`; never print or paste resolved production config (plain `config` prints the interpolated credentials).
1a. **Build the web image.** `bash scripts/release/build-web-image.sh` runs `pnpm --filter @ap/platform-web build:real-prod` and packages `apps/platform-web/dist` with nginx as `platform-release-web:local`. Run it before `$P up -d`: the `edge` service has `pull_policy: never` and no `build:` key, so compose fails with an image-not-found error when the script was not run.
2. **Set the role passwords, then cut over a new volume.** `$P run --rm set-role-passwords` first (new volume: it sets the `fops_*` replay logins; the cutover then renames them with the passwords intact), then `$P run --rm cutover` (once per new volume; safe to repeat).
3. **Start.** `$P up -d` (migration, bucket provisioning, then the backend).
4. **Bootstrap.** `$P run --rm bootstrap` creates the Workspace and the `system` Actor only (idempotent).
4a. **Restart the backend.** `$P restart backend`. The backend registers the 「플랫폼」 system and the business systems that declare `feedbackTracking` at startup, and it starts before step 4 creates the `system` Actor, so the first start skips with a warning (`platform systems sync skipped`). The restart runs the sync again; it is idempotent, so restarting later is harmless. The declaration file ships inside the backend image at `/app/platform-systems.json` (env `PLATFORM_SYSTEMS_FILE`, default that path; leave it unset or empty to keep the default). Mechanics: [core API](../../../../docs/architecture/platform-api/api/core.md#registry-owned-managed-systems-1289-node-i).
5. **First IdP login.** The future admin signs in through the platform host; this creates their Actor with role `user`.
6. **Promote.** `$P run --rm set-actor-role --external-id <idp-sub> --role admin --reason "first admin"` (profile `admin`; see [first-admin-bootstrap.md](first-admin-bootstrap.md)).
7. **Verify.** The person reloads and `GET /me` shows role Admin.

### DB role passwords

`platform_app` (runtime) and `platform_migrate` (schema owner) are the only login roles. Their passwords live only in the operator env file (`.env.production`, owner-only: `chmod 0600`, never committed) and are applied by the job-only `set-role-passwords` service (profile `roles`, migrate image; it holds the superuser credential only here and in `cutover`). The backend receives the app password inside `DATABASE_URL` and nothing else; the migrate password and superuser password reach job services only. The script reads the passwords from the environment, imports them into psql with `\getenv` (no secret in any argument), never prints them, and logs in as each role afterwards to prove them. It updates `platform_*` and/or the `fops_*` replay logins of a fresh volume, whichever exist, and is idempotent. It refuses ports 5434 and 5439 (ALTER ROLE is cluster-wide).

- **Provision (new volume):** fill both values in `.env.production`, then `$P run --rm set-role-passwords` **before** `cutover`. Same command on an existing install.
- **Rotate:** `$P stop backend` (and let no job run), edit both values in `.env.production` (keep mode 0600), `$P run --rm set-role-passwords`, `$P up -d`, check `/health/ready`. Pooled connections of the old password end when the backend stops; nothing else caches the value.
- Do not run `ALTER ROLE` by hand and do not paste the env file or resolved compose config into tickets or logs.

### Edge

The `edge` service (nginx, image from `apps/platform-web/Dockerfile`, config `ops/platform-api/edge/nginx.conf`) serves the web bundle and proxies to `backend:3001`, so web, `/api` and `/auth` share one origin: cookies stay first-party and no CORS is configured. It waits for the backend's `service_healthy`, has `mem_limit: 256m` and a healthcheck that fetches `/` from inside.

- **Routes, in this order.** `= /api/v1/platform/files` (the generic upload, exact match, forwarded unchanged; own body limit below); `/api/features/` strips the `/api/features` prefix and forwards to the backend (as `real-dev-proxy.ts` does in development, platform ADR-0071); `/api/` and `/auth/` are forwarded unchanged; `/assets/` (hashed files) is cached for a year as immutable and a missing asset is a 404; every other path is a file or falls back to `index.html`, which is sent with `Cache-Control: no-cache`. Backend responses, 4xx/5xx JSON included, pass through untouched: the proxied locations have no `error_page` or `proxy_intercept_errors`, so `/api` and `/auth` never return SPA HTML. `ops/platform-api/edge/nginx.test.mjs` (run by `gate.sh`) pins the order and that rule.
- **Headers.** `Host`, cookies and `X-Correlation-Id` pass unchanged. `X-Forwarded-For` is `$proxy_add_x_forwarded_for` (the ingress's value plus the ingress address). `X-Forwarded-Proto` is the ingress's header, never `$scheme`, because this hop is plain HTTP.
- **Document headers.** HTML and static files get the backend's Helmet policy (CSP with `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: SAMEORIGIN`); `PUBLIC_ATTACHMENT_ORIGIN` (compose passes it to the edge, default `'self'`) is rendered into the CSP at container start. Proxied `/api` and `/auth` responses keep the backend's own headers. Redirects nginx generates are relative (`absolute_redirect off`), so they keep the client's https.
- **Logs.** The edge access log records the path (`$uri`), status, size, time, `X-Correlation-Id` and forwarded client address, never the query string or Referer. `/auth/` logs only crit+ errors at the edge so OIDC `code`/`state` never reach nginx error lines; other paths log warn+, and an error line there can include the request line with its query string.
- **Hops.** Company TLS ingress → edge → backend, so `TRUSTED_PROXY_HOPS=2`: the backend takes the client address the ingress saw and sees the request as https (Secure session cookie, `https` redirect URLs).
- **Trust of forwarded headers.** `EDGE_BIND` has no default: bind the interface only the ingress reaches, and restrict `EDGE_PORT` to the ingress with a host firewall or security group. The ingress must set `X-Forwarded-Proto` and append to `X-Forwarded-For`, not pass client-supplied values through. Anyone who can reach the edge directly can forge both.
- **Limits.** `client_max_body_size 26m` (the 25 MiB attachment limit plus multipart overhead) for every route except `POST /api/v1/platform/files`, which has its own `34m` (the 32 MiB upload limit of ADR-0140 plus multipart overhead, with room for a file one byte over to reach the backend's judged `too_large` answer rather than an nginx 413). `proxy_read_timeout` and `proxy_send_timeout` are 60 s, above the backend's 30 s `HTTP_REQUEST_TIMEOUT_MS`. `proxy_request_buffering off`: uploads stream to the backend instead of being spooled on the edge's disk; the backend enforces the size.
- **TLS.** Terminated by the company ingress in front of the edge; certificates are not handled here.

Operator runbooks for this stack, with `P` as above (`$P exec backend node dist/cli/<name>.js …` for CLIs):

- First admin: [first-admin-bootstrap.md](first-admin-bootstrap.md) (`$P --profile bootstrap run --rm bootstrap`, `$P --profile admin run --rm set-actor-role …`).
- Failed background jobs: [failed-jobs-replay.md](failed-jobs-replay.md) (`jobs-inventory`, `jobs-replay`).
- Attachment orphans: [attachment-orphans.md](attachment-orphans.md) (`attachments-orphans`).
- Backup, isolated restore and upgrade (RPO 24 h, RTO 4 h): [backup-restore-upgrade.md](backup-restore-upgrade.md).

Email: the backend gets `NOTIFICATION_EMAIL_CHANNEL` (required: `mock` or `smtp`) and `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM` from `.env.production`. The mock channel only logs; the dispatch job still stamps `email_sent_at`, so with `mock` notifications reach the inbox only.

Backup, isolated restore and upgrade of this stack (RPO 24 h, RTO 4 h): [backup-restore-upgrade.md](backup-restore-upgrade.md).

Capacity checks (run periodically and before upgrades):

- Docker disk: `docker system df`; free space on the volume host: `df -h "$(docker info --format '{{.DockerRootDir}}')"`.
- Largest tables: `$P exec postgres psql -U postgres -d platform -c "select relid::regclass, pg_size_pretty(pg_total_relation_size(relid)) from pg_catalog.pg_statio_user_tables order by pg_total_relation_size(relid) desc limit 10"`.
- Attachment bucket size: `mc du <alias>/platform-attachments` with an `mc` alias for the MinIO endpoint.
- Job backlog and failures: `jobs-inventory` (see the failed-jobs runbook).
- Audit table: `$P exec postgres psql -U postgres -d platform -c "select pg_size_pretty(pg_total_relation_size('core.audit_log'))"`.

**Audit retention.** Interim policy (conductor decision, reversible): retain all audit rows; nothing purges them and the INSERT-only protections stay. Review the policy when `core.audit_log` (the only stored audit table; `core.platform_audit_events` is a projection function) exceeds 5 GB or once a year, whichever comes first.

Following one request: every response carries `X-Correlation-Id`, and the same value is the `request_id` field of that request's backend log lines. Take the id from the browser or the proxy, then `$P logs backend | grep <id>`.

## Routes and image behavior

In the local smoke stack and the backend image, the backend serves its own routes directly; there is no static web image or HTML-navigation split there. The production stack differs: its `edge` service serves the web bundle (see the Edge section above). The standalone nginx proxy (`/assets/*`, SPA fallback, `Accept: text/html` routing) was retired with the web app (#597). The auth routes are in apps/platform-api/src/modules/auth/routes.ts (GET /auth/login, GET /auth/callback, POST /auth/logout), the attachment routes in apps/platform-api/src/modules/attachments/routes.ts (POST /attachments, GET /attachments/:id/download), and health routes in apps/platform-api/src/modules/core/health/routes.ts (GET /health, /health/live, /health/ready). The platform host reaches them through its own proxy seam. The local backend keeps PUBLIC_ATTACHMENT_ORIGIN at the quoted literal 'self' for same-origin downloads.

## Company IdP and Kubernetes configuration

Until the company IdP is known, Keycloak can serve as the interim IdP: see [keycloak-interim-idp.md](keycloak-interim-idp.md).

Register the exact callback URI https://<public-host>/auth/callback. The company IdP must provide:

- OIDC_ISSUER_URL: absolute HTTPS issuer URL without query, fragment, or credentials.
- OIDC_CLIENT_ID and OIDC_CLIENT_SECRET: non-empty client credentials. The backend uses the OIDC client's client_secret_basic default when supported by discovery.
- OIDC_REDIRECT_URI: absolute HTTPS URL whose path is exactly /auth/callback, with no query or fragment.
- OIDC_SCOPES: single-space-separated scopes including openid; request email profile for the profile claims below.
- ID Token claims: non-empty string sub and email; email_verified may be absent but must not be false; name is preferred for the display name, then preferred_username, then the email local part. The backend verifies issuer, audience, expiry, signature, state, nonce, and PKCE S256. Its bounded raw-claim allowlist is sub, iss, aud, email, email_verified, name, and preferred_username.

For Kubernetes, supply non-secret runtime config through the workload environment and secrets through Kubernetes Secret objects per FO ADR-0013:

- Runtime config: NODE_ENV=production, HOST, PORT, AUTH_PROVIDER=oidc, WORKSPACE_ID, TRUSTED_PROXY_HOPS, PUBLIC_ATTACHMENT_ORIGIN, OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_REDIRECT_URI, OIDC_SCOPES, and STORAGE_S3_ENDPOINT, STORAGE_S3_REGION, STORAGE_S3_BUCKET, STORAGE_S3_FORCE_PATH_STYLE.
- Runtime secrets: DATABASE_URL for platform_app, OIDC_CLIENT_SECRET, STORAGE_S3_ACCESS_KEY_ID, and STORAGE_S3_SECRET_ACCESS_KEY. If enabled, also supply SMTP_PASSWORD with SMTP_HOST, SMTP_PORT, SMTP_USERNAME, and SMTP_FROM; or EMBEDDING_API_KEY when EMBEDDING_PROVIDER=voyage.
- Migration job only: DATABASE_URL_MIGRATE for platform_migrate. Do not mount it in the backend workload.

The images emit backend structured JSON logs to stdout per FO ADR-0013. They do not add metrics or tracing. No FO ADR-0013 amendment is needed for this local stack: its deployment, health, logging, and secret-handling facts remain accurate.

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
