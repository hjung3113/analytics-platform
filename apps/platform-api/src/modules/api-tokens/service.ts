// API token application service (ADR-0116, #1442): issue, list, revoke, authenticate.
// The token value exists only in the issue response; storage, audit, logs, errors and lists carry the prefix at most.

import { type Capability, isCapability, isSessionOnlyCapability } from '@ap/feature-shared';
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { actors, apiTokens } from '../../db/schema/core.js';
import { HttpError } from '../../lib/errors.js';
import { type ActorRecord, summarizeIp } from '../auth/session-service.js';
import type { AuditService } from '../core/audit/index.js';
import { bearerValue, generateToken, hashToken, hashesEqual, parseTokenPrefix } from './token-format.js';

export const LAST_USED_STAMP_INTERVAL_MS = 60_000;

export type TokenKind = 'personal' | 'service';

export interface TokenActor {
  actor_id: string;
  workspace_id: string;
  role_level: string;
}

export interface TokenRow {
  id: string;
  kind: TokenKind;
  name: string;
  prefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: string;
  actorId: string;
  unusedWarning: boolean;
}

export type TokenAuthResult =
  | {
      ok: true;
      tokenId: string;
      actorId: string;
      workspaceId: string;
      roleLevel: string;
      actor: ActorRecord;
      scopes: string[];
      kind: TokenKind;
    }
  | { ok: false; prefix: string | null; reason: string; tokenId: string | null; actorId: string | null; workspaceId: string | null };

export interface ApiTokenServiceDeps {
  db: Db;
  auditService: AuditService;
  workspaceId: string;
  unusedWarningDays: number;
  now?: () => Date;
}

export type ApiTokenService = ReturnType<typeof createApiTokenService>;

const DAY_MS = 86_400_000;
export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PageOptions {
  limit?: number | undefined;
  cursor?: string | undefined;
}
export interface TokenPage {
  items: TokenRow[];
  nextCursor: string | null;
}

type Field = { path: Array<string | number>; code: string };
const invalid = (fields: Field[]): HttpError =>
  new HttpError('validation.failed', 'invalid token request', { fields });

export function createApiTokenService(deps: ApiTokenServiceDeps) {
  const now = deps.now ?? (() => new Date());

  function toRow(r: typeof apiTokens.$inferSelect): TokenRow {
    const reference = (r.lastUsedAt ?? r.createdAt).getTime();
    return {
      id: r.id,
      kind: r.kind as TokenKind,
      name: r.name,
      prefix: r.prefix,
      scopes: r.scopes,
      expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
      lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
      lastUsedIp: r.lastUsedIp,
      revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
      createdBy: r.createdBy,
      actorId: r.actorId,
      unusedWarning: r.revokedAt === null && now().getTime() - reference >= deps.unusedWarningDays * DAY_MS,
    };
  }

  function validateScopes(scopes: readonly string[]): Field[] {
    const fields: Field[] = [];
    scopes.forEach((scope, i) => {
      if (!isCapability(scope)) fields.push({ path: ['scopes', i], code: 'unknown_capability' });
      else if (isSessionOnlyCapability(scope as Capability)) fields.push({ path: ['scopes', i], code: 'session_only' });
    });
    return fields;
  }

  async function issue(
    issuer: TokenActor,
    input: { kind: TokenKind; name: string; scopes: string[]; expiresAt: Date | null; actorId?: string },
  ): Promise<{ token: string; row: TokenRow }> {
    const fields = validateScopes(input.scopes);
    if (input.expiresAt && input.expiresAt.getTime() <= now().getTime()) {
      fields.push({ path: ['expiresAt'], code: 'in_the_past' });
    }
    let ownerActorId = issuer.actor_id;
    if (input.kind === 'service') {
      if (issuer.role_level !== 'admin') {
        throw new HttpError('permission.denied', 'service tokens are issued by an admin');
      }
      const target = input.actorId
        ? await deps.db
            .select({ id: actors.id, actorType: actors.actorType })
            .from(actors)
            .where(and(eq(actors.id, input.actorId), eq(actors.workspaceId, issuer.workspace_id)))
            .limit(1)
        : [];
      if (target[0]?.actorType !== 'system') fields.push({ path: ['actorId'], code: 'not_system_actor' });
      else ownerActorId = target[0].id;
    }
    if (fields.length > 0) throw invalid(fields);

    const generated = generateToken();
    const row = await deps.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(apiTokens)
        .values({
          workspaceId: issuer.workspace_id,
          actorId: ownerActorId,
          kind: input.kind,
          name: input.name,
          prefix: generated.prefix,
          secretHash: generated.hash,
          scopes: input.scopes,
          expiresAt: input.expiresAt,
          createdBy: issuer.actor_id,
        })
        .returning();
      const created = inserted[0];
      if (!created) throw new HttpError('internal.unexpected', 'token insert returned no row');
      await deps.auditService.record(tx, {
        workspace_id: issuer.workspace_id,
        actor_id: issuer.actor_id,
        event_type: 'api_token.issue',
        subject_type: 'api_token',
        subject_id: created.id,
        summary: `${input.kind} API token issued`,
        detail: {
          token_id: created.id,
          kind: input.kind,
          prefix: created.prefix,
          scopes: input.scopes,
          expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
          owner_actor_id: ownerActorId,
        },
      });
      return created;
    });
    return { token: generated.value, row: toRow(row) };
  }

  /**
   * Opaque keyset cursor over the list order `created_at desc, id desc`: base64url of `<created_at>,<id>`. The
   * timestamp travels as Postgres' own microsecond text (a JS Date would truncate it and skip rows of one millisecond).
   */
  const CREATED_AT_TEXT = sql<string>`to_char(${apiTokens.createdAt} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
  const TS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

  // Shape alone lets `2026-99-99T99:99:99…` reach the `::timestamptz` cast and fail there as a 500; a real instant
  // round-trips through Date with the same calendar fields (milliseconds; the cursor keeps its microseconds).
  function isRealInstant(text: string): boolean {
    const ms = Date.parse(text);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === text.slice(0, 19);
  }

  function decodeCursor(cursor: string | undefined): { createdAt: string; id: string } | null {
    if (cursor === undefined) return null;
    const [createdAt, id, ...rest] = Buffer.from(cursor, 'base64url').toString('utf8').split(',');
    if (rest.length > 0 || !createdAt || !id || !TS_PATTERN.test(createdAt) || !isRealInstant(createdAt) || !UUID_PATTERN.test(id)) {
      throw new HttpError('validation.failed', 'invalid cursor', { fields: [{ path: ['cursor'], code: 'invalid' }] });
    }
    return { createdAt, id };
  }

  async function page(
    where: ReturnType<typeof and>,
    opts: PageOptions,
  ): Promise<TokenPage> {
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const after = decodeCursor(opts.cursor);
    const afterTs = after ? sql`${after.createdAt}::timestamptz` : null;
    const rows = await deps.db
      .select({ row: apiTokens, cursorTs: CREATED_AT_TEXT })
      .from(apiTokens)
      .where(
        and(
          where,
          after && afterTs
            ? or(
                sql`${apiTokens.createdAt} < ${afterTs}`,
                and(sql`${apiTokens.createdAt} = ${afterTs}`, lt(apiTokens.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(apiTokens.createdAt), desc(apiTokens.id))
      .limit(limit + 1);
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];
    return {
      items: items.map((r) => toRow(r.row)),
      nextCursor:
        rows.length > limit && last ? Buffer.from(`${last.cursorTs},${last.row.id}`).toString('base64url') : null,
    };
  }

  async function listPersonal(actor: TokenActor, opts: PageOptions = {}): Promise<TokenPage> {
    return page(
      and(
        eq(apiTokens.workspaceId, actor.workspace_id),
        eq(apiTokens.kind, 'personal'),
        eq(apiTokens.createdBy, actor.actor_id),
      ),
      opts,
    );
  }

  async function listWorkspace(actor: TokenActor, filter: PageOptions & { noExpiry?: boolean }): Promise<TokenPage> {
    if (actor.role_level !== 'admin') throw new HttpError('permission.denied', 'admin only');
    return page(
      and(eq(apiTokens.workspaceId, actor.workspace_id), filter.noExpiry ? isNull(apiTokens.expiresAt) : undefined),
      filter,
    );
  }

  /** `scope: 'own'` = the caller's own personal token; `'workspace'` = any token of the workspace (admin). */
  async function revoke(actor: TokenActor, tokenId: string, scope: 'own' | 'workspace'): Promise<TokenRow> {
    if (scope === 'workspace' && actor.role_level !== 'admin') {
      throw new HttpError('permission.denied', 'admin only');
    }
    return deps.db.transaction(async (tx) => {
      const found = await tx
        .select()
        .from(apiTokens)
        .where(
          and(
            eq(apiTokens.id, tokenId),
            eq(apiTokens.workspaceId, actor.workspace_id),
            scope === 'own'
              ? and(eq(apiTokens.kind, 'personal'), eq(apiTokens.createdBy, actor.actor_id))
              : undefined,
          ),
        )
        .for('update')
        .limit(1);
      const current = found[0];
      if (!current) throw new HttpError('not_found.record', 'token not found');
      if (current.revokedAt) return toRow(current);
      const updated = await tx
        .update(apiTokens)
        .set({ revokedAt: now(), revokedBy: actor.actor_id })
        .where(eq(apiTokens.id, current.id))
        .returning();
      await deps.auditService.record(tx, {
        workspace_id: actor.workspace_id,
        actor_id: actor.actor_id,
        event_type: 'api_token.revoke',
        subject_type: 'api_token',
        subject_id: current.id,
        summary: `${current.kind} API token revoked`,
        detail: { token_id: current.id, kind: current.kind as TokenKind, prefix: current.prefix },
      });
      return toRow(updated[0] ?? current);
    });
  }

  /**
   * Authenticates a presented Bearer value. Every failure is one outcome to the caller (`auth.token_invalid`);
   * `reason` is for the audit row only. Personal tokens must still be owned by their issuer and an actor that is
   * not a system actor; service tokens by a system actor. The owner's role is read fresh on every call.
   */
  async function authenticate(value: string, ip: string | undefined): Promise<TokenAuthResult> {
    const prefix = parseTokenPrefix(value);
    const fail = (
      reason: string,
      row?: { id: string; actorId: string; workspaceId: string },
    ): TokenAuthResult => ({
      ok: false,
      prefix,
      reason,
      tokenId: row?.id ?? null,
      actorId: row?.actorId ?? null,
      workspaceId: row?.workspaceId ?? null,
    });
    if (prefix === null) return fail('malformed');
    const hash = hashToken(value);
    const found = await deps.db
      .select({
        token: apiTokens,
        actor: actors,
      })
      .from(apiTokens)
      .innerJoin(actors, eq(actors.id, apiTokens.actorId))
      .where(eq(apiTokens.secretHash, hash))
      .limit(1);
    const hit = found[0];
    if (!hit || !hashesEqual(hit.token.secretHash, hash)) return fail('unknown');
    const t = hit.token;
    const ref = { id: t.id, actorId: t.actorId, workspaceId: t.workspaceId };
    if (t.workspaceId !== deps.workspaceId || hit.actor.workspaceId !== t.workspaceId) return fail('workspace', ref);
    if (t.revokedAt) return fail('revoked', ref);
    if (t.expiresAt && t.expiresAt.getTime() <= now().getTime()) return fail('expired', ref);
    if (t.kind === 'personal' && (t.createdBy !== t.actorId || hit.actor.actorType === 'system')) {
      return fail('owner_mismatch', ref);
    }
    if (t.kind === 'service' && hit.actor.actorType !== 'system') return fail('owner_mismatch', ref);

    // Throttled use stamp: at most once per interval per token (the conditional update is the throttle).
    const cutoff = new Date(now().getTime() - LAST_USED_STAMP_INTERVAL_MS);
    await deps.db
      .update(apiTokens)
      .set({ lastUsedAt: now(), lastUsedIp: summarizeIp(ip) })
      .where(
        and(eq(apiTokens.id, t.id), or(isNull(apiTokens.lastUsedAt), sql`${apiTokens.lastUsedAt} < ${cutoff}`)),
      );
    return {
      ok: true,
      tokenId: t.id,
      actorId: t.actorId,
      workspaceId: t.workspaceId,
      roleLevel: hit.actor.roleLevel,
      actor: {
        id: hit.actor.id,
        workspaceId: hit.actor.workspaceId,
        externalId: hit.actor.externalId,
        email: hit.actor.email,
        displayName: hit.actor.displayName,
        roleLevel: hit.actor.roleLevel,
        actorType: hit.actor.actorType,
      },
      scopes: t.scopes,
      kind: t.kind as TokenKind,
    };
  }

  /**
   * Whether a token that authenticated earlier may still be used: not revoked, not expired, same workspace. A long call (a streamed
   * export, #1472) asks this at its chunk boundaries so a revocation takes effect before the next chunk; the lookup is by id, no secret.
   */
  async function isActive(tokenId: string): Promise<boolean> {
    const found = await deps.db
      .select({ revokedAt: apiTokens.revokedAt, expiresAt: apiTokens.expiresAt, workspaceId: apiTokens.workspaceId })
      .from(apiTokens)
      .where(eq(apiTokens.id, tokenId))
      .limit(1);
    const t = found[0];
    if (!t || t.workspaceId !== deps.workspaceId || t.revokedAt) return false;
    return !t.expiresAt || t.expiresAt.getTime() > now().getTime();
  }

  /** Audit one rejected attempt in its own transaction. The secret is never written; the prefix only when parseable. */
  async function recordAuthFailure(result: Extract<TokenAuthResult, { ok: false }>): Promise<void> {
    let workspaceId = result.workspaceId ?? deps.workspaceId;
    let actorId = result.actorId;
    if (!actorId) {
      const sys = await deps.db
        .select({ id: actors.id })
        .from(actors)
        .where(and(eq(actors.workspaceId, workspaceId), eq(actors.externalId, 'system')))
        .limit(1);
      actorId = sys[0]?.id ?? null;
    }
    if (!actorId) return;
    workspaceId = result.workspaceId ?? workspaceId;
    await deps.db.transaction((tx) =>
      deps.auditService.record(tx, {
        workspace_id: workspaceId,
        actor_id: actorId,
        event_type: 'api_token.auth_failed',
        subject_type: 'api_token',
        subject_id: result.tokenId ?? workspaceId,
        summary: 'API token authentication failed',
        detail: { prefix: result.prefix, reason: result.reason },
      }),
    );
  }

  async function recordSessionRequiredDenied(input: {
    workspaceId: string;
    actorId: string;
    tokenId: string;
    method: string;
    route: string;
    capability: string | null;
  }): Promise<void> {
    await deps.db.transaction((tx) =>
      deps.auditService.record(tx, {
        workspace_id: input.workspaceId,
        actor_id: input.actorId,
        event_type: 'api_token.session_required_denied',
        subject_type: 'api_token',
        subject_id: input.tokenId,
        summary: 'API token call refused: login session required',
        detail: {
          token_id: input.tokenId,
          method: input.method,
          route: input.route,
          capability: input.capability,
        },
      }),
    );
  }

  return { issue, listPersonal, listWorkspace, revoke, authenticate, isActive, recordAuthFailure, recordSessionRequiredDenied, bearerValue };
}
