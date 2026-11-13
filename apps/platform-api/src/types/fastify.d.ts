// Fastify request augmentation. `req.session` is populated by the
// `requireSession` middleware; `app.db` is the runtime Drizzle handle
// (platform_app role) wired in `buildServer`.

import 'fastify';
import type { PgBoss } from 'pg-boss';
import type { Db } from '../db/client.js';
import type { RoleLevel } from '../modules/auth/session-service.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * ADR-0116 deny-by-default: only a route that sets this may be reached with a Bearer API token, and only if
     * every authorization decision on it goes through the capability check. Absent = cookie session only.
     */
    tokenCallable?: boolean;
    /** A token call to this route is a mutation: it uses the mutation-sized per-token rate-limit bucket. */
    tokenMutation?: boolean;
    /**
     * #1972: the route is reachable without authentication on purpose (health probes, the login flow). State the
     * reason beside the declaration. A route needs this, `authInHandler` or a marked guard hook, or startup fails.
     */
    public?: boolean;
    /** #1972: the handler authenticates the caller itself (no marked guard hook can run first without a behaviour change). */
    authInHandler?: boolean;
  }
  interface FastifyRequest {
    session?: {
      session_id: string;
      actor_id: string;
      workspace_id: string;
      role_level: RoleLevel;
    };
  }
  interface FastifyInstance {
    db: Db;
    /**
     * Present when the runtime entrypoint passed a pg-boss handle to
     * buildServer (FO ADR-0009). Slice 1 has no in-request consumers, so it
     * stays optional; future modules typing this field will tighten the
     * contract as they need it.
     */
    boss?: PgBoss;
    rateLimitConfig: {
      similarityPreview: Record<string, unknown>;
      mutation: Record<string, unknown>;
      sensitive: Record<string, unknown>;
      read: Record<string, unknown>;
      notificationState: Record<string, unknown>;
      triage: Record<string, unknown>;
      reporterEdit: Record<string, unknown>;
      attachmentMutation: Record<string, unknown>;
    };
  }
}
