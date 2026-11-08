// `logKnowledge.specSubjectItems` (#1196 f, design v0.6 §15.2): the items about one module / event of a model, for the
// spec detail's «이 이벤트를 다룬 Item». Owning menu `log-knowledge-models` (the spec detail's), read right
// `platform:view`, the workspace is the session actor's. Item visibility is the item list's: published items whose latest
// revision names the target. `targetKey` is the escaped stable key (`module_key` or `module_key/event_key`).

import { PAGE_SIZE_MAX } from '../../lib/list-params/list-params.js';
import type { MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import { LOG_KNOWLEDGE_MODELS_MENU_ID } from './catalog-menu.js';
import type { LogKnowledgeDeps } from './deps.js';
import { listSubjectItems } from './repositories/item-read.js';
import { TARGET_KEY_MAX } from './domain/spec-target-key.js';
import { unsafeText } from '../../lib/text-safety.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Judged = { ok: true; modelId: string; targetKey: string; page: number; pageSize: number } | { ok: false; message: string };

function judge(params: Record<string, unknown>): Judged {
  const { modelId, targetKey } = params;
  if (typeof modelId !== 'string' || !UUID.test(modelId)) return { ok: false, message: 'modelId must be a uuid string' };
  if (typeof targetKey !== 'string' || targetKey.trim() === '' || targetKey.length > TARGET_KEY_MAX || unsafeText(targetKey)) {
    return { ok: false, message: `targetKey must be non-blank text of at most ${TARGET_KEY_MAX} characters` };
  }
  const page = params.page === undefined ? 0 : params.page;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > 1_000_000) {
    return { ok: false, message: 'page must be a non-negative integer (0-based)' };
  }
  const pageSize = params.pageSize === undefined ? 50 : params.pageSize;
  if (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) {
    return { ok: false, message: `pageSize must be an integer from 1 to ${PAGE_SIZE_MAX}` };
  }
  return { ok: true, modelId: modelId.toLowerCase(), targetKey, page, pageSize };
}

export function subjectEndpoints(deps: LogKnowledgeDeps): MenuEndpointDeclaration[] {
  return [
    {
      spec: {
        id: 'logKnowledge.specSubjectItems',
        menuId: LOG_KNOWLEDGE_MODELS_MENU_ID,
        paramKeys: ['modelId', 'targetKey', 'page', 'pageSize'],
        permission: 'platform:view',
        requiresScope: false,
        context: {},
        mergeTimeDomain: false,
      },
      authorize: (actor, tx) => holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {}),
      validate(params): ParamsJudgment {
        const judged = judge(params);
        return judged.ok ? { ok: true } : judged;
      },
      async handle(args) {
        const judged = judge(args.params);
        if (!judged.ok) return { outcome: 'error', data: null, message: judged.message };
        const { modelId, targetKey, page, pageSize } = judged;
        return { outcome: 'ok', data: await listSubjectItems(deps.db, { workspaceId: args.actor.workspace_id, actorId: args.actor.actor_id }, args.actor.workspace_id, modelId, targetKey, { page, pageSize }) };
      },
    },
  ];
}
