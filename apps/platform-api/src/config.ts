import { z } from 'zod';

import { validateAttachmentOrigin } from './config-attachment-origin.js';
import { validateOidcConfig } from './config-oidc.js';

const optionalEnvString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().optional(),
);
const optionalPositiveInt = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.coerce.number().int().positive().optional(),
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    HOST: z.string().default('0.0.0.0'),
    // Connection used by the running application; should be the platform_app role
    // (INSERT/SELECT/UPDATE/DELETE on non-audit tables, INSERT/SELECT only on
    // core.audit_log per FO ADR-0008).
    DATABASE_URL: z.string().url().optional(),
    // Connection used exclusively by drizzle-kit migrations and operator scripts;
    // should be the platform_migrate role (ALL on every table). Kept separate so the
    // running app cannot accidentally mutate core.audit_log rows.
    DATABASE_URL_MIGRATE: z.string().url().optional(),
    AUTH_PROVIDER: z.enum(['mock', 'oidc']).default('mock'),
    // OIDC env contract (issue #390, FO ADR-0006 amended 2026-09-22). Ignored
    // (not required, not validated) when AUTH_PROVIDER=mock; required and
    // rule-checked in superRefine when AUTH_PROVIDER=oidc. Validation
    // messages never echo values (the secret, URLs that may carry
    // credentials) — variable names and rule descriptions only.
    OIDC_ISSUER_URL: z.string().optional(),
    OIDC_CLIENT_ID: z.string().optional(),
    OIDC_CLIENT_SECRET: z.string().optional(),
    OIDC_REDIRECT_URI: z.string().optional(),
    OIDC_SCOPES: z.string().default('openid email profile'),
    WORKSPACE_ID: z.string().uuid().optional(),
    WORKSPACE_NAME: z.string().default('Platform'),
    // #1289 node i: committed apps/platform-web/platform-systems.json (business systems that declare feedbackTracking).
    // Unset or missing: only the 「플랫폼」 system is ensured at startup; an invalid file registers nothing from it.
    PLATFORM_SYSTEMS_FILE: optionalEnvString,
    // `personas` layers black-box test actors and grants over the core seed.
    // `bootstrap` creates only the Workspace and the system Actor (operator data).
    SEED_MODE: z.enum(['core', 'personas', 'scale', 'bootstrap']).default('core'),
    // CSP `img-src`/`connect-src` origin for public attachment URLs (#402).
    // Accepted: the quoted literal `'self'` (default, everything same-origin) or
    // a bare origin `https://host[:port]`; outside production also
    // `http://localhost[:port]` / `http://127.0.0.1[:port]`. Anything else —
    // paths, query, credentials, wildcards, whitespace/separators, other
    // schemes — fails config load via validateAttachmentOrigin.
    PUBLIC_ATTACHMENT_ORIGIN: z.string().default("'self'"),
    // Review HTTP-H-2: `trustProxy: true` is unconditional and lets clients
    // spoof `X-Forwarded-For` to reset anon rate-limit buckets and audit IPs
    // when no ingress is in front. Hop count restricts Fastify to trusting
    // only the rightmost N entries of the X-Forwarded-For chain. Set to the
    // number of trusted proxies between the client and Fastify (1 for a
    // single ingress; 0 disables trust, identical to `false`). Defaults to
    // 0 outside production so dev/test/CI cannot spoof.
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    NOTIFICATION_EMAIL_CHANNEL: z.enum(['mock', 'smtp']).default('mock'),
    SMTP_HOST: optionalEnvString,
    SMTP_PORT: optionalPositiveInt,
    SMTP_USERNAME: optionalEnvString,
    SMTP_PASSWORD: optionalEnvString,
    SMTP_FROM: optionalEnvString,
    VOC_SIMILARITY_PREVIEW: z.enum(['enabled', 'disabled']).default('enabled'),
    EMBEDDING_PROVIDER: z.enum(['voyage', 'fake', 'disabled']).default('disabled'),
    EMBEDDING_API_KEY: optionalEnvString,
    EMBEDDING_VERSION: z.coerce.number().int().positive().default(1),
    // #1266 b3: runtime DB time budgets and HTTP request timeout. The DB
    // budgets apply to the runtime app pool only (createDb opts); migrate and
    // seed pools keep the server defaults. pg-boss keeps its own settings.
    DB_POOL_MAX: z.coerce.number().int().positive().default(10),
    DB_POOL_ACQUIRE_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    DB_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    HTTP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    // ADR-0116 decision 3a: days without use (or since issue) after which a token list row carries `unusedWarning`.
    API_TOKEN_UNUSED_WARNING_DAYS: z.coerce.number().int().positive().optional(),
    // #1266 b10: operator maintenance only. true starts pg-boss (readiness and enqueueing still work) without the
    // supervisor or cron scheduler and registers no job worker, so copied pending jobs are neither run nor stamped.
    // Used by restore verification; never set it on a serving stack.
    JOBS_DISABLED: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    ),
    // #1266 b4: per-process cap on concurrent POST /attachments (each buffers up to 25 MiB).
    ATTACHMENT_UPLOAD_CONCURRENCY: z.coerce.number().int().positive().default(4),
    // #1729 node b: menu declaration/forwarder/resolver path (ADR-0146/0147/0148).
    // All optional; bundle-aware setup requires upstream/identity settings only for
    // envelope destinations (ADR-0153). Grant-service URL absent =
    // no resolver (requiresScope endpoints stay refused). Time budget ADR-0095 §2:
    // adapter (HTTP_REQUEST_TIMEOUT_MS, default 30 s) > upstream call (27 s) > judgment.
    MENU_DECLARATIONS_FILE: optionalEnvString,
    // #1900 (ADR-0156): the menu declaration snapshot the app assembly build wrote; required with the bundle, no switch.
    MENU_DECLARATIONS_SNAPSHOT_FILE: optionalEnvString,
    MENU_UPSTREAM_BASE_URL: optionalEnvString,
    MENU_IDENTITY_KEY_FILE: optionalEnvString,
    MENU_IDENTITY_KEY_ID: optionalEnvString,
    MENU_SCOPE_GRANT_SERVICE_URL: optionalEnvString,
    MENU_RESOLVER_TIMEOUT_MS: z.coerce.number().int().positive().default(3_000),
    MENU_UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(27_000),
  })
  .superRefine((config, context) => {
    const originIssue = validateAttachmentOrigin(config.PUBLIC_ATTACHMENT_ORIGIN, config.NODE_ENV);
    if (originIssue) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PUBLIC_ATTACHMENT_ORIGIN'],
        message: originIssue,
      });
    }
    for (const oidcIssue of validateOidcConfig({
      authProvider: config.AUTH_PROVIDER,
      nodeEnv: config.NODE_ENV,
      issuerUrl: config.OIDC_ISSUER_URL,
      clientId: config.OIDC_CLIENT_ID,
      clientSecret: config.OIDC_CLIENT_SECRET,
      redirectUri: config.OIDC_REDIRECT_URI,
      scopes: config.OIDC_SCOPES,
    }) ?? []) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [oidcIssue.path],
        message: oidcIssue.message,
      });
    }
    if (config.EMBEDDING_PROVIDER === 'voyage' && !config.EMBEDDING_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EMBEDDING_API_KEY'],
        message: 'EMBEDDING_API_KEY is required when EMBEDDING_PROVIDER=voyage',
      });
    }
    if (config.NOTIFICATION_EMAIL_CHANNEL === 'smtp') {
      for (const variable of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM'] as const) {
        if (config[variable] === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [variable],
            message: `${variable} is required when NOTIFICATION_EMAIL_CHANNEL=smtp`,
          });
        }
      }
      if (Boolean(config.SMTP_USERNAME) !== Boolean(config.SMTP_PASSWORD)) {
        const missingCredential = config.SMTP_USERNAME ? 'SMTP_PASSWORD' : 'SMTP_USERNAME';
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [missingCredential],
          message:
            'SMTP_USERNAME and SMTP_PASSWORD must be set together when NOTIFICATION_EMAIL_CHANNEL=smtp',
        });
      }
    }
    for (const [variable, value] of [
      ['MENU_UPSTREAM_BASE_URL', config.MENU_UPSTREAM_BASE_URL],
      ['MENU_SCOPE_GRANT_SERVICE_URL', config.MENU_SCOPE_GRANT_SERVICE_URL],
    ] as const) {
      if (value === undefined) continue;
      let url: URL | null = null;
      try {
        url = new URL(value);
      } catch {
        url = null;
      }
      if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [variable],
          message: `${variable} must be an absolute http(s) URL`,
        });
      } else if (url.username || url.password || url.search || url.hash) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [variable],
          message: `${variable} must be an absolute http(s) URL without credentials, query, or fragment`,
        });
      }
    }
    if (config.MENU_DECLARATIONS_FILE !== undefined && config.MENU_DECLARATIONS_SNAPSHOT_FILE === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MENU_DECLARATIONS_SNAPSHOT_FILE'],
        message: 'MENU_DECLARATIONS_SNAPSHOT_FILE is required when MENU_DECLARATIONS_FILE is set',
      });
    }
    if (config.MENU_DECLARATIONS_FILE !== undefined && config.MENU_UPSTREAM_TIMEOUT_MS >= config.HTTP_REQUEST_TIMEOUT_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MENU_UPSTREAM_TIMEOUT_MS'],
        message: 'MENU_UPSTREAM_TIMEOUT_MS must be lower than HTTP_REQUEST_TIMEOUT_MS',
      });
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(): AppConfig {
  return envSchema.parse(process.env);
}
