// The Onboarding reads (#1658, ADR-0139). Right: the module permission `eqv:view` (capability `eqv.view`), like the Studio reads. `requiresScope: false`, no Context, no time
// domain. Every param is validated; an unknown or hidden target answers `empty`, the same for a missing equipment and for an equipment whose
// Hub model the actor cannot see. Documents are re-validated on the way out and a stored row that fails is "not found" plus a log line (ids only).
import { bindingsFileSchema, mappingVersionSchema, observedInventorySchema, validateBindings, verifyMappingHash, type BindingsFile } from '@eqv/core';

import type { Db } from '../../db/client.js';
import type { MenuEndpointDeclaration, ParamsJudgment } from '../menu-dispatch/types.js';
import { type EqvDeps, eqvAuthorize } from './authorize.js';
import { bundledTemplateRows } from './domain/bundled-templates.js';
import { REVISION_PATTERN } from './domain/layout-checks.js';
import { isEquipmentId, parseScope, type MappingScopeRef } from './domain/mapping-checks.js';
import { isWindowHex, windowHashOf } from './domain/window-checks.js';
import { EQV_ONBOARDING_MENU_ID, EQV_VIEW_CAPABILITY, EQV_VIEW_PERMISSION } from './menu.js';
import { buildFleetRows } from './onboarding-fleet.js';
import { equipmentScope, scopeAddressable, type ModelLookup } from './onboarding-scope.js';
import * as read from './repositories/onboarding-read.js';
import * as windowRead from './repositories/window-read.js';

type Params = Record<string, unknown>;
type Result = { outcome: 'ok' | 'empty'; data: unknown };
const bad = (message: string): ParamsJudgment => ({ ok: false, message });
const found = (data: unknown): Result => ({ outcome: data === null ? 'empty' : 'ok', data });

/** The newest-first list holds at most this many Mapping Versions. */
export const MAPPING_VERSION_LIST_MAX = 500;

export interface OnboardingDeps extends EqvDeps {
  db: Db;
  knowledgeLookup: ModelLookup;
  log?: (message: string) => void;
}

export function onboardingEndpoints(deps: OnboardingDeps): MenuEndpointDeclaration[] {
  const log = deps.log ?? ((m: string) => console.error(m));
  const declare = (
    id: string,
    paramKeys: readonly string[],
    validate: (params: Params) => ParamsJudgment,
    run: (args: { workspaceId: string; actor: Parameters<MenuEndpointDeclaration['handle']>[0]['actor']; params: Params }) => Promise<Result>,
  ): MenuEndpointDeclaration => ({
    spec: { id, menuId: EQV_ONBOARDING_MENU_ID, paramKeys, permission: EQV_VIEW_PERMISSION, requiresScope: false, context: {}, mergeTimeDomain: false },
    authorize: eqvAuthorize(deps, EQV_VIEW_CAPABILITY),
    validate,
    handle: async (args) => run({ workspaceId: args.actor.workspace_id, actor: args.actor, params: args.params }),
  });

  const scopeParams = (allowEquipment: boolean) => (p: Params): ParamsJudgment => {
    const parsed = parseScope(p, allowEquipment);
    return parsed.ok ? { ok: true } : bad(`${parsed.errors[0]?.path.join('.') ?? 'scope'} is not a valid scope field`);
  };
  const equipmentOnly = (p: Params): ParamsJudgment => (isEquipmentId(p.equipmentId) ? { ok: true } : bad('equipmentId must be an equipment id'));
  const equipmentAndHash = (key: string) => (p: Params): ParamsJudgment =>
    !isEquipmentId(p.equipmentId)
      ? bad('equipmentId must be an equipment id')
      : typeof p[key] === 'string' && REVISION_PATTERN.test(p[key] as string)
        ? { ok: true }
        : bad(`${key} must be sha256:<64 hex>`);

  /** Runs `body` only for an equipment the actor can address. */
  const withEquipment =
    (body: (a: { workspaceId: string; equipmentId: string; params: Params }) => Promise<Result>) =>
    async ({ workspaceId, actor, params }: { workspaceId: string; actor: Parameters<MenuEndpointDeclaration['handle']>[0]['actor']; params: Params }): Promise<Result> => {
      const equipmentId = String(params.equipmentId);
      if (!(await equipmentScope(deps.db, deps.knowledgeLookup, actor, equipmentId))) return found(null);
      return body({ workspaceId, equipmentId, params });
    };

  const equipmentAndHex = (key: string) => (p: Params): ParamsJudgment =>
    !isEquipmentId(p.equipmentId) ? bad('equipmentId must be an equipment id') : isWindowHex(p[key]) ? { ok: true } : bad(`${key} must be 64 hex digits`);
  const noParams = (): ParamsJudgment => ({ ok: true });

  const scopedRow = (allowEquipment: boolean, get: (ws: string, scope: MappingScopeRef) => Promise<{ document: unknown; version: number } | null>) =>
    async ({ workspaceId, actor, params }: { workspaceId: string; actor: Parameters<MenuEndpointDeclaration['handle']>[0]['actor']; params: Params }): Promise<Result> => {
      const parsed = parseScope(params, allowEquipment);
      if (!parsed.ok) return found(null);
      if (!(await scopeAddressable(deps.db, deps.knowledgeLookup, actor, parsed.scope))) return found(null);
      const row = await get(workspaceId, parsed.scope);
      return found(row ? { document: row.document, version: String(row.version) } : null);
    };

  return [
    declare('eqv.aliasRules', ['level', 'vendorId', 'modelId', 'equipmentId'], scopeParams(true), scopedRow(true, (ws, scope) => read.getAliasRulesRow(deps.db, ws, scope))),
    declare('eqv.typeDictionary', ['level', 'vendorId', 'modelId'], scopeParams(false), scopedRow(false, (ws, scope) => read.getTypeDictionaryRow(deps.db, ws, scope))),
    declare('eqv.equipmentScopes', ['equipmentId'], equipmentOnly, async ({ actor, params }) =>
      found(await equipmentScope(deps.db, deps.knowledgeLookup, actor, String(params.equipmentId))),
    ),
    declare(
      'eqv.mappingVersions',
      ['equipmentId'],
      equipmentOnly,
      withEquipment(async ({ workspaceId, equipmentId }) => ({
        outcome: 'ok',
        data: { rows: await read.listMappingVersions(deps.db, workspaceId, equipmentId, MAPPING_VERSION_LIST_MAX) },
      })),
    ),
    declare(
      'eqv.mappingVersion',
      ['equipmentId', 'hash'],
      equipmentAndHash('hash'),
      withEquipment(async ({ workspaceId, equipmentId, params }) => {
        const row = await read.getMappingVersionRow(deps.db, workspaceId, equipmentId, String(params.hash));
        if (!row) return found(null);
        const parsed = mappingVersionSchema.safeParse(row.document);
        if (!parsed.success || parsed.data.hash !== row.hash || !(await verifyMappingHash(parsed.data))) {
          log(`eqv mapping read: stored Mapping Version ${row.hash} of ${equipmentId} failed its hash check in workspace ${workspaceId}`);
          return found(null);
        }
        return found({ layoutRevision: row.layoutRevision, publishedAt: row.publishedAt.toISOString(), document: parsed.data });
      }),
    ),
    declare(
      'eqv.bindings',
      ['equipmentId'],
      equipmentOnly,
      withEquipment(async ({ workspaceId, equipmentId }) => {
        const rows = await read.listBindingRows(deps.db, workspaceId, equipmentId);
        const file: BindingsFile = {
          schemaVersion: '0.4',
          equipmentId,
          bindings: rows.map((r) => ({
            layoutId: r.layoutId,
            mappingHash: r.mappingHash,
            layoutRevision: r.layoutRevision,
            effectiveFrom: r.effectiveFrom,
            ...(r.effectiveTo === null ? {} : { effectiveTo: r.effectiveTo }),
          })),
        };
        const checked = validateBindings(file);
        if (!checked.ok || !bindingsFileSchema.safeParse(file).success) {
          log(`eqv bindings read: stored Bindings of ${equipmentId} failed validation in workspace ${workspaceId}`);
          return found(null);
        }
        // The version is the row count: the same number `publishMapping` compares.
        return found({ document: checked.file, version: String(rows.length) });
      }),
    ),
    declare(
      'eqv.baselineInventory',
      ['equipmentId', 'mappingHash'],
      equipmentAndHash('mappingHash'),
      withEquipment(async ({ workspaceId, equipmentId, params }) => {
        const row = await read.getBaselineRow(deps.db, workspaceId, equipmentId, String(params.mappingHash));
        if (!row) return found(null);
        const parsed = observedInventorySchema.safeParse(row.document);
        if (!parsed.success) {
          log(`eqv baseline read: stored Baseline of ${equipmentId} (${row.mappingHash}) failed validation in workspace ${workspaceId}`);
          return found(null);
        }
        return found({ document: parsed.data });
      }),
    ),
    // Sample Window·Fleet PR: the four reads the menu declared as pending. Same permission and rules as the reads above.
    declare('eqv.fleet', [], noParams, async ({ actor }) => ({ outcome: 'ok', data: { rows: await buildFleetRows({ db: deps.db, knowledgeLookup: deps.knowledgeLookup, log }, actor) } })),
    declare(
      'eqv.sampleWindows',
      ['equipmentId'],
      equipmentOnly,
      withEquipment(async ({ workspaceId, equipmentId }) => ({ outcome: 'ok', data: { rows: await windowRead.listWindowRows(deps.db, workspaceId, equipmentId) } })),
    ),
    declare(
      'eqv.observedInventory',
      ['equipmentId', 'windowHash'],
      equipmentAndHex('windowHash'),
      withEquipment(async ({ workspaceId, equipmentId, params }) => {
        const row = await windowRead.getWindowRow(deps.db, workspaceId, equipmentId, windowHashOf(String(params.windowHash)));
        if (!row) return found(null);
        const parsed = observedInventorySchema.safeParse(row.inventory);
        if (!parsed.success) {
          log(`eqv window read: stored Inventory of ${equipmentId} (${row.hash}) failed validation in workspace ${workspaceId}`);
          return found(null);
        }
        return found(parsed.data);
      }),
    ),
    declare('eqv.bundledTemplates', [], noParams, async () => ({ outcome: 'ok', data: { rows: bundledTemplateRows() } })),
  ];
}
