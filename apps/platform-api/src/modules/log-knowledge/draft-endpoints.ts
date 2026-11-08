// The knowledge draft reads (#1198 a) as menu-dispatch declarations: the draft list and one draft's detail. Read right
// `platform:view` like the other item reads, but row visibility is enforced in SQL by the viewer (the author sees their
// drafts in every status; a holder of `knowledge.item.publish` also sees every draft that is not a plain `draft`;
// nobody else sees any). The dispatch outcome set has no `not_found`, so an unknown, other-workspace or hidden draft
// answers `ok` with `data: null` for the detail and simply is not in the list. The reads write nothing.

import { parseListParams } from '../../lib/list-params/list-params.js';
import type { MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import { LOG_KNOWLEDGE_ITEMS_MENU_ID } from './catalog-menu.js';
import type { LogKnowledgeDeps } from './deps.js';
import { DRAFT_FILTER_SPECS } from './domain/draft-filters.js';
import { DRAFT_SORT_IDS, getDraftDetail, listDrafts } from './repositories/draft-read.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_PARAM_KEYS = ['q', 'page', 'pageSize', 'sorting', 'filters'] as const;
const DRAFT_DEFAULT_SORT = { id: 'updatedAt', desc: true } as const;

function spec(id: string, paramKeys: readonly string[]) {
  return {
    id,
    menuId: LOG_KNOWLEDGE_ITEMS_MENU_ID,
    paramKeys,
    permission: 'platform:view',
    requiresScope: false,
    context: {},
    mergeTimeDomain: false,
  } as const;
}

const draftsJudge = (params: Record<string, unknown>) =>
  parseListParams(params, DRAFT_SORT_IDS, DRAFT_FILTER_SPECS, DRAFT_DEFAULT_SORT);

const draftIdOf = (params: Record<string, unknown>): string | null =>
  typeof params.draftId === 'string' && UUID.test(params.draftId) ? params.draftId.toLowerCase() : null;
const detailJudge = (params: Record<string, unknown>): ParamsJudgment =>
  draftIdOf(params) === null ? { ok: false, message: 'draftId must be a uuid string' } : { ok: true };

export function draftEndpoints(deps: LogKnowledgeDeps): MenuEndpointDeclaration[] {
  const authorize: MenuEndpointDeclaration['authorize'] = (actor, tx) =>
    holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {});
  return [
    {
      spec: spec('logKnowledge.drafts', LIST_PARAM_KEYS),
      authorize,
      validate(params): ParamsJudgment {
        const parsed = draftsJudge(params);
        return parsed.ok ? { ok: true } : parsed;
      },
      async handle(args) {
        const parsed = draftsJudge(args.params);
        if (!parsed.ok) return { outcome: 'error', data: null, message: parsed.message };
        // Visibility needs the viewer's review right, judged here (the shared `declareRead` drops the actor).
        const holdsPublish = await holdsPlatformPermission(deps.checkService, args.actor, 'knowledge:item-publish');
        const page = await listDrafts(
          deps.db,
          { ...parsed.value, workspaceId: args.actor.workspace_id },
          { workspaceId: args.actor.workspace_id, actorId: args.actor.actor_id, holdsPublish },
        );
        return { outcome: 'ok', data: page };
      },
    },
    {
      spec: spec('logKnowledge.draftDetail', ['draftId']),
      authorize,
      validate: detailJudge,
      async handle(args) {
        const draftId = draftIdOf(args.params);
        if (draftId === null) return { outcome: 'error', data: null, message: 'draftId must be a uuid string' };
        const holdsPublish = await holdsPlatformPermission(deps.checkService, args.actor, 'knowledge:item-publish');
        const detail = await getDraftDetail(deps.db, args.actor.workspace_id, draftId, {
          workspaceId: args.actor.workspace_id,
          actorId: args.actor.actor_id,
          holdsPublish,
        });
        return { outcome: 'ok', data: detail };
      },
    },
  ];
}
