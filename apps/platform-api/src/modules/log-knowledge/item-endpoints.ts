// The knowledge item reads of the log knowledge hub (ADR-0109, #1197 a) as menu-dispatch declarations: explore
// models, a model's profile, the item list and one item. Same read right and workspace rule as the catalog reads
// (`platform:view`, `requiresScope: false`, the workspace is the session actor's, never a param). The dispatch
// outcome set has no `not_found`, so an unknown or other-workspace id answers `ok` with `data: null`.

import type { EndpointResult, MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import {
  LOG_KNOWLEDGE_ITEMS_MENU_ID,
  LOG_KNOWLEDGE_MODELS_MENU_ID,
} from './catalog-menu.js';
import { CATALOG_FILTER_SPECS } from './domain/catalog-filters.js';
import { ITEM_FILTER_SPECS } from './domain/item-filters.js';
import { parseListParams } from '../../lib/list-params/list-params.js';
import type { LogKnowledgeDeps } from './deps.js';
import type { Viewer } from './repositories/access-visibility.js';
import { MODEL_SORT_IDS, listModels } from './repositories/catalog-read.js';
import { ITEM_SORT_IDS, getItemDetail, getModelProfile, listItems } from './repositories/item-read.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVISION_NO_MAX = 1_000_000;
const LIST_PARAM_KEYS = ['q', 'page', 'pageSize', 'sorting', 'filters'] as const;
const ITEM_DEFAULT_SORT = { id: 'updatedAt', desc: true } as const;

function spec(id: string, menuId: string, paramKeys: readonly string[]) {
  return {
    id,
    menuId,
    paramKeys,
    permission: 'platform:view',
    requiresScope: false,
    context: {},
    mergeTimeDomain: false,
  } as const;
}

export type Judge = (params: Record<string, unknown>) => { ok: true } | { ok: false; message: string };

export function declareRead(
  deps: LogKnowledgeDeps,
  id: string,
  menuId: string,
  paramKeys: readonly string[],
  judge: Judge,
  run: (viewer: Viewer, params: Record<string, unknown>) => Promise<EndpointResult>,
): MenuEndpointDeclaration {
  return {
    spec: spec(id, menuId, paramKeys),
    authorize: (actor, tx) => holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {}),
    validate(params): ParamsJudgment {
      const judged = judge(params);
      return judged.ok ? { ok: true } : judged;
    },
    async handle(args) {
      const judged = judge(args.params);
      if (!judged.ok) return { outcome: 'error', data: null, message: judged.message };
      return run({ workspaceId: args.actor.workspace_id, actorId: args.actor.actor_id }, args.params);
    },
  };
}

const exploreJudge: Judge = (params) =>
  parseListParams(params, MODEL_SORT_IDS, CATALOG_FILTER_SPECS.models);
const itemsJudge: Judge = (params) =>
  parseListParams(params, ITEM_SORT_IDS, ITEM_FILTER_SPECS, ITEM_DEFAULT_SORT);

const uuidParam = (params: Record<string, unknown>, key: string): string | null => {
  const value = params[key];
  return typeof value === 'string' && UUID.test(value) ? value : null;
};

const modelProfileJudge: Judge = (params) =>
  uuidParam(params, 'modelId') === null ? { ok: false, message: 'modelId must be a uuid string' } : { ok: true };

/** `revisionNo` is optional (absent = the latest); an explicit null or a non-positive integer is a refusal. */
function revisionNoOf(params: Record<string, unknown>): number | null | 'invalid' {
  if (params.revisionNo === undefined) return null;
  const n = params.revisionNo;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= REVISION_NO_MAX ? n : 'invalid';
}
const itemDetailJudge: Judge = (params) => {
  if (uuidParam(params, 'itemId') === null) return { ok: false, message: 'itemId must be a uuid string' };
  if (revisionNoOf(params) === 'invalid') return { ok: false, message: 'revisionNo must be a positive integer' };
  return { ok: true };
};

export function itemEndpoints(deps: LogKnowledgeDeps): MenuEndpointDeclaration[] {
  return [
    declareRead(deps, 'logKnowledge.exploreModels', LOG_KNOWLEDGE_MODELS_MENU_ID, LIST_PARAM_KEYS, exploreJudge, async (viewer, params) => {
      const { workspaceId } = viewer;
      const parsed = parseListParams(params, MODEL_SORT_IDS, CATALOG_FILTER_SPECS.models);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      const page = await listModels(deps.db, { ...parsed.value, workspaceId }, viewer, { withItemCount: true });
      return { outcome: 'ok', data: page };
    }),
    declareRead(deps, 'logKnowledge.modelProfile', LOG_KNOWLEDGE_MODELS_MENU_ID, ['modelId'], modelProfileJudge, async (viewer, params) => {
      const profile = await getModelProfile(deps.db, viewer, viewer.workspaceId, uuidParam(params, 'modelId') as string);
      return { outcome: 'ok', data: profile };
    }),
    declareRead(deps, 'logKnowledge.items', LOG_KNOWLEDGE_ITEMS_MENU_ID, LIST_PARAM_KEYS, itemsJudge, async (viewer, params) => {
      const { workspaceId } = viewer;
      const parsed = parseListParams(params, ITEM_SORT_IDS, ITEM_FILTER_SPECS, ITEM_DEFAULT_SORT);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      const page = await listItems(deps.db, { ...parsed.value, workspaceId }, viewer);
      return { outcome: 'ok', data: page };
    }),
    declareRead(deps, 'logKnowledge.itemDetail', LOG_KNOWLEDGE_ITEMS_MENU_ID, ['itemId', 'revisionNo'], itemDetailJudge, async (viewer, params) => {
      const revisionNo = revisionNoOf(params);
      const detail = await getItemDetail(
        deps.db,
        viewer,
        viewer.workspaceId,
        uuidParam(params, 'itemId') as string,
        revisionNo === 'invalid' ? null : revisionNo,
      );
      return { outcome: 'ok', data: detail };
    }),
  ];
}
