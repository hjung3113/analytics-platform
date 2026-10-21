// Platform port audit reads (ADR-0069 decisions 6, 7, 9): `auditTrail` and `entityAudit`.
// Judges a request and returns an outcome; the route wraps it in the envelope. Reads
// `core.audit_log` only through the allowlisted projection (core/audit), never directly.

import type { Db } from '../../db/client.js';
import { type PlatformAuditRow, platformAuditEvents } from '../core/audit/index.js';
import type { EntityLinkProviderRegistry } from '../entity-links/provider-types.js';
import type { CheckService } from '../permissions/check-service.js';
import { AUDIT_ACTION_BY_EVENT_TYPE, type PlatformAuditAction } from './audit-actions.js';
import {
  ENTITY_AUDIT_READABLE_TYPES,
  isUuid,
  parseAuditQuery,
  parseEntityRef,
} from './audit-query.js';
import type { Outcome } from './envelope.js';
import { type PlatformActor, holdsPlatformPermission } from './permissions.js';

/** The contract's `AuditEvent` minus `changes`/`reason`, which this port never releases. */
export interface PlatformAuditEvent {
  id: string;
  at: string;
  actor: string;
  action: PlatformAuditAction;
  source: 'user' | 'system';
  target: { type: string; id: string; scopeId: null };
}

export interface AuditJudgement<T> {
  outcome: Outcome;
  data?: T;
  message?: string;
}

export interface PlatformAuditServiceDeps {
  db: Db;
  checkService: CheckService;
  providers: EntityLinkProviderRegistry;
}

export function toAuditEvent(row: PlatformAuditRow): PlatformAuditEvent {
  return {
    id: row.id,
    at: row.at,
    actor: row.actor,
    action: AUDIT_ACTION_BY_EVENT_TYPE[row.eventType as keyof typeof AUDIT_ACTION_BY_EVENT_TYPE],
    source: row.actorType === 'system' ? 'system' : 'user',
    target: { type: row.subjectType, id: row.subjectId, scopeId: null },
  };
}

const ROLE_LEVELS = ['admin', 'developer', 'user'] as const;

export function createPlatformAuditService(deps: PlatformAuditServiceDeps) {
  async function auditTrail(
    actor: PlatformActor,
    body: unknown,
  ): Promise<AuditJudgement<{ items: PlatformAuditEvent[]; total: number }>> {
    // Permission before validation, as the reference implementation does.
    if (!(await holdsPlatformPermission(deps.checkService, actor, 'console:access'))) {
      return { outcome: 'forbidden', message: 'No permission console:access' };
    }
    const query = parseAuditQuery(body);
    if (!query) return { outcome: 'error', message: 'Invalid audit filter' };
    // An id that is not a uuid matches nothing; it is not a format error.
    if (query.targetId !== undefined && !isUuid(query.targetId)) return { outcome: 'empty' };
    const { rows, total } = await platformAuditEvents(deps.db, {
      workspaceId: actor.workspace_id,
      ...(query.type !== undefined ? { subjectType: query.type } : {}),
      ...(query.targetId !== undefined ? { subjectId: query.targetId } : {}),
      ...(query.actor !== undefined ? { actor: query.actor } : {}),
      ...(query.action !== undefined ? { action: query.action } : {}),
      ...(query.source !== undefined ? { source: query.source } : {}),
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      actionByEventType: AUDIT_ACTION_BY_EVENT_TYPE,
      sort: query.sort,
      limit: query.pageSize,
      offset: BigInt(query.page - 1) * BigInt(query.pageSize),
    });
    if (total === 0) return { outcome: 'empty' };
    return { outcome: 'ok', data: { items: rows.map(toAuditEvent), total } };
  }

  async function entityAudit(
    actor: PlatformActor,
    body: unknown,
  ): Promise<AuditJudgement<{ events: PlatformAuditEvent[] }>> {
    const ref = parseEntityRef(body);
    if (!ref) return { outcome: 'error', message: 'Invalid entity reference' };
    if (ref.scopeId !== null) return { outcome: 'error', message: 'Entity audit has no scope' };
    // The explicit list comes first: the registry also holds the opaque survey_response provider.
    if (!(ENTITY_AUDIT_READABLE_TYPES as readonly string[]).includes(ref.type)) {
      return { outcome: 'error', message: 'Unknown entity type' };
    }
    const type = ref.type as (typeof ENTITY_AUDIT_READABLE_TYPES)[number];
    // One answer for a bad id, a missing row and an unreadable row: existence is never revealed.
    const forbidden: AuditJudgement<never> = { outcome: 'forbidden', message: 'Not readable' };
    if (!isUuid(ref.id)) return forbidden;
    const provider = deps.providers[type];
    const subject = await provider.getPermissionSubject(deps.db, actor.workspace_id, ref.id);
    if (!subject) return forbidden;
    const roleLevel = ROLE_LEVELS.find((r) => r === actor.role_level) ?? 'user';
    const readable = await provider.canRead(
      { db: deps.db, checkService: deps.checkService },
      { actor_id: actor.actor_id, workspace_id: actor.workspace_id, role_level: roleLevel },
      subject,
    );
    if (!readable) return forbidden;
    const { rows } = await platformAuditEvents(deps.db, {
      workspaceId: actor.workspace_id,
      subjectType: type,
      subjectId: ref.id,
      actionByEventType: AUDIT_ACTION_BY_EVENT_TYPE,
      sort: { field: 'at', desc: true },
      limit: null,
      offset: 0n,
    });
    if (rows.length === 0) return { outcome: 'empty' };
    return { outcome: 'ok', data: { events: rows.map(toAuditEvent) } };
  }

  return { auditTrail, entityAudit };
}

export type PlatformAuditService = ReturnType<typeof createPlatformAuditService>;
