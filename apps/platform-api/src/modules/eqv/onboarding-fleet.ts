// The Fleet read model of the 설비 온보딩 menu (#1658 Sample Window·Fleet PR): one row per equipment whose Hub model the actor can see, with
// the latest active Sample Window, the status code, and the coverage of the latest Binding against that window. The status rules are the
// screen's (`EquipmentWorkspace.tsx`): no window row at all → `no-observations`; no Binding → `draft` if any applicable rule file exists, else
// `unstarted`; a Binding → `drift-unknown` when Drift cannot be judged (no latest active window, a missing or unreadable Mapping Version,
// Baseline or Layout Revision, or `detectDrift` throwing a RangeError — ONBOARDING §6), `drift` when it drifted, else `published`.
// Figures come from grouped statements, never one query per equipment; only the Layout Revision of a drift check is read per distinct Revision.
import {
  computeCoverage,
  detectDrift,
  mappingVersionSchema,
  observedInventorySchema,
  verifyMappingHash,
  type MappingVersion,
  type ObservedInventory,
} from '@eqv/core';

import type { Db } from '../../db/client.js';
import type { PlatformActor } from '../platform-port/permissions.js';
import { checkEquipmentLayout } from './domain/layout-checks.js';
import type { ModelLookup } from './onboarding-scope.js';
import { findRevision } from './repositories/eqv-write.js';
import * as windows from './repositories/window-read.js';

/** Fleet shows at most this many equipment (by id). The limit applies before the Hub hides models, so a workspace over it shows fewer rows. */
export const FLEET_ROWS_MAX = 500;

export const FLEET_STATUSES = ['no-observations', 'unstarted', 'draft', 'published', 'drift', 'drift-unknown'] as const;
export type FleetStatus = (typeof FLEET_STATUSES)[number];

export interface FleetRow {
  equipmentId: string;
  label: string;
  vendorId: string;
  vendorName: string;
  modelId: string;
  modelName: string;
  status: FleetStatus;
  latestWindow: { hash: string; from: string; to: string } | null;
  coverage: { referenceRatio: number | null; aliasRatio: number | null; assumedRatio: number | null } | null;
  unmappedReferences: number | null;
}

type RuleScope = Awaited<ReturnType<typeof windows.listRuleScopes>>[number];

const sum = (rows: readonly { references: number }[]) => rows.reduce((total, r) => total + r.references, 0);

/** A Mapping Version read for the Fleet figures: schema and own hash must hold, like `eqv.mappingVersion`. */
async function readMapping(stored: { hash: string; document: unknown } | undefined): Promise<MappingVersion | null> {
  if (!stored) return null;
  const parsed = mappingVersionSchema.safeParse(stored.document);
  if (!parsed.success || parsed.data.hash !== stored.hash || !(await verifyMappingHash(parsed.data))) return null;
  return parsed.data;
}

export async function buildFleetRows(
  deps: { db: Db; knowledgeLookup: ModelLookup; log: (message: string) => void },
  actor: PlatformActor,
): Promise<FleetRow[]> {
  const { db, knowledgeLookup } = deps;
  const ws = actor.workspace_id;
  const all = await windows.listEquipmentRows(db, ws, FLEET_ROWS_MAX);

  // The Hub answers for the viewer: a hidden model is a row that is not there.
  const models = new Map<string, NonNullable<Awaited<ReturnType<ModelLookup['getModel']>>>>();
  for (const modelId of new Set(all.map((e) => e.modelId))) {
    const model = await knowledgeLookup.getModel(db, ws, modelId, actor.actor_id);
    if (model) models.set(modelId, model);
  }
  const visible = all.flatMap((e) => {
    const model = models.get(e.modelId);
    return model ? [{ ...e, model }] : [];
  });
  const vendors = new Map<string, string>();
  for (const vendorId of new Set([...models.values()].map((m) => m.vendorId))) {
    const vendor = await knowledgeLookup.getVendor(db, ws, vendorId);
    if (vendor) vendors.set(vendorId, vendor.name);
  }

  const ids = visible.map((e) => e.equipmentId);
  const [latest, withWindows, bindings, ruleScopes] = await Promise.all([
    windows.latestActiveWindows(db, ws, ids),
    windows.equipmentWithWindows(db, ws, ids),
    windows.latestBindings(db, ws, ids),
    windows.listRuleScopes(db, ws),
  ]);
  const latestBy = new Map(latest.map((w) => [w.equipmentId, w]));
  const bindingBy = new Map(bindings.map((b) => [b.equipmentId, b]));
  const docs = await windows.mappingAndBaselineDocuments(db, ws, bindings.map((b) => ({ equipmentId: b.equipmentId, mappingHash: b.mappingHash })));
  const layouts = new Map<string, Promise<ReturnType<typeof checkEquipmentLayout> | null>>();
  const layoutOf = (layoutId: string, revision: string) => {
    const key = `${layoutId}/${revision}`;
    let found = layouts.get(key);
    if (!found) {
      found = findRevision(db, ws, layoutId, revision).then((row) => (row ? checkEquipmentLayout(layoutId, row.document, []) : null));
      layouts.set(key, found);
    }
    return found;
  };

  const ruled = (e: { equipmentId: string }, vendorId: string, modelId: string) =>
    ruleScopes.some((s: RuleScope) =>
      s.level === 'global' ||
      (s.level === 'maker' && s.vendorId === vendorId) ||
      (s.level === 'model' && s.vendorId === vendorId && s.modelId === modelId) ||
      (s.level === 'equipment' && s.equipmentId === e.equipmentId));

  const rows: FleetRow[] = [];
  for (const { model, ...e } of visible) {
    const window = latestBy.get(e.equipmentId);
    let inventory: ObservedInventory | null = null;
    if (window) {
      const parsed = observedInventorySchema.safeParse(window.inventory);
      if (parsed.success) inventory = parsed.data;
      else deps.log(`eqv fleet: stored window ${window.hash} of ${e.equipmentId} failed validation in workspace ${ws}`);
    }
    const binding = bindingBy.get(e.equipmentId);
    const mapping = binding ? await readMapping(docs.mappings.get(`${e.equipmentId}/${binding.mappingHash}`)) : null;

    let coverage: FleetRow['coverage'] = null;
    let unmappedReferences: number | null = null;
    if (inventory && !binding) unmappedReferences = sum(inventory.aliases);
    if (inventory && mapping) {
      try {
        const c = computeCoverage(inventory, mapping);
        coverage = { referenceRatio: c.references.ratio, aliasRatio: c.aliases.ratio, assumedRatio: c.assumed.ratio };
        unmappedReferences = sum(c.unmapped);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        deps.log(`eqv fleet: coverage of ${e.equipmentId} could not be computed in workspace ${ws}`);
      }
    }

    let status: FleetStatus;
    if (!withWindows.has(e.equipmentId)) status = 'no-observations';
    else if (!binding) status = ruled(e, model.vendorId, model.id) ? 'draft' : 'unstarted';
    else {
      status = 'drift-unknown';
      const baselineDoc = docs.baselines.get(`${e.equipmentId}/${binding.mappingHash}`);
      const baseline = baselineDoc === undefined ? null : observedInventorySchema.safeParse(baselineDoc);
      if (inventory && mapping && baseline?.success) {
        const layout = await layoutOf(binding.layoutId, binding.layoutRevision);
        if (layout?.ok) {
          try {
            const drift = detectDrift({ baseline: baseline.data, current: inventory, mapping, layout: layout.layout });
            status = drift.newAliases.length > 0 || drift.newSlots.length > 0 || drift.transfersWithoutCapability.length > 0 ? 'drift' : 'published';
          } catch (error) {
            if (!(error instanceof RangeError)) throw error;
          }
        }
      }
    }

    rows.push({
      equipmentId: e.equipmentId,
      label: e.label,
      vendorId: model.vendorId,
      vendorName: vendors.get(model.vendorId) ?? '',
      modelId: model.id,
      modelName: model.name,
      status,
      latestWindow: window ? { hash: window.hash, from: window.from, to: window.to } : null,
      coverage,
      unmappedReferences,
    });
  }
  return rows;
}
