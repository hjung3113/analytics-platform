// The validation request reads (#1445 d, design §5) as menu-dispatch declarations: the request list, one request with its
// attempts, the rule results of an attempt and one excerpt body. Same read right and workspace rule as the lifecycle
// reads (`platform:view`, `requiresScope: false`, the workspace is the session actor's); an unknown or foreign id answers
// `ok` with `data: null`. Lists carry `hasExcerpt` only. `excerpt` is the one read with a write: it needs the right
// `lifecycle.excerpt.read` for the Round's source owner (a revoked right is refused from the same call), is refused to a
// token call, and writes an audit row per read that names the rule result and the evidence index, never the text.

import { currentAuthContext } from '../../lib/auth-context.js';
import { createAuditService } from '../core/audit/audit-service.js';
import type { EndpointResult, MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import type { LogLifecycleDeps } from './deps.js';
import {
  EXCERPT_PARAM_KEYS,
  REQUEST_DETAIL_PARAM_KEYS,
  REQUEST_PARAM_KEYS,
  RULE_RESULT_PARAM_KEYS,
  parseExcerptParams,
  parseRequestDetailParams,
  parseRequestListParams,
  parseRuleResultParams,
} from './domain/queue-params.js';
import { LOG_VALIDATION_REQUESTS_MENU_ID } from './menu.js';
import { excerptTarget, getRequestDetail, listRequests, listRuleResults, readExcerpt } from './repositories/queue-read.js';
import { isWithinRunWindow } from './domain/run-window.js';
import { sql } from 'drizzle-orm';
import { getQueueSettings, holdsExcerptRead } from './repositories/queue-write.js';

type Actor = { actor_id: string; workspace_id: string };
type Judged<T> = { ok: true; value: T } | { ok: false; message: string };

function declare<T>(
  deps: LogLifecycleDeps,
  name: string,
  paramKeys: readonly string[],
  parse: (p: Record<string, unknown>) => Judged<T>,
  run: (actor: Actor, value: T) => Promise<EndpointResult>,
): MenuEndpointDeclaration {
  const judge = (p: Record<string, unknown>): ParamsJudgment => {
    const r = parse(p);
    return r.ok ? { ok: true } : { ok: false, message: r.message };
  };
  return {
    spec: {
      id: `logLifecycle.${name}`,
      menuId: LOG_VALIDATION_REQUESTS_MENU_ID,
      paramKeys,
      permission: 'platform:view',
      requiresScope: false,
      context: {},
      mergeTimeDomain: false,
    },
    authorize: (actor, tx) => holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {}),
    validate: judge,
    async handle(args) {
      const parsed = parse(args.params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return run(args.actor, parsed.value);
    },
  };
}

export function requestEndpoints(deps: LogLifecycleDeps): MenuEndpointDeclaration[] {
  const audit = createAuditService();
  return [
    declare(deps, 'queueStatus', [], () => ({ ok: true, value: null }), async (actor) => {
      const settings = await getQueueSettings(deps.db, actor.workspace_id);
      const now = await deps.db.execute(sql`select now() as at`);
      const at = new Date(String(now.rows[0]?.at));
      return { outcome: 'ok', data: { runWindow: settings.runWindow, immediateLimit: settings.immediateLimit, serverAt: at.toISOString(), withinWindow: isWithinRunWindow(settings.runWindow, at) } };
    }),
    declare(deps, 'requests', REQUEST_PARAM_KEYS, parseRequestListParams, async (actor, query) => ({
      outcome: 'ok',
      data: await listRequests(deps.db, actor.workspace_id, query),
    })),
    declare(deps, 'requestDetail', REQUEST_DETAIL_PARAM_KEYS, parseRequestDetailParams, async (actor, requestId) => ({
      outcome: 'ok',
      data: await getRequestDetail(deps.db, actor.workspace_id, requestId),
    })),
    declare(deps, 'ruleResults', RULE_RESULT_PARAM_KEYS, parseRuleResultParams, async (actor, query) => ({
      outcome: 'ok',
      data: await listRuleResults(deps.db, actor.workspace_id, query),
    })),
    declare(deps, 'excerpt', EXCERPT_PARAM_KEYS, parseExcerptParams, async (actor, q) => {
      // Human sessions only: no token can hold the per-source right, and a token read would have no person to audit.
      if (currentAuthContext().kind === 'token') return { outcome: 'forbidden', data: null, message: 'excerpt reads need a login session' };
      return deps.db.transaction(async (tx): Promise<EndpointResult> => {
        const target = await excerptTarget(tx, actor.workspace_id, q.ruleResultId);
        if (!target) return { outcome: 'ok', data: null };
        // The right is judged inside the transaction that writes the audit row: a revoked right refuses this very call.
        if (!(await holdsExcerptRead(tx, actor.workspace_id, target.sourceOwner, actor.actor_id))) {
          return { outcome: 'forbidden', data: null, message: 'no right lifecycle.excerpt.read for this source' };
        }
        const read = await readExcerpt(tx, actor.workspace_id, q.ruleResultId, q.evidenceIndex);
        if (!read) return { outcome: 'ok', data: null };
        await audit.record(tx, {
          workspace_id: actor.workspace_id,
          actor_id: actor.actor_id,
          event_type: 'lifecycle.excerpt.read',
          subject_type: 'execution_request',
          subject_id: target.requestId,
          summary: 'log excerpt read',
          detail: { attemptId: target.attemptId, ruleResultId: q.ruleResultId, evidenceIndex: q.evidenceIndex },
        });
        return { outcome: 'ok', data: { ruleResultId: q.ruleResultId, evidenceIndex: q.evidenceIndex, deleted: read.deleted, excerpt: read.excerpt } };
      });
    }),
  ];
}
