// `logKnowledge.accessRules` (#1504 S-a): the access mode and the rules of one model / SW version / Item, for the people who
// manage access. Owning menu `log-knowledge-access`. Declared with `knowledge:access-manage` and also needs `platform:view`; the
// capability is session-only, so a token never reads it. A target that does not exist in the workspace answers `ok` with
// `data: null`. Managing is judged by the capability, not by the visibility rule (see `access-actions.ts`).

import { PAGE_SIZE_MAX } from '../../lib/list-params/list-params.js';
import type { MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import { ACCESS_MENU_PERMISSION } from './access-actions.js';
import { LOG_KNOWLEDGE_ACCESS_MENU_ID } from './catalog-menu.js';
import type { LogKnowledgeDeps } from './deps.js';
import { ACCESS_TARGET_KINDS, type AccessTargetKind, ruleIsActive } from './domain/access-visibility.js';
import { listRules, readTarget } from './repositories/access-write.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Judged = { ok: true; kind: AccessTargetKind; targetId: string; page: number; pageSize: number } | { ok: false; message: string };

function judge(params: Record<string, unknown>): Judged {
  const { targetKind, targetId } = params;
  if (typeof targetKind !== 'string' || !(ACCESS_TARGET_KINDS as readonly string[]).includes(targetKind)) {
    return { ok: false, message: `targetKind must be one of ${ACCESS_TARGET_KINDS.join(', ')}` };
  }
  if (typeof targetId !== 'string' || !UUID.test(targetId)) return { ok: false, message: 'targetId must be a uuid string' };
  const page = params.page === undefined ? 0 : params.page;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > 1_000_000) {
    return { ok: false, message: 'page must be a non-negative integer (0-based)' };
  }
  const pageSize = params.pageSize === undefined ? 50 : params.pageSize;
  if (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) {
    return { ok: false, message: `pageSize must be an integer from 1 to ${PAGE_SIZE_MAX}` };
  }
  return { ok: true, kind: targetKind as AccessTargetKind, targetId: targetId.toLowerCase(), page, pageSize };
}

export function accessEndpoints(deps: LogKnowledgeDeps): MenuEndpointDeclaration[] {
  return [
    {
      spec: {
        id: 'logKnowledge.accessRules',
        menuId: LOG_KNOWLEDGE_ACCESS_MENU_ID,
        paramKeys: ['targetKind', 'targetId', 'page', 'pageSize'],
        permission: ACCESS_MENU_PERMISSION,
        requiresScope: false,
        context: {},
        mergeTimeDomain: false,
      },
      authorize: async (actor, tx) =>
        (await holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {})) &&
        (await holdsPlatformPermission(deps.checkService, actor, ACCESS_MENU_PERMISSION, tx ? { tx } : {})),
      validate(params): ParamsJudgment {
        const judged = judge(params);
        return judged.ok ? { ok: true } : judged;
      },
      async handle(args) {
        const judged = judge(args.params);
        if (!judged.ok) return { outcome: 'error', data: null, message: judged.message };
        const ws = args.actor.workspace_id;
        const target = await readTarget(deps.db, ws, judged.kind, judged.targetId);
        if (!target) return { outcome: 'ok', data: null };
        const page = await listRules(deps.db, ws, judged.kind, judged.targetId, { page: judged.page, pageSize: judged.pageSize });
        const now = new Date();
        return {
          outcome: 'ok',
          data: {
            target: { kind: judged.kind, id: target.id, accessMode: target.accessMode, version: String(target.rowVersion) },
            total: page.total,
            rows: page.rows.map((row) => ({
              ruleId: row.ruleId,
              granteeKind: 'actor',
              granteeId: row.granteeId,
              effect: row.effect,
              validUntil: row.validUntil ? row.validUntil.toISOString() : null,
              state: row.revokedAt !== null ? 'revoked' : ruleIsActive(row, now) ? 'active' : 'expired',
              createdBy: row.createdBy,
              createdAt: row.createdAt.toISOString(),
              revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
              revokedBy: row.revokedBy,
            })),
          },
        };
      },
    },
  ];
}
