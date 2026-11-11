// The Sample Window and equipment-registration actions of the 설비 온보딩 menu (#1658 Sample Window·Fleet PR, ADR-0139 amendment):
// importSampleWindow, replaceSampleWindow, retireSampleWindow, registerEquipment. All are `concurrency: 'none'` and need `eqv.window.import`,
// judged in `authorize` and again in `handle` after the equipment advisory lock (the same lock `publishMapping` takes, so a window cannot change
// under a publish). Each writes one audit row in the dispatch transaction (equipment id and hashes only) and answers ids and hashes.
// An equipment the actor cannot address (missing, or its Hub model hidden) is `equipmentId/not_found` for every action.
import { buildInventory } from '@eqv/core';

import type { Tx } from '../../db/tx.js';
import type { AttachmentsService } from '../attachments/index.js';
import { type FieldError, type MenuActionDeclaration, MenuActionForbiddenError, MenuActionInvalidError } from '../menu-dispatch/types.js';
import { equipmentSubjectId, recordEquipmentRegistered, recordWindowImported, recordWindowReplaced, recordWindowRetired } from './audit.js';
import { type EqvDeps, eqvAuthorize } from './authorize.js';
import { isEquipmentId, isUuid } from './domain/mapping-checks.js';
import { checkWindowFile, isWindowHex, parseUploadJson, registerErrors, windowHashOf } from './domain/window-checks.js';
import { EQV_ONBOARDING_MENU_ID, EQV_WINDOW_IMPORT_CAPABILITY, EQV_WINDOW_IMPORT_PERMISSION } from './menu.js';
import { equipmentScope, type ModelLookup } from './onboarding-scope.js';
import { lockOnboarding } from './repositories/onboarding-write.js';
import * as read from './repositories/window-read.js';
import * as write from './repositories/window-write.js';

/** The attachments service surface the import reads an upload through (ADR-0140 §6). */
export type UploadReader = Pick<AttachmentsService, 'readUnlinkedUpload'>;
/** The largest Sample Window file: the generic upload port's cap (`PLATFORM_FILE_MAX_BYTES`). */
export const SAMPLE_WINDOW_MAX_BYTES = 32 * 1024 * 1024;

const invalid = (...errors: FieldError[]) => new MenuActionInvalidError(errors);
const WINDOW_INVALIDATES = ['eqv.sampleWindows', 'eqv.observedInventory', 'eqv.fleet'] as const;

export function windowActions(deps: EqvDeps & { knowledgeLookup: ModelLookup; uploads: UploadReader }): MenuActionDeclaration[] {
  const canImport = eqvAuthorize(deps, EQV_WINDOW_IMPORT_CAPABILITY);
  const O = EQV_ONBOARDING_MENU_ID;
  const spec = (id: string, inputKeys: readonly string[], invalidates: readonly string[]) =>
    ({ id, menuId: O, inputKeys, permission: EQV_WINDOW_IMPORT_PERMISSION, requiresScope: false, concurrency: 'none', invalidates }) as const;

  /** Locks the equipment, judges the right again (the lock wait came after the dispatcher's last check) and resolves the addressable equipment. */
  async function enter(tx: Tx, actor: Parameters<typeof canImport>[0], equipmentId: string) {
    await lockOnboarding(tx, 'equipment', actor.workspace_id, equipmentId);
    if (!(await canImport(actor, tx))) throw new MenuActionForbiddenError();
    if (!(await equipmentScope(tx, deps.knowledgeLookup, actor, equipmentId))) throw invalid({ path: ['equipmentId'], code: 'not_found' });
  }
  const canReplay: NonNullable<MenuActionDeclaration['canReplay']> = async (tx, actor, input) =>
    isEquipmentId(input.equipmentId) && (await equipmentScope(tx, deps.knowledgeLookup, actor, input.equipmentId)) !== null;
  const windowInputErrors = (input: Record<string, unknown>): FieldError[] => [
    ...(isEquipmentId(input.equipmentId) ? [] : [{ path: ['equipmentId'], code: 'invalid' }]),
    ...(isWindowHex(input.windowHash) ? [] : [{ path: ['windowHash'], code: 'invalid' }]),
  ];

  const importWindow: MenuActionDeclaration = {
    spec: spec('eqv.importSampleWindow', ['equipmentId', 'uploadId'], WINDOW_INVALIDATES),
    authorize: (actor, tx) => canImport(actor, tx),
    canReplay,
    validate: (input) => [
      ...(isEquipmentId(input.equipmentId) ? [] : [{ path: ['equipmentId'], code: 'invalid' }]),
      ...(isUuid(input.uploadId) ? [] : [{ path: ['uploadId'], code: 'invalid' }]),
    ],
    async handle(tx, actor, input) {
      const ws = actor.workspace_id;
      const equipmentId = String(input.equipmentId);
      await enter(tx, actor, equipmentId);

      // Only the uploader reads an unlinked upload, within its 24 h; every other case is the same `not_found`.
      const bytes = await deps.uploads.readUnlinkedUpload({ workspaceId: ws, actorId: actor.actor_id, id: String(input.uploadId), maxBytes: SAMPLE_WINDOW_MAX_BYTES });
      if (bytes === null) throw invalid({ path: ['uploadId'], code: 'not_found' });
      const json = parseUploadJson(bytes);
      if (!json.ok) throw invalid({ path: ['file'], code: 'not_json' });

      // A retired window no longer blocks its range; every other stored window does (EV#105: an exact range is a reprocessed generation to stage).
      const checked = await checkWindowFile(json.value, equipmentId, await read.listLiveWindowRefs(tx, ws, equipmentId));
      if (!checked.ok) throw invalid(...checked.errors);
      const { summary, batch, replaces } = checked.check;

      const rows = await read.listWindowRows(tx, ws, equipmentId);
      const known = rows.find((w) => w.hash === summary.hash);
      // A retired window stays retired: its content again is refused, never answered as a success that changes nothing.
      if (known?.state === 'retired') throw invalid({ path: ['file'], code: 'retired' });
      if (known) return { data: known, version: null };

      const active = rows.find((w) => w.state === 'active' && replaces.some((ref) => ref.hash === w.hash));
      if (active && rows.some((w) => w.state === 'staged' && w.counterpart === active.hash)) throw invalid({ path: ['file'], code: 'staged_exists' });
      let inventory;
      try {
        inventory = buildInventory(batch);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        throw invalid({ path: ['file'], code: 'invalid' });
      }
      const state = active ? 'staged' : 'active';
      const counterpartHash = active?.hash ?? null;
      const stored = await write.insertWindow(tx, {
        workspaceId: ws, equipmentId, hash: summary.hash, from: summary.from, to: summary.to, dataGeneration: summary.dataGeneration,
        timeDomain: summary.timeDomain, occurrences: summary.occurrences, state, counterpartHash, batch, inventory, actorId: actor.actor_id,
      });
      await recordWindowImported({
        tx, actor, subjectId: stored.id, equipmentId, windowHash: summary.hash, state, counterpartHash, summary: `Sample Window imported for ${equipmentId}`,
      });
      return {
        data: {
          hash: summary.hash, from: summary.from, to: summary.to, dataGeneration: summary.dataGeneration, timeDomain: summary.timeDomain,
          occurrences: summary.occurrences, state, counterpart: counterpartHash, mappingCount: 0,
        },
        version: null,
      };
    },
  };

  const replaceWindow: MenuActionDeclaration = {
    spec: spec('eqv.replaceSampleWindow', ['equipmentId', 'windowHash'], WINDOW_INVALIDATES),
    authorize: (actor, tx) => canImport(actor, tx),
    canReplay,
    validate: windowInputErrors,
    async handle(tx, actor, input) {
      const ws = actor.workspace_id;
      const equipmentId = String(input.equipmentId);
      await enter(tx, actor, equipmentId);
      const staged = await read.getWindowRow(tx, ws, equipmentId, windowHashOf(String(input.windowHash)));
      if (!staged || staged.state !== 'staged') throw invalid({ path: ['windowHash'], code: 'not_staged' });
      const before = staged.counterpartHash === null ? null : await read.getWindowRow(tx, ws, equipmentId, staged.counterpartHash);
      // Only a window that is still active is replaced; Baselines taken from it stay (they point at the row, which keeps its content).
      const replaced = before?.state === 'active' ? before : null;
      if (replaced) await write.setWindowState(tx, { workspaceId: ws, equipmentId, hash: replaced.hash, state: 'replaced', counterpartHash: staged.hash, actorId: actor.actor_id });
      const activated = await write.setWindowState(tx, { workspaceId: ws, equipmentId, hash: staged.hash, state: 'active', counterpartHash: staged.counterpartHash, actorId: actor.actor_id });
      await recordWindowReplaced({
        tx, actor, subjectId: activated.id, equipmentId, activeHash: staged.hash, replacedHash: replaced?.hash ?? '', summary: `Sample Window replaced for ${equipmentId}`,
      });
      return { data: { equipmentId, activeHash: staged.hash, replacedHash: replaced?.hash ?? '' }, version: null };
    },
  };

  const retireWindow: MenuActionDeclaration = {
    spec: spec('eqv.retireSampleWindow', ['equipmentId', 'windowHash'], WINDOW_INVALIDATES),
    authorize: (actor, tx) => canImport(actor, tx),
    canReplay,
    validate: windowInputErrors,
    async handle(tx, actor, input) {
      const ws = actor.workspace_id;
      const equipmentId = String(input.equipmentId);
      await enter(tx, actor, equipmentId);
      const window = await read.getWindowRow(tx, ws, equipmentId, windowHashOf(String(input.windowHash)));
      if (!window || window.state !== 'active') throw invalid({ path: ['windowHash'], code: 'not_active' });
      const retired = await write.setWindowState(tx, { workspaceId: ws, equipmentId, hash: window.hash, state: 'retired', counterpartHash: window.counterpartHash, actorId: actor.actor_id });
      await recordWindowRetired({ tx, actor, subjectId: retired.id, equipmentId, windowHash: window.hash, summary: `Sample Window retired for ${equipmentId}` });
      return { data: { equipmentId, retiredHash: window.hash }, version: null };
    },
  };

  const register: MenuActionDeclaration = {
    spec: spec('eqv.registerEquipment', ['equipmentId', 'label', 'vendorId', 'modelId'], ['eqv.fleet', 'eqv.equipmentScopes']),
    authorize: (actor, tx) => canImport(actor, tx),
    validate: registerErrors,
    async handle(tx, actor, input) {
      const ws = actor.workspace_id;
      const equipmentId = String(input.equipmentId);
      const vendorId = String(input.vendorId).toLowerCase();
      const modelId = String(input.modelId).toLowerCase();
      // One registrar per id, whatever its letter case (`equipmentId/exists` also covers an id that differs only by case).
      await lockOnboarding(tx, 'equipment_register', ws, equipmentId.toLowerCase());
      if (!(await canImport(actor, tx))) throw new MenuActionForbiddenError();
      // The Hub answers for the actor: a vendor or model it cannot see is the same `not_found` as one that does not exist.
      if (!(await deps.knowledgeLookup.getVendor(tx, ws, vendorId))) throw invalid({ path: ['vendorId'], code: 'not_found' });
      const model = await deps.knowledgeLookup.getModel(tx, ws, modelId, actor.actor_id);
      if (!model || model.vendorId !== vendorId) throw invalid({ path: ['modelId'], code: 'not_found' });
      if (await read.equipmentIdExists(tx, ws, equipmentId)) throw invalid({ path: ['equipmentId'], code: 'exists' });
      await write.insertEquipment(tx, { workspaceId: ws, equipmentId, label: String(input.label).trim(), modelId: model.id });
      await recordEquipmentRegistered({
        tx, actor, subjectId: equipmentSubjectId(ws, equipmentId), equipmentId, vendorId, modelId: model.id, summary: `Equipment ${equipmentId} registered`,
      });
      return { data: { equipmentId }, version: null };
    },
  };

  // The menu declares them in this order (`onboarding-menu-drift.test.ts` compares).
  return [replaceWindow, retireWindow, importWindow, register];
}
