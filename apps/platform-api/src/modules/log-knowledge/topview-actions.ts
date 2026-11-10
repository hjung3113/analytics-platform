// The Hub writes of the Top View pointer (#1656): link and unlink, judged by `knowledge.catalog.manage` (`knowledge:catalog-manage`),
// versioned per (model, start SW) row (`expectedVersion: '0'` creates, as `eqv.saveDraft`), audited in the same transaction. The
// Revision is read through the eqv read service (hash re-checked there); the Hub stores the pointer only.
import type { Tx } from '../../db/tx.js';
import { type FieldError, type MenuActionDeclaration, MenuActionInvalidError } from '../menu-dispatch/types.js';
import { type EqvReadService, eqvReadService } from '../eqv/read-service.js';
import type { CheckService } from '../permissions/check-service.js';
import { applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import { recordTopViewAudit } from './catalog-audit.js';
import { CATALOG_MENU_PERMISSION, CATALOG_PERMISSION } from './catalog-actions.js';
import { LOG_KNOWLEDGE_MODELS_MENU_ID } from './catalog-menu.js';
import { canSeeModel, viewerOf } from './repositories/access-visibility.js';
import { deleteLink, insertLink, lockedLink, softwareOfModel, updateLink } from './repositories/topview-link.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Shape of a Revision hash; the eqv read service re-checks the stored hash, this only refuses a malformed input early.
const REVISION_PATTERN = /^sha256:[0-9a-f]{64}$/;
const LAYOUT_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const startSoftwareValid = (v: unknown) => v === null || isUuid(v);

export interface TopViewActionDeps {
  checkService: CheckService;
  eqvRead?: EqvReadService;
}

export function topViewActions(deps: TopViewActionDeps): MenuActionDeclaration[] {
  const eqv = deps.eqvRead ?? eqvReadService;
  const authorize = async (actor: PlatformActor, tx: Tx) =>
    applyAdminModuleBypass(
      actor.role_level,
      CATALOG_PERMISSION,
      await deps.checkService.checkCapability(actor, CATALOG_PERMISSION, { workspace_id: actor.workspace_id }, { tx }),
    ).allow;
  const invalidates = ['logKnowledge.modelTopView'];
  const modelOf = (input: Record<string, unknown>) => String(input.modelId).toLowerCase();
  const startOf = (input: Record<string, unknown>) => (input.fromSoftwareId === null ? null : String(input.fromSoftwareId).toLowerCase());

  /** Locks the model and the (model, start SW) row. A hidden or missing model: no row, like a missing one. */
  async function lockTarget(tx: Tx, actor: PlatformActor, input: Record<string, unknown>) {
    const viewer = viewerOf(actor);
    if (!(await canSeeModel(tx, viewer, modelOf(input)))) return { visible: false as const };
    return { visible: true as const, row: await lockedLink(tx, viewer, modelOf(input), startOf(input)) };
  }

  const link: MenuActionDeclaration = {
    spec: {
      id: 'logKnowledge.linkTopView',
      menuId: LOG_KNOWLEDGE_MODELS_MENU_ID,
      inputKeys: ['modelId', 'fromSoftwareId', 'layoutId', 'revision'],
      permission: CATALOG_MENU_PERMISSION,
      requiresScope: false,
      concurrency: 'version',
      invalidates,
    },
    authorize,
    validate(input) {
      const errors: FieldError[] = [];
      if (!isUuid(input.modelId)) errors.push({ path: ['modelId'], code: 'invalid' });
      if (!startSoftwareValid(input.fromSoftwareId)) errors.push({ path: ['fromSoftwareId'], code: 'invalid' });
      if (typeof input.layoutId !== 'string' || !LAYOUT_ID.test(input.layoutId)) errors.push({ path: ['layoutId'], code: 'invalid' });
      if (typeof input.revision !== 'string' || !REVISION_PATTERN.test(input.revision)) errors.push({ path: ['revision'], code: 'invalid' });
      return errors;
    },
    // '0' while no row exists for the key, so a client creates with expectedVersion '0'. A hidden model is `not_found` in handle.
    async currentVersion(tx, actor, input) {
      const found = await lockTarget(tx, actor, input);
      return found.visible && found.row ? String(found.row.version) : '0';
    },
    async handle(tx, actor, input) {
      const viewer = viewerOf(actor);
      const modelId = modelOf(input);
      const fromSoftwareId = startOf(input);
      const layoutId = String(input.layoutId);
      const revision = String(input.revision);
      const found = await lockTarget(tx, actor, input);
      if (!found.visible) throw new MenuActionInvalidError([{ path: ['modelId'], code: 'not_found' }]);
      if (fromSoftwareId !== null && !(await softwareOfModel(tx, viewer, modelId, fromSoftwareId))) {
        throw new MenuActionInvalidError([{ path: ['fromSoftwareId'], code: 'software_not_of_model' }]);
      }
      const published = await eqv.getPublishedRevision(tx, actor.workspace_id, layoutId, revision);
      if (!published) throw new MenuActionInvalidError([{ path: ['revision'], code: 'revision_not_found' }]);
      const row = found.row
        ? await updateLink(tx, { id: found.row.id, workspaceId: actor.workspace_id, layoutId, revision, actorId: actor.actor_id })
        : await insertLink(tx, { workspaceId: actor.workspace_id, modelId, fromSoftwareId, layoutId, revision, actorId: actor.actor_id });
      await recordTopViewAudit(tx, actor, 'linked', { linkId: row.id, modelId, fromSoftwareId, layoutId, revision });
      return { data: { linkId: row.id, version: String(row.version) }, version: String(row.version) };
    },
  };

  const unlink: MenuActionDeclaration = {
    spec: {
      id: 'logKnowledge.unlinkTopView',
      menuId: LOG_KNOWLEDGE_MODELS_MENU_ID,
      inputKeys: ['modelId', 'fromSoftwareId'],
      permission: CATALOG_MENU_PERMISSION,
      requiresScope: false,
      concurrency: 'version',
      invalidates,
    },
    authorize,
    validate(input) {
      const errors: FieldError[] = [];
      if (!isUuid(input.modelId)) errors.push({ path: ['modelId'], code: 'invalid' });
      if (!startSoftwareValid(input.fromSoftwareId)) errors.push({ path: ['fromSoftwareId'], code: 'invalid' });
      return errors;
    },
    // null = no row (or a hidden model) → `not_found`.
    async currentVersion(tx, actor, input) {
      const found = await lockTarget(tx, actor, input);
      return found.visible && found.row ? String(found.row.version) : null;
    },
    async handle(tx, actor, input) {
      const found = await lockTarget(tx, actor, input);
      if (!found.visible || !found.row) throw new MenuActionInvalidError([{ path: ['modelId'], code: 'not_found' }]);
      const row = found.row;
      await deleteLink(tx, actor.workspace_id, row.id);
      await recordTopViewAudit(tx, actor, 'unlinked', {
        linkId: row.id,
        modelId: row.modelId,
        fromSoftwareId: row.fromSoftwareId,
        layoutId: row.layoutId,
        revision: row.layoutRevision,
      });
      // A versioned write answers a version string: the version the row had when it was removed.
      return { data: { linkId: row.id }, version: String(row.version) };
    },
  };

  return [link, unlink];
}
