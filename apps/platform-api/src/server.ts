import type { NotificationSubjectReference } from '@ap/feature-shared';
import { resolveCorrelationId } from './lib/correlation-id.js';
import { createOwnerRecoveryRecorder } from './modules/dashboard/truth.js';
import { createOutcomeRecoveryRecorder } from './modules/surveys/recovery-presentation.js';
import { vocClusterSuggestionsRoutes } from './modules/voc/cluster-suggestions/routes.js';
import { createVocClusterSuggestionsService } from './modules/voc/cluster-suggestions/service.js';

import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import pg from 'pg';
import type { PgBoss } from 'pg-boss';
import type { Logger as PinoLogger } from 'pino';
import type { AppConfig } from './config.js';
import { type DbHandle, attachPoolErrorListener } from './db/client.js';
import { buildEntityLinkProviders } from './entity-link-providers.js';
import { registerHttpErrorHandler } from './lib/http-error-handler.js';
import { toJobLog } from './lib/job-log.js';
import { reqLogSerializer } from './lib/logger.js';
import { createRateLimitActorCache } from './lib/rate-limit-actor-cache.js';
import {
  createPgRateLimitStore,
  createSensitiveActorRateLimit,
} from './lib/rate-limit-pg-store.js';
import { buildRateLimitTiers } from './lib/rate-limit-tiers.js';
import type { DrainState } from './lib/shutdown.js';
import { getStorage } from './lib/storage/factory.js';
import type { StorageBackend } from './lib/storage/index.js';
import { SESSION_COOKIE_NAME } from './middleware/require-session.js';
import { catalogReportRoutes, logRulesContribution } from './modules/log-rules/index.js';
import {
  apiTokenRoutes,
  authResultOf,
  bearerValue,
  createApiTokenService,
  installAuthStore,
  installTokenGate,
} from './modules/api-tokens/index.js';
import {
  analyticsAreasRoutes,
  createAnalyticsAreaService,
} from './modules/analytics-areas/index.js';
import { MAX_ATTACHMENT_BYTES, attachmentsRoutes } from './modules/attachments/index.js';
import { createAttachmentsService } from './modules/attachments/service.js';
import type { AuthProvider } from './modules/auth/auth-provider.js';
import { listActorsRoutes } from './modules/auth/list-actors-routes.js';
import { createMockAuthProvider } from './modules/auth/mock-auth-provider.js';
import { createOidcAuthProvider } from './modules/auth/oidc-auth-provider.js';
import { authRoutes } from './modules/auth/routes.js';
import { createSessionService } from './modules/auth/session-service.js';
import { createAuditService } from './modules/core/audit/index.js';
import { healthRoutes } from './modules/core/health/routes.js';
import { createIdempotencyService } from './modules/core/idempotency/idempotency-service.js';
import { createDashboardService, dashboardRoutes } from './modules/dashboard/index.js';
import { createEntityLinksService, entityLinksRoutes } from './modules/entity-links/index.js';
import {
  createFindingsService,
  findingRecoveryProjection,
  findingRecoveryRepairScope,
  findingsRoutes,
  reconcileFindingExecution,
} from './modules/findings/index.js';
import { getItemReference, IMPROVEMENT_STATUS_LABELS, improvementItemsContribution } from './modules/improvement-items/index.js';
import {
  IMPORT_APPLY_BUDGET_MS,
  type ImportApplyHooks,
  createApplyRunnerPool,
  LOG_KNOWLEDGE_ROUTE_PREFIX,
  importRoutes as logKnowledgeImportRoutes,
  knowledgeLookup,
  logKnowledgeContribution,
} from './modules/log-knowledge/index.js';
import {
  VALIDATION_QUEUE_ROUTE_PREFIX,
  createQueueService,
  logLifecycleContribution,
  roundAttachmentParent,
  workerRoutes,
} from './modules/log-lifecycle/index.js';
import {
  type SourceOwnerAccess,
  type SourceReadPort,
  type LogExplorerExportDeps,
  type LogExplorerReadDeps,
  type UsageStore,
  LOG_EXPLORER_ROUTE_PREFIX,
  denyAllSourceOwners,
  guardSourceReadPort,
  logExplorerContribution,
  logExplorerExportRoutes,
} from './modules/log-explorer/index.js';
import {
  createManagedSystemService,
  managedSystemsRoutes,
} from './modules/managed-systems/index.js';
import {
  MENU_ACTION_PREFIX,
  type MenuDispatchContribution,
  createMenuDispatchRegistry,
  menuActionRoutes,
} from './modules/menu-dispatch/index.js';
import {
  MENU_QUERY_PREFIX,
  homeNoticesContribution,
  menuQueryRoutes,
} from './modules/menu-query/index.js';
import { createMilestonesService, milestonesRoutes } from './modules/milestones/index.js';
import {
  type NavCountsService,
  type NavResolveService,
  createNavCountsService,
  createNavResolveService,
  navRoutes,
} from './modules/nav/index.js';
import {
  type NotificationDispatcher,
  createNoopNotificationDispatcher,
  createNotificationNotifier,
  createNotificationService,
  createPgBossNotificationDispatcher,
  notificationRoutes,
} from './modules/notifications/index.js';
import {
  createCheckService,
  createDecisionService,
  createGrantAdminService,
  createRequestService,
  createSelectedReadService,
  permissionRecoveryProjection,
  permissionsRoutes,
} from './modules/permissions/index.js';
import { PLATFORM_PORT_PREFIX, platformPortRoutes } from './modules/platform-port/index.js';
import { holdsPlatformPermission } from './modules/platform-port/permissions.js';
import { platformSavedViewRoutes } from './modules/platform-saved-views/index.js';
import { createSavedViewsService, savedViewsRoutes } from './modules/saved-views/index.js';
import {
  createSurveysService,
  surveyRecoveryProjection,
  surveysRoutes,
} from './modules/surveys/index.js';
import { createTaskRequestsService, taskRequestsRoutes } from './modules/task-requests/index.js';
import { createTasksService, taskRecoveryProjection, tasksRoutes } from './modules/tasks/index.js';
import { createVocClustersService, vocClustersRoutes } from './modules/voc-clusters/index.js';
import { createEmbeddingProvider, isEmbeddingEnabled } from './modules/voc/embedding/factory.js';
import type { EmbeddingProvider } from './modules/voc/embedding/port.js';
import {
  createConversationService,
  createPublicUpdateReviewCandidateService,
  createVocEmbeddingEnqueuer,
  createVocPublicReadService,
  createVocReadService,
  createVocRecommendationsService,
  createVocService,
  readTaskRecoveryVocs,
  vocRecommendationsRoutes,
  vocRecoveryProjection,
  vocRecoveryRepairScope,
  vocRoutes,
} from './modules/voc/index.js';
import {
  createPreSubmitVocPeersService,
  preSubmitVocPeersRoutes,
} from './modules/voc/pre-submit-peers/index.js';
import { similarityPreviewRoutes } from './modules/voc/similarity-preview/routes.js';
import { createSimilarityPreviewService } from './modules/voc/similarity-preview/service.js';
import {
  createWorkspaceSettingsService,
  getResolvedWorkspaceSettings,
  workspaceSettingsRoutes,
} from './modules/workspace-settings/index.js';

export interface BuildServerOptions {
  embeddingProvider?: EmbeddingProvider;
  similarityPreviewDeadlineMs?: number;
  suggestionPageSize?: number;
  suggestionReadScanCeiling?: number;
  similarityPreviewClock?: () => Date;
  recoveryClock?: () => Date;
  /** Clock of the validation queue's run-window judgment (#1445 d); leases use the database clock. Tests inject it. */
  validationQueueClock?: () => Date;
  config: AppConfig;
  dbHandle: DbHandle;
  /**
   * Optional pg-boss handle. The runtime entrypoint starts pg-boss before
   * buildServer (ADR-0009:22-27 boot order) and threads it through so future
   * modules can attach request-time enqueue helpers without a second pg-boss
   * instance. Slice 1 has no in-request consumers; tests that don't need
   * background jobs may omit it.
   */
  boss?: PgBoss;
  /** Optional notification queue override for route and application tests. */
  notificationDispatcher?: NotificationDispatcher;
  /**
   * Optional process root logger (ADR-0013, amended 2026-09-22). When given,
   * Fastify attaches it via `loggerInstance` so request logs share the ONE
   * pino config the job logs use. Omitted (route tests): the inline logger
   * options below apply, byte-for-byte as before.
   */
  logger?: PinoLogger;
  /**
   * Optional storage backend override. Used by integration tests to inject a
   * mock instead of constructing the real S3-compat backend from env. In
   * production this is undefined and `getStorage()` builds the singleton.
   */
  storage?: StorageBackend;
  /**
   * Per-check budget in ms for the `GET /health/ready` dependency probes
   * (ADR-0013, amended 2026-09-22). Tests shrink it to keep
   * hanging-dependency cases fast; production uses the 2000 ms default.
   */
  healthProbeTimeoutMs?: number;
  /** Draining state flipped by the shutdown sequence (index.ts); readiness reports 503 once set. */
  drainState?: DrainState;
  /** Route-test seam; production constructs the navigation read model below. */
  navCountsService?: NavCountsService;
  /** Route-test seam; production constructs the navigation resolve service below. */
  navResolveService?: NavResolveService;
  /**
   * Menu endpoints/actions that business modules contribute to `POST /api/v1/menu-query` and
   * `POST /api/v1/menu-action` (menu-dispatch). Added to the platform's own `home.notices`; a failing
   * registration validation stops the boot. Tests pass their own pair here.
   */
  menuDispatch?: readonly MenuDispatchContribution[];
  /**
   * Log explorer Source seams (#1469). Production passes neither: no Source adapter is connected yet, so every read answers
   * `source_absent` (`source_not_connected`) and no Source owner is granted. The dev/test assembly injects the synthetic adapter
   * (`test-support/log-explorer-dev-assembly.ts`); the production graph check keeps it out of the production entry.
   */
  logExplorer?: {
    sourceReadPort?: SourceReadPort;
    sourceOwnerAccess?: SourceOwnerAccess;
    cursorKey?: Buffer;
    clock?: () => Date;
    /** Test seams of the token budget and the export stream (#1472): counters, chunk size, a hook before each chunk, the export time cap. */
    usage?: UsageStore;
    exportChunkBytes?: number;
    beforeExportChunk?: LogExplorerExportDeps['beforeExportChunk'];
    exportTotalMs?: number;
  };
  /** Test seam of the catalog import apply (#1195 b): a shorter time budget and failure/barrier hooks. */
  logKnowledgeImport?: { applyBudgetMs?: number; hooks?: ImportApplyHooks & { afterApply?(): Promise<void> } };
}

export async function buildServer(opts: BuildServerOptions): Promise<FastifyInstance> {
  const embeddingProvider = opts.embeddingProvider ?? createEmbeddingProvider(opts.config);
  const { config, dbHandle, boss } = opts;

  if (!config.WORKSPACE_ID) {
    throw new Error(
      'WORKSPACE_ID env var is required to build the server (ADR-0006 single seeded workspace).',
    );
  }
  // Review HTTP-H-1: refuse to boot the mock provider in production. The
  // route-level `/auth/mock-login` 404 gate stays as defense-in-depth, but
  // the boot-time refusal is the primary contract — an operator who forgets
  // to flip `AUTH_PROVIDER=oidc` gets a loud failure at startup instead of
  // a silent auth-bypass surface (CWE-489).
  if (config.NODE_ENV === 'production' && config.AUTH_PROVIDER === 'mock') {
    throw new Error(
      'AUTH_PROVIDER=mock is not permitted in production (ADR-0006). Set AUTH_PROVIDER=oidc.',
    );
  }
  const workspaceId = config.WORKSPACE_ID;

  const app = Fastify({
    ...(opts.logger
      ? { loggerInstance: opts.logger }
      : {
          logger: {
            level: config.NODE_ENV === 'test' ? 'silent' : 'info',
            // ADR-0013: logs-first observability via stdout JSON.
            // Review HTTP-M-3: redact request-header lines that carry secrets
            // (cookie holds the session id; idempotency-key correlates a single
            // actor's retries). Without this, anyone with log access can lift a
            // live session out of stdout (CWE-532).
            redact: {
              paths: [
                'req.headers.cookie',
                'req.headers["set-cookie"]',
                'req.headers.authorization',
                'req.headers["idempotency-key"]',
              ],
              remove: true,
            },
            // Issue #390: req.url carries the one-time OIDC authorization
            // code on /auth/callback — same req serializer as
            // createRootLogger (redactSensitiveQuery on the url value only).
            serializers: { req: reqLogSerializer },
          },
        }),
    // #1266 b3: bound the time a client may take to send a full request.
    requestTimeout: config.HTTP_REQUEST_TIMEOUT_MS,
    disableRequestLogging: config.NODE_ENV === 'test',
    // F-009 + Review HTTP-H-2: `trustProxy: true` is too permissive — it
    // trusts the entire X-Forwarded-For chain, so any client can spoof
    // `req.ip` and reset their anon rate-limit bucket (and the IP recorded
    // in session/audit rows). ADR-0015:7-14 keys on `req.ip` so trust must
    // be bounded to the operator-configured hop count. Default 0 outside
    // prod (identical to `trustProxy: false`); prod operators set
    // `TRUSTED_PROXY_HOPS=1` when a single ingress terminates TLS.
    trustProxy: config.NODE_ENV === 'production' ? Math.max(config.TRUSTED_PROXY_HOPS, 0) : false,
    // #620 / ADR-0069 decision 3: Correlation ID. The id is the Fastify reqId; the log
    // field is `request_id` (FO ADR-0013) and every response echoes it below.
    genReqId: resolveCorrelationId,
    requestIdLogLabel: 'request_id',
  }).withTypeProvider<ZodTypeProvider>();

  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Correlation-Id', req.id);
  });
  // ADR-0116: the request's auth-context holder must exist before any other hook runs.
  installAuthStore(app as unknown as FastifyInstance);

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('db', dbHandle.db);
  if (boss) {
    // Future request handlers that need to enqueue work pull this off the
    // app decorator instead of importing a module-level singleton.
    app.decorate('boss', boss);
  }

  // ── @fastify/helmet ─ ADR-0015:21-37 ─────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', config.PUBLIC_ATTACHMENT_ORIGIN],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", config.PUBLIC_ATTACHMENT_ORIGIN],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
  });

  // ── @fastify/cookie ─ session cookie codec ──────────────────────────
  await app.register(cookie);

  // ── @fastify/multipart ─ PLAN-22 C3a ────────────────────────────────
  // 25 MiB cap (D-06). Limits are global — only POST /attachments accepts
  // multipart today; other routes still validate as JSON.
  await app.register(multipart, {
    limits: {
      fileSize: MAX_ATTACHMENT_BYTES,
      files: 1,
    },
  });

  // ── @fastify/rate-limit ─ ADR-0015:7-18 ─────────────────────────────
  // Postgres-backed via our custom store. The global tier is per-Actor when
  // authenticated (100/min) or per-IP when not (50/min); the route-level
  // mutation and sensitive tiers are registered as named groups on the
  // routes that need them. `/health`, `/health/live`, and `/health/ready`
  // are exempt via `allowList` — k8s probes must never see 429.
  const sessionService = createSessionService({
    db: dbHandle.db,
    workspaceId,
    log: { warn: (msg, meta) => app.log.warn(meta ?? {}, msg) },
  });

  // Adversarial review API-C-2: `@fastify/rate-limit` runs as an
  // `onRequest` hook, which fires BEFORE the `requireSession` preHandler
  // that populates `req.session`. The prior keyGenerator therefore always
  // observed `undefined` and fell back to `req.ip`, collapsing all users
  // behind a shared NAT into one bucket. We resolve the session cookie
  // inline before bucket selection so the per-actor bucket is the
  // workspace+actor identity when a valid session cookie is present, and
  // `req.ip` only for unauthenticated traffic.
  const auditService = createAuditService();
  const apiTokenService = createApiTokenService({
    db: dbHandle.db,
    auditService,
    workspaceId,
    unusedWarningDays: config.API_TOKEN_UNUSED_WARNING_DAYS ?? 30,
  });
  const rateLimitActorCache = createRateLimitActorCache();
  // Token mutations (`config.tokenMutation`) use the size of the mutation tier (lib/rate-limit-tiers.ts) on their own key.
  const TOKEN_MUTATION_SUFFIX = ':mutation';
  const TOKEN_MUTATION_MAX = buildRateLimitTiers(async () => '').mutation.max as number;
  const resolveRateLimitActorKey = async (req: FastifyRequest): Promise<string> => {
    // ADR-0116 decision 8: a Bearer call that authenticates has its own bucket `<workspace>:token:<id>`; a route that
    // declares `config.tokenMutation` gets a separate mutation-sized bucket (`…:mutation`). Every rejected
    // authentication (unknown, malformed, revoked, expired, wrong owner) and an empty Bearer credential is counted in
    // the unauthenticated per-IP bucket. The cookie is ignored. The outcome is resolved once and reused by the gate.
    const bearer = bearerValue(req.headers.authorization);
    if (bearer !== null) {
      try {
        const result = await authResultOf(req, () => apiTokenService.authenticate(bearer, req.ip));
        if (result.ok) {
          const base = `${result.workspaceId}:token:${result.tokenId}`;
          return req.routeOptions?.config?.tokenMutation === true ? `${base}${TOKEN_MUTATION_SUFFIX}` : base;
        }
      } catch (err) {
        req.log?.warn?.({ err }, 'rate-limit token lookup failed; falling back to ip');
      }
      return req.ip;
    }
    const raw = req.cookies?.[SESSION_COOKIE_NAME];
    const token = typeof raw === 'string' ? raw : undefined;
    if (token) {
      const cachedIdentity = rateLimitActorCache.get(token);
      if (cachedIdentity) {
        return `${cachedIdentity.workspace_id}:${cachedIdentity.actor_id}`;
      }

      try {
        const identity = await sessionService.lookupActorIdByToken(token);
        if (identity) {
          rateLimitActorCache.set(token, identity);
          return `${identity.workspace_id}:${identity.actor_id}`;
        }
      } catch (err) {
        req.log?.warn?.({ err }, 'rate-limit actor lookup failed; falling back to ip');
      }
    }
    return req.ip;
  };

  const actorAwareKeyGenerator = async (req: FastifyRequest): Promise<string> => {
    return resolveRateLimitActorKey(req);
  };

  await app.register(rateLimit, {
    global: true,
    max: (req, key) =>
      key === req.ip ? 50 : key.endsWith(TOKEN_MUTATION_SUFFIX) ? TOKEN_MUTATION_MAX : 100,
    timeWindow: '1 minute',
    allowList: (req) =>
      req.url === '/health' || req.url === '/health/live' || req.url === '/health/ready',
    keyGenerator: actorAwareKeyGenerator,
    store: createPgRateLimitStore(dbHandle.pool, 'global') as never,
    errorResponseBuilder: (_req, ctx) => ({
      code: 'rate_limited.actor',
      message: 'rate limit exceeded',
      detail: { retry_after_seconds: Math.ceil(ctx.ttl / 1000) },
    }),
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });

  // Per-route tiers (ADR-0015:11-13) — lib/rate-limit-tiers.ts. The actor
  // key generator stays here: it closes over sessionService and the
  // rate-limit actor cache, both wired above.
  app.decorate('rateLimitConfig', buildRateLimitTiers(actorAwareKeyGenerator));

  // ADR-0116 token gate: after the rate limiter (a failed Bearer call counts in the IP bucket), before any route.
  installTokenGate(app as unknown as FastifyInstance, { tokens: apiTokenService });

  // ── Error handler ─ ADR-0012 envelope (lib/http-error-handler.ts) ────
  // Registered on the ROOT instance: a plugin-scoped setErrorHandler would
  // not cover sibling product routes.
  // Same pino-logger variance as `return app as unknown as FastifyInstance`
  // below: the concrete instance satisfies the default contract at runtime.
  registerHttpErrorHandler(app as unknown as FastifyInstance);

  // ── Health routes ─ ADR-0013 (modules/core/health/routes.ts) ────────
  // Resolved once and shared with the attachments module below. This is the
  // same `opts.storage ?? getStorage()` instance attachment routes already
  // use. `getStorage()` is a lazy proxy: env errors surface on the first
  // `.exists()` call and count as a readiness-check failure there, never a
  // boot crash.
  const attachmentsStorage = opts.storage ?? getStorage();
  await app.register(healthRoutes, {
    pool: dbHandle.pool,
    boss,
    storage: attachmentsStorage,
    ...(opts.healthProbeTimeoutMs !== undefined
      ? { healthProbeTimeoutMs: opts.healthProbeTimeoutMs }
      : {}),
    drain: opts.drainState,
  });

  // ADR-0006:16 — the two providers are swapped by the AUTH_PROVIDER env
  // var. createOidcAuthProvider performs IdP discovery at boot and rejects
  // on failure, so an unreachable/misconfigured issuer fails buildServer
  // BEFORE the HTTP listener starts (issue #390 fail-closed boot).
  let authProvider: AuthProvider;
  switch (config.AUTH_PROVIDER) {
    case 'mock':
      authProvider = createMockAuthProvider({ db: dbHandle.db, workspaceId });
      break;
    case 'oidc':
      // All OIDC_* fields are present by construction — config.ts superRefine
      // requires them when AUTH_PROVIDER=oidc.
      authProvider = await createOidcAuthProvider({
        oidc: {
          issuerUrl: config.OIDC_ISSUER_URL ?? '',
          clientId: config.OIDC_CLIENT_ID ?? '',
          clientSecret: config.OIDC_CLIENT_SECRET ?? '',
          redirectUri: config.OIDC_REDIRECT_URI ?? '',
          scopes: config.OIDC_SCOPES,
        },
        nodeEnv: config.NODE_ENV,
      });
      break;
    default:
      throw new Error(`Unknown AUTH_PROVIDER value: ${String(config.AUTH_PROVIDER)}`);
  }
  await app.register(authRoutes, {
    authProvider,
    sessionService,
    workspaceId,
    nodeEnv: config.NODE_ENV,
  });

  // ── GET /actors — workspace actor list (post-#21 drift fix) ─────────────
  // FE Triage OwnerPicker (`useWorkspaceActors`) calls this; the route was
  // never registered alongside #21's FE work, leaving the assignee picker
  // silently empty in dev. Registered after authRoutes so requireSession is
  // available.
  await app.register(listActorsRoutes, {
    db: dbHandle.db,
    sessionService,
    workspaceId,
  });

  // ── Permissions module — slice 1 issue #4 ───────────────────────────────
  // Registered AFTER auth so requireSession is available on its routes.
  const recoveryRecorder = createOwnerRecoveryRecorder();
  const checkService = createCheckService({ db: dbHandle.db });
  const idempotencyService = createIdempotencyService();
  const notificationDispatcher =
    opts.notificationDispatcher ??
    (boss ? createPgBossNotificationDispatcher(boss) : createNoopNotificationDispatcher());
  const notify = createNotificationNotifier(notificationDispatcher);
  const requestService = createRequestService({
    recoveryRecorder,
    db: dbHandle.db,
    checkService,
    auditService,
    idempotencyService,
    notify,
  });
  const decisionService = createDecisionService({
    recoveryRecorder,
    db: dbHandle.db,
    checkService,
    auditService,
    idempotencyService,
    notify,
    resolveWorkspaceSettings: getResolvedWorkspaceSettings,
  });
  const grantAdminService = createGrantAdminService({
    db: dbHandle.db,
    checkService,
    auditService,
    idempotencyService,
    notify,
  });
  await app.register(permissionsRoutes, {
    sessionService,
    checkService,
    requestService,
    selectedReadService: createSelectedReadService({ db: dbHandle.db, checkService }),
    decisionService,
    grantAdminService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
      sensitive: app.rateLimitConfig.sensitive,
    },
  });

  await app.register(apiTokenRoutes, {
    sessionService,
    tokens: apiTokenService,
    workspaceId,
    rateLimitConfig: { mutation: app.rateLimitConfig.mutation },
  });

  // ── Log rules (#1491): the token-submitted rule catalog report (design log-rules §5.1, ADR-0122) ──────────────
  await app.register(catalogReportRoutes, {
    db: dbHandle.db,
    checkService,
    auditService,
    sessionService,
    workspaceId,
    rateLimitConfig: { mutation: app.rateLimitConfig.mutation },
  });

  // ── Managed Systems module — Slice 2 issue #10 ──────────────────────────
  const managedSystemService = createManagedSystemService({
    db: dbHandle.db,
    checkService,
    auditService,
    idempotencyService,
  });
  await app.register(managedSystemsRoutes, {
    sessionService,
    managedSystemService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
    },
  });

  // ── Workspace Settings module — Slice 9 issue #195 ─────────────────────
  const workspaceSettingsService = createWorkspaceSettingsService({
    db: dbHandle.db,
    checkService,
    auditService,
  });
  await app.register(workspaceSettingsRoutes, {
    sessionService,
    workspaceSettingsService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
    },
  });

  // ── Analytics Areas module — Slice 2 issue #11 ──────────────────────────
  const analyticsAreaService = createAnalyticsAreaService({
    db: dbHandle.db,
    checkService,
    auditService,
    idempotencyService,
  });
  await app.register(analyticsAreasRoutes, {
    sessionService,
    analyticsAreaService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
    },
  });

  // One Round attachment parent reader, shared by the Entity Links end check and the attachment download path (ADR-0123).
  const roundAttachmentParentReader = roundAttachmentParent({ db: dbHandle.db, checkService });
  // ── Entity Links module — Slice 4.1 issue #112 ────────────────────────────
  const entityLinksService = createEntityLinksService({
    reconcileFindingExecution,
    recoveryRecorder,
    db: dbHandle.db,
    checkService,
    auditService,
    providers: buildEntityLinkProviders({
      // The 수동 검증 첨부 end is judged by the same parent reader as the download path (ADR-0123).
      attachmentParents: [roundAttachmentParentReader],
    }),
  });
  await app.register(entityLinksRoutes, {
    sessionService,
    entityLinksService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
      read: app.rateLimitConfig.read,
    },
  });

  // ── Findings module — Slice 5 issue #122 ─────────────────────────────────
  const findingsService = createFindingsService({
    outcomeRecoveryRecorder: createOutcomeRecoveryRecorder(),
    recoveryRecorder,
    db: dbHandle.db,
    auditService,
    checkService,
    idempotencyService,
    entityLinksService,
  });
  await app.register(findingsRoutes, {
    sessionService,
    findingsService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
      read: app.rateLimitConfig.read,
    },
  });

  const surveysService = createSurveysService({
    ...(opts.recoveryClock ? { recoveryClock: opts.recoveryClock } : {}),
    recoveryRecorder,
    db: dbHandle.db,
    auditService,
    checkService,
    idempotencyService,
    resolveWorkspaceSettings: getResolvedWorkspaceSettings,
  });
  await app.register(surveysRoutes, {
    sessionService,
    surveysService,
    findingsService,
    workspaceId,
    rateLimitConfig: { mutation: app.rateLimitConfig.mutation, read: app.rateLimitConfig.read },
  });

  // ── Task Requests module — Slice 6 issue #132 ─────────────────────────────
  // The independent increment runs while the command holds a transaction
  // connection. A separate bounded pool prevents command-pool starvation.
  // `pool.options` carries the runtime time budgets (statement/lock/idle-tx
  // timeouts), so this pool inherits them; only size and acquire timeout differ.
  const selfApprovalPool = new pg.Pool({
    ...dbHandle.pool.options,
    max: 2,
    connectionTimeoutMillis: 5_000,
  });
  attachPoolErrorListener(selfApprovalPool, (err) =>
    app.log.error({ errName: err.name, code: (err as { code?: unknown }).code }, 'self-approval pool error'),
  );
  app.addHook('onClose', async () => selfApprovalPool.end());
  const taskRequestsService = createTaskRequestsService({
    consumeSelfApprovalRateLimit: createSensitiveActorRateLimit(selfApprovalPool),
    recoveryRecorder,
    db: dbHandle.db,
    auditService,
    checkService,
    idempotencyService,
    notify,
  });
  await app.register(taskRequestsRoutes, {
    sessionService,
    taskRequestsService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
      read: app.rateLimitConfig.read,
    },
  });

  // #378: constructed before the Tasks module so Task detail can resolve its
  // source VOC's visibility through the canonical VOC read-authority path.
  const vocReadService = createVocReadService({
    db: dbHandle.db,
    checkService,
    entityLinksService,
  });
  // ADR-0110 decision 3: the public part of a VOC; its own rule, never the ADR-0031 one.
  const vocPublicReadService = createVocPublicReadService({ db: dbHandle.db });

  // ── Tasks module — Slice 6 issue #134 ────────────────────────────────────
  const tasksService = createTasksService({
    recoveryRecorder,
    db: dbHandle.db,
    auditService,
    checkService,
    idempotencyService,
    vocReadService,
    notify,
    ...(boss ? { boss } : {}),
  });
  await app.register(tasksRoutes, {
    sessionService,
    tasksService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
      read: app.rateLimitConfig.read,
    },
  });

  // ── Milestones module — #514 ─────────────────────────────────────────────
  const milestonesService = createMilestonesService({
    db: dbHandle.db,
    auditService,
    checkService,
    idempotencyService,
  });
  await app.register(milestonesRoutes, {
    sessionService,
    milestonesService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
      read: app.rateLimitConfig.read,
    },
  });

  // VOC conversation command is constructed here so cluster candidate apply can
  // delegate each selected VOC to the canonical per-VOC command.
  const vocService = createVocService({
    recoveryRecorder,
    db: dbHandle.db,
    auditService,
    checkService,
    idempotencyService,
    notify,
    vocReadService,
    // #168 (ADR-0034 D6). Disabled provider → the enqueuer is a no-op, so a
    // key-less environment creates no embedding jobs at all.
    embeddingEnqueuer: createVocEmbeddingEnqueuer({
      ...(boss ? { boss } : {}),
      embeddingEnabled: isEmbeddingEnabled(config),
      log: { error: (msg, meta) => app.log.error(meta ?? {}, msg) },
    }),
  });
  const conversationService = createConversationService({
    recoveryRecorder,
    db: dbHandle.db,
    auditService,
    checkService,
    idempotencyService,
    notify,
    vocReadService,
  });
  const publicUpdateReviewCandidateService = createPublicUpdateReviewCandidateService({
    db: dbHandle.db,
    auditService,
    checkService,
    conversationService,
    vocReadService,
  });

  const subjectReferenceForAllowedRecord = (
    displayId: string,
    title: string,
  ): NotificationSubjectReference => {
    const safeDisplayId = displayId.trim();
    const safeTitle = title.trim();
    return safeDisplayId && safeTitle
      ? { visibility_state: 'allowed', display_id: safeDisplayId, title: safeTitle }
      : { visibility_state: 'unavailable' };
  };

  const notificationService = createNotificationService({
    db: dbHandle.db,
    notificationDispatcher,
    resolveSubjectReference: async ({
      actor,
      subject_type: subjectType,
      subject_id: subjectId,
    }): Promise<NotificationSubjectReference> => {
      switch (subjectType) {
        case 'voc': {
          const reference = await vocReadService.resolveVocReference({ actor, vocId: subjectId });
          return reference.visibility_state === 'allowed'
            ? subjectReferenceForAllowedRecord(reference.display_id, reference.title)
            : { visibility_state: 'unavailable' };
        }
        case 'task':
        case 'task_request': {
          const summary = await entityLinksService.resolveReadableEndpointSummary({
            actor,
            endpoint: { type: subjectType, id: subjectId },
          });
          if (!summary) return { visibility_state: 'unavailable' };
          if (subjectType === 'task') {
            if (summary.type !== 'task') return { visibility_state: 'unavailable' };
            return subjectReferenceForAllowedRecord(summary.display_id, summary.title);
          }
          if (summary.type !== 'task_request') return { visibility_state: 'unavailable' };
          const title = summary.requested_outcome.trim() || summary.evidence_summary.trim();
          return subjectReferenceForAllowedRecord(summary.display_id, title);
        }
        case 'permission_request': {
          const request = await requestService.resolveNotificationReference(actor, subjectId);
          return request
            ? subjectReferenceForAllowedRecord(request.id.slice(0, 8), request.requested_capability)
            : { visibility_state: 'unavailable' };
        }
        case 'permission_grant': {
          const grant = await grantAdminService.resolveNotificationReference(actor, subjectId);
          return grant
            ? subjectReferenceForAllowedRecord(grant.id.slice(0, 8), grant.capability)
            : { visibility_state: 'unavailable' };
        }
        case 'public_update_review_candidate': {
          const reference = await publicUpdateReviewCandidateService.resolveNotificationReference(
            actor,
            subjectId,
          );
          return reference?.visibility_state === 'allowed'
            ? subjectReferenceForAllowedRecord(reference.display_id, reference.title)
            : { visibility_state: 'unavailable' };
        }
        case 'improvement_item': {
          // The same read right and workspace rule as `improvement.itemDetail` (`platform:view`, the actor's workspace).
          // The reference is the `IM-<n>` identity and the status display name only: never the problem/action text.
          if (!(await holdsPlatformPermission(checkService, actor, 'platform:view'))) {
            return { visibility_state: 'unavailable' };
          }
          const item = await getItemReference(dbHandle.db, actor.workspace_id, subjectId);
          return item
            ? subjectReferenceForAllowedRecord(`IM-${item.itemNo}`, IMPROVEMENT_STATUS_LABELS[item.status] ?? '')
            : { visibility_state: 'unavailable' };
        }
        default:
          return { visibility_state: 'unavailable' };
      }
    },
  });

  // ── VOC Cluster module — Slice 5 issue #126 ───────────────────────────────
  const vocClustersService = createVocClustersService({
    recoveryRecorder,
    db: dbHandle.db,
    auditService,
    checkService,
    idempotencyService,
    postPublicUpdate: conversationService.postPublicUpdate,
  });
  await app.register(vocClustersRoutes, {
    sessionService,
    vocClustersService,
    taskRequestsService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
      read: app.rateLimitConfig.read,
    },
  });
  const navCountsService =
    opts.navCountsService ??
    createNavCountsService({
      vocReadService,
      findingsService,
      surveysService,
      vocClustersService,
    });
  const navResolveService =
    opts.navResolveService ??
    createNavResolveService({
      vocReadService,
      findingsService,
      tasksService,
      taskRequestsService,
    });
  // ── Platform port — #620, ADR-0069 ──────────────────────────────────────
  await app.register(platformPortRoutes, {
    prefix: PLATFORM_PORT_PREFIX,
    sessionService,
    checkService,
    workspaceId,
    db: dbHandle.db,
    vocReadService,
    findingsService,
    tasksService,
  });
  // Saved views share the platform prefix with the port above; the sub-paths do not overlap (#1105, ADR-0099).
  await app.register(platformSavedViewRoutes, {
    prefix: PLATFORM_PORT_PREFIX,
    sessionService,
    checkService,
    workspaceId,
    db: dbHandle.db,
  });
  // The business menu ports (#1106 menu-query, #1193 menu-action): one declaration registry that
  // modules contribute to. Registration problems throw here and stop the boot.
  // `importApply` runs inside the action engine's transaction, which holds a command-pool connection: its runner
  // takes connections from a separate pool sized to the apply slots (like the self-approval pool above), so same-key
  // followers or a tiny DB_POOL_MAX cannot starve it. The apply route stays on the command pool (no outer connection).
  const importApplyRunnerPool = createApplyRunnerPool(
    dbHandle.pool.options,
    opts.logKnowledgeImport?.applyBudgetMs ?? IMPORT_APPLY_BUDGET_MS,
  );
  attachPoolErrorListener(importApplyRunnerPool, (err) =>
    app.log.error({ errName: err.name, code: (err as { code?: unknown }).code }, 'import apply runner pool error'),
  );
  app.addHook('onClose', async () => importApplyRunnerPool.end());
  const logExplorerDeps: LogExplorerReadDeps = {
    db: dbHandle.db,
    checkService,
    audit: auditService,
    clock: opts.logExplorer?.clock ?? (() => new Date()),
    sourceReadPort: opts.logExplorer?.sourceReadPort ?? null,
    sourceOwnerAccess: opts.logExplorer?.sourceOwnerAccess ?? denyAllSourceOwners,
    ...(opts.logExplorer?.cursorKey ? { cursorKey: opts.logExplorer.cursorKey } : {}),
    ...(opts.logExplorer?.usage ? { usage: opts.logExplorer.usage } : {}),
  };
  const menuRegistry = createMenuDispatchRegistry([
    homeNoticesContribution({ db: dbHandle.db, checkService }),
    logKnowledgeContribution({
      db: dbHandle.db,
      checkService,
      runnerPool: importApplyRunnerPool,
      ...(opts.logKnowledgeImport?.applyBudgetMs !== undefined ? { applyBudgetMs: opts.logKnowledgeImport.applyBudgetMs } : {}),
      ...(opts.logKnowledgeImport?.hooks ? { applyHooks: opts.logKnowledgeImport.hooks } : {}),
    }),
    improvementItemsContribution({ db: dbHandle.db, checkService, notify }),
    logLifecycleContribution({ db: dbHandle.db, checkService, knowledgeLookup, entityLinks: entityLinksService }),
    logExplorerContribution(logExplorerDeps),
    logRulesContribution({ db: dbHandle.db, checkService }),
    ...(opts.menuDispatch ?? []),
  ]);
  // The catalog import upload (#1195 a) is a multipart route, which the menu-action port cannot carry: it is
  // registered here beside the module's contribution (the contribution type has no route hook).
  // The log explorer export (#1472) is a streamed download, which the JSON menu envelope cannot carry: its own REST route, session or token.
  await app.register(logExplorerExportRoutes, {
    prefix: LOG_EXPLORER_ROUTE_PREFIX,
    deps: {
      ...logExplorerDeps,
      tokenActive: (tokenId) => apiTokenService.isActive(tokenId),
      ...(opts.logExplorer?.exportChunkBytes !== undefined ? { exportChunkBytes: opts.logExplorer.exportChunkBytes } : {}),
      ...(opts.logExplorer?.beforeExportChunk ? { beforeExportChunk: opts.logExplorer.beforeExportChunk } : {}),
      ...(opts.logExplorer?.exportTotalMs !== undefined ? { exportTotalMs: opts.logExplorer.exportTotalMs } : {}),
    },
    port: logExplorerDeps.sourceReadPort ? guardSourceReadPort(logExplorerDeps.sourceReadPort) : null,
    sessionService,
    workspaceId,
  });
  await app.register(logKnowledgeImportRoutes, {
    prefix: LOG_KNOWLEDGE_ROUTE_PREFIX,
    sessionService,
    checkService,
    idempotencyService,
    db: dbHandle.db,
    pool: dbHandle.pool,
    workspaceId,
    ...(opts.logKnowledgeImport?.applyBudgetMs !== undefined
      ? { applyBudgetMs: opts.logKnowledgeImport.applyBudgetMs }
      : {}),
    ...(opts.logKnowledgeImport?.hooks ? { applyHooks: opts.logKnowledgeImport.hooks } : {}),
  });
  await app.register(menuQueryRoutes, {
    prefix: MENU_QUERY_PREFIX,
    sessionService,
    checkService,
    workspaceId,
    db: dbHandle.db,
    registry: menuRegistry,
  });
  await app.register(menuActionRoutes, {
    prefix: MENU_ACTION_PREFIX,
    sessionService,
    workspaceId,
    db: dbHandle.db,
    registry: menuRegistry,
  });
  // The validation request queue worker REST (#1445 d, ADR-0117): token-only, `validation.worker` scope.
  await app.register(workerRoutes, {
    prefix: VALIDATION_QUEUE_ROUTE_PREFIX,
    sessionService,
    workspaceId,
    queue: createQueueService({ db: dbHandle.db, ...(opts.validationQueueClock ? { now: opts.validationQueueClock } : {}) }),
  });
  await app.register(navRoutes, {
    sessionService,
    navCountsService,
    navResolveService,
    workspaceId,
    rateLimitConfig: { read: app.rateLimitConfig.read },
  });
  const dashboardService = createDashboardService({
    ...(opts.recoveryClock ? { recoveryClock: opts.recoveryClock } : {}),
    recoveryReaders: {
      vocRecoveryProjection,
      vocRecoveryRepairScope,
      findingRecoveryProjection,
      findingRecoveryRepairScope,
      taskRecoveryProjection,
      permissionRecoveryProjection,
      surveyRecoveryProjection,
      readTaskRecoveryVocs,
    },
    db: dbHandle.db,
    checkService,
    requestService,
    vocReadService,
  });
  await app.register(dashboardRoutes, {
    sessionService,
    dashboardService,
    workspaceId,
    rateLimitConfig: { read: app.rateLimitConfig.read, mutation: app.rateLimitConfig.mutation },
  });
  await app.register(notificationRoutes, {
    sessionService,
    notificationService,
    workspaceId,
    rateLimitConfig: {
      read: app.rateLimitConfig.read,
      notificationState: app.rateLimitConfig.notificationState,
    },
  });

  // #143 actor-private persisted list filters. This is intentionally a root
  // prefix (rather than /nav) because it is a CRUD resource, not navigation's
  // read-only badge aggregation.
  const savedViewsService = createSavedViewsService({ db: dbHandle.db });
  await app.register(savedViewsRoutes, {
    sessionService,
    savedViewsService,
    workspaceId,
    rateLimitConfig: { mutation: app.rateLimitConfig.mutation, read: app.rateLimitConfig.read },
  });

  const vocRecommendationsService = createVocRecommendationsService({
    db: dbHandle.db,
    auditService,
    embeddingVersion: config.EMBEDDING_VERSION,
    embeddingEnabled: isEmbeddingEnabled(config),
    createClustersService: (db) =>
      createVocClustersService({
        recoveryRecorder,
        db,
        auditService,
        checkService,
        idempotencyService,
        postPublicUpdate: conversationService.postPublicUpdate,
      }),
  });
  await app.register(vocRecommendationsRoutes, {
    sessionService,
    vocRecommendationsService,
    workspaceId,
    rateLimitConfig: { mutation: app.rateLimitConfig.mutation, read: app.rateLimitConfig.read },
  });
  const clusterSuggestionsService = createVocClusterSuggestionsService({
    db: dbHandle.db,
    auditService,
    checkService,
    idempotencyService,
    embeddingVersion: config.EMBEDDING_VERSION,
    embeddingEnabled: isEmbeddingEnabled(config),
    embeddingIdentity: embeddingProvider.identity(),
    ...(opts.suggestionPageSize !== undefined
      ? { suggestionPageSize: opts.suggestionPageSize }
      : {}),
    ...(opts.suggestionReadScanCeiling !== undefined
      ? { suggestionReadScanCeiling: opts.suggestionReadScanCeiling }
      : {}),
    createClustersService: (db) =>
      createVocClustersService({
        db,
        auditService,
        checkService,
        idempotencyService,
        recoveryRecorder,
        postPublicUpdate: conversationService.postPublicUpdate,
      }),
  });
  await app.register(vocClusterSuggestionsRoutes, {
    service: clusterSuggestionsService,
    sessionService,
    workspaceId,
    rateLimitConfig: { mutation: app.rateLimitConfig.mutation, read: app.rateLimitConfig.read },
  });
  const preSubmitVocPeersService = createPreSubmitVocPeersService({ db: dbHandle.db });
  await app.register(similarityPreviewRoutes, {
    sessionService,
    workspaceId,
    rateLimitConfig: app.rateLimitConfig.similarityPreview,
    readRateLimitConfig: app.rateLimitConfig.read,
    service: createSimilarityPreviewService({
      db: dbHandle.db,
      config,
      provider: embeddingProvider,
      log: toJobLog(app.log),
      ...(opts.similarityPreviewDeadlineMs !== undefined
        ? { deadlineMs: opts.similarityPreviewDeadlineMs }
        : {}),
      ...(opts.similarityPreviewClock ? { clock: opts.similarityPreviewClock } : {}),
    }),
  });

  await app.register(preSubmitVocPeersRoutes, {
    sessionService,
    preSubmitVocPeersService,
    workspaceId,
    rateLimitConfig: { read: app.rateLimitConfig.read },
  });

  // ── VOC module — Slice 3 issue #13 / #14 / #15 / #16 ──────────────────────
  await app.register(vocRoutes, {
    sessionService,
    vocService,
    vocReadService,
    vocPublicReadService,
    findingsService,
    taskRequestsService,
    conversationService,
    publicUpdateReviewCandidateService,
    workspaceId,
    rateLimitConfig: {
      mutation: app.rateLimitConfig.mutation,
      read: app.rateLimitConfig.read,
      triage: app.rateLimitConfig.triage,
      reporterEdit: app.rateLimitConfig.reporterEdit,
    },
  });

  // ── Attachments module — Slice 3 #22 / PLAN-22 C3a + C3b ────────────────
  // `attachmentsStorage` is resolved once above the health probes.
  const attachmentsService = createAttachmentsService({
    storage: attachmentsStorage,
    auditService,
    db: dbHandle.db,
    idempotencyService,
    vocReadService,
    vocPublicAttachmentReader: vocPublicReadService,
    // Parent kinds other than `voc` (#1451); a linked row whose kind is not listed here is denied.
    parents: [roundAttachmentParentReader],
    log: { warn: (msg, meta) => app.log.warn(meta ?? {}, msg) },
  });
  await app.register(attachmentsRoutes, {
    sessionService,
    attachmentsService,
    workspaceId,
    uploadConcurrency: config.ATTACHMENT_UPLOAD_CONCURRENCY,
    rateLimitConfig: {
      attachmentMutation: app.rateLimitConfig.attachmentMutation,
    },
  });

  // When `loggerInstance` is supplied, Fastify types the instance with the
  // concrete pino `Logger`; TS cannot prove it satisfies the default
  // FastifyBaseLogger-typed `FastifyInstance` contract, but at runtime the
  // pino logger IS a superset of that contract — hence the unknown cast.
  return app as unknown as FastifyInstance;
}
