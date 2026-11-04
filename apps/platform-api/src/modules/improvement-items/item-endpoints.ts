// The improvement item reads (#1328 a, design docs/design/features/improvement-items.md §3) as menu-dispatch
// declarations: the item list, one item and an item's history. Same read right and workspace rule as the other
// direct list menus (`platform:view`, `requiresScope: false`, the workspace is the session actor's, never a param).
// The dispatch outcome set has no `not_found`, so an unknown or other-workspace id answers `ok` with `data: null`.
// The reads write nothing; the item writes are item-actions.ts (#1328 b). The Quest port is a later node.

import type { EndpointResult, MenuDispatchContribution, MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import type { ImprovementItemsDeps } from './deps.js';
import { itemActions } from './item-actions.js';
import { ASSIGNEE_ME } from './domain/item-filters.js';
import {
  DETAIL_PARAM_KEYS,
  EVENT_PARAM_KEYS,
  LIST_PARAM_KEYS,
  parseDetailParams,
  parseEventParams,
  parseItemListParams,
} from './domain/item-params.js';
import { IMPROVEMENT_ITEMS_MENU_ID } from './menu.js';
import { getItemDetail, listItemEvents, listItems } from './repositories/item-read.js';

function spec(id: string, paramKeys: readonly string[]) {
  return {
    id,
    menuId: IMPROVEMENT_ITEMS_MENU_ID,
    paramKeys,
    permission: 'platform:view',
    requiresScope: false,
    context: {},
    mergeTimeDomain: false,
  } as const;
}

type Judge = (params: Record<string, unknown>) => ParamsJudgment;

function declareRead(
  deps: ImprovementItemsDeps,
  id: string,
  paramKeys: readonly string[],
  judge: Judge,
  run: (actor: { actor_id: string; workspace_id: string }, params: Record<string, unknown>) => Promise<EndpointResult>,
): MenuEndpointDeclaration {
  return {
    spec: spec(id, paramKeys),
    authorize: (actor, tx) => holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {}),
    validate: (params) => judge(params),
    async handle(args) {
      const judged = judge(args.params);
      if (!judged.ok) return { outcome: 'error', data: null, message: judged.message };
      return run(args.actor, args.params);
    },
  };
}

const ok = { ok: true } as const;
const listJudge: Judge = (params) => {
  const parsed = parseItemListParams(params);
  return parsed.ok ? ok : parsed;
};
const detailJudge: Judge = (params) => {
  const parsed = parseDetailParams(params);
  return parsed.ok ? ok : parsed;
};
const eventsJudge: Judge = (params) => {
  const parsed = parseEventParams(params);
  return parsed.ok ? ok : parsed;
};

export function itemEndpoints(deps: ImprovementItemsDeps): MenuEndpointDeclaration[] {
  return [
    declareRead(deps, 'improvement.items', LIST_PARAM_KEYS, listJudge, async (actor, params) => {
      const parsed = parseItemListParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      const assignee = parsed.value.conditions.assignee;
      // `me` is the signed-in actor: resolved here so the query only ever sees ids.
      const conditions = assignee
        ? {
            ...parsed.value.conditions,
            assignee: { ...assignee, values: assignee.values.map((v) => (v === ASSIGNEE_ME ? actor.actor_id : v)) },
          }
        : parsed.value.conditions;
      const page = await listItems(deps.db, { ...parsed.value, conditions, workspaceId: actor.workspace_id });
      return { outcome: 'ok', data: page };
    }),
    declareRead(deps, 'improvement.itemDetail', DETAIL_PARAM_KEYS, detailJudge, async (actor, params) => {
      const parsed = parseDetailParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await getItemDetail(deps.db, actor.workspace_id, parsed.value) };
    }),
    declareRead(deps, 'improvement.itemEvents', EVENT_PARAM_KEYS, eventsJudge, async (actor, params) => {
      const parsed = parseEventParams(params);
      if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
      return { outcome: 'ok', data: await listItemEvents(deps.db, actor.workspace_id, parsed.value) };
    }),
  ];
}

export function improvementItemsContribution(deps: ImprovementItemsDeps): MenuDispatchContribution {
  return { endpoints: itemEndpoints(deps), actions: itemActions(deps) };
}
