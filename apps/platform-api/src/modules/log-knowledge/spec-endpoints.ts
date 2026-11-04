// The model spec reads of the log knowledge hub (design v0.6 §15.4, #1196 a) as menu-dispatch declarations: the
// latest published spec of a model and the model's revision list. Owning menu `log-knowledge-models`, same read
// right and workspace rule as the item reads (`platform:view`, no scope, the workspace is the session actor's).
// An unknown or other-workspace model answers `ok` with `data: null` (modelSpec) or an empty page (revisions).

import type { EndpointResult, MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import { LOG_KNOWLEDGE_MODELS_MENU_ID } from './catalog-menu.js';
import type { LogKnowledgeDeps } from './deps.js';
import { PAGE_SIZE_MAX } from './domain/list-params.js';
import { getModelSpec, listModelSpecRevisions } from './repositories/spec-read.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Judged = { ok: true; modelId: string; page: number; pageSize: number } | { ok: false; message: string };

function judgeParams(params: Record<string, unknown>, paged: boolean): Judged {
  const modelId = params.modelId;
  if (typeof modelId !== 'string' || !UUID.test(modelId)) return { ok: false, message: 'modelId must be a uuid string' };
  if (!paged) return { ok: true, modelId, page: 0, pageSize: 0 };
  const page = params.page === undefined ? 0 : params.page;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 0 || page > 1_000_000) {
    return { ok: false, message: 'page must be a non-negative integer (0-based)' };
  }
  const pageSize = params.pageSize === undefined ? 50 : params.pageSize;
  if (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) {
    return { ok: false, message: `pageSize must be an integer from 1 to ${PAGE_SIZE_MAX}` };
  }
  return { ok: true, modelId, page, pageSize };
}

function declareSpecRead(
  deps: LogKnowledgeDeps,
  id: string,
  paramKeys: readonly string[],
  paged: boolean,
  run: (workspaceId: string, judged: Extract<Judged, { ok: true }>) => Promise<EndpointResult>,
): MenuEndpointDeclaration {
  return {
    spec: {
      id,
      menuId: LOG_KNOWLEDGE_MODELS_MENU_ID,
      paramKeys,
      permission: 'platform:view',
      requiresScope: false,
      context: {},
      mergeTimeDomain: false,
    },
    authorize: (actor, tx) => holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {}),
    validate(params): ParamsJudgment {
      const judged = judgeParams(params, paged);
      return judged.ok ? { ok: true } : judged;
    },
    async handle(args) {
      const judged = judgeParams(args.params, paged);
      if (!judged.ok) return { outcome: 'error', data: null, message: judged.message };
      return run(args.actor.workspace_id, judged);
    },
  };
}

export function specEndpoints(deps: LogKnowledgeDeps): MenuEndpointDeclaration[] {
  return [
    declareSpecRead(deps, 'logKnowledge.modelSpec', ['modelId'], false, async (workspaceId, { modelId }) => ({
      outcome: 'ok',
      data: await getModelSpec(deps.db, workspaceId, modelId),
    })),
    declareSpecRead(
      deps,
      'logKnowledge.modelSpecRevisions',
      ['modelId', 'page', 'pageSize'],
      true,
      async (workspaceId, { modelId, page, pageSize }) => ({
        outcome: 'ok',
        data: await listModelSpecRevisions(deps.db, workspaceId, modelId, { page, pageSize }),
      }),
    ),
  ];
}
