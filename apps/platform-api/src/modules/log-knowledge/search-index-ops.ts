// Ops visibility of the search index (#1506 S-c, design log-knowledge-search §5.1): `logKnowledge.searchIndexStatus` (counts, lag,
// backfill n/N, generations) and `logKnowledge.searchIndexRequeue` (dead notifications -> pending). No screen. They sit on the
// access-management menu behind `knowledge.access.manage` (session-only, Admin through the module bypass): the existing
// admin-style knowledge capability, so no new capability or menu. Counts only, never an Item id. The requeue is not audited: it changes derived index state only, no source data (a new audit event type would need the cross-package audit registry).

import type { Tx } from '../../db/tx.js';
import type { ActionHandlerResult, MenuActionDeclaration, MenuEndpointDeclaration } from '../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import { holdsPlatformPermission, type PlatformActor } from '../platform-port/permissions.js';
import { ACCESS_MENU_PERMISSION, ACCESS_PERMISSION } from './access-actions.js';
import { LOG_KNOWLEDGE_ACCESS_MENU_ID } from './catalog-menu.js';
import type { LogKnowledgeDeps } from './deps.js';
import { requeueDead, searchIndexStatus } from './repositories/search-index.js';

export function searchIndexEndpoints(deps: LogKnowledgeDeps): MenuEndpointDeclaration[] {
  return [
    {
      spec: {
        id: 'logKnowledge.searchIndexStatus',
        menuId: LOG_KNOWLEDGE_ACCESS_MENU_ID,
        paramKeys: [],
        permission: ACCESS_MENU_PERMISSION,
        requiresScope: false,
        context: {},
        mergeTimeDomain: false,
      },
      authorize: async (actor, tx) =>
        (await holdsPlatformPermission(deps.checkService, actor, 'platform:view', tx ? { tx } : {})) &&
        (await holdsPlatformPermission(deps.checkService, actor, ACCESS_MENU_PERMISSION, tx ? { tx } : {})),
      validate: () => ({ ok: true }),
      async handle(args) {
        return { outcome: 'ok', data: await searchIndexStatus(deps.db, args.actor.workspace_id) };
      },
    },
  ];
}

export function searchIndexActions(deps: { checkService: CheckService }): MenuActionDeclaration[] {
  const requeue: MenuActionDeclaration = {
    spec: {
      id: 'logKnowledge.searchIndexRequeue',
      menuId: LOG_KNOWLEDGE_ACCESS_MENU_ID,
      inputKeys: [],
      permission: ACCESS_MENU_PERMISSION,
      requiresScope: false,
      concurrency: 'none',
      invalidates: ['logKnowledge.searchIndexStatus'],
    },
    authorize: async (actor: PlatformActor, tx: Tx) =>
      applyAdminModuleBypass(
        actor.role_level,
        ACCESS_PERMISSION,
        await deps.checkService.checkCapability(actor, ACCESS_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
      ).allow,
    validate: () => [],
    async handle(tx, actor): Promise<ActionHandlerResult> {
      const requeued = await requeueDead(tx, actor.workspace_id);
      return { data: { requeued }, version: null };
    },
  };
  return [requeue];
}
