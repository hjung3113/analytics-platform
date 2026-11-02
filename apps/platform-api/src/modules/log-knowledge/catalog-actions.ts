// The catalog write actions of the log knowledge hub (#1194 a, design v0.6 §7, ADR-0107): create, update
// and set-active for vendor, process, model and software version. Right: `knowledge.catalog.manage`
// (workspace-scoped; Admin passes through the module bypass, a bare capability check refuses Admin).
// Rules: the workspace is the actor's; `code_key` is computed here (`toCodeKey`); a duplicate key, an
// unknown id or an inactive parent is a `MenuActionInvalidError` (field errors, never a 500); no cascade on
// deactivation; every successful write bumps `row_version` and writes its audit row in the same
// transaction. SetActive to the value a row already has changes nothing and answers `ok` with the
// current version.

import { createAuditService } from '../core/audit/audit-service.js';
import type { Tx } from '../../db/tx.js';
import {
  type ActionHandlerResult,
  type FieldError,
  type MenuActionDeclaration,
  MenuActionInvalidError,
} from '../menu-dispatch/types.js';
import { type CheckService, applyAdminModuleBypass } from '../permissions/check-service.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import { LOG_KNOWLEDGE_MENU_ID } from './catalog-menu.js';
import { type CatalogOp, validateCatalogInput } from './domain/catalog-input.js';
import { toCodeKey } from './domain/code-key.js';
import {
  type CatalogKind,
  type CatalogRow,
  DuplicateCatalogKeyError,
  type ParentKind,
  changeModelProcesses,
  codeKeyTaken,
  insertRow,
  lockRow,
  modelProcessIds,
  setRowActive,
  shareLockParent,
  shareLockProcesses,
  updateRow,
} from './repositories/catalog-write.js';

export const CATALOG_PERMISSION = 'knowledge.catalog.manage';

const SUBJECT = {
  vendor: 'knowledge_vendor',
  process: 'knowledge_process',
  model: 'knowledge_model',
  software: 'knowledge_software',
} as const;

const NOUN = { vendor: 'Vendor', process: 'Process', model: 'Model', software: 'Software version' } as const;

/** Read endpoints (same menu) that show the rows a write of this kind changes. */
const INVALIDATES: Record<CatalogKind, readonly string[]> = {
  vendor: ['logKnowledge.vendors', 'logKnowledge.models'],
  process: ['logKnowledge.processes', 'logKnowledge.models'],
  model: [
    'logKnowledge.models',
    'logKnowledge.vendors',
    'logKnowledge.processes',
    'logKnowledge.softwareVersions',
  ],
  software: ['logKnowledge.softwareVersions', 'logKnowledge.models'],
};

const INPUT_KEYS: Record<CatalogKind, Record<CatalogOp, readonly string[]>> = {
  vendor: { create: ['code', 'name'], update: ['id', 'code', 'name'], setActive: ['id', 'active'] },
  process: { create: ['code', 'name'], update: ['id', 'code', 'name'], setActive: ['id', 'active'] },
  model: {
    create: ['vendorId', 'code', 'name', 'processIds'],
    update: ['id', 'code', 'name', 'processIds'],
    setActive: ['id', 'active'],
  },
  software: {
    create: ['modelId', 'versionLabel', 'name'],
    update: ['id', 'versionLabel', 'name'],
    setActive: ['id', 'active'],
  },
};

const PARENT: Partial<Record<CatalogKind, { kind: ParentKind; field: string }>> = {
  model: { kind: 'vendor', field: 'vendorId' },
  software: { kind: 'model', field: 'modelId' },
};

export interface CatalogActionDeps {
  checkService: CheckService;
}

const codeField = (kind: CatalogKind) => (kind === 'software' ? 'versionLabel' : 'code');
const lower = (ids: readonly unknown[]) => ids.map((id) => String(id).toLowerCase());

function summary(row: CatalogRow, rowVersion = row.rowVersion) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active,
    version: String(rowVersion),
  };
}

export function catalogActions(deps: CatalogActionDeps): MenuActionDeclaration[] {
  const audit = createAuditService();

  const authorize = async (actor: PlatformActor, tx: Tx) =>
    applyAdminModuleBypass(
      actor.role_level,
      CATALOG_PERMISSION,
      await deps.checkService.checkCapability(
        actor,
        CATALOG_PERMISSION,
        { workspace_id: actor.workspace_id },
        { tx },
      ),
    ).allow;

  const record = (
    tx: Tx,
    actor: PlatformActor,
    kind: CatalogKind,
    type: 'created' | 'updated' | 'deactivated' | 'reactivated',
    row: CatalogRow,
    changes?: Record<string, [unknown, unknown]>,
  ) =>
    audit.record(tx, {
      workspace_id: actor.workspace_id,
      actor_id: actor.actor_id,
      event_type: `knowledge.catalog.${type}`,
      subject_type: SUBJECT[kind],
      subject_id: row.id,
      summary: `${NOUN[kind]} ${row.code} ${type}`,
      detail: { code: row.code, name: row.name, ...(changes ? { changes } : {}) },
    });

  const duplicate = (kind: CatalogKind) =>
    new MenuActionInvalidError([{ path: [codeField(kind)], code: 'duplicate' }]);

  /** Resolves a parent for a new row: unknown → not_found, inactive → inactive. */
  async function requireParent(
    tx: Tx,
    actor: PlatformActor,
    kind: ParentKind,
    id: string,
    path: readonly string[],
  ) {
    const parent = await shareLockParent(tx, kind, actor.workspace_id, id);
    if (!parent) throw new MenuActionInvalidError([{ path, code: 'not_found' }]);
    if (!parent.active) throw new MenuActionInvalidError([{ path, code: 'inactive' }]);
  }

  /** Every process id must exist in the workspace; `newIds` (not yet mapped) must also be active. */
  async function checkProcesses(
    tx: Tx,
    actor: PlatformActor,
    all: readonly string[],
    newIds: ReadonlySet<string>,
  ) {
    const found = new Map(
      (await shareLockProcesses(tx, actor.workspace_id, all)).map((p) => [p.id.toLowerCase(), p]),
    );
    const errors: FieldError[] = [];
    all.forEach((id, index) => {
      const process = found.get(id.toLowerCase());
      if (!process) errors.push({ path: ['processIds', String(index)], code: 'not_found' });
      else if (!process.active && newIds.has(id.toLowerCase())) {
        errors.push({ path: ['processIds', String(index)], code: 'inactive' });
      }
    });
    if (errors.length > 0) throw new MenuActionInvalidError(errors);
  }

  function create(kind: CatalogKind): MenuActionDeclaration {
    const parent = PARENT[kind];
    return {
      spec: {
        id: `logKnowledge.${kind}Create`,
        menuId: LOG_KNOWLEDGE_MENU_ID,
        inputKeys: INPUT_KEYS[kind].create,
        permission: CATALOG_PERMISSION,
        requiresScope: false,
        concurrency: 'none',
        invalidates: INVALIDATES[kind],
      },
      authorize,
      validate: (input) => validateCatalogInput(kind, 'create', input),
      async handle(tx, actor, input): Promise<ActionHandlerResult> {
        const ws = actor.workspace_id;
        const code = input[codeField(kind)] as string;
        const parentId = parent ? (input[parent.field] as string) : null;
        if (parent && parentId) await requireParent(tx, actor, parent.kind, parentId, [parent.field]);
        const processIds = kind === 'model' ? (input.processIds as string[]) : [];
        if (processIds.length > 0) {
          await checkProcesses(tx, actor, processIds, new Set(lower(processIds)));
        }
        if (await codeKeyTaken(tx, kind, ws, toCodeKey(code), parentId, null)) throw duplicate(kind);
        let row: CatalogRow;
        try {
          row = await insertRow(tx, kind, {
            workspaceId: ws,
            actorId: actor.actor_id,
            code,
            name: input.name as string,
            parentId,
          });
        } catch (error) {
          if (error instanceof DuplicateCatalogKeyError) throw duplicate(kind);
          throw error;
        }
        if (processIds.length > 0) {
          await changeModelProcesses(tx, ws, row.id, actor.actor_id, processIds, []);
        }
        await record(tx, actor, kind, 'created', row, undefined);
        return { data: summary(row), version: String(row.rowVersion) };
      },
    };
  }

  const currentVersion = (kind: CatalogKind) => async (tx: Tx, actor: PlatformActor, input: Record<string, unknown>) => {
    const row = await lockRow(tx, kind, actor.workspace_id, input.id as string);
    return row ? String(row.rowVersion) : null;
  };

  function update(kind: CatalogKind): MenuActionDeclaration {
    return {
      spec: {
        id: `logKnowledge.${kind}Update`,
        menuId: LOG_KNOWLEDGE_MENU_ID,
        inputKeys: INPUT_KEYS[kind].update,
        permission: CATALOG_PERMISSION,
        requiresScope: false,
        concurrency: 'version',
        invalidates: INVALIDATES[kind],
      },
      authorize,
      validate: (input) => validateCatalogInput(kind, 'update', input),
      currentVersion: currentVersion(kind),
      async handle(tx, actor, input): Promise<ActionHandlerResult> {
        const ws = actor.workspace_id;
        const before = await lockRow(tx, kind, ws, input.id as string);
        if (!before) throw new Error(`action ${kind}Update: currentVersion judged not_found first`);
        const code = input[codeField(kind)] as string;
        const name = input.name as string;
        const changes: Record<string, [unknown, unknown]> = {};
        if (code !== before.code) changes[codeField(kind)] = [before.code, code];
        if (name !== before.name) changes.name = [before.name, name];

        let add: string[] = [];
        let remove: string[] = [];
        if (kind === 'model') {
          const wanted = input.processIds as string[];
          const current = await modelProcessIds(tx, ws, before.id);
          const wantedKeys = new Set(lower(wanted));
          const currentKeys = new Set(lower(current));
          add = wanted.filter((id) => !currentKeys.has(id.toLowerCase())).map((id) => id.toLowerCase());
          remove = current.filter((id) => !wantedKeys.has(id.toLowerCase()));
          await checkProcesses(tx, actor, wanted, new Set(add));
          if (add.length > 0 || remove.length > 0) {
            changes.processIds = [current, [...wantedKeys].sort()];
          }
        }

        if (
          toCodeKey(code) !== toCodeKey(before.code) &&
          (await codeKeyTaken(tx, kind, ws, toCodeKey(code), before.parentId, before.id))
        ) {
          throw duplicate(kind);
        }
        let row: CatalogRow;
        try {
          row = await updateRow(tx, kind, ws, before.id, actor.actor_id, { code, name });
        } catch (error) {
          if (error instanceof DuplicateCatalogKeyError) throw duplicate(kind);
          throw error;
        }
        if (kind === 'model') await changeModelProcesses(tx, ws, row.id, actor.actor_id, add, remove);
        await record(tx, actor, kind, 'updated', row, Object.keys(changes).length > 0 ? changes : undefined);
        return { data: summary(row), version: String(row.rowVersion) };
      },
    };
  }

  function setActive(kind: CatalogKind): MenuActionDeclaration {
    return {
      spec: {
        id: `logKnowledge.${kind}SetActive`,
        menuId: LOG_KNOWLEDGE_MENU_ID,
        inputKeys: INPUT_KEYS[kind].setActive,
        permission: CATALOG_PERMISSION,
        requiresScope: false,
        concurrency: 'version',
        invalidates: INVALIDATES[kind],
      },
      authorize,
      validate: (input) => validateCatalogInput(kind, 'setActive', input),
      currentVersion: currentVersion(kind),
      async handle(tx, actor, input): Promise<ActionHandlerResult> {
        const before = await lockRow(tx, kind, actor.workspace_id, input.id as string);
        if (!before) throw new Error(`action ${kind}SetActive: currentVersion judged not_found first`);
        const active = input.active as boolean;
        // Same value: nothing changes, nothing is audited, the current version is answered. No cascade either way.
        if (before.active === active) {
          return { data: summary(before), version: String(before.rowVersion) };
        }
        const row = await setRowActive(tx, kind, actor.workspace_id, before.id, actor.actor_id, active);
        await record(tx, actor, kind, active ? 'reactivated' : 'deactivated', row);
        return { data: summary(row), version: String(row.rowVersion) };
      },
    };
  }

  return (['vendor', 'process', 'model', 'software'] as const).flatMap((kind) => [
    create(kind),
    update(kind),
    setActive(kind),
  ]);
}
