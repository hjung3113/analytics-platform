import { viewerOf } from '../log-knowledge/index.js';
// The validation request write actions (#1445 d, design §5, ADR-0117 decisions 2, 8, 9): register and cancel a request
// (`lifecycle.round.manage`, human session or token), plus the two admin settings of the queue: `queueSettingsUpdate`
// (run window, lease, immediate limit, excerpt retention), `excerptDelete` (erase excerpt bodies of a Round or attempt) and `excerptAccessSet` (who may read the excerpts of a source
// owner, the right `lifecycle.excerpt.read`). Every write is one transaction: row change + `core.audit_log` row.
// Audit detail is body-free (packages/feature-shared/src/audit/log-lifecycle.ts).

import { createHash } from 'node:crypto';

import type { Tx } from '../../db/tx.js';
import { createAuditService } from '../core/audit/audit-service.js';
import {
  type ActionHandlerResult,
  type FieldError,
  type MenuActionDeclaration,
  MenuActionInvalidError,
} from '../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import { type PlatformActor, holdsPlatformPermission } from '../platform-port/permissions.js';
import { DEFAULT_MAX_ATTEMPTS, parseQueueInput, QUEUE_INPUT_KEYS, type QueueOp, validateQueueInput } from './domain/queue-input.js';
import { parseRunWindow } from './domain/run-window.js';
import { LOG_VALIDATION_REQUESTS_MENU_ID } from './menu.js';
import { LIFECYCLE_ROUND_MENU_PERMISSION, LIFECYCLE_ROUND_PERMISSION } from './round-actions.js';
import {
  attemptOwner,
  cancelRequest,
  countActiveImmediate,
  EXCERPT_ERASE_BATCH,
  eraseExcerpts,
  getQueueSettings,
  getRound,
  insertRequest,
  lockImmediateQuota,
  lockQueueSettings,
  lockRequest,
  putQueueSettings,
  setExcerptReader,
} from './repositories/queue-write.js';
import { actorInWorkspace } from './repositories/lifecycle-write.js';

const INVALIDATES = ['logLifecycle.requests', 'logLifecycle.requestDetail'] as const;
const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);
/** Queue-local field code of the per-user immediate limit (ADR-0117 decision 8). */
export const IMMEDIATE_LIMIT_CODE = 'queue.immediate_limit';

export interface RequestActionDeps {
  checkService: CheckService;
}

/** sha256 of the canonical request identity: which round (and so which samples) with which engine profile. */
export function requestDigest(roundId: string, sampleManifestDigest: string, engineProfileRef: string | null): string {
  return createHash('sha256').update(JSON.stringify({ roundId, sampleManifestDigest, engineProfileRef }), 'utf8').digest('hex');
}

export function requestActions(deps: RequestActionDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const authorizeManage = async (actor: PlatformActor, tx: Tx) =>
    applyAdminModuleBypass(
      actor.role_level,
      LIFECYCLE_ROUND_PERMISSION,
      await deps.checkService.checkCapability(actor, LIFECYCLE_ROUND_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;
  // Admin-only settings: the same `console:access` judgment (workspace.admin) the console actions use.
  const authorizeAdmin = (actor: PlatformActor, tx: Tx) => holdsPlatformPermission(deps.checkService, actor, 'console:access', { tx });

  const spec = (op: QueueOp, concurrency: 'none' | 'version', admin: boolean) => ({
    id: `logLifecycle.${op}`,
    menuId: LOG_VALIDATION_REQUESTS_MENU_ID,
    inputKeys: QUEUE_INPUT_KEYS[op],
    permission: admin ? 'console:access' : LIFECYCLE_ROUND_MENU_PERMISSION,
    requiresScope: false,
    concurrency,
    invalidates: INVALIDATES,
  });

  const requestCreate: MenuActionDeclaration = {
    spec: spec('requestCreate', 'none', false),
    authorize: authorizeManage,
    validate: (input) => validateQueueInput('requestCreate', input),
    async handle(tx, actor, input, ctx): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const parsed = parseQueueInput('requestCreate', input);
      if (!parsed.ok) throw new Error('action requestCreate: validate passed but parse failed');
      const v = parsed.value;
      const round = await getRound(tx, ws, v.roundId, viewerOf(actor));
      if (!round) throw invalid({ path: ['roundId'], code: 'not_found' });
      if (round.status !== 'open') throw invalid({ path: ['roundId'], code: 'round_closed' });
      const immediate = v.immediate === true;
      if (immediate) {
        // The per-user count and the insert that follows it are one critical section (advisory lock per workspace + user).
        await lockImmediateQuota(tx, ws, actor.actor_id);
        const settings = await getQueueSettings(tx, ws);
        if ((await countActiveImmediate(tx, ws, actor.actor_id)) >= settings.immediateLimit) {
          throw invalid({ path: ['immediate'], code: IMMEDIATE_LIMIT_CODE });
        }
      }
      const engineProfileRef = v.engineProfileRef === undefined || v.engineProfileRef === null || v.engineProfileRef.trim() === '' ? null : v.engineProfileRef.trim();
      const maxAttempts = v.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
      const row = await insertRequest(tx, {
        workspaceId: ws,
        roundId: round.id,
        priority: v.priority,
        immediate,
        requestDigest: requestDigest(round.id, round.sampleManifestDigest, engineProfileRef),
        engineProfileRef,
        requestedByActorId: actor.actor_id,
        idempotencyKey: ctx.correlationId,
        maxAttempts,
      });
      await audit.record(tx, {
        workspace_id: ws,
        actor_id: actor.actor_id,
        event_type: 'lifecycle.request.created',
        subject_type: 'execution_request',
        subject_id: row.id,
        summary: 'validation request registered',
        detail: { roundId: round.id, priority: row.priority, immediate, maxAttempts },
      });
      return { data: { requestId: row.id, version: String(row.rowVersion) }, version: null };
    },
  };

  const requestCancel: MenuActionDeclaration = {
    spec: spec('requestCancel', 'version', false),
    authorize: authorizeManage,
    validate: (input) => validateQueueInput('requestCancel', input),
    async currentVersion(tx, actor, input) {
      const row = await lockRequest(tx, actor.workspace_id, input.id as string, viewerOf(actor));
      // A suite subject's request belongs to its suite run, not to a Round: this action does not see it (cancelling a suite run is backlog).
      return row && row.roundId !== null ? String(row.rowVersion) : null;
    },
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const parsed = parseQueueInput('requestCancel', input);
      if (!parsed.ok) throw new Error('action requestCancel: validate passed but parse failed');
      const row = await lockRequest(tx, ws, parsed.value.id, viewerOf(actor));
      if (!row || row.roundId === null) throw new Error('action requestCancel: currentVersion judged not_found first');
      // Terminal states never move again; a finished request is cancelled by a new request, not by this action.
      if (row.state !== 'queued' && row.state !== 'claimed') throw invalid({ path: ['id'], code: 'illegal_transition' });
      const version = await cancelRequest(tx, ws, row.id, parsed.value.reason);
      await audit.record(tx, {
        workspace_id: ws,
        actor_id: actor.actor_id,
        event_type: 'lifecycle.request.cancelled',
        subject_type: 'execution_request',
        subject_id: row.id,
        summary: 'validation request cancelled',
        detail: { roundId: row.roundId, from: row.state },
      });
      return { data: { version: String(version) }, version: String(version) };
    },
  };

  const queueSettingsUpdate: MenuActionDeclaration = {
    spec: spec('queueSettingsUpdate', 'none', true),
    authorize: authorizeAdmin,
    validate: (input) => validateQueueInput('queueSettingsUpdate', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const parsed = parseQueueInput('queueSettingsUpdate', input);
      if (!parsed.ok) throw new Error('action queueSettingsUpdate: validate passed but parse failed');
      const v = parsed.value;
      const current = await lockQueueSettings(tx, ws);
      const next = {
        runWindow: v.runWindow === undefined ? current.runWindow : (parseRunWindow(v.runWindow) ?? current.runWindow),
        leaseSeconds: v.leaseSeconds ?? current.leaseSeconds,
        immediateLimit: v.immediateLimit ?? current.immediateLimit,
        excerptRetentionDays: v.excerptRetentionDays ?? current.excerptRetentionDays,
      };
      const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(current[k]));
      if (changed.length === 0) return { data: { changed: [] }, version: null };
      await putQueueSettings(tx, ws, actor.actor_id, next);
      await audit.record(tx, {
        workspace_id: ws,
        actor_id: actor.actor_id,
        event_type: 'lifecycle.queue_settings.updated',
        subject_type: 'queue_settings',
        subject_id: ws,
        summary: 'validation queue settings updated',
        detail: { changed },
      });
      return { data: { changed }, version: null };
    },
  };

  const excerptAccessSet: MenuActionDeclaration = {
    spec: spec('excerptAccessSet', 'none', true),
    authorize: authorizeAdmin,
    validate: (input) => validateQueueInput('excerptAccessSet', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const parsed = parseQueueInput('excerptAccessSet', input);
      if (!parsed.ok) throw new Error('action excerptAccessSet: validate passed but parse failed');
      const v = parsed.value;
      if (!(await actorInWorkspace(tx, ws, v.actorId))) throw invalid({ path: ['actorId'], code: 'not_found' });
      await setExcerptReader(tx, { workspaceId: ws, sourceOwner: v.sourceOwner, actorId: v.actorId, grantedBy: actor.actor_id, allowed: v.allowed });
      await audit.record(tx, {
        workspace_id: ws,
        actor_id: actor.actor_id,
        event_type: 'lifecycle.excerpt_access.set',
        subject_type: 'excerpt_reader',
        subject_id: v.actorId,
        summary: 'excerpt read access changed',
        detail: { actorId: v.actorId, allowed: v.allowed },
      });
      return { data: { allowed: v.allowed }, version: null };
    },
  };

  // Administrator's immediate erasure (ADR-0117 decision 7): bodies only, never rule results or evidence; the reason is stored
  // on the erased rows, the audit row carries scope and count. Session-only like the other admin settings (`console:access`).
  const excerptDelete: MenuActionDeclaration = {
    spec: spec('excerptDelete', 'none', true),
    authorize: authorizeAdmin,
    validate: (input) => validateQueueInput('excerptDelete', input),
    async handle(tx, actor, input): Promise<ActionHandlerResult> {
      const ws = actor.workspace_id;
      const parsed = parseQueueInput('excerptDelete', input);
      if (!parsed.ok) throw new Error('action excerptDelete: validate passed but parse failed');
      const v = parsed.value;
      let subject: { type: 'validation_round' | 'execution_request'; id: string };
      let count = 0;
      if (v.scope === 'round') {
        const round = await getRound(tx, ws, v.id, viewerOf(actor));
        if (!round) throw invalid({ path: ['id'], code: 'not_found' });
        subject = { type: 'validation_round', id: round.id };
        for (;;) {
          const n = await eraseExcerpts(tx, ws, { roundId: round.id }, v.reason);
          count += n;
          if (n < EXCERPT_ERASE_BATCH) break;
        }
      } else {
        const owner = await attemptOwner(tx, ws, v.id, viewerOf(actor));
        if (!owner) throw invalid({ path: ['id'], code: 'not_found' });
        subject = { type: 'execution_request', id: owner.requestId };
        for (;;) {
          const n = await eraseExcerpts(tx, ws, { attemptId: v.id }, v.reason);
          count += n;
          if (n < EXCERPT_ERASE_BATCH) break;
        }
      }
      await audit.record(tx, {
        workspace_id: ws,
        actor_id: actor.actor_id,
        event_type: 'lifecycle.excerpt.deleted',
        subject_type: subject.type,
        subject_id: subject.id,
        summary: 'log excerpts deleted',
        detail: { scope: v.scope, count, ...(v.scope === 'attempt' ? { attemptId: v.id } : {}) },
      });
      return { data: { count }, version: null };
    },
  };

  return [requestCreate, requestCancel, queueSettingsUpdate, excerptAccessSet, excerptDelete];
}
