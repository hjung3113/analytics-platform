// The Hub reads of the model profile's Top View section (#1656): `logKnowledge.modelTopView` (the pointer that applies to a target SW
// version, the Revision document through the eqv read service, and the model's links) and `logKnowledge.topViewRevisionOptions`
// (the published Revisions a catalog manager may link). Read right `platform:view`; the Hub model ACL decides, never `eqv:view`.
import { holdsMenuPermission } from '../platform-port/permissions.js';
import type { MenuEndpointDeclaration } from '../menu-dispatch/types.js';
import { CATALOG_PERMISSION } from './catalog-actions.js';
import { LOG_KNOWLEDGE_MODELS_MENU_ID } from './catalog-menu.js';
import type { LogKnowledgeDeps } from './deps.js';
import { resolveTopViewLink } from './domain/topview-resolution.js';
import { type Judge, declareRead } from './item-endpoints.js';
import { canSeeModel } from './repositories/access-visibility.js';
import { listModelLinks, softwareOfModel, visibleModelSoftware } from './repositories/topview-link.js';
import { eqvReadService } from '../eqv/read-service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

const modelTopViewJudge: Judge = (params) => {
  if (!isUuid(params.modelId)) return { ok: false, message: 'modelId must be a uuid string' };
  if (params.softwareId !== undefined && !isUuid(params.softwareId)) return { ok: false, message: 'softwareId must be a uuid string' };
  return { ok: true };
};

export function topViewEndpoints(deps: LogKnowledgeDeps): MenuEndpointDeclaration[] {
  const eqv = deps.eqvRead ?? eqvReadService;
  return [
    declareRead(deps, 'logKnowledge.modelTopView', LOG_KNOWLEDGE_MODELS_MENU_ID, ['modelId', 'softwareId'], modelTopViewJudge, async (viewer, params) => {
      const modelId = (params.modelId as string).toLowerCase();
      // A hidden or missing model answers like a missing one.
      if (!(await canSeeModel(deps.db, viewer, modelId))) return { outcome: 'ok', data: null };
      const software = await visibleModelSoftware(deps.db, viewer, modelId);
      // Oldest release first, so the last row has the greatest release_order.
      let target: (typeof software)[number] | null = software[software.length - 1] ?? null;
      if (typeof params.softwareId === 'string') {
        const picked = await softwareOfModel(deps.db, viewer, modelId, params.softwareId.toLowerCase());
        if (!picked) return { outcome: 'error', data: null, message: 'softwareId is not a software version of this model' };
        target = picked;
      }
      const links = await listModelLinks(deps.db, viewer, modelId);
      const hit = resolveTopViewLink(
        links.map((l) => ({ ...l, tieKey: l.id })),
        target ? target.releaseOrder : null,
      );
      let resolved = null;
      let resolvedError: 'revision_unavailable' | undefined;
      if (hit) {
        const rev = await eqv.getPublishedRevision(deps.db, viewer.workspaceId, hit.layoutId, hit.revision);
        if (rev) {
          resolved = {
            linkId: hit.id,
            fromSoftwareId: hit.fromSoftwareId,
            fromSoftwareVersion: hit.fromSoftwareVersion,
            layoutId: rev.layoutId,
            revision: rev.revision,
            document: rev.document,
            publishedAt: rev.publishedAt,
          };
        } else {
          resolvedError = 'revision_unavailable';
        }
      }
      return {
        outcome: 'ok',
        data: {
          target: target ? { softwareId: target.id, version: target.version } : null,
          resolved,
          ...(resolvedError ? { resolvedError } : {}),
          links: links.map((l) => ({
            linkId: l.id,
            fromSoftwareId: l.fromSoftwareId,
            fromSoftwareVersion: l.fromSoftwareVersion,
            layoutId: l.layoutId,
            revision: l.revision,
            version: l.version,
          })),
        },
      };
    }),
    guardManageOnly(
      deps,
      declareRead(deps, 'logKnowledge.topViewRevisionOptions', LOG_KNOWLEDGE_MODELS_MENU_ID, [], () => ({ ok: true }), async (viewer) => {
        const rows = await eqv.listPublishedRevisions(deps.db, viewer.workspaceId);
        return { outcome: 'ok', data: { rows } };
      }),
    ),
  ];
}

/** Layout ids are invisible to Hub readers, so the picker read is for catalog managers only (judged in the handler, as the other manage-only reads). */
export function guardManageOnly(deps: LogKnowledgeDeps, declaration: MenuEndpointDeclaration): MenuEndpointDeclaration {
  return {
    ...declaration,
    async handle(args) {
      if (!(await holdsMenuPermission(deps.checkService, args.actor, CATALOG_PERMISSION))) {
        return { outcome: 'forbidden', data: null };
      }
      return declaration.handle(args);
    },
  };
}
